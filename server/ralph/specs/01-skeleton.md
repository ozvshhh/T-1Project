# 명세 01 — NestJS 뼈대·/__health·docker compose (단계 1)

바탕: docs/api.md 0~2절, docs/backend-plan.md 1단계, 03-delivery.md 3-1a. 기존 루트 `Dockerfile`(nginx 정적)·`deploy/nginx.conf.template`·`docker-compose.yml`은 프런트 팀원 작업이다. **지우지 말고 확장한다.**

## 구조 결정 (바꾸려면 여기만)
- `server/`: NestJS 11, TypeScript, Node 22. 패키지 매니저 npm. 테스트 jest(+supertest). 린트 eslint, 포맷 prettier.
- `server/package.json` 스크립트: `build`(nest build), `start`(node dist/main.js), `start:dev`, `test`(jest), `typecheck`(tsc --noEmit), `lint`(eslint), `check`(typecheck && lint && test).
- 서버는 컨테이너 안 `0.0.0.0:3000`, 전역 prefix `api` (단, `/__health`는 prefix 제외).
- compose: `app`(기존 nginx, 3000 공개) / `server`(NestJS, ports 없음) / `db`(`mongo:7`, ports·container_name 없음, 볼륨 `db-data`, healthcheck `mongosh --eval "db.adminCommand('ping')"`). `app`은 `server`에, `server`는 `db`(healthy)에 depends_on.
- nginx: `location /api/ { proxy_pass http://server:3000; }`, `location = /__health { proxy_pass http://server:3000/__health; }`(기존 return 블록 교체), 나머지는 `try_files $uri /index.html`.
- 환경변수(server): `RELEASE_ID`(빌드 인자→ENV), `DATABASE_URL=mongodb://db:27017/app`, `SEED_USER_EMAIL=seeker@example.com`, `SEED_USER_PASSWORD=loopthon-2026`(compose에 값 그대로), `AI_GATEWAY_API_KEY: ${AI_GATEWAY_API_KEY:-}`, `SESSION_SECRET`(compose에 로컬 전용 값 그대로).
- DB 접근: mongoose(`@nestjs/mongoose`). 모델은 2단계부터.

## 완료 기준 (주장)
- [ ] C1-1: `server/`에 NestJS 앱이 있고 `cd server && npm run check`(typecheck·lint·test)가 통과한다. `server/.gitignore`에 node_modules·dist·.env. `server/.env.example`에 위 환경변수 이름만.
- [ ] C1-2: `GET /__health`가 인증 없이 200, 본문 `{"releaseId":"<RELEASE_ID 환경변수 값>"}`, 헤더 `Cache-Control: no-store`, `Content-Type: application/json`. supertest 테스트가 RELEASE_ID를 바꿔 넣고 응답을 단언한다. 비밀값·다른 환경변수는 응답에 없다.
- [ ] C1-3: `GET /api/없는경로`는 `404 { "error": { "code": "NOT_FOUND", "message" } }`이고, 모든 예외 응답이 api.md 1절 형식(`error.code`, `error.message`)이다(전역 예외 필터). 500에도 스택이 본문에 없다. 테스트 있음.
- [ ] C1-4: `server/Dockerfile` 다단계: 1단계 `npm ci`+`npm run build`, 2단계 `node:22-slim`에 `dist`+production deps만, `ARG RELEASE_ID` → `ENV RELEASE_ID`, `CMD ["node","dist/main.js"]`. 시작 명령에 빌드·설치 없음.
- [ ] C1-5: 루트 `docker-compose.yml`에 위 구조대로 `server`·`db` 서비스와 환경변수가 있고, `app`은 기존 nginx 이미지 그대로이며 `deploy/nginx.conf.template`가 `/api/`·`/__health`를 `server`로 proxy한다. 다른 서비스에 ports·container_name 없음, `env_file` 없음, 시드 값 리터럴.
- [ ] C1-6: 서버가 기동 시 `DATABASE_URL`로 Mongo에 연결하고, `users` 컬렉션에 `SEED_USER_EMAIL` 사용자가 없으면 역할 `취준생`으로 만든다(비밀번호는 bcrypt 해시). 이미 있으면 건너뛴다(두 번 기동해도 1명). `AI_GATEWAY_API_KEY`가 비어도 기동한다. 시드 로직 단위 테스트(모델 mock) 있음.
- [ ] C1-7 (docker): 저장소 루트에서 `docker compose down -v` → `docker compose up -d --build` 뒤 2분 안에 `curl -s -i http://127.0.0.1:3000/__health`가 200·`releaseId`(RELEASE_ID 미지정 시 `dev`)·`no-store`를 돌려주고, `curl -s -i http://127.0.0.1:3000/api/nope`가 404 JSON을 돌려준다.
- [ ] C1-8: 루트 `README.md` 「설치·실행」에 로컬 실행(`cd server && npm install && npm run start:dev`), docker 실행, `npm run check` 방법이 있고 「환경변수」 표에 `SESSION_SECRET`가 추가돼 있다. `.github/workflows/scenarios.yml`은 키트(`../loopthon-starter/workflows/scenarios.yml`)를 그대로 복사하고, 별도 `ci.yml`이 `server`의 `npm ci && npm run check`를 돈다.
