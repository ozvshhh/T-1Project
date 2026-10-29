# 명세 06 — 경험 대화·사실 후보 확정 R3·R4·R5·C1·C2 (단계 6)

바탕: `docs/api.md` 5절, 6절 `confirm`·후보에 대한 `PATCH`/`DELETE`, R3·R4·R5, C1·C2. AI는 04의 `AiService`(테스트는 `FakeAiService`).

## 결정
- 컬렉션 `messages`(experienceId, userId, role ai|user, text, createdAt). 대화 = 그 경험의 메시지 시간순.
- AI 입력(start·answers 공통): 제목, 시기, **설명이 있는 파일 단서의 설명**, 텍스트 단서 내용(요청 시점의 전체), 대화 기록 전체, 지금 `itemStatus`. 설명 없는 파일 단서·파일 바이트·파일 이름은 넣지 않는다(api.md 0절). 지시문은 `server/src/experiences/prompts.ts` 한 곳.
- 지시문이 지킬 것: 상황·역할·행동·결과·의의를 하나씩 묻는다, 사용자가 말하지 않은 수치·역할을 지어내지 않는다, 후보는 사용자의 답에 있는 내용만.
- `start` AI 응답 스키마: `{ question: string, itemStatus: Record<Item, ItemStatus> }`. `answers` 응답 스키마: `{ question: string, itemStatus: Record<Item, ItemStatus>, candidates: { item: Item, text: string }[] }`. 스키마 밖이면 04가 실패로 처리한다.
- **저장 순서(C2)**: AI 호출이 성공한 뒤에만 사용자 메시지·AI 메시지·`itemStatus`·후보를 한꺼번에 저장한다. AI가 실패하면 사용자 답도 저장하지 않는다(메시지 수 그대로).
- 후보는 `status: candidate`, `source: ai_unverified`, `origin: conversation`.
- 후보 확정 `POST .../facts/:factId/confirm`: 대상이 `candidate`가 아니면 409(`FACT_RESOLVED`). `source`는 said|clue만(05와 같은 clueId 규칙), 선택 `text`·`item`으로 고친 뒤 확정. 확정되면 `card`에 보이고 `candidates`에서 빠진다. 후보에 대한 `PATCH`·`DELETE`는 05의 같은 경로가 처리한다(상태 그대로 유지·삭제).
- 질문 수 상한·멈춤 API는 없다(R3).

## 완료 기준 (주장)
- [ ] C6-1: `GET /api/experiences/:id/conversation`이 `{messages, itemStatus, candidates}`(대화 전이면 `messages: []`)를 돌려준다. `POST .../conversation/start`가 AI 첫 질문을 저장하고 `200 {question, itemStatus}`를 돌려주며, 이미 대화가 있으면 AI를 부르지 않고 마지막 AI 질문을 돌려준다(FakeAi 호출 횟수 단언). AI에 넘긴 입력에 설명 있는 파일 단서의 설명·텍스트 단서는 있고, 설명 없는 파일 단서와 파일 이름은 없다(FakeAi 기록 단언). AI 실패 → 502, 메시지 0개 그대로.
- [ ] C6-2: `POST .../conversation/answers` `{text}` → `200 {answer, question, itemStatus, newCandidates}`. 빈 글 400, start 전 `409 CONVERSATION_NOT_STARTED`. 답 사이에 추가한 단서가 다음 AI 입력에 들어간다. `newCandidates`는 `candidate`·`ai_unverified`·`origin: conversation`이고 경험의 `candidates`에 쌓인다. AI 실패(FakeAi 실패 주입) → 502이고 메시지 수·후보 수·`itemStatus`가 호출 전과 같다. e2e 테스트 있음.
- [ ] C6-3: `POST .../facts/:factId/confirm`이 후보를 `confirmed`로 바꿔 `card`에 넣고 `candidates`에서 뺀다. `text`·`item`을 함께 보내면 고친 값으로 확정된다. `source: ai_unverified`·없는 source → 400, `clue`인데 clueId 없음·남의 경험 단서 → 400, 이미 확정된 사실 → 409, 남의 경험 → 404. 확정 전 후보는 `card`에 없고(C1), 확정해도 `itemStatus`는 바뀌지 않는다. e2e 테스트 있음.
