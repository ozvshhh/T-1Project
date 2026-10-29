# T-1Project

SUMTECH 2026 루프톤 팀 서비스 저장소입니다. 주제: AI 에이전트와 함께 만드는 실생활 문제 해결 서비스.

## 문서

- `docs/problem.yaml` — 문제 정의와 기능 명세 (2단계에서 작성)
- `docs/scenarios.yaml` — 사용자 핵심 흐름과 주 사용 플랫폼 (2단계에서 작성)
- `progress.md` — 진행 기록
- `docs/design/DESIGN.md` — UI 스타일 가이드 (색·글꼴·모서리·간격만, 내용·기능은 problem.yaml과 specs를 따름). 견본: `docs/design/style-reference.html`

## 설치·실행

3단계에서 앱 구성이 정해지면 여기에 설치·빌드·실행 방법과 환경변수 표를 적습니다.

## 환경변수

| 이름 | 용도 | 설정 위치 |
| --- | --- | --- |
| `RELEASE_ID` | 배포된 commit 식별자 (`/__health` 응답) | docker-compose·CI·배포 |
| `DATABASE_URL` | DB 연결 주소 | docker-compose·배포 |
| `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` | 로컬 docker 시드 계정 | docker-compose |
| `AI_GATEWAY_API_KEY` | AI Gateway 키 (필요할 때만) | 배포 환경변수·GitHub Secrets |

변수 이름 목록은 `.env.example`에 있습니다.

## 팀 작업 방법

1. 초대 메일(또는 GitHub 알림)에서 **Accept invitation**을 누른다.
2. 저장소를 받는다.
   ```bash
   git clone https://github.com/tgYun783/T-1Project.git
   cd T-1Project
   ```
3. 작업은 각자 브랜치에서 한다. `main`에 직접 올리지 않는다.
   ```bash
   git checkout -b feature/작업이름
   # 수정 후
   git add <파일>
   git commit -m "설명"
   git push -u origin feature/작업이름
   ```
4. GitHub에서 `main`으로 Pull Request를 만들어 합친다. 대시보드와 주최 측 실행은 `main`에 올라간 것만 본다.
5. 작업 시작 전에는 항상 `git pull origin main`으로 최신 상태를 받는다.
