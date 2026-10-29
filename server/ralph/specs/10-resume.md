# 명세 10 — 이력서로 경험 만들기 R2·R3·C2 (단계 10, 기획 변경 반영)

바탕: `docs/api.md` 0절(이력서 행)·2절(Resume·ActivityDraft·Experience의 `summary`)·4절 「이력서와 경험」·5절(start 입력에 `summary`)·10절, `frontend/specs/mock-data.md` 「시드」(정본, 글자 그대로)와 「이력서 활동 나누기」, `docs/scenarios.yaml` S1·S2.
2026-10-30 06:01 기획 변경(b74a9f4): 경험은 이력서의 활동을 확정해서만 만든다. 05·06·09에서 만든 코드를 이 명세에 맞게 고친다.

## 결정
- 컬렉션 `resumes`(userId unique, text: string|null, drafts[], updatedAt). 초안(`drafts`)은 문서 안 배열이고 각각 고유 id, `title`·`period`·`summary`·`origin`(ai|manual). 계정당 문서 하나. 응답은 api.md 2절 `Resume` 모양(`text`·`drafts`·`updatedAt`, 아직 없으면 `text: null`·`drafts: []`·`updatedAt: null`).
- `Experience`에 `summary: string`(기본 빈 문자열)을 더하고 모든 경험 응답에 넣는다. `PATCH /api/experiences/:id`는 지금처럼 `title`·`period`만 받는다.
- **`POST /api/experiences`를 없앤다**(학생 결정 2026-10-30, api.md 4절 "경험을 하나씩 따로 만드는 API는 없다"). 이 경로는 전역 404가 된다. 기존 테스트가 이 경로로 경험을 만들던 곳은 이력서 확정 API나 테스트 도우미(모델 직접 저장)로 바꾼다. 테스트를 지우거나 단언을 약하게 만들지 않는다.
- `POST /api/resume` AI: task `resume-split`, 입력은 붙여넣은 글 전체, 응답 스키마 `{ activities: { title: string, period: string, summary: string }[] }`(모든 칸 required, strict). 지시문(`server/src/resume/prompts.ts` 한 곳): 글에 있는 활동만 나눈다, 제목·시기는 글에 쓰인 대로(시기가 없으면 빈 문자열), `summary`는 그 활동에 해당하는 원문 부분, 글에 없는 활동·역할·수치를 지어내지 않는다. 새 스키마는 `server/src/ai/strict-schema.spec.ts`의 목록에도 더한다.
- 중복 빼기는 서버가 한다: 제목을 앞뒤 공백 제거 후 비교해, 내 경험·내 초안·이번 응답 안에서 이미 나온 제목과 같으면 뺀다. 빈 제목은 버린다. 이번에 더한 것만 `added`.
- 저장 순서(C2): AI가 성공한 뒤에만 `text`·`drafts`·`updatedAt`을 한 번에 저장한다. 실패하면 `text`도 바꾸지 않는다.
- 초안 직접 추가·수정·삭제는 AI를 부르지 않는다. 이력서 문서가 없으면 `text: null`로 만든다. 남의 초안·없는 초안·잘못된 id → 404.
- 확정 `POST /api/resume/drafts/confirm`: `draftIds`는 문자열 배열 1개 이상(아니면 400). 하나라도 내 초안이 아니면 404이고 아무것도 만들지 않는다. 요청 순서대로 경험을 만들고(`title`·`period`·`summary`가 초안 값, 단서·사실·대화 없음, `itemStatus` 모두 null) 그 초안들을 뺀 뒤 `201 { experiences }`.
- 경험 대화 AI 입력(start·answers 공통, `server/src/experiences/prompts.ts`)에 `summary`가 비어 있지 않으면 "이력서에서 온 활동 내용"으로 넣는다(api.md 5절).
- 시드(09 확장, mock-data.md 「시드」 글자 그대로, `server/src/seed/seed-data.ts`): 이력서 글(4줄), 남은 초안 하나(`프로그래밍 동아리 운영진`·`2024년`·summary는 그 줄, `origin: ai`), 경험 1·2의 `summary`(글의 해당 줄, 앞의 `- ` 제외), 작성한 자소서 `라라테크 백엔드 지원`(`kind: generated`, 우대사항·인재상, 문항 1은 근거 카드 경험 1·2·추천 두 개 이유 `직접 만든 기능과 결과가 문항과 맞아요`·선택·사용 경험 1·2·응답은 프런트 목 `frontend/src/mocks/db.ts`의 `GENERATED_ANSWER`와 같은 글·`answerEdited: false`, 문항 2는 응답·추천·선택 없음). 목록 순서도 목과 같게: 경험은 경험 1이 먼저, 자소서는 `가나다소프트 백엔드 지원`이 먼저(더 최근 수정). AI를 부르지 않고, 새 계정일 때만 넣는다.

