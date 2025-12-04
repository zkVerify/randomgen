# RandomGen - Zero-Knowledge Random Number Generator

A Node.js library for generating and verifying zero-knowledge proofs for a Poseidon-based random number generator using Circom and Groth16.

## Overview

RandomGen provides a secure, verifiable way to generate multiple random numbers using zero-knowledge proofs. It combines:

- **Circom circuit**: A constraint system that computes multiple random numbers from three inputs using PoseidonEx hashing
- **Groth16 proofs**: Cryptographic proofs that verify the random number generation without revealing private inputs
- **Node.js library**: Easy-to-use functions for proof generation, verification, and orchestration

### Circuit Details

The circuit takes three public inputs and one private input to produce multiple random numbers:

- **Public inputs**: `blockHash`, `userNonce`, `N` (modulus)
- **Private input**: `kurierEntropy` (optional extra entropy)
- **Output**: `R[numOutputs]` = array of `Poseidon(...) mod N` values

Each output `R[i]` is in the range [0, N).

### Circuit Variants

The library provides **15 pre-generated circuit variants**, each configured for a different number of random outputs (1-15). All circuits share the same template logic from `random_template.circom`.

| Circuit File                           | numOutputs | Recommended Power | Use Case                     |
| -------------------------------------- | ---------- | ----------------- | ---------------------------- |
| `random_1.circom`                      | 1          | 12                | Single random value          |
| `random_2.circom`                      | 2          | 12                | Pair of random values        |
| `random_3.circom`                      | 3          | 13                | Testing (faster compilation) |
| `random_4.circom`                      | 4          | 13                | Small batches                |
| `random_5.circom` - `random_14.circom` | 5-14       | 14                | Medium batches               |
| `random_15.circom`                     | 15         | 15                | Production (library default) |

> ⚠️ **Important**: The `numOutputs` parameter in your orchestrator/code **must match** the circuit's configured outputs. Mismatches will cause proof generation to fail.

#### Generating Circuit Files

Circuit files can be regenerated using the included script:

