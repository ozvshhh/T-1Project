# 프론트엔드 진행 기록

랄프 루프가 바퀴마다 맨 아래에 세 줄 이내로 이어 쓴다.

- 초기 세팅 완료 (Vite, React, TS, Tailwind v4, React Router, Prettier, Vitest). 다음: specs/ 작성.
- [1] 이전 기획 화면·테스트 삭제, App 라우트는 *만, Layout 메뉴 제거, NotFound 문구·App.test 교체.
  남은 일: 2번 API 타입·클라이언트 교체. 막힌 점 없음(src/mocks·api·auth는 아직 옛 코드).
- [2] 막힘: 정본 ../docs/api.md 를 읽을 권한이 없어(작업 폴더 밖, 승인 불가) API 타입·경로를 알 수 없음. 추측으로 구현하지 않고 중단.
  남은 일: api.md 읽기 권한(또는 frontend/ 안에 사본)을 준 뒤 2번부터 다시 실행. fix_plan.md 는 그대로 둠.
- [2] api.md 타입·클라이언트(Bearer, 401이면 토큰 삭제)·auth 토큰 방식으로 교체, 컴파일용 최소 목(auth만)·render 도우미·client.test.ts 추가.
  남은 일: 3번 목 API ① (db 시드·경험·대화). 막힌 점 없음(prettier 실행은 승인이 필요해 format:check는 18번에서 확인).
- [3] 막힘(시작 전 중단): 시드 계정을 mock-data.md대로 `seeker@example.com`/`loopthon-2026`으로 바꾸면 기존 `src/api/client.test.ts:31`의 `api.login('seed@t1.test', 'seedpass1234')`가 깨진다(옛 시드 계정을 박아 둔 테스트라 스펙과 어긋남).
  이 테스트는 3번 작업이 이름으로 고치라고 적은 파일이 아니라 고치지 않음. 해결: fix_plan 3번에 "client.test.ts의 로그인 계정을 시드 계정으로 바꾼다"를 더하거나 사람이 직접 고친 뒤 3번부터 다시 실행.
- [3] 다시 실행했지만 막힘 그대로(fix_plan 3번에 client.test.ts 수정 지시가 없고, 테스트는 여전히 `seed@t1.test`로 로그인). 구현하지 않고 중단.
- [3] 세 번째 실행도 같은 이유로 중단(fix_plan 3번·client.test.ts 모두 그대로). 사람이 fix_plan 3번에 client.test.ts 로그인 계정 수정을 적거나 직접 고쳐야 진행 가능.
- [3] 목 db를 api.md 모양·mock-data 시드(seeker 계정, 경험 2개, 자소서 1개)로 다시 쓰고 계정·경험·단서·대화·사실 확정/직접 추가 경로 추가, client.test.ts 로그인 계정 교체, handlers.test.ts 추가.
  남은 일: 4번 목 API ② 자소서(db.coverLetters 시드는 이미 있음). 막힌 점 없음(setup.ts server export·render 토큰 도우미는 2번에서 이미 됨, prettier는 승인 필요라 18번에서).
- [4] 자소서 목 경로(붙여넣기·조회·수정·작성 시작·추천·카드 고르기·응답·고친 응답 409) 추가, coverLetters.test.ts 추가.
  남은 일: 5번 목 API ③ 점검(자소서 수정·문항 응답 수정·생성 때 점검 stale 처리를 자소서 경로에 더해야 함). 막힌 점 없음.
