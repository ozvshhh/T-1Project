#!/usr/bin/env bash
# 백엔드 역할 분리 랄프 루프. 저장소 루트에서 실행된다. 사용법: server/ralph/ralph.sh [최대 반복 수]
set -u
cd "$(dirname "$0")/../.." || exit 1
R=server/ralph
CLAIMS=$(node $R/check.mjs count)
MAX="${1:-$(( CLAIMS * 4 + 2 ))}"           # 위키 관찰: 상한은 주장 수 × 3보다 크게
mkdir -p $R/logs $R/reviews $R/confirms
echo "주장 $CLAIMS개, 최대 반복 $MAX"

COMMON=(Read Glob Grep "Bash(ls:*)" "Bash(cat:*)" "Bash(npm run:*)" "Bash(npm test:*)" "Bash(npx jest:*)" "Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)" "Bash(git show:*)")
VERIFY_TOOLS=("${COMMON[@]}" "Write($R/reviews/*)" "Edit($R/reviews/*)" "Bash(docker compose:*)" "Bash(curl:*)" "Bash(sleep:*)")
FIX_TOOLS=("${COMMON[@]}" Write Edit "Bash(npm install:*)" "Bash(npm ci:*)" "Bash(npx nest:*)" "Bash(mkdir:*)" "Bash(git add:*)" "Bash(git commit:*)")
FIX_DENY=("Edit($R/**)" "Edit(docs/**)" "Edit(frontend/**)" "Edit(e2e/**)" WebSearch WebFetch)
CONFIRM_TOOLS=("${COMMON[@]}" "Write($R/confirms/*)" "Edit($R/confirms/*)")

for i in $(seq 1 "$MAX"); do
  NEXT=$(node $R/check.mjs next)
  case "$NEXT" in
    COMPLETE) echo "=== 모든 주장 pass. $((i-1))회에서 끝. ==="; node $R/check.mjs status; exit 0 ;;
    BLOCKED)  echo "=== BLOCKED.md 확인 후 사람이 판단하세요. ==="; exit 1 ;;
  esac
  ROLE=${NEXT%% *}; CID=${NEXT##* }
  SPEC=$(node -e "const l=require('./$R/ledger.json');console.log(l.claims.find(c=>c.id==='$CID').spec)")
  CLAIM=$(node -e "const l=require('./$R/ledger.json');const c=l.claims.find(c=>c.id==='$CID');console.log(JSON.stringify(c))")
  start=$(date +%s)
  echo ""; echo "=== 반복 $i/$MAX  역할=$ROLE  주장=$CID  ($(date +%H:%M:%S)) ==="

  PROMPT="$(cat $R/prompts/$ROLE.md)

## 이번 주장
$CLAIM

## 읽을 파일(이 순서로)
1. $R/AGENT.md
2. $R/specs/$SPEC
3. docs/api.md (해당 절만)"

  case "$ROLE" in
    verify)
      claude -p "$PROMPT" --permission-mode default --allowedTools "${VERIFY_TOOLS[@]}" 2>&1 | tee "$R/logs/$i-verify-$CID.log" ;;
    fix)
      node $R/check.mjs before fix "$CID" >/dev/null
      PROMPT="$PROMPT
4. $R/reviews/$CID.md (반영할 제안)"
      claude -p "$PROMPT" --permission-mode acceptEdits --allowedTools "${FIX_TOOLS[@]}" --disallowedTools "${FIX_DENY[@]}" 2>&1 | tee "$R/logs/$i-fix-$CID.log" ;;
    confirm)
      SNAP=$(node -e "const l=require('./$R/ledger.json');console.log(l.claims.find(c=>c.id==='$CID').snapshot)")
      N=$(node -e "const l=require('./$R/ledger.json');console.log(l.claims.find(c=>c.id==='$CID').fixCount+1)")
      PROMPT="$PROMPT
4. $R/reviews/$CID.md (제안)
5. 수정 전 스냅샷 commit: $SNAP — 'git diff $SNAP..HEAD -- server docker-compose.yml deploy README.md'로 변경을 본다
6. 결과 파일 이름: $R/confirms/$CID-$N.md"
      claude -p "$PROMPT" --permission-mode default --allowedTools "${CONFIRM_TOOLS[@]}" 2>&1 | tee "$R/logs/$i-confirm-$CID.log" ;;
  esac

  RESULT=$(node $R/check.mjs after "$ROLE" "$CID")
  secs=$(( $(date +%s) - start ))
  echo "--- $RESULT | ${secs}초"
  echo "$i,$ROLE,$CID,\"$RESULT\",$secs" >> $R/logs/summary.csv
done
echo "=== 최대 반복 수($MAX) 도달. check.mjs status로 남은 주장을 보세요. ==="
node $R/check.mjs status
exit 1
