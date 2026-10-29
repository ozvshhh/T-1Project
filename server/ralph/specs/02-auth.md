# 명세 02 — 인증 F1 (단계 2)
바탕: docs/api.md 1·3절, features F1. 역할은 `취준생` 하나.

## 결정
- 세션: `express-session` + `connect-mongo`(세션을 Mongo에 저장), 쿠키 `HttpOnly`, `SameSite=Lax`, 이름 `sid`, 비밀은 `SESSION_SECRET`. 세션에 `userId`만 둔다.
- 비밀번호 bcrypt(cost 10). 이메일은 소문자 정규화, unique index.
- 인증 가드 `AuthGuard`: 세션 없으면 `401 UNAUTHENTICATED`. `@CurrentUser()` 데코레이터.
- 소유자 검사 헬퍼: 자원의 `userId !== 세션 userId` → `404 NOT_FOUND`.

## 완료 기준
- [ ] C2-1: `POST /api/auth/signup` {email,password} → 201 `{user:{id,email,role:"취준생",createdAt}}` + 세션 쿠키. 이메일 형식 오류·8자 미만 비밀번호 → 400 VALIDATION(details에 field). 중복 → 409 EMAIL_TAKEN. 응답에 비밀번호·해시 없음. e2e 테스트(supertest, mongodb-memory-server) 있음.
- [ ] C2-2: `POST /api/auth/login` → 200 + 쿠키. 틀린 비밀번호·없는 이메일 모두 `401 INVALID_CREDENTIALS`(같은 메시지). 시드 계정으로 로그인되는 테스트.
- [ ] C2-3: `GET /api/auth/me` → 로그인 시 200 user, 아니면 401. `POST /api/auth/logout` → 204, 이후 `me`가 401.
- [ ] C2-4: AuthGuard가 적용된 보호 경로 예시(`GET /api/auth/me`)에 쿠키 없이 요청하면 401이고, 쿠키를 위조하면 401이다. 세션 저장이 Mongo 컬렉션 `sessions`에 남는다.
- [ ] C2-5: 세션 쿠키는 `Secure`가 프로덕션(HTTPS)에서만 켜지도록 환경변수 `COOKIE_SECURE`(기본 false, compose에서 false)로 제어하고, compose 안 nginx 경유 요청에서 쿠키가 유지된다(`X-Forwarded-*` 신뢰 설정). README 환경변수 표 갱신.
