# 가채점표 인수인계 (Claude → Claude)

이 문서를 받은 Claude는 저장소의 `tools/plan-score/` 도구로 T1 팀 기획서(`docs/problem.yaml`)를 채점하고,
학생과 함께 점수를 올리는 일을 이어받는다. 작성: 2026-10-30 06:00 무렵(KST).

## 1. 한 줄 요약

대회 대시보드의 **기획 점수(30점)**를 미리 가늠하는 가채점기다.
`score.py`가 problem.yaml을 채점하고, `backtest.py`가 대시보드의 시간별 실제 점수와 맞춰 "대시보드 예상 점수" 식을 만든다.
현재 main(fd42155)의 형식 가채점은 **29.5 / 30**, 대시보드 예상은 **약 18.4 / 30(±1.0)**이다.

## 2. 폴더 내용

| 파일 | 하는 일 |
|---|---|
| `score.py` | problem.yaml 채점. `scorecard.md`(항목별 점수·우선순위)를 쓰고 `history.csv`에 한 줄 쌓는다 |
| `backtest.py` | 대시보드 시간별 점수(`DASH` 목록)와 그 시각 main의 problem.yaml을 맞춰 보고 `calib.json`(예상식)을 다시 만든다 |
| `calib.json` | 예상식 `대시보드 예상 = a + b × 형식 가채점`. 지금 a=4.44, b=0.47, 평균 오차 1.0 |
| `가채점표.md` | 항목·배점, 시점별 대조표, 데이터에서 읽은 것, 한계. **처음에 꼭 읽을 것** |
| `scorecard.md`, `history.csv` | 마지막 채점 결과와 기록. 실행하면 생기고 git에는 올리지 않는다(`.gitignore`) |
| `HANDOFF.md` | 이 문서 |

아래 명령은 모두 **저장소 루트**에서 실행한다.

필요한 것: Python 3, PyYAML(`pip install pyyaml`), git, GitHub CLI(`gh`, 저장소 clone용).

## 3. 저장소

- GitHub: `tgYun783/T-1Project` (private, 기본 브랜치 `main`). 대시보드는 **main에 push된** `docs/problem.yaml`을 읽는다.
- 로컬 clone이 없으면: `gh repo clone tgYun783/T-1Project <짧은 경로>` (Windows는 경로가 길면 clone이 실패한다. 짧은 폴더에 받는다).
- 팀이 서로 다른 Claude 세션으로 동시에 작업한다. 작업 전 항상 `git pull`로 최신 main을 받는다.

## 4. 채점하는 법

```bash
python tools/plan-score/score.py docs/problem.yaml
```

출력의 "형식 가채점"과 "대시보드 기획 점수 예상"을 학생에게 알리고, `scorecard.md`의 "점수 올리기 우선순위"를 보여 준다.

대시보드에 새 점수가 찍히면(정시마다 채점됨, 학생이 화면 캡처를 줌) `backtest.py`의 `DASH`에 한 줄 추가하고 다시 맞춘다.

```python
("2026-10-30 06:00", 기획점수, 구현점수),   # 그래프 눈금으로 읽은 값
```

```bash
git fetch
python tools/plan-score/backtest.py .
```

backtest는 `origin/main`의 기록을 읽으니 먼저 `git fetch`를 한다. 배점을 고치거나 DASH를 늘린 변경은 다른 수정과 모아서 커밋한다.

평균 차이가 커지면(예: 2점 이상) 어느 시점에서 어긋났는지 보고, 그때 바뀐 칸을 근거로 `score.py`의 배점을 고친다.
배점을 고친 뒤에는 반드시 backtest를 다시 돌려 평균 차이와 "오르내림 방향이 맞은 구간"을 확인한다.

## 5. 지금까지 알아낸 것 (근거: 가채점표.md 「대조 결과」)

