# 할 일 목록

위에서부터 하나씩. 끝내면 [x], 막히면 [!].
스펙: `specs/` (2026-10-30 새 기획). 이전 기획(이력서·모의면접) 코드는 1번에서 지운다.
각 작업의 완료 조건 = 그 작업 스펙의 「테스트」 항목이 vitest로 통과하고, `npm run typecheck`·`npm run lint`에 새 오류가 없다.
테스트는 화면 글자(버튼·입력칸 이름)로 요소를 찾는다. 글자는 `specs/`의 것을 그대로 쓴다.

- [ ] 1. 이전 기획 코드 정리: `src/pages/Resume.tsx`, `src/pages/interview/` 전체, `src/pages/cover-letters/` 전체, `src/pages/Home.tsx`, `src/lib/media.ts`, 이전 기획을 검사하는 `src/flows.test.tsx`를 `git rm`으로 지운다. `App.tsx` 라우트는 `*`(NotFound)만 남기고, `App.test.tsx`는 없는 주소에서 `없는 페이지예요`와 `홈으로`가 보이는지만 검사하도록 맞춘다(specs/00-common.md L). `npm run typecheck`가 통과해야 한다.
- [ ] 2. API 타입·클라이언트 교체: `src/api/types.ts`를 docs/api.md 2절 타입으로, `src/api/client.ts`를 api.md 경로 전체 함수로 바꾼다. 토큰은 localStorage, 모든 요청에 `Authorization: Bearer`, `401`이면 토큰 삭제(specs/00-common.md). `src/auth/`도 토큰 방식으로 맞춘다. 테스트: Bearer 헤더가 붙는지, 401이면 토큰이 지워지는지.
- [ ] 3. 목 API 교체: `src/mocks/db.ts`·`handlers.ts`를 api.md 모든 경로로 다시 쓰고, `specs/mock-data.md`의 시드와 AI 고정 동작을 넣는다. 테스트에서 `server.use`를 쓸 수 있게 `src/test/setup.ts`의 MSW 서버를 export한다. `src/test/render.tsx`의 로그인 도우미를 토큰 방식으로 맞춘다. 테스트: 시드 계정 로그인, 경험 2개·자소서 1개 조회, 시드 자소서 점검이 네 문장을 고르는지, "재지 않았" 답이 `unknown`이 되는지.
- [ ] 4. 공통 레이아웃: 헤더(로그인 전·후), 로그인 보호, 자소서 잠금 가드, AI 진행·실패·`다시 시도` 컴포넌트, 상태 표시 컴포넌트, 단계 색(specs/00-common.md). 테스트: 로그인 안 한 채 `/experiences`면 로그인 화면, 확정 카드 없는 계정으로 `/cover-letters/paste`면 홈 잠금 안내, `로그아웃`이면 토큰 삭제.
- [ ] 5. A 소개·B 가입·로그인 (specs/01-auth.md, 시나리오 S1).
- [ ] 6. C 홈 잠금·목록 (specs/02-home.md, S1·S3). S1 흐름 테스트: 소개 → `가입하기` → 가입 → 잠금 안내와 `경험 등록`.
- [ ] 7. D 경험 목록·E 경험 등록 (specs/03-experiences.md).
- [ ] 8. F 경험 상세 — 위 영역·대화·항목 상태 (specs/04-experience-detail.md, S4).
- [ ] 9. F 경험 상세 — 사실 후보 확정·경험 카드·직접 추가 (specs/04-experience-detail.md, S2). S2 흐름 테스트: 가입 → `경험 등록` → 등록 → `직접 추가` → `카드에 추가` → `자소서` 메뉴에서 `새로 쓰기`가 보임.
- [ ] 10. G 붙여넣기 (specs/05-cover-letters.md, S3). S3 흐름 테스트.
- [ ] 11. H 작성 시작 (specs/05-cover-letters.md).
- [ ] 12. I 문항별 작성 (specs/06-write.md, S5). S5 흐름 테스트: `새로 쓰기` → 입력 → `작성 시작` → 캡스톤 카드 켜기 → `이 문항 만들기` → 응답과 근거 카드.
- [ ] 13. J 자소서 상세 — 붙여넣음·작성함·점검 입구·지난 점검 (specs/05-cover-letters.md).
- [ ] 14. K 제출 전 점검 — 문장 목록·질문·판정·다음 문장·오래된 점검 (specs/07-check.md, S6). S6 흐름 테스트.
- [ ] 15. K 제출 전 점검 — 고치기·경험 대화 바로가기, 사실 후보 카드에 저장 (specs/07-check.md).
- [ ] 16. 마무리: `npm run check` 전체 통과. 실패하면 고친다. 스펙에 없는 화면·파일이 남아 있지 않은지 `src/`를 확인한다.
