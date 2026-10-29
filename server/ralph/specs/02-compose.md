# 명세 02 — nginx 유지 + 채점·배포 맞추기 (단계 2)

바탕: 키트 `docker-compose.example.yml`·`workflows/scenarios.yml`, `docs/backend-plan.md` 2절, AWS 문서 「Create and manage container service deployments in Lightsail」(같은 배포의 컨테이너끼리는 `localhost`로 통신).

## 왜 바꾸나
- 주최 측 실행과 `scenarios.yml`은 시드 계정을 **`services.app.environment`**의 `SEED_USER_EMAIL`·`SEED_USER_PASSWORD`에서 읽는다. 지금은 `server`에만 있어 E2E가 로그인하지 못한다.
- Lightsail에는 compose가 없어 `server`라는 이름을 찾을 수 없고, 같은 배포의 컨테이너는 `localhost`를 함께 써서 nginx와 서버가 둘 다 3000이면 겹친다.
- nginx 기본값으로는 요청 본문 1MB(단서 파일 5MB 막힘), 응답 대기 60초(AI 30초 + 재시도 1회면 넘을 수 있음)라 기능 단계에서 nginx가 HTML 오류를 낸다.

## 구조 결정 (팀 결정 2026-10-30: nginx 유지. 바꾸려면 여기만)
- compose 서비스는 지금처럼 `app`(nginx, 3000 공개) · `server`(NestJS, ports 없음) · `db`(mongo:7). 루트 `Dockerfile`의 프런트 빌드·nginx 구성은 그대로 두고 아래 `ENV` 한 줄만 더한다(프런트 팀원 파일, PR에서 알린다).
- 서버 포트: `PORT` 환경변수(기본 **3001**), `0.0.0.0`에 붙는다. `server/Dockerfile`은 `EXPOSE 3001`.
- nginx가 넘길 주소: 환경변수 `API_UPSTREAM`. 루트 `Dockerfile`에 `ENV API_UPSTREAM=http://server:3001`(compose 기본), Lightsail 배포에서는 `http://localhost:3001`을 넣는다. nginx 공식 이미지의 템플릿 치환(`/etc/nginx/templates/*.template`, 정의된 환경변수만 치환)으로 `${API_UPSTREAM}`을 넣는다. `$uri` 같은 nginx 변수는 그대로 남아야 한다.
- `deploy/nginx.conf.template`: `location /api/ { proxy_pass ${API_UPSTREAM}; }`, `location = /__health { proxy_pass ${API_UPSTREAM}/__health; }`, 나머지 `try_files $uri /index.html`(없는 화면 주소는 지금처럼 200 + 화면의 「없는 페이지예요」). `server` 블록에 `client_max_body_size 6m;`, 프록시 위치에 `proxy_read_timeout 120s;`.
- 환경변수: `app`에 `SEED_USER_EMAIL: seeker@example.com`·`SEED_USER_PASSWORD: loopthon-2026`을 **`server`와 같은 리터럴로** 추가(채점용, nginx는 쓰지 않음). `server`의 `SESSION_SECRET`을 `JWT_SECRET`(로컬 전용 리터럴)으로 바꾼다(3단계가 JWT).
- 기존 `compose.spec.ts`의 `proxy_pass http://server:3000` 단언과 `SESSION_SECRET` 단언, `dockerfile.spec.ts`의 포트 관련 단언은 **이 명세가 대체한다.** 그 부분만 새 기준으로 고친다. 나머지 기존 테스트는 그대로 통과해야 한다.
- Lightsail 실제 배포(컨테이너 두 개, 공개 포트는 nginx 3000)는 10단계에서 사람이 한다. 이 단계는 그때 설정 차이가 `API_UPSTREAM` 하나뿐이도록 만드는 것까지.

## 완료 기준 (주장)
- [ ] C2-1: 서버가 `PORT`(기본 3001)로 `0.0.0.0`에 붙는다(포트를 정하는 함수의 단위 테스트: 값 없음 → 3001, `PORT=4000` → 4000). `server/Dockerfile`이 `EXPOSE 3001`이고 `main.ts`에 3000이 남아 있지 않다.
- [ ] C2-2: `deploy/nginx.conf.template`의 `/api/`·`/__health`가 `${API_UPSTREAM}`으로 넘기고(`server:3000`이 없음), SPA 대체(`try_files $uri /index.html`)가 남아 있으며, `client_max_body_size 6m`과 프록시 위치의 `proxy_read_timeout 120s`가 있다. 루트 `Dockerfile`에 `ENV API_UPSTREAM=http://server:3001`이 있고 나머지 줄은 바뀌지 않았다. `compose.spec.ts`가 이를 단언한다.
- [ ] C2-3: `docker-compose.yml`의 `app.environment`와 `server.environment`에 `SEED_USER_EMAIL`·`SEED_USER_PASSWORD`가 **같은 리터럴 값**으로 있고(`${}` 없음, 두 값이 같은지 테스트), `server`에 `JWT_SECRET` 리터럴이 있고 `SESSION_SECRET`이 어디에도 없다. `db`에 ports·container_name 없음, `env_file` 없음은 그대로. `server/.env.example`과 README 「환경변수」 표가 같은 목록이다(`JWT_SECRET`·`PORT`·`API_UPSTREAM` 추가, `SESSION_SECRET` 제거, `API_UPSTREAM`은 "compose 기본 `http://server:3001`, Lightsail `http://localhost:3001`"로 설명). 맨 위 주석과 `main.ts` 주석이 새 구조와 맞는다.
- [ ] C2-4 (docker): 저장소 루트에서 `docker compose down -v` → `docker compose up -d --build` 뒤 2분 안에 `curl -s -i http://127.0.0.1:3000/__health`가 200·`releaseId`·`no-store`이고, `curl -s http://127.0.0.1:3000/`가 `<div id="root">`가 든 HTML, `curl -s -i http://127.0.0.1:3000/api/nope`가 404 JSON(`NOT_FOUND`), `docker compose config --format json`의 `services.app.environment.SEED_USER_EMAIL`이 `seeker@example.com`이다. `docker compose exec app cat /etc/nginx/conf.d/default.conf`에 `http://server:3001`이 치환돼 있고 `$uri`가 그대로 있다.