- 점수가 크게 오른 때는 **없던 칸이 생긴 때**였다. 해법·기능이 처음 생김(+4.9), 출처 정리·순환 논리 제거(+2.4), 완결 문장 statement·대표 경험 E4(+2.4).
- 크게 떨어진 때는 **초점이 흔들린 때**였다. 초점만 바꾸고 다른 칸은 옛 초점 그대로 + 근본 문제 "(가설)"(-4.1), 명사구 statement·고객 확장·근거 없는 주장(최저 7.4).
- 02:00~05:00 동안 문구 다듬기·출처 교체만 했고 점수는 17.4에서 그대로였다. 형식 항목은 거의 다 찼고, **형식을 30점 다 채워도 예상은 약 18.6점에서 멈춘다.** 그 위는 대시보드가 내용의 질을 보는 영역이라 이 도구로는 알 수 없다.
- features와 functional_spec 불일치는 점수 변화로 드러나지 않았다(F4는 키트 규칙 때문에 1점만 둠).

## 6. 현재 상태와 남은 일

main fd42155 기준.

- 남은 감점: **P4 -0.5**. experiences의 "학생 답 대기" 5줄과 E4.when 빈칸.
  - E1: 막힌 꼬리질문의 구체적 내용
  - E2: quote가 지인이 실제로 한 말인지
  - E4: 인터뷰 날짜, 대상(학년·구직 상황), 면접 시점·회사 규모, 면접 결과, 인터뷰 인원 수
  - 다른 팀원들의 면접 경험: 언제·어느 면접인지
  - → 학생에게 E4부터 하나씩 묻는다(이전 세션에서 물었지만 답을 받지 못했다).
- 06:00 이후 대시보드 점수를 받아 예상 18.4와 비교하고 DASH에 추가한다.
- 열린 PR #37(`docs/solution-paths-scope`)과 브랜치 `docs/alternatives-a1-a4`, `docs/spec-resume-coverletter`, `feature/backend-plan`은 main과 problem.yaml이 충돌하고, 이후 팀 결정(경로 3 보류, features 교체)보다 오래된 내용이다. **머지하지 않았다.** 정리(닫기 등)는 팀이 정한다.
- `frontend` 브랜치(E2E S1~S6 스펙, 05:20)는 main과 충돌 없이 합쳐지지만 학생 요청이 아니어서 머지하지 않았다.

## 7. 꼭 지킬 것

1. **기획 내용은 학생 말에서만 나온다.** 대회 키트(loopthon-starter `START_HERE.md`·`steps/02-problem.md`) 규칙이다.
   채점기는 무엇이 비었는지만 알려 준다. 빈칸을 Claude가 채우거나 답·후보·예시 문장을 먼저 내지 않는다.
   학생에게 질문은 한 번에 하나나 둘, 해요체로 한다. 학생 답을 반영할 때는 주석에 "학생 답(날짜)"을 남긴다.
   예외: 팀 문서에 이미 있는 내용을 다른 칸으로 옮기는 일(예: scenarios.yaml expected → features.done)은 출처를 주석에 적고 할 수 있다.
2. **점수만 올리는 수정은 하지 않는다.** "학생 답 대기" 표시를 지우거나 출처 번호만 붙이면 형식 점수는 오르지만 실제 점수는 안 오른다.
3. **push는 모아서 한다.** main에 push할 때마다 CI가 실제 AI를 불러 팀 예산($10)이 준다. 학생은 PR 없이 main에 바로 push하는 것을 허락했지만, push 여부는 매번 학생에게 묻는다.
4. push 전에 `git pull`로 최신 main을 받고, YAML 문법을 확인한다(`python -c "import yaml;yaml.safe_load(open('docs/problem.yaml',encoding='utf-8'))"`).
5. 학생이 "다 머지"처럼 범위가 모호하게 말하면 무엇을 머지할지 먼저 확인한다(이전 세션에서 학생의 뜻은 "방금 고친 것이 머지됐는지"였다).

## 8. 채점기에서 조심할 점

- 출처 번호 `S#`과 scenarios.yaml 흐름 번호가 겹친다. features에서는 흐름을 `(흐름 S5)`처럼 쓰고, 채점기는 "흐름 " 뒤의 S#을 출처로 세지 않는다.
- 한글 조사가 붙은 인용("S3의")도 인용으로 센다(정규식 `(?<![A-Za-z0-9])S\d+(?!\d)`).
- 대시보드 그래프 값은 눈금으로 읽어 ±0.3 오차가 있다. 정시 채점으로 보고, 그 시각 직전의 main 버전을 쓴다(`git rev-list -1 --first-parent --before="<시각> +0900" origin/main`).
- 구현 점수(20점)는 이 도구의 대상이 아니다.
