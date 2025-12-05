# RandomGen - Zero-Knowledge Random Number Generator

A Node.js library for generating and verifying zero-knowledge proofs for a Poseidon-based random number generator using Circom and Groth16.

## Overview

RandomGen provides a secure, verifiable way to generate unique random numbers using zero-knowledge proofs. It combines:

- **Circom circuit**: A constraint system that generates unique random numbers via permutation
- **Groth16 proofs**: Cryptographic proofs that verify the random number generation
- **Node.js library**: Easy-to-use functions for proof generation, verification, and orchestration

### Circuit Details

The circuit takes two public inputs and produces unique random numbers via permutation:

- **Public inputs**: `blockHash`, `userNonce`
- **Template parameters**: `numOutputs`, `poolSize`, `startValue`
- **Output**: `randomNumbers[numOutputs]` = unique values in range [startValue, startValue + poolSize - 1]

The circuit uses:
1. `Poseidon(2)` hash of (blockHash, userNonce) to create a deterministic seed
2. `RandomPermutate` component that shuffles [startValue, startValue+1, ..., startValue+poolSize-1] using Fisher-Yates algorithm
3. First `numOutputs` values from the permuted array become the output

**Key properties:**
- All outputs are **unique** (no duplicates)
- All outputs are in range **[startValue, startValue + poolSize - 1]** (contiguous integers)
- Output is deterministic based on inputs
- Maximum `poolSize` is 50 (due to field size constraints)

### Circuit Variants

The library uses circuit naming convention: `random_{numOutputs}_{poolSize}_{startValue}.circom`

| Circuit File            | numOutputs | poolSize | startValue | Use Case                  |
| ----------------------- | ---------- | -------- | ---------- | ------------------------- |
| `random_3_10_0.circom`  | 3          | 10       | 0          | Testing (zero-indexed)    |
| `random_5_35_1.circom`  | 5          | 35       | 1          | Lottery-style (5 from 35) |
| `random_6_49_1.circom`  | 6          | 49       | 1          | Lottery-style (6 from 49) |
| `random_7_35_1.circom`  | 7          | 35       | 1          | Lottery-style (7 from 35) |
| `random_10_50_1.circom` | 10         | 50       | 1          | Maximum range             |

> ⚠️ **Important**: The `numOutputs`, `poolSize`, and `startValue` parameters in your orchestrator **must match** the circuit's configuration.

#### Generating Circuit Files

Circuit files can be regenerated using the included script:

```bash
# Generate specific circuit (6 numbers from 1-49)
node scripts/generate-circuits.js 6,49,1

# Generate multiple circuits
node scripts/generate-circuits.js 3,10,0 5,35,1 6,49,1
```

## Installation

### Prerequisites

Before installing RandomGen, ensure you have:

1. **Node.js** (v14+) and npm
2. **Circom** (v2+) - globally installed for circuit compilation
3. **snarkjs** (v0.7+) - globally installed for proof generation and verification

Install global dependencies:

**Circom (v2+)** requires Rust and Cargo:
```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Circom from source
git clone https://github.com/iden3/circom.git
cd circom
cargo build --release
cargo install --path circom
```

**snarkjs**:
```bash
npm install -g snarkjs@^0.7
```

### Recommended: Use Pre-Prepared Powers of Tau Files

For production use, it's **strongly recommended** to use pre-prepared Phase 2 Powers of Tau files from trusted ceremonies:

**Available sources:**

1. **snarkjs repository** (recommended for most users):
   - https://github.com/iden3/snarkjs?tab=readme-ov-file#7-prepare-phase-2
   - Files: `powersOfTau28_hez_final_XX.ptau` (where XX is the power)

2. **Perpetual Powers of Tau** (Ethereum community ceremony):
   - https://github.com/privacy-ethereum/perpetualpowersoftau

```bash
# Download a prepared ptau file
curl -O https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_13.ptau
mv powersOfTau28_hez_final_13.ptau pot13_final.ptau
```

### Install RandomGen

```bash
npm install randomgen
```

Or for local development:

```bash
git clone <repository-url>
cd randomgen
npm install
```

## Quick Start

### Basic Usage with Orchestrator (Recommended)