\`\`\`bash
# Generate all circuits (1-15)
npm run generate-circuits:all

# Generate specific circuits
node scripts/generate-circuits.js 3 5 10
\`\`\`

#### Choosing the Right Circuit

- **For testing/development**: Use `random_3.circom` with `power: 13` for faster compilation (~10s vs ~60s)
- **For production**: Use `random_15.circom` with `power: 15` for maximum random outputs
- **For specific needs**: Choose the circuit that matches your exact `numOutputs` requirement

The circuit uses `PoseidonEx` to generate multiple hash outputs efficiently. For `numOutputs > 4`, dummy zero inputs are added to satisfy `PoseidonEx` constraints (`t = nInputs + 1` must be `>= numOutputs`).

## Installation

### Prerequisites

Before installing RandomGen, ensure you have:

1. **Node.js** (v14+) and npm
2. **Circom** (v2+) - globally installed for circuit compilation
3. **snarkjs** (v0.7+) - globally installed for proof generation and verification

Install global dependencies:

**Circom (v2+)** requires Rust and Cargo:
\`\`\`bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Circom from source
git clone https://github.com/iden3/circom.git
cd circom
cargo build --release
cargo install --path circom
\`\`\`

**snarkjs**:
\`\`\`bash
npm install -g snarkjs@^0.7
\`\`\`

### Recommended: Use Pre-Prepared Powers of Tau Files

For production use, it's **strongly recommended** to use pre-prepared Phase 2 Powers of Tau files from trusted ceremonies rather than generating your own. These files have been created with contributions from many participants and include a random beacon, making them much more secure.

**Available sources:**

1. **snarkjs repository** (recommended for most users):
   - https://github.com/iden3/snarkjs?tab=readme-ov-file#7-prepare-phase-2
   - Files: `powersOfTau28_hez_final_XX.ptau` (where XX is the power)

2. **Perpetual Powers of Tau** (Ethereum community ceremony with 54 contributions):
   - https://github.com/privacy-ethereum/perpetualpowersoftau?tab=readme-ov-file#prepared-and-truncated-files
   - More contributions = stronger security guarantees

**Example usage with pre-prepared files:**

\`\`\`bash
# Download a prepared ptau file (e.g., power 15 for production)
curl -O https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_15.ptau

# Rename to match expected format
mv powersOfTau28_hez_final_15.ptau pot15_final.ptau
\`\`\`

> 💡 **Why use prepared files?** The security of Groth16 proofs depends on the "toxic waste" from the Powers of Tau ceremony being destroyed. Pre-prepared files from multi-party ceremonies ensure that as long as at least one participant was honest, the ceremony is secure.

### Install RandomGen

\`\`\`bash
npm install randomgen
\`\`\`

Or for local development:

\`\`\`bash
git clone <repository-url>
cd randomgen
npm install
\`\`\`

## Quick Start

### Basic Usage with Orchestrator (Recommended)

\`\`\`javascript
const { RandomCircuitOrchestrator } = require('randomgen');

async function generateRandomProof() {
  // Create orchestrator instance with all configuration
  // ⚠️ IMPORTANT: numOutputs MUST match the circuit file you're using!
  //    - circuitName: 'random_15' → numOutputs: 15
  //    - circuitName: 'random_3'  → numOutputs: 3
  //    - circuitName: 'random_N'  → numOutputs: N
  const orchestrator = new RandomCircuitOrchestrator({
    circuitName: 'random_15',   // Uses random_15.circom (15 outputs)
    numOutputs: 15,             // Must match circuit's numOutputs!
    power: 15,                  // Powers of tau (2^15 constraints)
    ptauEntropy: 'my-ptau-entropy',    // Entropy for ptau ceremony
    setupEntropy: 'my-setup-entropy',  // Entropy for zkey ceremony
  });

  // Initialize (generates artifacts if needed, skips existing ones)
  await orchestrator.initialize();

  // Generate proof
  const inputs = {
    blockHash: 12345678901234567890n,
    userNonce: 7,
    kurierEntropy: 42,
    N: 1000,  // Public input: modulus for the random number range
  };

  const proofData = await orchestrator.generateRandomProof(inputs);

  // Verify proof
  const isValid = await orchestrator.verifyRandomProof(
    proofData.proof,
    proofData.publicSignals
  );

  console.log('Proof valid:', isValid);
  console.log('Random outputs:', proofData.R);  // Array of 15 random values
  // Each R[i] is in range [0, 1000)
}

generateRandomProof().catch(console.error);
\`\`\`

### Using Low-Level Utils

\`\`\`javascript
const { utils } = require('randomgen');

async function lowLevelExample() {
  // Create circuit inputs (all parameters required)
  const inputs = utils.createCircuitInputs({
    blockHash: 100,
    userNonce: 200,
    kurierEntropy: 300,
    N: 1000,
  });

  console.log('Circuit inputs:', inputs);
  // Output: { blockHash: '100', userNonce: '200', kurierEntropy: '300', N: '1000' }

  // Generate proof (circuitName is required)
  const { proof, publicSignals } = await utils.generateProof(inputs, 'random');

  // Verify proof (filename is required)
  const vkey = utils.loadVerificationKey('verification_key.json');
  const isValid = await utils.verifyProof(vkey, proof, publicSignals);

  console.log('Proof verified:', isValid);
}

lowLevelExample().catch(console.error);
\`\`\`

### Setup and Compilation

For custom circuits or regenerating artifacts:

\`\`\`javascript
const { setup } = require('randomgen');

async function setupCircuit() {
  // Complete setup with all required parameters
  // Only regenerates missing artifacts (smart caching)
  await setup.completeSetup('random', {
    circuitPath: 'circuits/random_15.circom',
    power: 15,
    ptauName: 'pot15_final.ptau',
    ptauEntropy: 'my-ptau-entropy',    // Required for ptau ceremony
    setupEntropy: 'my-setup-entropy',  // Required for zkey ceremony
  });
}

// Or use individual setup functions:
async function manualSetup() {
  // Compile circuit (both parameters required)
  const { r1csPath, wasmPath } = await setup.compileCircuit(
    'random',
    'circuits/random_15.circom'
  );

  // Generate powers of tau (all parameters required)
  await setup.ensurePtauFile(15, 'pot15_final.ptau', 'my-entropy');

  // Run Groth16 setup (all parameters required)
  await setup.setupGroth16(
    r1csPath,
    'pot15_final.ptau',
    'build/random_final.zkey',
    'my-setup-entropy'
  );

  // Export verification key
  await setup.exportVerificationKey(
    'build/random_final.zkey',
    'build/verification_key.json'
  );

  console.log('Setup complete!');
}
\`\`\`

## API Reference

### RandomCircuitOrchestrator

High-level orchestrator for managing the complete ZK proof workflow.

#### Constructor

\`\`\`javascript
new RandomCircuitOrchestrator(options)
\`\`\`

| Option         | Type   | Default                   | Description                                 |
| -------------- | ------ | ------------------------- | ------------------------------------------- |
| `circuitName`  | string | `"random_15"`             | Circuit name: `random_1` to `random_15`     |
| `numOutputs`   | number | `15`                      | Number of outputs (**must match circuit!**) |
| `power`        | number | `15`                      | Powers of tau (2^power constraints)         |
| `ptauName`     | string | `"pot{power}_final.ptau"` | PTAU filename                               |
| `ptauEntropy`  | string | timestamp-based           | Entropy for ptau contribution               |
| `setupEntropy` | string | timestamp-based           | Entropy for zkey contribution               |
| `buildDir`     | string | `"./build"`               | Build directory path                        |
| `circuitDir`   | string | `"./circuits"`            | Circuit directory path                      |

> ⚠️ **Critical**: `circuitName` and `numOutputs` must be consistent. If using `random_5.circom`, set `numOutputs: 5`.

#### Methods

##### `initialize()`

Initializes the orchestrator and generates artifacts if needed.
Only regenerates missing artifacts (smart caching).

\`\`\`javascript
await orchestrator.initialize();
\`\`\`

##### `validateBuildArtifacts()`

Checks if all required build artifacts exist (R1CS, WASM, zkey, verification key).

\`\`\`javascript
const validation = orchestrator.validateBuildArtifacts();
// { isValid: boolean, missingFiles: string[] }
\`\`\`

##### `generateRandomProof(inputs)`

Generates a complete ZK proof with verification.

\`\`\`javascript
const result = await orchestrator.generateRandomProof({
  blockHash: 12345n,
  userNonce: 7,
  kurierEntropy: 42,
  N: 1000,
});
// Returns: { proof, publicSignals, R (array of strings), circuitInputs }
\`\`\`

##### `verifyRandomProof(proof, publicSignals)`

Verifies a generated proof.

\`\`\`javascript
const isValid = await orchestrator.verifyRandomProof(proof, publicSignals);
// Returns: boolean
\`\`\`

##### `saveProofData(proofData, outputDir)`

Saves proof data to JSON files. `outputDir` is required.

\`\`\`javascript
const files = await orchestrator.saveProofData(proofData, 'proofs/');
// Returns: { proof: string, publicSignals: string, R: string }
\`\`\`

##### `loadProofData(proofFile, publicSignalsFile)`

Loads proof data from JSON files. Both parameters are required.

\`\`\`javascript
const { proof, publicSignals } = orchestrator.loadProofData(
  'proofs/proof.json',
  'proofs/public.json'
);
\`\`\`

### Standalone Functions

#### `computeLocalHash(inputs, numOutputs)`

Computes the local Poseidon hash and random values without generating a proof.
Useful for testing and verification. **Both parameters are required.**

\`\`\`javascript
const { computeLocalHash } = require('randomgen');
const { hashes, R } = await computeLocalHash(
  { blockHash: 100, userNonce: 200, kurierEntropy: 300, N: 1000 },
  15
);
// hashes: array of Poseidon hash output strings
// R: array of (hash mod N) value strings
\`\`\`

### Utils Functions

Core cryptographic and utility functions. **All parameters are required** - no defaults.

#### `computePoseidonHash(input1, input2, input3, nOuts)`

Computes Poseidon hash of three inputs, returning an array of BigInt outputs.
For `nOuts > 4`, dummy zero inputs are automatically added to match circuit behavior.

\`\`\`javascript
const hashes = await utils.computePoseidonHash(1, 2, 3, 5);
// Returns: BigInt[] - array of 5 hash values
\`\`\`

#### `generateRandomFromSeed(seeds, N)`

Generates random numbers from seed(s) using modulo operation.
Accepts a single seed or an array of seeds.

\`\`\`javascript
// Single seed
const [random] = utils.generateRandomFromSeed(12345n, 1000n);

// Multiple seeds (from computePoseidonHash output)
const randoms = utils.generateRandomFromSeed([seed1, seed2, seed3], 1000n);
// Returns: BigInt[] - array of values in [0, N)
\`\`\`

#### `createCircuitInputs(inputs)`

Creates properly formatted inputs for the circuit.
All fields are required: `blockHash`, `userNonce`, `kurierEntropy`, `N`.

\`\`\`javascript
const circuitInputs = utils.createCircuitInputs({
  blockHash: 100,
  userNonce: 200,
  kurierEntropy: 300,
  N: 1000,
});
// Returns: { blockHash, userNonce, kurierEntropy, N } as strings
\`\`\`

#### `generateProof(inputs, circuitName)`

Generates a Groth16 proof. Both parameters are required.

\`\`\`javascript
const { proof, publicSignals } = await utils.generateProof(inputs, "random_15");
\`\`\`

#### `verifyProof(vkey, proof, publicSignals)`

Verifies a proof against the verification key.

\`\`\`javascript
const isValid = await utils.verifyProof(vkey, proof, publicSignals);
// Returns: boolean
\`\`\`

#### `loadVerificationKey(filename)`

Loads verification key from build directory. Filename is required.

\`\`\`javascript
const vkey = utils.loadVerificationKey('verification_key.json');
\`\`\`

#### `getWasmPath(circuitName)` / `getFinalZkeyPath(circuitName)`

Get paths to circuit artifacts. `circuitName` is required.

\`\`\`javascript
const wasmPath = utils.getWasmPath('random');
const zkeyPath = utils.getFinalZkeyPath('random');
\`\`\`

#### `fullWorkflow(inputs, circuitName)`

Executes complete workflow: create inputs → generate proof → verify.
Both parameters are required.

\`\`\`javascript
const result = await utils.fullWorkflow(inputs, "random_15");
// Returns: { inputs, proof, publicSignals, isValid }
\`\`\`

### Setup Functions

Circuit compilation and artifact generation functions. **All parameters are required**.

#### `completeSetup(circuitName, options)`

Orchestrates complete setup workflow with smart caching (only regenerates missing artifacts).

\`\`\`javascript
await setup.completeSetup('random', {
  circuitPath: 'circuits/random_15.circom',  // Required
  power: 15,                               // Required
  ptauName: 'pot15_final.ptau',           // Required
  ptauEntropy: 'my-ptau-entropy',         // Required
  setupEntropy: 'my-setup-entropy',       // Required
});
\`\`\`

#### `compileCircuit(circuitName, circuitPath)`

Compiles Circom circuit to R1CS and WASM. Both parameters are required.

\`\`\`javascript
const { r1csPath, wasmPath } = await setup.compileCircuit(
  'random',
  'circuits/random_15.circom'
);
\`\`\`

#### `ensurePtauFile(power, ptauName, entropy)`

Creates or verifies Powers of Tau file. All parameters are required.

\`\`\`javascript
await setup.ensurePtauFile(15, 'pot15_final.ptau', 'my-entropy');
\`\`\`

#### `setupGroth16(r1csPath, ptauPath, zkeyPath, entropy)`

Generates Groth16 proving key (zkey) with contribution. All parameters are required.

\`\`\`javascript
await setup.setupGroth16(
  'build/random.r1cs',
  'pot15_final.ptau',
  'build/random_final.zkey',
  'my-entropy'
);
\`\`\`

#### `exportVerificationKey(zkeyPath, vkeyPath)`

Extracts verification key from zkey file.

\`\`\`javascript
await setup.exportVerificationKey(
  'build/random_final.zkey',
  'build/verification_key.json'
);
\`\`\`

## Project Structure

\`\`\`
randomgen/
├── index.js                 # Main entry point (library exports)
├── package.json             # Project metadata and dependencies
├── README.md                # This file
├── jest.config.cjs          # Jest configuration for tests
├── circuits/
│   ├── random_15.circom        # Production circuit (15 outputs)
│   ├── random_3.circom   # Test circuit (3 outputs, faster)
│   ├── random_template.circom # Shared circuit template
│   └── circomlib/           # Circom library dependencies
├── lib/
│   ├── utils.js             # Core cryptographic utilities
│   ├── orchestrator.js      # High-level orchestrator
│   └── setupArtifacts.js    # Setup and compilation utilities
├── tests/
│   ├── random.test.cjs      # Circuit tests (uses random_3.circom)
│   ├── utils.test.cjs       # Utils function tests
│   ├── orchestrator.test.cjs # Orchestrator tests
│   └── setupArtifacts.test.cjs # Setup utility tests
├── examples/
│   ├── e2e-example.js       # End-to-end usage example
│   └── advanced-example.js  # Advanced usage patterns
├── build/                   # Generated artifacts (created at runtime)
│   ├── random_js/           # WASM and witness generator
│   ├── random.r1cs          # Circuit R1CS file
│   ├── random_final.zkey    # Groth16 proving key
│   └── verification_key.json # Verification key
└── scripts/
    ├── compile.sh           # Compile circuit
    ├── setup_groth16.sh     # Generate setup artifacts
    ├── prove.sh             # Generate proof
    └── verify.sh            # Verify proof
\`\`\`

## Testing

Run the test suite:

\`\`\`bash
npm test
\`\`\`

Run tests in watch mode:

\`\`\`bash
npm run test:watch
\`\`\`

Test coverage includes:
- Unit tests for all utility functions
- Orchestrator class tests
- Circuit validation tests (using `random_3.circom` with 3 outputs)
- Integration tests for complete workflows
- Edge cases and error handling

**Note**: Tests use `random_3.circom` (3 outputs, power=13) for faster execution.

## Example Use Cases

### 1. Verifiable Lottery / Random Selection

Generate provably fair random numbers for selecting winners from a pool of participants.
The proof guarantees the randomness is deterministic and cannot be manipulated.

\`\`\`javascript
const { RandomCircuitOrchestrator, computeLocalHash } = require('randomgen');

async function selectLotteryWinners() {
  // =========================================================================
  // SETUP: Initialize the orchestrator (first run compiles circuit ~30-60s)
  // =========================================================================
  const orchestrator = new RandomCircuitOrchestrator({
    // Use secure, unpredictable entropy in production!
    // These could come from a hardware RNG, user input, or trusted source
    ptauEntropy: process.env.PTAU_ENTROPY || 'lottery-ptau-entropy-2024',
    setupEntropy: process.env.SETUP_ENTROPY || 'lottery-setup-entropy-2024',
  });

  await orchestrator.initialize();

  // =========================================================================
  // INPUTS: Combine public randomness sources for transparency
  // =========================================================================
  const participants = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', /* ... */];
  const numWinners = 3;

  // Public inputs that anyone can verify:
  // - blockHash: from a future block (commit-reveal scheme)
  // - userNonce: incremented for each draw to ensure uniqueness
  const inputs = {
    blockHash: 0x1a2b3c4d5e6f7890n,  // e.g., Ethereum block hash
    userNonce: 1,                     // Draw #1 for this lottery
    kurierEntropy: 0,                 // Private entropy (0 = none, fully transparent)
    N: participants.length,           // Modulus = number of participants
  };

  // =========================================================================
  // GENERATE PROOF: Create verifiable random numbers
  // =========================================================================
  const result = await orchestrator.generateRandomProof(inputs);

  // result.R contains 15 random indices, each in range [0, participants.length)
  // Take the first `numWinners` unique indices
  const winnerIndices = [...new Set(result.R.map(r => Number(r)))].slice(0, numWinners);
  const winners = winnerIndices.map(i => participants[i]);

  console.log('=== LOTTERY RESULTS ===');
  console.log('Block Hash:', inputs.blockHash.toString(16));
  console.log('Draw Number:', inputs.userNonce);
  console.log('Total Participants:', participants.length);
  console.log('Winners:', winners);

  // =========================================================================
  // VERIFY: Anyone can verify the proof is valid
  // =========================================================================
  const isValid = await orchestrator.verifyRandomProof(result.proof, result.publicSignals);
  console.log('Proof Valid:', isValid);

  // Save proof for public audit
  await orchestrator.saveProofData(result, './lottery-proofs');

  return { winners, proof: result.proof, publicSignals: result.publicSignals };
}

selectLotteryWinners().catch(console.error);
\`\`\`

### 2. Gaming: Provably Fair Card Shuffle

Generate a verifiable shuffle for card games where players need to trust the randomness.

\`\`\`javascript
const { RandomCircuitOrchestrator } = require('randomgen');

async function shuffleDeck() {
  // =========================================================================
  // For gaming, you might want both server and player entropy
  // =========================================================================
  const serverSeed = BigInt('0x' + require('crypto').randomBytes(16).toString('hex'));
  const playerCommitment = 12345n;  // Player submits this before seeing server seed

  const orchestrator = new RandomCircuitOrchestrator({
    ptauEntropy: 'game-server-ptau',
    setupEntropy: 'game-server-setup',
  });

  await orchestrator.initialize();

  // =========================================================================
  // Generate 15 random values for shuffling
  // =========================================================================
  const result = await orchestrator.generateRandomProof({
    blockHash: serverSeed,           // Server's randomness (revealed after player commits)
    userNonce: playerCommitment,     // Player's commitment
    kurierEntropy: Date.now(),       // Additional entropy
    N: 52,                           // 52 cards in a deck
  });

  // =========================================================================
  // Fisher-Yates shuffle using the random values
  // =========================================================================
  const deck = Array.from({ length: 52 }, (_, i) => i);  // [0, 1, 2, ..., 51]
  const randomValues = result.R.map(r => Number(r));

  for (let i = deck.length - 1; i > 0 && i >= deck.length - 15; i--) {
    // Use each random value to pick a card to swap
    const j = randomValues[deck.length - 1 - i] % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  // =========================================================================
  // The shuffled deck can be verified by anyone with the proof
  // =========================================================================
  console.log('Shuffled deck (first 10 cards):', deck.slice(0, 10));
  console.log('Proof can be verified by all players');

  // Players can independently verify the shuffle:
  const isValid = await orchestrator.verifyRandomProof(result.proof, result.publicSignals);
  console.log('Shuffle verified:', isValid);

  return { deck, proof: result.proof, publicSignals: result.publicSignals };
}

shuffleDeck().catch(console.error);
\`\`\`

### 3. Offline Verification (No Proof Generation)

Verify expected outputs locally without the overhead of proof generation.
Useful for testing, debugging, or pre-computing expected results.

\`\`\`javascript
const { computeLocalHash, RandomCircuitOrchestrator } = require('randomgen');

async function offlineVerification() {
  // =========================================================================
  // Compute what the circuit WOULD output (fast, no proof)
  // =========================================================================
  const inputs = {
    blockHash: 12345678901234567890n,
    userNonce: 7,
    kurierEntropy: 42,
    N: 1000,
  };

  // computeLocalHash mimics the circuit computation locally
  // This is useful for:
  //   1. Testing your integration before generating proofs
  //   2. Pre-computing expected values
  //   3. Debugging mismatches between local and circuit outputs
  const { hashes, R } = await computeLocalHash(inputs, 15);

  console.log('=== LOCAL COMPUTATION (no proof) ===');
  console.log('Poseidon hashes:', hashes.slice(0, 3), '...');  // First 3 of 15
  console.log('Random values R:', R.slice(0, 3), '...');       // First 3 of 15
  console.log('All R values are in range [0, 1000)');

  // =========================================================================
  // Later, generate a real proof and verify outputs match
  // =========================================================================
  const orchestrator = new RandomCircuitOrchestrator({
    ptauEntropy: 'verify-example-ptau',
    setupEntropy: 'verify-example-setup',
  });
  await orchestrator.initialize();

  const proofResult = await orchestrator.generateRandomProof(inputs);

  // Verify the proof's R values match our local computation
  const localMatchesProof = R.every((localR, i) => localR === proofResult.R[i]);
  console.log('\n=== VERIFICATION ===');
  console.log('Local computation matches proof:', localMatchesProof);
  console.log('Proof is cryptographically valid:', 
    await orchestrator.verifyRandomProof(proofResult.proof, proofResult.publicSignals)
  );
}

offlineVerification().catch(console.error);
\`\`\`

### 4. Low-Level API: Custom Circuit Integration

For advanced users who need fine-grained control over the proof workflow.

\`\`\`javascript
const { utils, setup } = require('randomgen');
const path = require('path');

async function customCircuitWorkflow() {
  // =========================================================================
  // STEP 1: Manual setup (useful for custom circuits or CI/CD pipelines)
  // =========================================================================
  const circuitName = 'random_3.circom';  // Use test circuit for this example
  const circuitPath = path.join(__dirname, 'circuits', `${circuitName}.circom`);

  console.log('Compiling circuit...');
  const { r1csPath, wasmPath } = await setup.compileCircuit(circuitName, circuitPath);
  console.log('  R1CS:', r1csPath);
  console.log('  WASM:', wasmPath);

  console.log('Setting up powers of tau...');
  const ptauPath = await setup.ensurePtauFile(13, 'pot13_final.ptau', 'my-ptau-entropy');
  console.log('  PTAU:', ptauPath);

  console.log('Running Groth16 setup...');
  const zkeyPath = await setup.setupGroth16(r1csPath, ptauPath, 'build/custom_final.zkey', 'my-zkey-entropy');
  console.log('  Zkey:', zkeyPath);

  console.log('Exporting verification key...');
  const vkey = await setup.exportVerificationKey(zkeyPath, 'build/custom_vkey.json');
  console.log('  Vkey exported');

  // =========================================================================
  // STEP 2: Create and validate inputs
  // =========================================================================
  const rawInputs = {
    blockHash: 999888777n,
    userNonce: 42,
    kurierEntropy: 123456,
    N: 100,
  };

  // createCircuitInputs ensures all values are properly formatted as strings
  const circuitInputs = utils.createCircuitInputs(rawInputs);
  console.log('\nCircuit inputs:', circuitInputs);

  // =========================================================================
  // STEP 3: Generate and verify proof using low-level utils
  // =========================================================================
  console.log('\nGenerating proof...');
  const { proof, publicSignals } = await utils.generateProof(circuitInputs, circuitName);

  console.log('Verifying proof...');
  const isValid = await utils.verifyProof(vkey, proof, publicSignals);
  console.log('Proof valid:', isValid);

  // =========================================================================
  // STEP 4: Extract random outputs from public signals
  // =========================================================================
  // Public signals format: [R[0], R[1], R[2], blockHash, userNonce, N]
  // For random_3.circom circuit with 3 outputs:
  const numOutputs = 3;
  const R = publicSignals.slice(0, numOutputs);
  console.log('\nRandom outputs R:', R);
  console.log('All values are in range [0, 100):', R.every(r => BigInt(r) < 100n));
}

customCircuitWorkflow().catch(console.error);
\`\`\`

### 5. Batch Processing: Multiple Proofs

Generate multiple independent proofs efficiently by reusing the initialized orchestrator.

\`\`\`javascript
const { RandomCircuitOrchestrator } = require('randomgen');

async function batchProofGeneration() {
  // =========================================================================
  // Initialize once, generate many proofs
  // =========================================================================
  const orchestrator = new RandomCircuitOrchestrator({
    circuitName: 'random_3.circom',  // Faster for demo
    numOutputs: 3,
    power: 13,
    ptauEntropy: 'batch-ptau',
    setupEntropy: 'batch-setup',
  });

  // First initialization is slow (compiles circuit, generates keys)
  console.log('Initializing (one-time setup)...');
  const startInit = Date.now();
  await orchestrator.initialize();
  console.log(`Initialization took ${Date.now() - startInit}ms`);

  // =========================================================================
  // Generate multiple proofs (much faster after initialization)
  // =========================================================================
  const requests = [
    { blockHash: 100n, userNonce: 1, N: 50 },
    { blockHash: 200n, userNonce: 2, N: 100 },
    { blockHash: 300n, userNonce: 3, N: 200 },
    { blockHash: 400n, userNonce: 4, N: 500 },
    { blockHash: 500n, userNonce: 5, N: 1000 },
  ];

  console.log(`\nGenerating ${requests.length} proofs...`);
  const results = [];

  for (const [index, request] of requests.entries()) {
    const startProof = Date.now();
    
    const result = await orchestrator.generateRandomProof({
      ...request,
      kurierEntropy: 0,  // No private entropy for this example
    });
    
    const elapsed = Date.now() - startProof;
    results.push({ ...result, elapsed });
    
    console.log(`  Proof ${index + 1}: R=${result.R.join(',')} (${elapsed}ms)`);
  }

  // =========================================================================
  // Verify all proofs
  // =========================================================================
  console.log('\nVerifying all proofs...');
  for (const [index, result] of results.entries()) {
    const isValid = await orchestrator.verifyRandomProof(result.proof, result.publicSignals);
    console.log(`  Proof ${index + 1}: ${isValid ? '✓ Valid' : '✗ Invalid'}`);
  }

  const avgTime = results.reduce((sum, r) => sum + r.elapsed, 0) / results.length;
  console.log(`\nAverage proof time: ${avgTime.toFixed(0)}ms`);
}

batchProofGeneration().catch(console.error);
\`\`\`

## Troubleshooting

### "circom: command not found"
Install Circom from source (requires Rust and Cargo):
\`\`\`bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
git clone https://github.com/iden3/circom.git
cd circom
cargo build --release
cargo install --path circom
\`\`\`

### "snarkjs: command not found"
Install snarkjs globally:
\`\`\`bash
npm install -g snarkjs@^0.7
\`\`\`

### "Cannot find module 'randomgen'"
Ensure the package is installed:
\`\`\`bash
npm install randomgen
\`\`\`

### Build artifacts missing
Artifacts are generated automatically on first use via `initialize()`.
Only missing artifacts are regenerated (smart caching).

\`\`\`javascript
await orchestrator.initialize();
\`\`\`

### Verification fails
Ensure:
1. Same verification key is used as was generated during setup
2. Proof hasn't been tampered with
3. Public signals match the input values
4. Build artifacts are present and valid

## Performance Considerations

- **First run**: ~30-60 seconds (circuit compilation and setup)
- **Subsequent runs**: Near-instant (artifacts are cached)
- **Proof generation**: ~1-2 seconds per proof
- **Proof verification**: ~100-200ms per proof
- **Test circuit**: Use `random_3.circom` for faster development

## Related Resources

- [Circom Documentation](https://docs.circom.io/)
- [snarkjs Documentation](https://github.com/iden3/snarkjs)
- [Poseidon Hash](https://www.poseidon-hash.info/)
- [Groth16 Protocol](https://eprint.iacr.org/2016/260.pdf)
