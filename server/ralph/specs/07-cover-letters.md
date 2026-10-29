# 명세 07 — 자기소개서 등록·문항별 작성 R7·R8·R13·C1·C4 (단계 7)

바탕: `docs/api.md` 2절(CoverLetter·CoverLetterItem), 7·8절, R7·R8·R13, C1·C2·C4.

## 결정
- 컬렉션 `coverLetters`(userId, kind pasted|generated, title, body, target, items[], createdAt, updatedAt). 문항(`items`)은 문서 안 배열, 각 문항에 고유 id.
- 「확정 사실이 있는 카드」 = `facts`에 `status: confirmed`가 1개 이상인 내 경험. 후보(`candidate`)는 세지 않는다(C1).
- 추천 AI 입력: 우대사항, 인재상, 그 문항, 확정 사실이 있는 내 경험마다 id·제목·확정 사실. 응답 스키마 `{ recommendations: { experienceId, reason }[] }`. **서버가 후보 집합에 없는 experienceId를 버린다**(AI가 지어낸 id·남의 id 방지).
- 문항 응답 AI 입력: 우대사항, 인재상, 그 문항, `selectedExperienceIds` 카드의 **확정 사실만**(후보·대화 원문·단서는 넣지 않음). 지시문에 "카드에 없는 수치·기여도·역할을 쓰지 않는다"를 넣는다(R8). 응답 스키마 `{ answer: string }`.
- AI는 사용자가 부른 `.../answer`에서만 응답을 만든다(C4). 다른 어떤 API도 `answer`를 AI로 바꾸지 않는다.
- `GET /api/cover-letters/:id`의 `experiences`는 모든 문항의 `usedExperienceIds` 합집합(중복 없음, 지금 경험 모양). 삭제된 경험은 빠진다.
- 점검 「오래됨」 표시는 08이 한다. 이 단계의 자소서 변경 지점(`PATCH /cover-letters/:id`, `PATCH .../items/:itemId`, `POST .../answer`)은 한 함수(`markChanged(coverLetterId)` 같은)를 거치게 해 08이 거기에 붙인다.
- 저장 순서(C2): 추천·응답 생성은 AI 성공 뒤에만 저장한다.

## 완료 기준 (주장)
- [ ] C7-1: `POST /api/cover-letters` `{title?, body}` → `201 {coverLetter}`(`kind: pasted`, `items: []`, `target: null`), 빈 글·공백만 → 400. `GET /api/cover-letters`는 내 것만 최근 수정순. `PATCH /api/cover-letters/:id`로 title·body 수정(빈 body 400, `generated`에 body → 400). 남의 것 404. e2e 테스트 있음.
- [ ] C7-2: `POST /api/cover-letters/generate` `{title?, preferred, talent, questions[]}` → `201`(`kind: generated`, 문항마다 `answer: null`·빈 `recommendations`·빈 `selectedExperienceIds`·빈 `usedExperienceIds`·`answerEdited: false`, `body: null`). `preferred`·`talent` 빈 값, `questions` 0개·빈 문항 → 400. AI를 부르지 않는다. e2e 테스트 있음.
- [ ] C7-3: `POST .../items/:itemId/recommendations`가 확정 사실이 있는 내 경험만 AI에 넘기고(후보만 있는 경험·남의 경험은 입력에 없음), AI가 돌려준 목록에서 후보 집합 밖 id를 버린 뒤 `200 {item}`으로 저장한다. 확정 사실이 있는 경험이 없으면 AI를 부르지 않고 `400 NO_CONFIRMED_FACTS`. AI 실패 → 502, 문항 그대로. e2e 테스트 있음.
- [ ] C7-4: `PUT .../items/:itemId/experiences` `{experienceIds}`가 선택을 저장하고 `200 {item, usedElsewhere}`를 돌려준다. `usedElsewhere`는 같은 자소서의 다른 문항 `selectedExperienceIds`/`usedExperienceIds`에 있는 경험과 그 문항 id다(막지 않음). 확정 사실 없는 경험 → `400 NO_CONFIRMED_FACTS`(details에 그 경험), 남의 경험 → 404. 추천에 없는 내 경험도 고를 수 있다. e2e 테스트 있음.
- [ ] C7-5: `POST .../items/:itemId/answer`가 선택 카드의 확정 사실만 AI에 넘기고(후보 문장이 입력에 없음을 FakeAi 기록으로 단언) `answer`·`usedExperienceIds`(=그때의 선택)·`answerEdited: false`를 저장한다. 선택이 비면 400. `PATCH .../items/:itemId` `{answer}`는 `answerEdited: true`(빈 글 400). 고친 응답이 있을 때 `confirmOverwrite: true` 없이 부르면 AI를 부르지 않고 `409 OVERWRITE_CONFIRM_REQUIRED`, 있으면 덮어쓴다. AI 실패 → 502, 기존 응답 그대로. e2e 테스트 있음.
- [ ] C7-6: `GET /api/cover-letters/:id`가 `{coverLetter, experiences}`를 돌려주고 `experiences`가 모든 문항 `usedExperienceIds`의 합집합(중복 없음)이다. 자소서를 바꾸는 세 API가 모두 하나의 변경 알림 함수를 거친다(단위 테스트로 호출 단언). 어떤 API도 사용자가 `.../answer`를 부르지 않았는데 `answer`를 AI로 바꾸지 않는다(C4, 추천·선택 API 뒤 `answer`가 그대로임을 단언).