```javascript
const { RandomCircuitOrchestrator } = require('randomgen');

async function generateRandomProof() {
  // Create orchestrator instance
  // Circuit: random_6_49_1 generates 6 unique numbers from 1-49
  const orchestrator = new RandomCircuitOrchestrator({
    circuitName: 'random_6_49_1',
    numOutputs: 6,
    poolSize: 49,
    startValue: 1,
    power: 13,
    ptauEntropy: 'my-ptau-entropy',
    setupEntropy: 'my-setup-entropy',
  });

  // Initialize (generates artifacts if needed)
  await orchestrator.initialize();

  // Generate proof with only 2 public inputs
  const inputs = {
    blockHash: 12345678901234567890n,
    userNonce: 7,
  };

  const proofData = await orchestrator.generateRandomProof(inputs);

  // Verify proof
  const isValid = await orchestrator.verifyRandomProof(
    proofData.proof,
    proofData.publicSignals
  );

  console.log('Proof valid:', isValid);
  console.log('Random numbers:', proofData.randomNumbers);
  // Example output: [12, 35, 7, 49, 23, 1] - 6 unique values in [1, 49]
}

generateRandomProof().catch(console.error);
```

### Using Low-Level Utils

```javascript
const { utils, computeLocalRandomNumbers } = require('randomgen');

async function lowLevelExample() {
  // Create circuit inputs (only 2 inputs needed)
  const inputs = utils.createCircuitInputs({
    blockHash: 100,
    userNonce: 200,
  });

  console.log('Circuit inputs:', inputs);
  // Output: { blockHash: '100', userNonce: '200' }

  // Compute locally without proof (for testing)
  // Parameters: inputs, numOutputs, poolSize, startValue
  const localResult = await computeLocalRandomNumbers({ blockHash: 100n, userNonce: 200n }, 6, 49, 1);
  console.log('Local computation:', localResult.randomNumbers);
  // Returns: array of 6 unique numbers in [1, 49]

  // Generate proof
  const { proof, publicSignals } = await utils.generateProof(inputs, 'random_6_49_1');

  // Verify proof
  const vkey = utils.loadVerificationKey('verification_key.json');
  const isValid = await utils.verifyProof(vkey, proof, publicSignals);

  console.log('Proof verified:', isValid);
}

lowLevelExample().catch(console.error);
```

## API Reference

### RandomCircuitOrchestrator

High-level orchestrator for managing the complete ZK proof workflow.

#### Constructor

```javascript
new RandomCircuitOrchestrator(options)
```

| Option         | Type   | Default                   | Description                                                         |
| -------------- | ------ | ------------------------- | ------------------------------------------------------------------- |
| `circuitName`  | string | `"random_5_35_1"`         | Circuit name matching `random_{numOutputs}_{poolSize}_{startValue}` |
| `numOutputs`   | number | `5`                       | Number of outputs (**must match circuit!**)                         |
| `poolSize`     | number | `35`                      | Size of value pool (**must match circuit!**)                        |
| `startValue`   | number | `1`                       | First value in range (**must match circuit!**)                      |
| `power`        | number | `13`                      | Powers of tau (2^power constraints)                                 |
| `ptauName`     | string | `"pot{power}_final.ptau"` | PTAU filename                                                       |
| `ptauEntropy`  | string | timestamp-based           | Entropy for ptau contribution                                       |
| `setupEntropy` | string | timestamp-based           | Entropy for zkey contribution                                       |
| `buildDir`     | string | `"./build"`               | Build directory path                                                |
| `circuitDir`   | string | `"./circuits"`            | Circuit directory path                                              |

> ⚠️ **Critical**: `circuitName`, `numOutputs`, `poolSize`, and `startValue` must be consistent.

#### Methods

##### `initialize()`

Initializes the orchestrator and generates artifacts if needed.

```javascript
await orchestrator.initialize();
```

##### `validateBuildArtifacts()`

Checks if all required build artifacts exist.

```javascript
const validation = orchestrator.validateBuildArtifacts();
// { isValid: boolean, missingFiles: string[] }
```

##### `generateRandomProof(inputs)`

Generates a complete ZK proof.

```javascript
const result = await orchestrator.generateRandomProof({
  blockHash: 12345n,
  userNonce: 7,
});
// Returns: { proof, publicSignals, randomNumbers, circuitInputs }
```

##### `verifyRandomProof(proof, publicSignals)`

Verifies a generated proof.

```javascript
const isValid = await orchestrator.verifyRandomProof(proof, publicSignals);
// Returns: boolean
```

##### `saveProofData(proofData, outputDir)`

Saves proof data to JSON files.

```javascript
const files = await orchestrator.saveProofData(proofData, 'proofs/');
// Returns: { proof: string, publicSignals: string, randomNumbers: string }
```

##### `loadProofData(proofFile, publicSignalsFile)`

Loads proof data from JSON files.

```javascript
const { proof, publicSignals } = orchestrator.loadProofData(
  'proofs/proof.json',
  'proofs/public.json'
);
```

### Standalone Functions

