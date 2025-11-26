#!/bin/bash
set -euo pipefail

BUILD_DIR="build"
CIRCUIT_NAME="random"
INPUT_FILE="input.json"

if [ ! -f "$BUILD_DIR/${CIRCUIT_NAME}_final.zkey" ]; then
  echo "Missing $BUILD_DIR/${CIRCUIT_NAME}_final.zkey. Run scripts/setup_groth16.sh first."
  exit 1
fi

if [ ! -f "$INPUT_FILE" ]; then
  echo "Missing $INPUT_FILE. Create it with the required inputs."
  exit 1
fi

if [ ! -f "$BUILD_DIR/${CIRCUIT_NAME}.wasm" ]; then
  echo "Missing $BUILD_DIR/${CIRCUIT_NAME}.wasm. Run scripts/compile.sh first."
  exit 1
fi

# Generate the witness using snarkjs (works with circom 0.x artifacts)
snarkjs wtns calculate "$BUILD_DIR/${CIRCUIT_NAME}.wasm" "$INPUT_FILE" "$BUILD_DIR/witness.wtns"

snarkjs groth16 prove "$BUILD_DIR/${CIRCUIT_NAME}_final.zkey" "$BUILD_DIR/witness.wtns" "$BUILD_DIR/proof.json" "$BUILD_DIR/public.json"

echo "Proof generated: $BUILD_DIR/proof.json"
echo "Public data:     $BUILD_DIR/public.json"
