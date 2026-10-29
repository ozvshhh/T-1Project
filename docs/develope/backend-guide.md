# 백엔드 개발 가이드 (랄프 루프 참고용)

백엔드 담당자와 랄프 루프(`PROMPT.md`)가 읽는 문서다. 주최 측 채점 규칙과 배포 환경의 제약을 모았다. 비밀값(비밀번호·키)은 이 문서와 저장소에 적지 않는다.

## 현재 구성

| 항목 | 내용 |
| --- | --- |
| 프론트 | `frontend/` — Vite + React + TS + Tailwind v4 (`npm run check`로 검사) |
| 컨테이너 | 루트 `Dockerfile`, `docker-compose.yml` (현재 `app` 하나, nginx가 정적 파일 + `/__health`) |
| 배포 | AWS Lightsail Container Service `t1-project` (서울, nano 1대) |
| 배포 주소 | https://t1-project.g339d0tmz2ype.ap-northeast-2.cs.amazonlightsail.com |
| DB | Lightsail Managed Database `t1-db` (PostgreSQL 18, micro, 비공개, 서울). VPC 피어링 켜짐 |

## 지켜야 할 채점 규칙 (어기면 주최 측 실행이 실패한다)

1. **서비스 이름은 `app`, 포트는 `"3000:3000"`**. 앱은 컨테이너 안 `0.0.0.0:3000`에서 받는다. 브라우저는 3000번 `app` 하나만 거친다.
2. **절대 주소 금지**. `http://localhost:3000` 같은 주소를 코드·설정에 쓰지 않는다(API·리다이렉트·CORS는 요청 기준 상대 경로, 예: `/api/...`).
3. `app` 외 서비스(`db` 등)에는 `ports`·`container_name`을 두지 않는다. `env_file`도 쓰지 않는다(`.env`는 저장소에 없다).
4. DB 데이터는 이름 붙은 볼륨(`db-data`)에 둔다. `./data` 같은 폴더 연결 금지.
5. 환경변수 이름은 그대로: `RELEASE_ID`, `SEED_USER_EMAIL`, `SEED_USER_PASSWORD`, `AI_GATEWAY_API_KEY`. 시드 계정 값은 `${}` 없이 compose에 직접 적는다.
6. 빌드(의존성 설치·컴파일)는 `Dockerfile`에서 끝낸다. 시작 명령은 서버 실행(필요하면 마이그레이션·시드 포함)만 한다.
7. 빈 DB에서 `docker compose up --build`만으로 앱과 시드 데이터가 **2분 안에** 떠야 한다. 빌드는 10분 이내, app은 CPU 2개·메모리 4GB 제한.
8. 앱은 처음 뜰 때 시드 계정과 흐름에 필요한 선행 데이터를 스스로 만든다. 흐름이 만드는 데이터는 미리 만들지 않는다.
9. `AI_GATEWAY_API_KEY`는 비어 있어도 앱이 떠야 한다. 서버는 이 이름으로만 키를 읽는다.
10. **`GET /__health`**: 로그인·리다이렉트 없이 5초 안에 200, `Content-Type: application/json`, `Cache-Control: no-store`, 본문 `{"releaseId":"<빌드에 주입된 commit SHA>"}`. SHA를 소스에 고정하지 않는다(`RELEASE_ID` 빌드 인자).
11. 로그인이 있으면 가짜 성공 화면이 아니라 실제 인증으로 만들고, 시드 계정은 아이디·비밀번호로 바로 로그인된다. 없는 주소는 404(500 아님).
12. 로그인하지 않은 사람이 `/`를 열면 서비스 이름과 하는 일이 보여야 한다.

## 백엔드를 붙일 때 권장 구조

- 서버 하나가 API(`/api/...`), 프론트 정적 파일(`frontend/dist`), `/__health`를 모두 3000에서 처리한다. 지금 `Dockerfile`의 nginx 단계를 서버 실행으로 바꾼다.
- `docker-compose.yml`에 `db` 서비스(postgres)를 추가하고 `app`에 `DATABASE_URL`을 준다. 로컬 compose용 DB는 채점·개발용이다.
- 마이그레이션·시드는 앱 기동 시 실행하고 여러 번 실행해도 안전하게(멱등) 만든다.

## 배포 환경의 DB

- 배포용 DB는 Lightsail Managed Database `t1-db`이고 **인터넷에 공개되어 있지 않다**. 로컬 PC에서는 직접 접속할 수 없다. 배포된 컨테이너에서만 VPC 피어링으로 내부 주소로 붙는다.
- 접속 정보(엔드포인트·포트)는 AWS CLI로 확인한다. 마스터 비밀번호는 문서·채팅·Git에 적지 않는다.
  ```bash
  aws lightsail get-relational-database --region ap-northeast-2 --relational-database-name t1-db \
    --query 'relationalDatabase.masterEndpoint'
  aws lightsail get-relational-database-master-user-password --region ap-northeast-2 \
    --relational-database-name t1-db
  ```
- 마스터 사용자 `t1admin`, DB 이름 `app`. 연결 문자열은 `DATABASE_URL`로 컨테이너 환경변수에 넣는다(deployment 설정).
- Container Service에는 영구 디스크가 없다. 파일 업로드·SQLite 같은 로컬 저장에 기대지 않는다.

## 배포 방법 (수동)

AWS 로그인(`aws login`)과 `lightsailctl`(`~/.local/bin`)이 필요하다. 맥(arm64)에서는 반드시 `linux/amd64`로 빌드한다.

```bash
SHA=$(git rev-parse HEAD)
docker build --platform linux/amd64 --build-arg RELEASE_ID=$SHA -t t1-app:$SHA .
aws lightsail push-container-image --region ap-northeast-2 --service-name t1-project --label app --image t1-app:$SHA
# 출력된 ":t1-project.app.N" 이미지로 deployment 생성 (포트 3000, health check /__health, RELEASE_ID=$SHA, DATABASE_URL 등)
aws lightsail create-container-service-deployment --region ap-northeast-2 --service-name t1-project \
  --containers file://containers.json --public-endpoint file://endpoint.json
```

배포 뒤에는 `curl <배포주소>/__health`로 `releaseId`가 방금 commit SHA와 같은지 확인하고, 대시보드에 같은 배포 URL을 다시 저장해 UP과 버전 일치를 갱신한다. 대시보드는 **기본 브랜치(main)의 commit**만 본다.

## 랄프 루프에서 지킬 점

- 한 바퀴에 작업 하나만. 스펙(`frontend/specs/` 또는 백엔드 스펙 폴더)에 없는 기능은 만들지 않는다.
- 기존 `*.test.*` 파일은 수정·삭제하지 않는다. 새 기능은 새 테스트 파일로 추가한다.
- 위 채점 규칙(특히 `/__health`, 상대 경로, 시드 계정, 2분 기동)을 어기는 변경은 테스트로 막는다.
- 비밀값(DB 비밀번호, `AI_GATEWAY_API_KEY`)은 코드·로그·커밋에 남기지 않는다. `.env.example`에는 이름만 적는다.
- 행사가 끝나면 과금되는 리소스(컨테이너 서비스 `t1-project`, DB `t1-db`)를 삭제한다.