#### `computeLocalRandomNumbers(inputs, numOutputs, poolSize, startValue)`

Computes the expected random numbers locally without generating a proof.
Useful for testing and verification.

```javascript
const { computeLocalRandomNumbers } = require('randomgen');

const result = await computeLocalRandomNumbers(
  { blockHash: 12345n, userNonce: 7n },  // inputs
  6,       // numOutputs
  49,      // poolSize
  1        // startValue
);
// Returns: { seed: '...', randomNumbers: [12, 35, 7, 49, 23, 1] }
// randomNumbers = array of 6 unique numbers in [1, 49]
```

### Utils Functions

Core cryptographic and utility functions.

#### `computePoseidonHash(blockHash, userNonce)`

Computes Poseidon hash of two inputs, returning a BigInt seed.

```javascript
const seed = await utils.computePoseidonHash(12345n, 7n);
// Returns: BigInt - the hash result
```

#### `computePermutation(seed, poolSize, startValue)`

Generates a permutation of [startValue, startValue+1, ..., startValue+poolSize-1] using Fisher-Yates algorithm.
Mirrors the circuit's RandomPermutate component.

```javascript
const permutation = utils.computePermutation(seed, 49, 1);
// Returns: array of 49 unique numbers [1..49] in shuffled order

// For zero-indexed:
const zeroIndexed = utils.computePermutation(seed, 10, 0);
// Returns: array of 10 unique numbers [0..9] in shuffled order
```

#### `createCircuitInputs(inputs)`

Creates properly formatted inputs for the circuit.

```javascript
const circuitInputs = utils.createCircuitInputs({
  blockHash: 100,
  userNonce: 200,
});
// Returns: { blockHash: '100', userNonce: '200' }
```

#### `generateProof(inputs, circuitName)`

Generates a Groth16 proof.

```javascript
const { proof, publicSignals } = await utils.generateProof(inputs, "random_6_49_1");
```

#### `verifyProof(vkey, proof, publicSignals)`

Verifies a proof against the verification key.

```javascript
const isValid = await utils.verifyProof(vkey, proof, publicSignals);
```

#### `loadVerificationKey(filename)`

Loads verification key from build directory.

```javascript
const vkey = utils.loadVerificationKey('verification_key.json');
```

#### `getWasmPath(circuitName)` / `getFinalZkeyPath(circuitName)`

Get paths to circuit artifacts.

```javascript
const wasmPath = utils.getWasmPath('random_6_49_1');
const zkeyPath = utils.getFinalZkeyPath('random_6_49_1');
```

#### `fullWorkflow(inputs, circuitName)`

Executes complete workflow: create inputs → generate proof → verify.

```javascript
const result = await utils.fullWorkflow(inputs, "random_6_49_1");
// Returns: { inputs, proof, publicSignals, isValid }
```

### Setup Functions

Circuit compilation and artifact generation functions.

#### `completeSetup(circuitName, options)`

Orchestrates complete setup workflow with smart caching.

```javascript
await setup.completeSetup('random_6_49_1', {
  circuitPath: 'circuits/random_6_49_1.circom',
  power: 13,
  ptauName: 'pot15_final.ptau',
  ptauEntropy: 'my-ptau-entropy',
  setupEntropy: 'my-setup-entropy',
});
```

#### `compileCircuit(circuitName, circuitPath)`

Compiles Circom circuit to R1CS and WASM.

```javascript
const { r1csPath, wasmPath } = await setup.compileCircuit(
  'random_6_49_1',
  'circuits/random_6_49_1.circom'
);
```

#### `ensurePtauFile(power, ptauName, entropy)`

Creates or verifies Powers of Tau file.

```javascript
await setup.ensurePtauFile(, 'pot13_final.ptau', 'my-entropy');
```

#### `setupGroth16(r1csPath, ptauPath, zkeyPath, entropy)`

Generates Groth16 proving key (zkey).

```javascript
await setup.setupGroth16(
  'build/random_6_49_1.r1cs',
  'pot13_final.ptau',
  'build/random_6_49_final.zkey',
  'my-entropy'
);
```

#### `exportVerificationKey(zkeyPath, vkeyPath)`

Extracts verification key from zkey file.

```javascript
await setup.exportVerificationKey(
  'build/random_6_49_1_final.zkey',
  'build/verification_key.json'
);
```

## Project Structure

