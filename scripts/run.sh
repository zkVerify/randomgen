#!/bin/bash
set -euo pipefail

# Simple wrapper to run the circuit with CLI inputs instead of manually editing input.json.
#
# Usage:
#   ./scripts/run.sh <blockHash> <userNonce> <kurierEntropy>

if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <blockHash> <userNonce> <kurierEntropy>"
  exit 1
fi

BLOCK_HASH="$1"
USER_NONCE="$2"
KURIER_ENTROPY="$3"

# If blockHash is hex (e.g. 0xabc...), convert it to decimal so JSON stays valid.
# Use node (which you already have) instead of python.
if [[ "$BLOCK_HASH" == 0x* || "$BLOCK_HASH" == 0X* ]]; then
  BLOCK_HASH_DEC=$(node -e "console.log(BigInt(process.argv[1]).toString())" "$BLOCK_HASH")
else
  BLOCK_HASH_DEC="$BLOCK_HASH"
fi

TMP_INPUT="build/input_cli.json"
mkdir -p build

cat > "$TMP_INPUT" <<EOF
{
  "blockHash": $BLOCK_HASH_DEC,
  "userNonce": $USER_NONCE,
  "kurierEntropy": $KURIER_ENTROPY
}
EOF

echo "Using inputs:"
cat "$TMP_INPUT"
echo

# Use the temporary input file for proving
INPUT_FILE="$TMP_INPUT" ./scripts/prove.sh

# Verify the resulting proof
./scripts/verify.sh


