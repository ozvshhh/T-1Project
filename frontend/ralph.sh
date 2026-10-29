#!/usr/bin/env bash
# 랄프 루프: PROMPT.md 를 최대 N바퀴 반복 실행한다.
# 사용법: ./ralph.sh [최대 반복 수, 기본 10]
set -u
cd "$(dirname "$0")"
MAX="${1:-10}"
mkdir -p logs

for i in $(seq 1 "$MAX"); do
  start=$(date +%s)
  echo ""
  echo "=== 바퀴 $i / $MAX  ($(date +%H:%M:%S)) ==="

  claude -p "$(cat PROMPT.md)" \
    --permission-mode acceptEdits \
    --allowedTools "Bash(npx vitest:*)" "Bash(npx tsc:*)" "Bash(npm run:*)" "Bash(npm test:*)" "Bash(git add:*)" "Bash(git rm:*)" "Bash(git commit:*)" "Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)" \
    2>&1 | tee "logs/iter-$i.log"

  secs=$(( $(date +%s) - start ))
  passed=$(npx vitest run 2>&1 | grep -E "Tests +[0-9]" | tail -1)
  echo "--- 바퀴 $i 끝: ${secs}초 | ${passed:-테스트 결과 없음}"
  echo "$i,${secs},\"${passed}\"" >> logs/summary.csv

  if grep -q "^RALPH_COMPLETE" "logs/iter-$i.log"; then
    echo "=== 완료 신호를 받았어요. $i 바퀴에서 멈춥니다. ==="
    exit 0
  fi
  if grep -q "^- \[!\]" fix_plan.md; then
    echo "=== 막힌 작업([!])이 생겼어요. progress.md 를 확인하세요. ==="
    exit 1
  fi
done

echo "=== 최대 반복 수($MAX)에 도달했어요. ==="
