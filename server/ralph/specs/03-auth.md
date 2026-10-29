# 명세 03 — 계정 R1·C3 (단계 3)

바탕: `docs/api.md` 0·1·3절, R1, C3.

## 결정
- 인증은 JWT(학생 답 2026-10-30, api.md 0절). `@nestjs/jwt`, HS256, 비밀 `JWT_SECRET`. 페이로드는 `{ sub: userId }`만.
- `JWT_SECRET`이 비면 기동 시 무작위 비밀을 만들고 경고 한 줄을 남긴다(앱은 반드시 기동. 재시작하면 기존 토큰은 무효). 값은 로그에 쓰지 않는다.
- 만료: `JWT_EXPIRES_IN`(기본 `7d`). api.md 11절 「학생 답 대기」라 설정값으로만 둔다.
- 비밀번호 규칙: api.md 11절 「학생 답 대기」. 답이 오기 전에는 **비어 있지 않음, 72바이트 이하**(bcrypt 한계)만 검사한다. 숫자는 설정 파일 한 곳에.
- 비밀번호 bcrypt(cost 10). 이메일은 앞뒤 공백 제거·소문자로 저장, unique index.
- 전역 가드: 모든 경로가 기본으로 인증 필요, `@Public()`이 붙은 `signup`·`login`·`/__health`·정적 파일만 예외. 실패는 `401 UNAUTHENTICATED`. `@CurrentUser()`로 userId.
- 소유자 검사 헬퍼: 자원의 `userId` ≠ 토큰 userId면 `404 NOT_FOUND`(있는지도 알려 주지 않음). 4단계부터 모든 자원이 쓴다.
- 기존 `users` 스키마의 `role` 필드는 응답에 넣지 않는다(api.md의 user는 `{id, email}`).
- 테스트 DB는 `mongodb-memory-server`(devDependency). 실제 compose DB를 쓰지 않는다.
- 로그아웃 API는 없다(프런트가 토큰을 버림).

## 완료 기준 (주장)
- [ ] C3-1: `POST /api/auth/signup` `{email,password}` → `201 {token, user:{id,email}}`. 이메일 형식 오류·빈 값, 빈 비밀번호·72바이트 초과 → `400 VALIDATION`(`details: [{field, reason}]`). 이미 가입된 이메일(대소문자·공백 차이 포함) → `409 EMAIL_TAKEN`. 응답·DB 문서 어디에도 평문 비밀번호가 없다. e2e 테스트(supertest + mongodb-memory-server) 있음.
- [ ] C3-2: `POST /api/auth/login` → `200 {token, user}`. 틀린 비밀번호와 없는 이메일은 같은 `401 INVALID_CREDENTIALS`(같은 message). 시드 계정(`SEED_USER_EMAIL`/`SEED_USER_PASSWORD`)으로 로그인되는 테스트가 있다.
- [ ] C3-3: `GET /api/auth/me`가 유효한 토큰이면 `200 {user:{id,email}}`. 토큰 없음·`Bearer` 형식 아님·서명 변조·다른 비밀로 서명·만료(짧은 `JWT_EXPIRES_IN`로 테스트)·삭제된 사용자 → 모두 `401 UNAUTHENTICATED`. 전역 가드라서 새 컨트롤러는 `@Public()` 없이 자동 보호된다는 테스트(임시 테스트용 컨트롤러 또는 `/api/auth/me`)가 있고, `/__health`는 토큰 없이 200이다.
- [ ] C3-4: `JWT_SECRET`이 비어도 앱이 기동해 가입·로그인·me가 동작하고, 비밀 값이 로그·응답에 나오지 않는다(테스트). 소유자 검사 헬퍼가 있고 단위 테스트로 "남의 자원 → 404 NOT_FOUND"를 단언한다.
