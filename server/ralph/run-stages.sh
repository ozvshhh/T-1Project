#!/usr/bin/env bash
# 여러 단계를 순서대로 이어 돌린다. 사용법: server/ralph/run-stages.sh 02 03 04
# 단계마다 명세를 적재하고 ralph.sh를 돌린다. 어느 단계든 0이 아닌 종료 코드면(BLOCKED·권한·한도·상한) 거기서 멈춘다.
set -u
cd "$(dirname "$0")/../.." || exit 1
R=server/ralph
for STAGE in "$@"; do
  echo ""; echo "######## 단계 $STAGE 시작 ($(date +%H:%M:%S)) ########"
  node $R/check.mjs load "$STAGE" || exit 1
  "$R/ralph.sh"
  code=$?
  if [ $code -ne 0 ]; then
    echo "######## 단계 $STAGE 에서 멈춤 (exit $code). check.mjs status와 BLOCKED.md를 확인하세요. ########"
    exit $code
  fi
  echo "######## 단계 $STAGE 완료 ($(date +%H:%M:%S)) ########"
done
echo "######## 요청한 단계 모두 완료 ########"
