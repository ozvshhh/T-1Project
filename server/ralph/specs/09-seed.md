# 명세 09 — 시드 데이터 (단계 9)

바탕: `frontend/specs/mock-data.md` 「시드」(정본. 글자 하나도 바꾸지 않는다), `docs/scenarios.yaml` 머리 주석, 03-delivery(빈 DB에서 첫 기동 시 앱이 만든다, 2분 안).

## 결정
- 기존 시드 서비스(시드 계정 만들기)를 확장한다. 계정을 **새로 만든 경우에만** 아래 데이터를 넣는다(이미 있으면 아무것도 하지 않음 → 두 번 기동해도 중복 없음).
- 넣을 것(mock-data.md 그대로): 경험 1 「캡스톤디자인 학과 공지 알림 앱」(텍스트 단서 1, 확정 사실 4개 `said`·`origin: conversation`, 대화 AI 질문 4·답 4 + 마지막 AI 질문 1, `itemStatus` 상황·역할·행동 explained / 결과 needs_more / 의의 null, 후보 1개 의의 `ai_unverified`), 경험 2 「교내 해커톤 동아리 회비 정산 웹」(단서 없음, 확정 사실 3개 `said`·`origin: manual`, 대화 없음, `itemStatus` 모두 null), 자소서 「가나다소프트 백엔드 지원」(`pasted`, 본문 그대로, 점검 없음).
- 경험 1 대화의 질문·답 문장은 mock-data.md 「AI 고정 동작 › 경험 대화」의 질문 순서와 확정 사실 문장으로 만든다(새 내용을 지어내지 않는다).
- 확인 필요(사람): mock-data.md는 경험 1 대화를 "AI 질문 4개와 답 4개, 마지막 줄은 의의를 묻는 AI 질문"이라고 해 개수가 맞지 않는다. 루프 전에 프런트 팀원과 정해 이 줄을 고친다. 정하기 전 기본: 질문 5·답 4(상황→역할→행동→결과 질문·답, 마지막 의의 질문), 메시지 9개.
- 시드 텍스트는 `server/src/seed/seed-data.ts` 한 곳에 상수로 둔다. AI를 부르지 않는다.
- 흐름이 만드는 데이터(새 가입자, S5의 작성 자소서, S6의 점검)는 미리 만들지 않는다.

## 완료 기준 (주장)
- [ ] C9-1: 빈 DB(mongodb-memory-server)에서 시드를 돌리면 시드 계정으로 로그인한 `GET /api/experiences`가 위 두 경험을 api.md 모양으로 돌려주고(사실·출처·origin·itemStatus·후보·단서가 mock-data.md와 글자까지 같음), `GET /api/experiences/:id/conversation`이 경험 1에 질문·답이 번갈아 있고 마지막 메시지가 의의를 묻는 AI 질문(`이 경험이 지금 지원에 어떤 의미가 있나요?`), 경험 2에 0개, `GET /api/cover-letters`가 붙여넣은 자소서 1개(본문 글자 일치)를 돌려준다. 시드를 두 번 돌려도 개수가 같다. 테스트 있음.
- [ ] C9-2 (docker): `docker compose down -v` → `docker compose up -d --build` 뒤 2분 안에 `/__health` 200이고, `curl`로 `POST /api/auth/login`(compose의 시드 이메일·비밀번호) → 토큰, 그 토큰으로 `GET /api/experiences`가 2개, `GET /api/cover-letters`가 1개다. `docker compose restart app` 뒤에도 개수가 같다.
