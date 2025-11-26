#!/bin/bash
set -euo pipefail

BUILD_DIR="build"
CIRCUIT_NAME="random"
PTAU_FILE="pot12_final.ptau"

if [ ! -f "$PTAU_FILE" ]; then
  echo "Missing $PTAU_FILE. Download or generate a Powers of Tau file first."
  echo "Example (unsafe dev setup): snarkjs powersoftau new bn128 12 pot12_0000.ptau && snarkjs powersoftau contribute pot12_0000.ptau pot12_final.ptau --name='kurier dev' -v"
  exit 1
fi

PREPARED_PTAU="pot12_final_phase2.ptau"

# Prepare the Powers of Tau file for phase 2 (Groth16)
snarkjs powersoftau prepare phase2 "$PTAU_FILE" "$PREPARED_PTAU"

# Clean any previous zkey artifacts
rm -f "$BUILD_DIR/${CIRCUIT_NAME}_0000.zkey" "$BUILD_DIR/${CIRCUIT_NAME}_final.zkey"

snarkjs groth16 setup "$BUILD_DIR/$CIRCUIT_NAME.r1cs" "$PREPARED_PTAU" "$BUILD_DIR/${CIRCUIT_NAME}_0000.zkey"

snarkjs zkey contribute "$BUILD_DIR/${CIRCUIT_NAME}_0000.zkey" "$BUILD_DIR/${CIRCUIT_NAME}_final.zkey" --name="kurier" -v -e="kurier entropy"

snarkjs zkey export verificationkey "$BUILD_DIR/${CIRCUIT_NAME}_final.zkey" "$BUILD_DIR/verification_key.json"

echo "Groth16 setup complete. Proving key and verification key written to $BUILD_DIR/."
