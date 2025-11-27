## zk-RNG Circom Project

This project implements a minimal zero-knowledge random number generator circuit using Circom 2 and Groth16 (via `snarkjs`).

The circuit:

- **Public inputs**: `blockHash`, `userNonce`
- **Private input**: `kurierEntropy` (optional extra entropy)
- **Output**: `R` — a number in the range \([0, 1000)\)

`R` is derived by hashing (`Poseidon(3)`) the three inputs and reducing the result modulo 1000.

All logic is implemented in `circuits/random.circom`.

---

## Prerequisites

- Node.js & npm
- Globally installed:
  - `circom`
  - `snarkjs`

Install:

```bash
npm install -g circom@^2 snarkjs
```

---

## Project Structure

- `circuits/random.circom` — Poseidon-based RNG circuit
- `input.json` — example inputs for witness/proof generation
- `scripts/` — shell scripts for compilation, setup, proving, and verification
  - `compile.sh` — compile circuit to R1CS + WASM
  - `setup_groth16.sh` — Groth16 trusted setup (uses a Powers of Tau file)
  - `prove.sh` — generate witness, proof, and public signals
  - `verify.sh` — verify proof locally
  - `run.sh` — convenience wrapper to run with CLI arguments
- `build/` — compilation and proof artifacts (created as you run scripts)
- `arkworks-converter/` — Rust tool to convert snarkjs format to arkworks format
- `arkworks/` — output directory with arkworks-native format files (binary + JSON)

---

## Step 1: Compile the circuit

From the project root (`/home/strummer/randomgen`):

```bash
./scripts/compile.sh
```

This produces:

- `build/random.r1cs`
- `build/random.wasm`
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

Option A (manual file): edit `input.json`, then call `./scripts/prove.sh` and `./scripts/verify.sh` in later steps.

```json
{
  "blockHash": "0xc9ccb486624046360c2523d3fb3dc8112dfe0c3e90d1896605dfbe363f9c0001",
  "userNonce": 7,
  "kurierEntropy": 42
}
```

- **blockHash**: public value (e.g. on-chain block hash)
- **userNonce**: user-provided public nonce
- **kurierEntropy**: private entropy from Kurier (or any backend)

### Option B: pass inputs via CLI (no manual `input.json`)

Use this if you prefer one shot execution; it internally creates its own JSON and runs both `prove.sh` and `verify.sh`:

```bash
./scripts/run.sh <blockHash> <userNonce> <kurierEntropy>
```

Example:

```bash
./scripts/run.sh 123456 7 42
```

You can also pass a **hex block hash** (e.g. from Ethereum) and it will be converted to decimal automatically:

```bash
./scripts/run.sh 0xd9885ce1b0330741ce78b3e781fbc131f22f2bd40eb1dc41f6b7844f47ec7c54 7 42
```

This script will:

1. Build a temporary JSON file at `build/input_cli.json` with those values.
2. Call `./scripts/prove.sh` using that file.
3. Run `./scripts/verify.sh` to check the proof.

---

## Step 4: Generate proof

Run:

```bash
./scripts/prove.sh
```

This:

1. Generates a witness using `snarkjs wtns calculate build/random.wasm ...`
2. Runs `snarkjs groth16 prove` to create:
   - `build/proof.json`
   - `build/public.json`

`scripts/prove.sh` also **prints the result to the console** in a friendly format:

```text
=== zk-RNG Result ===
R (mixed output): <big number here>
blockHash (decimal): <decimal form of your blockHash>
userNonce: <your nonce>
kurierEntropy: <your entropy>
=====================
```

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

## Optional: Send proofs via Kurier (Horizen Relayer client)

If you want to exercise Horizen's Relayer API (per the [tutorial](https://relayer.horizenlabs.io/docs/tutorial)), this repo ships a lightweight Node client under `kurier/`.

1. **Configure environment**
   ```bash
   cd kurier
   cp env.example .env
   # edit .env and set:
   #   API_KEY=<your relayer key>
   #   API_URL (optional, defaults to testnet)
   #   CHAIN_ID (optional, defaults to 0 = off-chain test)
   ```

2. **Install Kurier client deps** (first run only)
   ```bash
   cd kurier
   npm install
   ```

3. **Regenerate zk artifacts** (from repo root) so `build/verification_key.json`, `build/proof.json`, and `build/public.json` are fresh:
   ```bash
   ./scripts/run.sh <blockHash> <userNonce> <kurierEntropy>
   ```

4. **Run Kurier**
   ```bash
   cd kurier
   node index.js
   ```

   The script will:
   - Register the Groth16 verification key (result cached in `kurier/circom-vkey.json`)
   - Submit the proof/public signals
   - Poll job status until it reaches `Finalized`/`Aggregated`

All Relayer responses (`vkHash`, `jobId`, `txHash`, etc.) are printed to the console so you can trace them in the zkVerify explorer or via the Relayer API.


