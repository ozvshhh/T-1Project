# 명세 08 — 제출 전 점검 R9~R12·C1·C4 (단계 8)

바탕: `docs/api.md` 2절(Check·CheckSentence·JudgeResult), 9절, R9~R12(judge J1~J4), C1·C2·C4.

## 결정
- 컬렉션 `checks`(userId, coverLetterId, stale, sentences[], candidates[], createdAt). 문장·후보는 문서 안 배열, 각각 고유 id. 후보는 확정 전까지 `facts`가 아니라 점검 문서 안에 둔다(경험이 정해지지 않았을 수 있으므로).
- 문장 고르기 AI 입력: 붙여넣은 자소서는 `body`, 생성한 자소서는 문항별 `answer`(문항 id와 함께, `null`은 제외). 응답 스키마 `{ sentences: { text, coverLetterItemId | null }[] }`. **서버가 원문에 그대로 들어 있지 않은 문장을 버리고**, `coverLetterItemId`는 실제로 그 문장을 담은 문항으로 다시 맞춘다.
- 문장 첫 질문 AI 응답 `{ question }`. 답 판정 AI 응답 `{ unknown: boolean, judge: { id: J1|J2|J3|J4, result: met|missing }[], nextQuestion: string | null, candidates: { item, text }[] }`.
- **상태는 서버가 정한다**(AI가 상태를 고르지 않는다). 순서: ① `unknown`이면 `unknown`, 끝(J 판정보다 먼저, R11) ② `judge`가 비어 있지 않고 모두 `met`이면 `explained`, 끝 ③ 빠진 기준이 있고 `followUpsLeft > 0`이면 `nextQuestion`(없으면 실패로 보고 502)을 새 turn으로 붙이고 `followUpsLeft - 1` ④ 아니면 `needs_more`, 끝. `judge`가 비면 AI 형식 오류로 본다(502).
- 판정 지시문은 J1~J4의 `clear_if` 문장(problem.yaml R10)을 그대로 쓰고, 문장에 해당하는 기준만 목록에 넣으라고 한다. 점수는 어디에도 없다(R11). 지시문은 `server/src/checks/prompts.ts` 한 곳.
- 후보의 `experienceId`: 생성한 자소서의 문장이면 그 문항 `usedExperienceIds` 중 AI가 고른 것(목록 밖이면 첫 번째), 붙여넣은 자소서면 `null`.
- 오래됨: 07의 변경 알림 함수에서 그 자소서의 모든 점검을 `stale: true`로. 오래된 점검의 `start`·`answers` → `409 CHECK_STALE`. 조회는 된다.
- 저장 순서(C2): 점검 만들기·문장 시작·답하기 모두 AI 성공 뒤에만 저장한다. 실패하면 사용자 답도 저장하지 않는다.
- AI는 자소서 문장을 고쳐 쓰지 않는다(C4). 점검 API는 `coverLetters`를 바꾸지 않는다.

## 완료 기준 (주장)
- [ ] C8-1: `POST /api/cover-letters/:id/checks` → `201 {check}`(문장마다 `pending`·`followUpsLeft: 3`·빈 `turns`, `stale: false`). 원문에 없는 문장은 버려지고, 생성 자소서는 문장이 든 문항 id가 붙는다. 고를 문장이 없으면 `sentences: []`. `GET /api/checks/:checkId`, `GET /api/cover-letters/:id/checks`(최신순)가 있고 남의 것 404. AI 실패 → 502, 점검 0개 그대로. e2e 테스트 있음.
- [ ] C8-2: `POST /api/checks/:checkId/sentences/:sentenceId/start`가 첫 질문을 turn으로 붙이고 `in_progress`로 만든다. 이미 시작한 문장은 AI를 부르지 않고 그대로 돌려준다. `PATCH /cover-letters/:id`·`PATCH .../items/:itemId`·`POST .../items/:itemId/answer` 뒤에는 그 자소서의 기존 점검이 모두 `stale: true`이고, 오래된 점검의 start·answers → `409 CHECK_STALE`. e2e 테스트 있음.
- [ ] C8-3: `POST .../sentences/:sentenceId/answers`의 상태 결정이 위 ①~④ 순서다: FakeAi로 (a) `unknown: true` + J 모두 missing → `unknown` (b) 모두 met → `explained` (c) missing 3번 연속 → 추가 질문 3번 뒤 `needs_more`(첫 질문 포함 turn 4개, `followUpsLeft` 3→0)를 각각 단언한다. 시작 전 `409 SENTENCE_NOT_STARTED`, 끝난 문장 `409 SENTENCE_FINISHED`, 빈 글 400. 응답에 점수 필드가 없다. AI 실패 → 502이고 turn·`followUpsLeft`·후보가 그대로다.
- [ ] C8-4: 답에서 나온 후보가 `Check.candidates`에 `ai_unverified`로 쌓이고 `newCandidates`로 돌아온다(생성 자소서면 문항 근거 카드 중 하나의 `experienceId`, 붙여넣은 자소서면 `null`). `POST /api/checks/:checkId/candidates/:factId/confirm` `{experienceId, item, text?, source, clueId?}`가 고른 내 경험에 `confirmed`·`origin: check` 사실을 만들고 후보를 목록에서 뺀다. `ai_unverified`·clueId 규칙 위반(다른 경험의 단서 포함) → 400, 남의 경험 → 404, 이미 처리한 후보 → `409 CANDIDATE_RESOLVED`. `DELETE .../candidates/:factId` → 204. 점검 API 어느 것도 자소서 본문·응답을 바꾸지 않는다(C4). e2e 테스트 있음.
