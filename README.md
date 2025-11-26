## zk-RNG Circom Project

This project implements a minimal zero-knowledge random number generator circuit using Circom 2 and Groth16 (via `snarkjs`).

The circuit:

- **Public inputs**: `blockHash`, `userNonce`
- **Private input**: `kurierEntropy` (optional extra entropy)
- **Output**: `R` — a random number in the range \([0, 1000)\)

The randomness is derived by hashing all inputs with **Poseidon**, then reducing modulo 1000:

- `seed = Poseidon([blockHash, userNonce, kurierEntropy])`
- `R = seed % 1000`

All logic is implemented in `circuits/random.circom`.

---

## Prerequisites

- Node.js & npm
- Globally installed:
  - `circom`
  - `snarkjs`

Install:

```bash
npm install -g circom snarkjs
```

---

## Project Structure

- `circuits/random.circom` — Poseidon-based RNG circuit
- `input.json` — example inputs for witness/proof generation
- `scripts/compile.sh` — compile circuit to R1CS + WASM
- `scripts/setup_groth16.sh` — Groth16 trusted setup (uses a Powers of Tau file)
- `scripts/prove.sh` — generate witness, proof, and public signals
- `scripts/verify.sh` — verify proof locally
- `build/` — compilation and proof artifacts (created as you run scripts)

---

## Step 1: Compile the circuit

From the project root (`/home/strummer/randomgen`):

```bash
./scripts/compile.sh
```

This produces:

- `build/random.r1cs`
- `build/random.wasm`
- `build/random_js/*`
- `build/random.sym`

---

## Step 2: Powers of Tau (ptau) and Groth16 setup

You need a **Powers of Tau** file (e.g. `pot12_final.ptau`) in the project root.

For local/dev usage (not secure for production), you can generate one like this:

```bash
snarkjs powersoftau new bn128 12 pot12_0000.ptau
snarkjs powersoftau contribute pot12_0000.ptau pot12_final.ptau --name="kurier dev" -v
```

Then run the Groth16 setup:

```bash
./scripts/setup_groth16.sh
```

This writes:

- `build/random_0000.zkey`
- `build/random_final.zkey` (proving key)
- `build/verification_key.json` (verification key)

---

## Step 3: Prepare inputs

Edit `input.json` as needed:

```json
{
  "blockHash": 123456,
  "userNonce": 42,
  "kurierEntropy": 7
}
```

- **blockHash**: public value (e.g. on-chain block hash)
- **userNonce**: user-provided public nonce
- **kurierEntropy**: private entropy from Kurier (or any backend)

---

## Step 4: Generate proof

Run:

```bash
./scripts/prove.sh
```

This:

1. Generates a witness using `build/random_js/generate_witness.js`
2. Runs `snarkjs groth16 prove` to create:
   - `build/proof.json`
   - `build/public.json`

`public.json` contains:

- The public inputs (`blockHash`, `userNonce`)
- The output `R`

---

## Step 5: Verify proof

Run:

```bash
./scripts/verify.sh
```

If everything is correct, `snarkjs` prints that the proof is valid.

---

## Example Kurier-style response format

Given the artifacts, a Kurier-style API response could look like:

```json
{
  "R": 123,
  "proof": { /* contents of build/proof.json */ },
  "public_inputs": {
    "blockHash": 123456,
    "userNonce": 42,
    "kurierEntropy": 7
  }
}
```

An on-chain verifier or any client can independently verify that `R` was correctly generated from the declared public inputs and the private `kurierEntropy` using the verification key.