## 완료 기준 (주장)
- [ ] C10-1: `GET /api/resume`가 처음엔 `{resume:{text:null, drafts:[], updatedAt:null}}`. `POST /api/resume/drafts` `{title, period?, summary?}` → `201 {draft}`(`origin: manual`, 빠진 칸은 빈 문자열), 빈·공백 title 400. `PATCH .../drafts/:draftId`로 title·period·summary 수정(빈 title 400), `DELETE` 204. 남의 초안·없는 id·잘못된 id 형식 404, 토큰 없음 401. 다른 계정의 이력서가 보이지 않는다. AI를 부르지 않는다(FakeAi 호출 0). e2e 테스트 있음.
- [ ] C10-2: `POST /api/resume` `{text}`가 FakeAi 응답의 활동을 초안(`origin: ai`)으로 더하고 `200 {resume, added}`를 돌려준다. AI 입력에 붙여넣은 글이 있다(FakeAi 기록). 내 경험·내 초안과 제목이 같은 활동, 응답 안의 중복 제목, 빈 제목은 빠진다. 다시 붙여넣으면 `text`가 새 글로 바뀌고 새 활동만 더해진다. 빈·공백 text 400(AI 미호출). AI 실패·스키마 밖 → 502이고 `text`·`drafts`가 호출 전과 같다. 응답 스키마가 strict 호환 테스트 목록에 있다. e2e 테스트 있음.
- [ ] C10-3: `POST /api/resume/drafts/confirm` `{draftIds}`가 요청 순서대로 경험을 만들어 `201 {experiences}`(각각 초안의 title·period·summary, 빈 clues·card·candidates, itemStatus 모두 null)를 돌려주고 그 초안들을 `drafts`에서 뺀다. 만든 경험은 `GET /api/experiences`에 보인다. 빈 배열·문자열 아님 → 400, 없는/남의 초안이 섞이면 404이고 경험·초안이 그대로. `POST /api/experiences`는 404. 모든 경험 응답(목록·상세·PATCH·확정)에 `summary`가 있다. 기존 05~08 e2e가 `POST /api/experiences` 없이 통과한다. e2e 테스트 있음.
- [ ] C10-4: 경험 대화 `start`·`answers`의 AI 입력에 그 경험의 `summary`가 들어가고(FakeAi 기록 단언), `summary`가 빈 문자열이면 그 줄이 없다. 기존 06 단언(설명 있는 파일 단서·텍스트 단서 포함, 설명 없는 파일 단서·파일 이름 제외)이 그대로 통과한다. e2e 테스트 있음.
- [ ] C10-5: 빈 DB 시드 뒤 시드 계정으로 `GET /api/resume`가 mock-data.md의 글(글자 일치)과 초안 하나(`프로그래밍 동아리 운영진`·`2024년`·`origin: ai`)를, `GET /api/experiences`가 경험 1·2를 이 순서로 각 `summary`(글의 해당 줄)와 함께, `GET /api/cover-letters`가 `가나다소프트 백엔드 지원`(pasted)·`라라테크 백엔드 지원`(generated)을 이 순서로 돌려준다. `GET /api/cover-letters/:id`(라라테크)의 문항 1 응답이 `GENERATED_ANSWER`와 글자까지 같고 `usedExperienceIds`가 경험 1·2, `experiences`에 두 경험, 문항 2는 `answer: null`. 두 번 돌려도 개수가 같다. 기존 09 단언은 그대로 통과한다. 테스트 있음.
- [ ] C10-6 (docker): `docker compose down -v` → `docker compose up -d --build` 뒤 2분 안에 `/__health` 200이고, compose의 시드 계정으로 로그인한 토큰으로 `GET /api/resume` 초안 1개, `GET /api/experiences` 2개, `GET /api/cover-letters` 2개. 이어서 `POST /api/resume/drafts` → `POST /api/resume/drafts/confirm` 하면 경험 3개·초안 1개(시드 초안)이고, `POST /api/experiences`는 404. 끝나면 `docker compose down -v`.
