# 명세 05 — 경험·단서·직접 쓴 사실 R2·R5·R6 (단계 5)

바탕: `docs/api.md` 2절(Experience·Clue·Fact 모양), 4절, 6절의 `POST/PATCH/DELETE .../facts`, R2·R5·R6, C1.
AI를 부르지 않는 단계다. 대화·후보 확정(6절 confirm)은 06에서 한다.

## 결정
- 컬렉션: `experiences`(userId, title, period, itemStatus, createdAt, updatedAt), `clues`(experienceId, userId, type, description, text, fileName, mimeType, size, 파일 바이트), `facts`(experienceId, userId, item, text, status, source, clueId, origin, createdAt). 응답은 api.md 2절 모양으로 조립한다(`card`는 `status: confirmed`만 항목별로, `candidates`는 `status: candidate`만).
- 파일은 **MongoDB에 저장**한다(GridFS 또는 문서 안 Binary). 배포 컨테이너에 영구 디스크가 없으므로 로컬 디스크에 쓰지 않는다(backend-guide 「배포 환경의 DB」).
- 파일 형식·크기: api.md 11절 「학생 답 대기」. 답이 오기 전에는 설정값 `CLUE_MAX_BYTES`(기본 5MB) 초과만 `400 VALIDATION`(field `file`)으로 막고 형식은 제한하지 않는다. 업로드는 `multer` 메모리 저장 + 크기 제한.
- `itemStatus` 처음 값은 다섯 항목 모두 `null`. 사실을 추가·수정·삭제해도 `itemStatus`는 바뀌지 않는다(api.md 5절 끝, 학생 답).
- 사실 `source`는 `said`|`clue`만 받는다. `ai_unverified`는 400(C1). `clue`면 `clueId` 필수이고 **같은 경험의 단서**여야 한다. 아니면 400.
- 경험의 `updatedAt`은 제목·시기 수정, 단서 추가, 사실 추가·수정·삭제 때 갱신한다(목록이 최근 수정순).
- 모든 경로는 03의 전역 가드·소유자 검사(남의 것 → 404)를 쓴다. 잘못된 ObjectId 형식도 404.

## 완료 기준 (주장)
- [ ] C5-1: `POST /api/experiences`(`title`·`period` 필수, 공백만이면 400) → `201 {experience}`가 api.md 2절 모양(`clues: []`, `itemStatus` 다섯 항목 `null`, `card` 다섯 항목 빈 배열, `candidates: []`)이다. `GET /api/experiences`는 내 것만 최근 수정순, `GET /api/experiences/:id`·`PATCH`(`title`/`period`, 빈 값 400)는 남의 것·없는 id·잘못된 id 형식에 404. e2e 테스트 있음.
- [ ] C5-2: `POST /api/experiences/:id/clues`가 JSON 텍스트 단서(`text` 필수)와 multipart 파일 단서(`type`이 photo·award·document, `file` 필수, `description` 선택)를 받아 `201 {clue}`를 돌려주고, `GET /api/experiences/:id`의 `clues`에 보인다. 파일 바이트는 Mongo에 있고 디스크에 쓰지 않는다. `CLUE_MAX_BYTES` 초과 → 400. `GET .../clues/:clueId/file`이 올린 바이트·Content-Type·파일 이름(Content-Disposition)을 그대로 돌려주고, 텍스트 단서·남의 단서는 404. e2e 테스트 있음.
- [ ] C5-3: `POST /api/experiences/:id/facts`(`item`, `text`, `source` said|clue, `clueId`) → `201 {fact}`(`status: confirmed`, `origin: manual`)이고 경험의 `card[item]`에 들어간다. `PATCH .../facts/:factId`로 text·item·source 수정, `DELETE`는 204. `source: ai_unverified`·없는 item·빈 text·`clue`인데 clueId 없음·다른 경험의 clueId → 400. 사실을 바꿔도 `itemStatus`가 그대로이고 `updatedAt`은 바뀐다. e2e 테스트 있음.