```
randomgen/
├── index.js                 # Main entry point (library exports)
├── package.json             # Project metadata and dependencies
├── README.md                # This file
├── jest.config.cjs          # Jest configuration for tests
├── circuits/
│   ├── random_6_49_1.circom     # Example circuit (6 from 49 starting at 1)
│   ├── random_template.circom  # Shared circuit template
│   └── circomlib/              # Circom library dependencies
├── lib/
│   ├── utils.js             # Core cryptographic utilities
│   ├── orchestrator.js      # High-level orchestrator
│   └── setupArtifacts.js    # Setup and compilation utilities
├── tests/
│   ├── random.test.cjs      # Circuit tests
│   ├── utils.test.cjs       # Utils function tests
│   ├── orchestrator.test.cjs # Orchestrator tests
│   └── setupArtifacts.test.cjs # Setup utility tests
├── examples/
│   ├── e2e-example.js       # End-to-end usage example
│   └── advanced-example.js  # Advanced usage patterns
├── build/                   # Generated artifacts (created at runtime)
│   ├── random_6_49_1_js/    # WASM and witness generator
│   ├── random_6_49_1.r1cs   # Circuit R1CS file
│   ├── random_6_49_1_final.zkey # Groth16 proving key
│   └── verification_key.json # Verification key
└── scripts/
    ├── generate-circuits.js # Generate circuit files
    ├── compile.sh           # Compile circuit
    ├── setup_groth16.sh     # Generate setup artifacts
    ├── prove.sh             # Generate proof
    └── verify.sh            # Verify proof
```

## Testing

Run the test suite:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

Test coverage includes:
- Unit tests for all utility functions
- Orchestrator class tests
- Circuit validation tests
- Integration tests for complete workflows
- Edge cases and error handling

## Example Use Cases

### 1. Verifiable Lottery / Random Selection

Generate provably fair random numbers for selecting winners.

```javascript
const { RandomCircuitOrchestrator, computeLocalRandomNumbers } = require('randomgen');

async function selectLotteryWinners() {
  // Setup: 6 unique numbers from 1-49 (like many lotteries)
  const orchestrator = new RandomCircuitOrchestrator({
    circuitName: 'random_6_49_1',
    numOutputs: 6,
    poolSize: 49,
    startValue: 1,
    ptauEntropy: process.env.PTAU_ENTROPY || 'lottery-ptau-entropy-2024',
    setupEntropy: process.env.SETUP_ENTROPY || 'lottery-setup-entropy-2024',
  });

  await orchestrator.initialize();

  // Public inputs that anyone can verify
  const inputs = {
    blockHash: 0x1a2b3c4d5e6f7890n,  // e.g., from a future block
    userNonce: 1,                     // Draw #1
  };

  // Generate proof
  const result = await orchestrator.generateRandomProof(inputs);

  console.log('=== LOTTERY RESULTS ===');
  console.log('Block Hash:', inputs.blockHash.toString(16));
  console.log('Draw Number:', inputs.userNonce);
  console.log('Winning Numbers:', result.randomNumbers);
  // Example: [7, 23, 35, 12, 49, 3] - 6 unique numbers in [1, 49]

  // Verify proof
  const isValid = await orchestrator.verifyRandomProof(result.proof, result.publicSignals);
  console.log('Proof Valid:', isValid);

  // Save proof for public audit
  await orchestrator.saveProofData(result, './lottery-proofs');

  return { winningNumbers: result.randomNumbers, proof: result.proof };
}

selectLotteryWinners().catch(console.error);
```

### 2. Offline Verification (No Proof Generation)

Compute expected outputs locally without proof generation overhead.

```javascript
const { computeLocalRandomNumbers, RandomCircuitOrchestrator } = require('randomgen');

async function offlineVerification() {
  const blockHash = 12345678901234567890n;
  const userNonce = 7n;

  // Fast local computation (no proof)
  const result = await computeLocalRandomNumbers(
    { blockHash, userNonce },
    6,   // numOutputs
    49,  // poolSize
    1    // startValue
  );

  console.log('=== LOCAL COMPUTATION (no proof) ===');
  console.log('Random numbers:', result.randomNumbers);
  // All numbers are unique and in range [1, 49]

  // Later, generate real proof and verify outputs match
  const orchestrator = new RandomCircuitOrchestrator({
    circuitName: 'random_6_49_1',
    numOutputs: 6,
    poolSize: 49,
    startValue: 1,
  });
  await orchestrator.initialize();

  const proofResult = await orchestrator.generateRandomProof({
    blockHash,
    userNonce,
  });

  // Verify local computation matches proof
  const matches = result.randomNumbers.every((n, i) => 
    n === Number(proofResult.randomNumbers[i])
  );
  console.log('\n=== VERIFICATION ===');
  console.log('Local matches proof:', matches);
  console.log('Proof is valid:', 
    await orchestrator.verifyRandomProof(proofResult.proof, proofResult.publicSignals)
  );
}

offlineVerification().catch(console.error);
```

