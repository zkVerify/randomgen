#!/bin/bash
set -euo pipefail

CIRCUIT_DIR="circuits"
CIRCUIT_NAME="random"

mkdir -p build

# Compile the circuit with Circom 2 directly into build/
circom "$CIRCUIT_DIR/$CIRCUIT_NAME.circom" --r1cs --wasm --sym -o build

echo "Compiled $CIRCUIT_NAME.circom to build/."
