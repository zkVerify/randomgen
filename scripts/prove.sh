#!/bin/bash
set -euo pipefail

BUILD_DIR="build"
CIRCUIT_NAME="random"
# Allow overriding the input file via $INPUT_FILE; default to input.json
INPUT_FILE="${INPUT_FILE:-input.json}"

if [ ! -f "$BUILD_DIR/${CIRCUIT_NAME}_final.zkey" ]; then
  echo "Missing $BUILD_DIR/${CIRCUIT_NAME}_final.zkey. Run scripts/setup_groth16.sh first."
  exit 1
fi

if [ ! -f "$INPUT_FILE" ]; then
  echo "Missing $INPUT_FILE. Create it with the required inputs."
  exit 1
fi

if [ ! -f "$BUILD_DIR/${CIRCUIT_NAME}.r1cs" ]; then
  echo "Missing $BUILD_DIR/${CIRCUIT_NAME}.r1cs. Run scripts/compile.sh first."
  exit 1
fi

if [ ! -f "$BUILD_DIR/${CIRCUIT_NAME}.wasm" ]; then
  echo "Missing $BUILD_DIR/${CIRCUIT_NAME}.wasm. Run scripts/compile.sh first."
  exit 1
fi

# Generate the witness using snarkjs (compatible with Circom 2 wasm)
snarkjs wtns calculate "$BUILD_DIR/${CIRCUIT_NAME}.wasm" "$INPUT_FILE" "$BUILD_DIR/witness.wtns"

snarkjs groth16 prove "$BUILD_DIR/${CIRCUIT_NAME}_final.zkey" "$BUILD_DIR/witness.wtns" "$BUILD_DIR/proof.json" "$BUILD_DIR/public.json"

echo "Proof generated: $BUILD_DIR/proof.json"
echo "Public data:     $BUILD_DIR/public.json"

# Pretty-print the outcome R and inputs from public.json to the console
node - <<'EOF'
const fs = require('fs');
const path = require('path');

const buildDir = process.env.BUILD_DIR || 'build';
const publicPath = path.join(buildDir, 'public.json');

try {
  const raw = fs.readFileSync(publicPath, 'utf8');
  const arr = JSON.parse(raw);
  if (!Array.isArray(arr) || arr.length < 4) {
    console.log('public.json has unexpected format:', raw);
    process.exit(0);
  }
  const [R, blockHash, userNonce, kurierEntropy] = arr;
  console.log('\n=== zk-RNG Result ===');
  console.log('R (mixed output):', R);
  console.log('blockHash (decimal):', blockHash);
  console.log('userNonce:', userNonce);
  console.log('kurierEntropy:', kurierEntropy);
  console.log('=====================\n');
} catch (e) {
  console.log('Could not read/parse public.json:', e.message);
}
EOF
