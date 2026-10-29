# interview-engine

2:1 모의면접(실무 면접관·임원 면접관) 진행 로직이다. 설계는 [`docs/interview-design.md`](../docs/interview-design.md)를 따른다.
팀 결정(2026-10-29): 백엔드 **NestJS**, DB **MongoDB**, AI 모델 **`openai/gpt-6.1-terra`**.

- `src/` — 면접 로직. NestJS·DB에 묶이지 않는다.
- `nest/` — NestJS에 그대로 넣는 모듈(컨트롤러·예외 필터·MongoDB 연결).

## 들어 있는 것

| 파일 | 하는 일 |
| --- | --- |
| `src/engine.ts` | 면접 진행: 본질문 4개 생성 → 순서 랜덤 → 답변마다 꼬리질문/다음 주제 판단 → 종료 → 결과·자소서 수정 제안 |
| `src/prompts.ts` | AI에게 보내는 지시문(면접관 역할, 꼬리질문 규칙) |
| `src/schemas.ts` | AI 응답 형식(JSON). 이 형식이 아니면 버린다 |
| `src/llm.ts` | AI Gateway 호출(OpenAI 호환 API). 키는 `AI_GATEWAY_API_KEY`에서만 읽는다 |
| `src/fallback.ts` | AI가 실패했을 때 쓰는 기본 질문 |
| `src/store.ts` / `src/mongoStore.ts` | 저장소 규격, 메모리 저장소(테스트용), MongoDB 저장소 |
| `src/config.ts` | 한도(본질문 2+2, 꼬리질문 2, 최대 12개·12분 등)와 화면 표시 이름 |
| `nest/interview.module.ts` | `InterviewModule.fromEnv()` / `InterviewModule.forRoot()` |
| `nest/interview.controller.ts` | `/api/interviews` API |
| `nest/interview.filter.ts` | 엔진 오류 → HTTP 상태 |

서버가 규칙을 직접 검사하는 것: 꼬리질문 횟수, 근거 답변 id가 실제로 있는지, 이미 설명된 항목을 다시 묻는지, '모름' 항목을 두 번 이상 다시 묻는지, 근거 문장이 자소서에 그대로 있는지, 다른 사용자의 면접인지, 같은 답변을 두 번 보냈는지(버전 번호).
AI가 실패하거나 키가 없으면 기본 질문·다음 주제로 넘어가 면접은 계속되고, 그 사실을 `fallbackEvents`에 남긴다.

## NestJS 앱에 붙이기

1. 이 폴더의 `src/`, `nest/`를 백엔드 프로젝트로 가져온다(예: `backend/src/interview/`). 상대 경로 import(`../src/...`)만 맞춘다.
2. 백엔드에 의존성 추가: `npm install zod mongodb`
3. `AppModule`에 넣는다.

```ts
import { Module } from '@nestjs/common';
import { InterviewModule } from './interview/nest';

@Module({
  imports: [InterviewModule.fromEnv()],
})
export class AppModule {}
```

4. 인증 가드가 `req.user`에 `{ id }`(또는 `{ sub }`)를 넣어야 한다. 없으면 면접 API는 401을 돌려준다.
5. Nest 기본 설정(`emitDecoratorMetadata`)이 없어도 동작하도록 주입은 모두 `@Inject(토큰)`으로 했다.

다른 곳에서 엔진을 쓰려면 `@Inject(INTERVIEW_ENGINE) engine: InterviewEngine`.

### API

모두 로그인 필요. 오류는 `{ code, message }`이고 `message`는 화면에 그대로 보여 줄 수 있는 한국어다.

| 메서드·주소 | 본문 | 돌려주는 것 |
| --- | --- | --- |
| `POST /api/interviews` | `{ resume, coverLetter }` | 201, 첫 질문이 담긴 상태 |
| `GET /api/interviews/:id` | | 지금 상태(새로고침용) |
| `POST /api/interviews/:id/answers` | `{ questionId, text, source: 'text' \| 'voice' }` | 다음 질문(끝났으면 `current: null`) |
| `POST /api/interviews/:id/skip` | | 다음 본질문 |
| `POST /api/interviews/:id/end` | | 종료된 상태 |
| `GET /api/interviews/:id/result` | | 질문·답변 기록, 설명된 항목, 보완할 항목(최대 3), 자소서 수정 제안 |
| `POST /api/interviews/:id/suggestions/:sid/approve` | | 바뀐 자소서 전문 — 앱의 자소서 저장소에도 반영한다 |
| `POST /api/interviews/:id/suggestions/:sid/reject` | | |

| 상태 코드 | 뜻 |
| --- | --- |
| 400 | 입력이 비었거나 너무 김, 본문 형식 오류 |
| 401 | 로그인 안 됨 |
| 404 | 없는 면접 또는 다른 사람의 면접 |
| 409 | 이미 넘어간 질문에 답함(두 번 누름), 끝난 면접, 아직 안 끝난 면접의 결과 요청 |

상태의 `current`에는 `interviewerLabel`(예: "실무 면접관"), `text`(질문), `purpose`(확인 목적), `basisSentence`(근거 자소서 문장)가 있다.
TTS는 `text`를 읽고, 화면에도 `text`를 글자로 보여 준다(자동 테스트는 소리를 못 듣는다).

## 환경변수

| 이름 | 용도 | 기본값 |
| --- | --- | --- |
| `MONGO_URL` | MongoDB 주소. docker-compose에서는 `mongodb://db:27017` | 필수 |
| `MONGO_DB` | DB 이름 | `app` |
| `AI_GATEWAY_API_KEY` | AI Gateway 키. 서버에서만 읽는다. 비어 있으면 기본 질문으로 진행(앱은 뜬다) | |
| `AI_MODEL` | Gateway 모델 ID | `openai/gpt-6.1-terra` |
| `AI_REASONING_EFFORT` | 추론 강도(`none`·`low`·`medium`·`high` 등). 높을수록 느리고 비싸다 | `low` |

### 모델과 비용 (2026-10-29 Gateway 모델 목록 기준)

- `openai/gpt-6.1-terra`: 입력 100만 토큰당 $1, 출력 100만 토큰당 $5. 구조화 출력(structured output)과 추론 강도 조절을 지원한다.
- 추론 토큰은 출력으로 청구된다. 그래서 면접 진행에는 `low`로 둔다.
- 면접 한 번은 AI 호출 최대 14회다(질문 생성 1 + 답변 최대 12 + 수정 제안 1). 비용은 아직 실제로 재 보지 않았다. 첫 실제 호출 때 응답의 `usage`로 확인한다.

## 검사

```bash
npm install
npm run check
```

- `npm run check`: 타입 검사 + 단위 테스트(42개). 가짜 AI로 규칙과 NestJS API 연결을 검사한다. 자동 화면 테스트(E2E)와는 다르다. E2E는 실제 AI를 부른다.
- MongoDB 테스트는 실제 MongoDB가 있을 때만 돈다: `MONGO_URL=mongodb://localhost:27017 npm test`

## 아직 안 된 것

- 실제 MongoDB 연결과 실제 AI Gateway 호출 확인(키 필요).
- NestJS 백엔드 프로젝트 자체, docker-compose의 `db`(mongo) 서비스, 로그인.
- 음성 전사. 엔진은 전사된 글자만 받는다(`source: 'voice'`로 표시).
- 3.1 자소서 초안 생성.