### 3. Low-Level API: Custom Circuit Integration

```javascript
const { utils, setup } = require('randomgen');
const path = require('path');

async function customCircuitWorkflow() {
  // Manual setup
  const circuitName = 'random_3_10_1';
  const circuitPath = path.join(__dirname, 'circuits', `${circuitName}.circom`);

  console.log('Compiling circuit...');
  const { r1csPath, wasmPath } = await setup.compileCircuit(circuitName, circuitPath);

  console.log('Setting up powers of tau...');
  await setup.ensurePtauFile(13, 'pot13_final.ptau', 'my-ptau-entropy');

  console.log('Running Groth16 setup...');
  await setup.setupGroth16(r1csPath, 'pot13_final.ptau', 'build/custom_final.zkey', 'my-zkey-entropy');

  console.log('Exporting verification key...');
  const vkey = await setup.exportVerificationKey('build/custom_final.zkey', 'build/custom_vkey.json');

  // Create inputs
  const circuitInputs = utils.createCircuitInputs({
    blockHash: 999888777n,
    userNonce: 42,
  });

  console.log('Circuit inputs:', circuitInputs);

  // Generate and verify proof
  const { proof, publicSignals } = await utils.generateProof(circuitInputs, circuitName);
  const isValid = await utils.verifyProof(vkey, proof, publicSignals);
  console.log('Proof valid:', isValid);

  // Extract random outputs from public signals
  // Public signals: [randomNumbers[0], randomNumbers[1], randomNumbers[2], blockHash, userNonce]
  const numOutputs = 3;
  const randomNumbers = publicSignals.slice(0, numOutputs);
  console.log('Random numbers:', randomNumbers);
}

customCircuitWorkflow().catch(console.error);
```

### 4. Batch Processing: Multiple Proofs

```javascript
const { RandomCircuitOrchestrator } = require('randomgen');

async function batchProofGeneration() {
  const orchestrator = new RandomCircuitOrchestrator({
    circuitName: 'random_3_10_1',
    numOutputs: 3,
    poolSize: 10,
    startValue: 1,
    power: 13,
    ptauEntropy: 'batch-ptau',
    setupEntropy: 'batch-setup',
  });

  console.log('Initializing (one-time setup)...');
  await orchestrator.initialize();

  // Generate multiple proofs
  const requests = [
    { blockHash: 100n, userNonce: 1 },
    { blockHash: 200n, userNonce: 2 },
    { blockHash: 300n, userNonce: 3 },
  ];

  console.log(`\nGenerating ${requests.length} proofs...`);

  for (const [index, request] of requests.entries()) {
    const startTime = Date.now();
    const result = await orchestrator.generateRandomProof(request);
    const elapsed = Date.now() - startTime;

    console.log(`  Proof ${index + 1}: numbers=${result.randomNumbers.join(',')} (${elapsed}ms)`);

    const isValid = await orchestrator.verifyRandomProof(result.proof, result.publicSignals);
    console.log(`    Verified: ${isValid ? '✓' : '✗'}`);
  }
}

batchProofGeneration().catch(console.error);
```

## Troubleshooting

### "circom: command not found"
Install Circom from source (requires Rust and Cargo):
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
git clone https://github.com/iden3/circom.git
cd circom
cargo build --release
cargo install --path circom
```

### "snarkjs: command not found"
Install snarkjs globally:
```bash
npm install -g snarkjs@^0.7
```

### "Cannot find module 'randomgen'"
Ensure the package is installed:
```bash
npm install randomgen
```

### Build artifacts missing
Artifacts are generated automatically on first use via `initialize()`.

```javascript
await orchestrator.initialize();
```

### Verification fails
Ensure:
1. Same verification key is used as was generated during setup
2. Proof hasn't been tampered with
3. Public signals match the input values
4. Build artifacts are present and valid

## Performance Considerations

- **First run**: ~30-60 seconds (circuit compilation and setup)
- **Subsequent runs**: Near-instant (artifacts are cached)
- **Proof generation**: ~200-300 ms per proof
- **Proof verification**: ~20ms per proof
- **Test circuit**: Use smaller circuits (e.g., `random_3_10_1`) for faster development

## Related Resources

- [Circom Documentation](https://docs.circom.io/)
- [snarkjs Documentation](https://github.com/iden3/snarkjs)
- [Poseidon Hash](https://www.poseidon-hash.info/)
- [Groth16 Protocol](https://eprint.iacr.org/2016/260.pdf)
