# 명세 02 — app 하나로 합치기 (단계 2)

바탕: `docs/develope/backend-guide.md` 「백엔드를 붙일 때 권장 구조」, 키트 `docker-compose.example.yml`·`workflows/scenarios.yml`, `docs/backend-plan.md` 2절.

## 왜 바꾸나
- 주최 측 실행과 `scenarios.yml`은 시드 계정을 **`services.app.environment`**의 `SEED_USER_EMAIL`·`SEED_USER_PASSWORD`에서 읽는다. 지금은 `server`에만 있어 E2E가 로그인하지 못한다.
- 주최 측 자원 제한(CPU 2·메모리 4GB)은 `app`에만 걸리고, Lightsail 배포도 컨테이너 하나다. nginx가 `server:3000`으로 넘기는 구조는 배포에서 동작하지 않는다.
- 그래서 NestJS 서버 하나가 3000에서 `/api/*`, `/__health`, 프런트 정적 파일(`frontend/dist`)을 모두 처리한다.

## 구조 결정 (바꾸려면 여기만)
- 루트 `Dockerfile` 3단계: ① `node:22-slim`에서 `frontend/` `npm ci && npm run build` ② `server/` `npm ci && npm run build` ③ 실행 이미지 `node:22-slim`에 server `dist` + production 의존성 + ①의 `dist`를 `/app/public`에. `ARG RELEASE_ID=dev` → `ENV RELEASE_ID`. `CMD ["node","dist/main.js"]`. 시작 명령에 설치·빌드 없음.
- `docker-compose.yml`: 서비스는 `app`·`db` 둘. `app`은 `build.context: .`, `"3000:3000"`, environment에 `RELEASE_ID: ${RELEASE_ID:-dev}`, `DATABASE_URL: mongodb://db:27017/app`, `SEED_USER_EMAIL: seeker@example.com`, `SEED_USER_PASSWORD: loopthon-2026`, `JWT_SECRET`(로컬 전용 리터럴), `AI_GATEWAY_API_KEY: ${AI_GATEWAY_API_KEY:-}`. `db(healthy)`에 depends_on. `db`는 지금 그대로(`mongo:7`, ports·container_name 없음, 볼륨 `db-data`). `SESSION_SECRET`은 없앤다(3단계가 JWT).
- `server/Dockerfile`과 `deploy/nginx.conf.template`은 지운다(`git rm`). 루트 Dockerfile이 유일한 빌드 파일이다.
- 정적 파일: 서버가 `PUBLIC_DIR`(기본 `/app/public`, 테스트에서 임시 폴더로 바꿈)의 파일을 내준다. 폴더가 없으면 정적 서빙 없이 기동한다(로컬 `start:dev`).
- 화면 주소 판정: `frontend/specs/00-common.md` 「라우트」 표의 주소(`/`, `/signup`, `/login`, `/cover-letters`, `/cover-letters/paste`, `/cover-letters/new`, `/cover-letters/:id`, `/cover-letters/:id/items/:itemId`, `/experiences`, `/experiences/new`, `/experiences/:id`, `/checks/:checkId`)는 `index.html`을 **200**으로, 그 밖의 주소(`/api/`·`/__health`·실제 파일 제외)는 같은 `index.html`을 **404**로 준다(화면은 L 「없는 페이지예요」를 그린다). 주소 목록은 설정 파일 한 곳에 둔다.
- 기존 `compose.spec.ts`·`dockerfile.spec.ts`의 `server` 서비스·`server/Dockerfile`·nginx 단언은 **이 명세가 대체한다.** 이 두 파일은 고쳐도 된다(약화가 아니라 구조 변경). 나머지 기존 테스트는 그대로 통과해야 한다.
- 프런트 팀원 작업 파일(`frontend/**`)은 고치지 않는다. 루트 Dockerfile 변경은 PR에서 프런트 팀원에게 알린다(사람).

## 완료 기준 (주장)
- [ ] C2-1: 루트 `Dockerfile`이 위 3단계 구조이고 `server/Dockerfile`·`deploy/nginx.conf.template`이 없다. `dockerfile.spec.ts`가 단계 구성·`ARG RELEASE_ID`·`CMD`에 설치·빌드가 없음을 단언한다.
- [ ] C2-2: `docker-compose.yml`의 서비스가 정확히 `app`·`db`이고, `app.environment`에 위 6개 이름(값 규칙 포함: 시드·`DATABASE_URL`·`JWT_SECRET`은 `${}` 없는 리터럴)이 있으며 `SESSION_SECRET`이 없다. `db`에 ports·container_name 없음, 어디에도 `env_file` 없음. `compose.spec.ts`가 이를 단언한다. `server/.env.example`·README 「환경변수」 표가 같은 목록(`JWT_SECRET` 추가, `SESSION_SECRET` 제거)이다.
- [ ] C2-3: 서버가 `PUBLIC_DIR`의 정적 파일을 내주고, 라우트 표의 주소(`/`, `/experiences/abc` 등)는 `index.html` 200, `/no-such-page`는 `index.html` 404, `/api/nope`는 404 JSON(`error.code: NOT_FOUND`), `/__health`는 기존과 같다. `PUBLIC_DIR`이 없어도 기동한다. 임시 폴더에 가짜 `index.html`을 둔 supertest 테스트가 있다.
- [ ] C2-4 (docker): 저장소 루트에서 `docker compose down -v` → `docker compose up -d --build` 뒤 2분 안에 `curl -s -i http://127.0.0.1:3000/__health`가 200·`releaseId`·`no-store`, `curl -s http://127.0.0.1:3000/`가 `<div id="root">`가 든 HTML, `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/no-such-page`가 404, `docker compose config --format json`의 `services.app.environment.SEED_USER_EMAIL`이 `seeker@example.com`이다.
