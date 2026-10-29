#!/usr/bin/env bash
# 랄프 루프: PROMPT.md 를 최대 N바퀴 반복 실행한다.
# 사용법: ./ralph.sh [최대 반복 수, 기본 10]
# 모델·강도는 환경변수로 바꾼다. 예: MODEL=opus EFFORT=high ./ralph.sh 3
#   MODEL    기본 sonnet  (claude --model, 별칭 fable/opus/sonnet 또는 전체 이름)
#   EFFORT   기본 medium  (claude --effort: low, medium, high, xhigh, max)
#   FALLBACK 기본 sonnet  (claude --fallback-model, 과부하 때 대신 쓸 모델. 비우면 안 씀)
set -u
cd "$(dirname "$0")"
MAX="${1:-10}"
MODEL="${MODEL:-sonnet}"
EFFORT="${EFFORT:-medium}"
FALLBACK="${FALLBACK-sonnet}"
RUN="$(date +%Y%m%d-%H%M%S)"
mkdir -p logs

extra=()
# 주 모델과 같은 fallback은 넘기지 않는다.
if [ -n "$FALLBACK" ] && [ "$FALLBACK" != "$MODEL" ]; then
  extra+=(--fallback-model "$FALLBACK")
fi

echo "=== 실행 $RUN: 모델 $MODEL, 강도 $EFFORT${FALLBACK:+, fallback $FALLBACK} ==="

for i in $(seq 1 "$MAX"); do
  start=$(date +%s)
  log="logs/iter-$RUN-$i.log"
  echo ""
  echo "=== 바퀴 $i / $MAX  ($(date +%H:%M:%S)) ==="

  claude -p "$(cat PROMPT.md)" \
    --model "$MODEL" \
    --effort "$EFFORT" \
    ${extra[@]+"${extra[@]}"} \
    --add-dir ../docs \
    --permission-mode acceptEdits \
    --allowedTools "Bash(npx vitest:*)" "Bash(npx tsc:*)" "Bash(npm run:*)" "Bash(npm test:*)" "Bash(git add:*)" "Bash(git rm:*)" "Bash(git commit:*)" "Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)" \
    2>&1 | tee "$log"

  secs=$(( $(date +%s) - start ))
  passed=$(npx vitest run 2>&1 | grep -E "Tests +[0-9]" | tail -1)
  echo "--- 바퀴 $i 끝: ${secs}초 | ${passed:-테스트 결과 없음}"
  echo "$RUN,$i,$MODEL,$EFFORT,${secs},\"${passed}\"" >> logs/summary.csv

  if grep -q "^RALPH_COMPLETE" "$log"; then
    echo "=== 완료 신호를 받았어요. $i 바퀴에서 멈춥니다. ==="
    exit 0
  fi
  if grep -q "^- \[!\]" fix_plan.md; then
    echo "=== 막힌 작업([!])이 생겼어요. progress.md 를 확인하세요. ==="
    exit 1
  fi
done

echo "=== 최대 반복 수($MAX)에 도달했어요. ==="
