# T-1Project Frontend

Vite + React + TypeScript + Tailwind CSS v4 + React Router.

## 시작

```bash
cd frontend
npm install
npm run dev
```

## 스크립트

| 명령             | 용도                                      |
| ---------------- | ----------------------------------------- |
| `npm run dev`    | 개발 서버                                 |
| `npm run build`  | 타입 검사 + 프로덕션 빌드                 |
| `npm run test`   | Vitest 실행 (Testing Library, jsdom)      |
| `npm run lint`   | oxlint                                    |
| `npm run format` | Prettier 적용 (Tailwind 클래스 정렬 포함) |
| `npm run check`  | 타입·린트·포맷·테스트·빌드 전체           |

`@/` 는 `src/` 의 import 별칭이다 (예: `import Home from '@/pages/Home'`).

## 랄프 루프

`specs/` 에 스펙을 쓰고 `fix_plan.md` 에 작업을 적은 뒤 실행한다. 바퀴마다 작업 하나를 구현하고 커밋한다.

```bash
./ralph.sh 10
```

`PROMPT.md` 가 바퀴마다 주는 지시이고, 결과는 `progress.md` 와 `logs/` 에 쌓인다. 끝나면 `RALPH_COMPLETE` 신호로 멈춘다.
