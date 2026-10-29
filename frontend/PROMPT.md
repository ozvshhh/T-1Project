너는 T-1Project 프론트엔드(Vite + React + TypeScript + Tailwind v4)를 만드는 중이다. 이번 실행에서는 작업 하나만 끝내고 종료한다.

먼저 ../docs/problem.yaml, specs/ 아래 모든 파일, fix_plan.md, progress.md 를 읽어라.

1. fix_plan.md 에서 아직 체크되지 않은 작업 중 맨 위의 것 하나만 골라라.
2. 구현하기 전에 src/ 를 검색해서 이미 구현돼 있는지 확인하라. 있다고 가정하지도, 없다고 가정하지도 마라.
3. specs/ 에 적힌 대로 구현하라. 스펙에 없는 기능, 라이브러리, 파일은 만들지 마라.
4. 임시 구현, 빈 컴포넌트, TODO 로 넘어가지 마라. 그 작업은 끝까지 구현하라.
5. 이미 있는 *.test.ts(x) 파일은 수정하거나 지우지 마라. 테스트가 틀렸다고 생각되면 progress.md 에 이유를 적고 멈춰라. 새 기능에는 같은 폴더에 새 테스트 파일을 추가해도 된다.
6. 이번 작업의 테스트만 `npx vitest run <파일>` 로 실행하라. 통과하고 `npm run typecheck` 와 `npm run lint` 에 새 오류가 없을 때만 git 에 커밋하라. 커밋 메시지는 "ralph: <작업 이름>" 형식으로 써라.
7. fix_plan.md 에서 끝낸 작업을 [x] 로 체크하고, progress.md 맨 아래에 한 일, 남은 할 일, 막힌 점을 세 줄 이내로 적어라.
8. 같은 작업에서 테스트가 3번 연속 실패하면 막힌 이유를 progress.md 에 적고 fix_plan.md 에 [!] 로 표시한 뒤 종료하라.
9. fix_plan.md 의 모든 작업이 [x] 이고 `npm run check` 가 전부 통과하면 마지막 줄에 정확히 RALPH_COMPLETE 라고 출력하라. 그 외에는 이 단어를 출력하지 마라.
