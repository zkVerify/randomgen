#!/bin/bash
set -euo pipefail

CIRCUIT_DIR="circuits"
CIRCUIT_NAME="random"

mkdir -p build

# Compile the circuit (circom 0.x writes artifacts to the project root)
circom "$CIRCUIT_DIR/$CIRCUIT_NAME.circom" --r1cs --wasm --sym

# Move/copy artifacts into the build directory for downstream scripts
if [ -f "${CIRCUIT_NAME}.r1cs" ]; then
  cp "${CIRCUIT_NAME}.r1cs" build/
fi

if [ -f "${CIRCUIT_NAME}.wasm" ]; then
  cp "${CIRCUIT_NAME}.wasm" build/
fi

if [ -f "${CIRCUIT_NAME}.sym" ]; then
  cp "${CIRCUIT_NAME}.sym" build/
fi

echo "Compiled $CIRCUIT_NAME.circom to build/."
