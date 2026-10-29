# interview-engine

2:1 모의면접(실무 면접관·임원 면접관) 진행 로직이다. 설계는 [`docs/interview-design.md`](../docs/interview-design.md)를 따른다.
서버 프레임워크와 DB에 묶이지 않게 만들었다. 백엔드가 정해지면 `src/`를 가져다 API 몇 개에 연결하면 된다.

## 들어 있는 것

| 파일 | 하는 일 |
| --- | --- |
| `src/engine.ts` | 면접 진행: 본질문 4개 생성 → 순서 랜덤 → 답변마다 꼬리질문/다음 주제 판단 → 종료 → 결과·자소서 수정 제안 |
| `src/prompts.ts` | AI에게 보내는 지시문(면접관 역할, 꼬리질문 규칙) |
| `src/schemas.ts` | AI 응답 형식(JSON). 이 형식이 아니면 버린다 |
| `src/llm.ts` | AI Gateway 호출(OpenAI 호환 API). 키는 `AI_GATEWAY_API_KEY`에서만 읽는다 |
| `src/fallback.ts` | AI가 실패했을 때 쓰는 기본 질문 |
| `src/store.ts` | 저장소 규격 + 메모리 저장소(테스트·개발용) |
| `src/mongoStore.ts` | MongoDB 저장소 |
| `src/config.ts` | 한도(본질문 2+2, 꼬리질문 2, 최대 12개·12분 등)와 화면 표시 이름 |

서버가 규칙을 직접 검사하는 것: 꼬리질문 횟수, 근거 답변 id가 실제로 있는지, 이미 설명된 항목을 다시 묻는지, '모름' 항목을 두 번 이상 다시 묻는지, 근거 문장이 자소서에 그대로 있는지, 다른 사용자의 면접인지, 같은 답변을 두 번 보냈는지(버전 번호).
AI가 실패하거나 키가 없으면 기본 질문·다음 주제로 넘어가 면접은 계속되고, 그 사실을 `fallbackEvents`에 남긴다.

## 쓰는 법

```ts
import { MongoClient } from 'mongodb';
import {
  GatewayLlmClient,
  InterviewEngine,
  InterviewError,
  MongoSessionStore,
  type InterviewSessionDoc,
} from './interview-engine/src/index.js';

const client = new MongoClient(process.env.MONGO_URL!);
const col = client.db('app').collection<InterviewSessionDoc>('interview_sessions');
await MongoSessionStore.ensureIndexes(col);

const engine = new InterviewEngine({
  store: new MongoSessionStore(col),
  // 키가 없어도 앱은 떠야 하므로, 키가 없으면 null(기본 질문으로 진행)
  llm: process.env.AI_GATEWAY_API_KEY
    ? new GatewayLlmClient({ model: process.env.AI_MODEL! })
    : null,
});
```

| 함수 | 언제 | 돌려주는 것 |
| --- | --- | --- |
| `start({ userId, resume, coverLetter })` | 면접 시작 | `InterviewView` (지금 질문 포함) |
| `get(sessionId, userId)` | 새로고침 | `InterviewView` |
| `answer(sessionId, userId, { questionId, text, source })` | 답변 제출. `source`는 `'text'` 또는 `'voice'` | 다음 질문이 담긴 `InterviewView` (끝났으면 `current: null`) |
| `skip(sessionId, userId)` | 질문 건너뛰기 | `InterviewView` |
| `end(sessionId, userId)` | 면접 종료 | `InterviewView` |
| `result(sessionId, userId)` | 끝난 뒤 결과 화면 | 질문·답변 기록, 설명된 항목, 보완할 항목(최대 3), 자소서 수정 제안 |
| `approveSuggestion(sessionId, userId, suggestionId)` | 수정 제안 승인 | 바뀐 자소서 전문 — 앱이 자기 자소서 저장소에도 반영한다 |
| `rejectSuggestion(...)` | 수정 제안 거절 | |

`InterviewView.current`에는 `interviewerLabel`(예: "실무 면접관"), `text`(질문), `purpose`(확인 목적), `basisSentence`(근거 자소서 문장)가 있다. TTS는 `text`를 읽고, 화면에도 `text`를 글자로 보여 준다(자동 테스트는 소리를 못 듣는다).

### API 연결 예 (Express)

```ts
const status = (e: InterviewError) => (e.code === 'not_found' ? 404 : e.code === 'invalid_input' ? 400 : 409);
const wrap = (fn: (req: any) => Promise<unknown>) => async (req: any, res: any) => {
  try {
    res.json(await fn(req));
  } catch (e) {
    if (e instanceof InterviewError) return res.status(status(e)).json({ code: e.code, message: e.message });
    res.status(500).json({ message: '잠시 뒤 다시 시도해 주세요.' });
  }
};

// req.user.id는 로그인 미들웨어가 넣는다고 가정
app.post('/api/interviews', wrap((req) => engine.start({ userId: req.user.id, ...req.body })));
app.get('/api/interviews/:id', wrap((req) => engine.get(req.params.id, req.user.id)));
app.post('/api/interviews/:id/answers', wrap((req) => engine.answer(req.params.id, req.user.id, req.body)));
app.post('/api/interviews/:id/skip', wrap((req) => engine.skip(req.params.id, req.user.id)));
app.post('/api/interviews/:id/end', wrap((req) => engine.end(req.params.id, req.user.id)));
app.get('/api/interviews/:id/result', wrap((req) => engine.result(req.params.id, req.user.id)));
app.post('/api/interviews/:id/suggestions/:sid/approve', wrap((req) => engine.approveSuggestion(req.params.id, req.user.id, req.params.sid)));
```

## 환경변수

| 이름 | 용도 |
| --- | --- |
| `AI_GATEWAY_API_KEY` | AI Gateway 키. 서버에서만 읽는다. 비어 있으면 기본 질문으로 진행 |
| `AI_MODEL` | Gateway 모델 ID. 공식 목록(`GET https://ai-gateway.vercel.sh/v1/models`)에서 고른다. 팀 예산 $10이라 작은 모델 권장 |
| `MONGO_URL` | MongoDB 주소(MongoDB를 쓸 때) |

## 검사

```bash
npm install
npm run check
```

- `npm run check`: 타입 검사 + 단위 테스트. 단위 테스트는 가짜 AI로 규칙만 검사한다(자동 화면 테스트 E2E와 다르다. E2E는 실제 AI를 부른다).
- MongoDB 테스트는 실제 MongoDB가 있을 때만 돈다: `MONGO_URL=mongodb://localhost:27017 npm test`

## 아직 정하지 않은 것

- 백엔드 언어·프레임워크, DB(MongoDB / PostgreSQL). PostgreSQL로 가면 `SessionStore`의 세 함수만 새로 만든다.
- 사용할 AI 모델(`AI_MODEL`).
- 음성 전사 방식. 엔진은 전사된 글자만 받는다(`source: 'voice'`로 표시).
- 3.1 자소서 초안 생성은 이 모듈에 없다.
