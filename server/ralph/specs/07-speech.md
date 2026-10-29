# 명세 07 — 음성 전사·TTS (단계 7, E2E 대상 아님)
바탕: docs/api.md 7절. 학생 답: 전사는 OpenAI STT 모델, 서버 경유.

## 결정
- 모델 이름 환경변수 `AI_STT_MODEL`, `AI_TTS_MODEL`(Gateway 목록에서 확인한 식별자만; 확인 전엔 기본값을 비워 두고 비어 있으면 502).
- 업로드 상한 `SPEECH_MAX_BYTES`(기본 25MB), 허용 MIME `audio/webm,audio/ogg,audio/wav,audio/mpeg`. 오디오는 디스크·DB에 저장하지 않는다.

## 완료 기준
- [ ] C7-1: `POST /api/speech/transcribe` multipart(`audio`,`interviewId`) → 200 `{text}`. 남의 세션 → 404. 크기·MIME 위반 → 400. 전사 결과가 공백만 → 400 EMPTY_TRANSCRIPT. AI 실패 → 502. 단위 테스트(AiModule mock).
- [ ] C7-2: `GET /api/speech/tts?interviewId&questionId` → 200 `audio/mpeg` 스트림. 실패 → 502. 질문이 그 세션에 없으면 404.
- [ ] C7-3: 사람이 실제 키로 짧은 녹음 1건을 전사해 결과를 `server/ralph/reviews/C7-manual.md`에 기록(비용 포함). 이 주장은 verify가 사람 기록 파일의 존재와 내용(모델 식별자·결과 비어 있지 않음)으로 판정한다.
