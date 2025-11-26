#!/bin/bash
set -euo pipefail

BUILD_DIR="build"

snarkjs groth16 verify "$BUILD_DIR/verification_key.json" "$BUILD_DIR/public.json" "$BUILD_DIR/proof.json"
