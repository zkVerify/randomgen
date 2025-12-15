# RandomGen - Zero-Knowledge Random Number Generator

A Node.js library for generating and verifying zero-knowledge proofs for a Poseidon-based random number generator using Circom and Groth16.

## Overview

RandomGen provides a secure, verifiable way to generate multiple random numbers using zero-knowledge proofs. It combines:

- **Circom circuit**: A constraint system that computes multiple random numbers from three inputs using PoseidonEx hashing
- **Groth16 proofs**: Cryptographic proofs that verify the random number generation without revealing private inputs
- **Node.js library**: Easy-to-use functions for proof generation, verification, and orchestration

### Circuit Details

The circuit takes three public inputs to produce multiple random numbers:

- **Public inputs**: `blockHash`, `userNonce`, `N` (modulus)
- **Output**: `R[numOutputs]` = array of `Poseidon(...) mod N` values

Each output `R[i]` is in the range [0, N).

> **Note**: All input values (`blockHash`, `userNonce`, `N`) are truncated to 31 bytes (248 bits) if they exceed that size to fit within the BN128 field.

### Circuit Variants

The library provides **15 pre-generated circuit variants**, each configured for a different number of random outputs (1-15). All circuits share the same template logic from `random_template.circom`.

> ⚠️ **Important**: The `numOutputs` parameter in your orchestrator/code **must match** the circuit's configured outputs. Mismatches will cause proof generation to fail.

#### Generating Circuit Files

Circuit files can be regenerated using the included script:

```bash
# Generate all circuits (1-15)
npm run generate-circuits:all

# Generate specific circuits
node scripts/generate-circuits.js 3 5 10
```

#### Choosing the Right Circuit

Choose the circuit that matches your exact `numOutputs` requirement

The circuit uses `PoseidonEx` to generate multiple hash outputs efficiently. For `numOutputs > 4`, dummy zero inputs are added to satisfy `PoseidonEx` constraints (`t = nInputs + 1` must be `>= numOutputs`).

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

For production use, it's **strongly recommended** to use pre-prepared Phase 2 Powers of Tau files from trusted ceremonies rather than generating your own. These files have been created with contributions from many participants and include a random beacon, making them much more secure.

**Available sources:**

1. **snarkjs repository** (recommended for most users):
   - https://github.com/iden3/snarkjs?tab=readme-ov-file#7-prepare-phase-2
   - Files: `powersOfTau28_hez_final_XX.ptau` (where XX is the power)

2. **Perpetual Powers of Tau** (Ethereum community ceremony with 54 contributions):
   - https://github.com/privacy-ethereum/perpetualpowersoftau?tab=readme-ov-file#prepared-and-truncated-files
   - More contributions = stronger security guarantees

> 💡 **Why use prepared files?** The security of Groth16 proofs depends on the "toxic waste" from the Powers of Tau ceremony being destroyed. Pre-prepared files from multi-party ceremonies ensure that as long as at least one participant was honest, the ceremony is secure.

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
  // Create orchestrator instance with all configuration
  // ⚠️ IMPORTANT: numOutputs MUST match the circuit file you're using!
  //    - circuitName: 'random_1' → numOutputs: 1
  //    - circuitName: 'random_3'  → numOutputs: 3
  //    - circuitName: 'random_N'  → numOutputs: N
  const orchestrator = new RandomCircuitOrchestrator({
    circuitName: 'random_1',   // Uses random_1.circom
    numOutputs: 1,             // Must match circuit's numOutputs!
    power: 11,                  // Powers of tau (2^11 constraints)
    ptauEntropy: 'my-ptau-entropy',    // Entropy for ptau ceremony
    setupEntropy: 'my-setup-entropy',  // Entropy for zkey ceremony
  });

  // Initialize (generates artifacts if needed, skips existing ones)
  await orchestrator.initialize();

  // Generate proof
  const inputs = {
    blockHash: 12345678901234567890n,
    userNonce: 7,
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
```

### Using Low-Level Utils

```javascript
const { utils } = require('randomgen');

async function lowLevelExample() {
  // Create circuit inputs (all parameters required)
  const inputs = utils.createCircuitInputs({
    blockHash: 100,
    userNonce: 200,
    N: 1000,
  });

  console.log('Circuit inputs:', inputs);
  // Output: { blockHash: '100', userNonce: '200', N: '1000' }

  // Generate proof (circuitName is required)
  const { proof, publicSignals } = await utils.generateProof(inputs, 'random');

  // Verify proof (filename is required)
  const vkey = utils.loadVerificationKey('verification_key.json');
  const isValid = await utils.verifyProof(vkey, proof, publicSignals);

  console.log('Proof verified:', isValid);
}

lowLevelExample().catch(console.error);
```

### Setup and Compilation

For custom circuits or regenerating artifacts:

```javascript
const { setup } = require('randomgen');

async function setupCircuit() {
  // Complete setup with all required parameters
  // Only regenerates missing artifacts (smart caching)
  await setup.completeSetup('random', {
    circuitPath: 'circuits/random_1.circom',
    power: 11,
    ptauName: 'pot11_final.ptau',
    ptauEntropy: 'my-ptau-entropy',    // Required for ptau ceremony
    setupEntropy: 'my-setup-entropy',  // Required for zkey ceremony
  });
}

// Or use individual setup functions:
async function manualSetup() {
  // Compile circuit (both parameters required)
  const { r1csPath, wasmPath } = await setup.compileCircuit(
    'random',
    'circuits/random_1.circom'
  );

  // Generate powers of tau (all parameters required)
  await setup.ensurePtauFile(15, 'pot11_final.ptau', 'my-entropy');

  // Run Groth16 setup (all parameters required)
  await setup.setupGroth16(
    r1csPath,
    'pot11_final.ptau',
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
```

## API Reference

### RandomCircuitOrchestrator

High-level orchestrator for managing the complete ZK proof workflow.

#### Constructor

```javascript
new RandomCircuitOrchestrator(options)
```

| Option         | Type   | Default                   | Description                                 |
| -------------- | ------ | ------------------------- | ------------------------------------------- |
| `circuitName`  | string | `"random_1"`              | Circuit name: `random_1` to `random_1`      |
| `numOutputs`   | number | `1`                      | Number of outputs (**must match circuit!**) |
| `power`        | number | `11`                      | Powers of tau (2^power constraints)         |
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

```javascript
await orchestrator.initialize();
```

##### `validateBuildArtifacts()`

Checks if all required build artifacts exist (R1CS, WASM, zkey, verification key).

```javascript
const validation = orchestrator.validateBuildArtifacts();
// { isValid: boolean, missingFiles: string[] }
```

##### `generateRandomProof(inputs)`

Generates a complete ZK proof with verification.

```javascript
const result = await orchestrator.generateRandomProof({
  blockHash: 12345n,
  userNonce: 7,
  N: 1000,
});
// Returns: { proof, publicSignals, R (array of strings), circuitInputs }
```

##### `verifyRandomProof(proof, publicSignals)`

Verifies a generated proof.

```javascript
const isValid = await orchestrator.verifyRandomProof(proof, publicSignals);
// Returns: boolean
```

##### `saveProofData(proofData, outputDir)`

Saves proof data to JSON files. `outputDir` is required.

```javascript
const files = await orchestrator.saveProofData(proofData, 'proofs/');
// Returns: { proof: string, publicSignals: string, R: string }
```

##### `loadProofData(proofFile, publicSignalsFile)`

Loads proof data from JSON files. Both parameters are required.

```javascript
const { proof, publicSignals } = orchestrator.loadProofData(
  'proofs/proof.json',
  'proofs/public.json'
);
```

### Standalone Functions

#### `computeLocalHash(inputs, numOutputs)`

Computes the local Poseidon hash and random values without generating a proof.
Useful for testing and verification. **Both parameters are required.**

```javascript
const { computeLocalHash } = require('randomgen');
const { hashes, R } = await computeLocalHash(
  { blockHash: 100, userNonce: 200, N: 1000 },
  15
);
// hashes: array of Poseidon hash output strings
// R: array of (hash mod N) value strings
```

### Utils Functions

Core cryptographic and utility functions. **All parameters are required** - no defaults.

#### `computePoseidonHash(input1, input2, nOuts)`

Computes Poseidon hash of two inputs, returning an array of BigInt outputs.
For `nOuts > 4`, dummy zero inputs are automatically added to match circuit behavior.

```javascript
const hashes = await utils.computePoseidonHash(1, 2, 5);
// Returns: BigInt[] - array of 5 hash values
```

#### `generateRandomFromSeed(seeds, N)`

Generates random numbers from seed(s) using modulo operation.
Accepts a single seed or an array of seeds.

```javascript
// Single seed
const [random] = utils.generateRandomFromSeed(12345n, 1000n);

// Multiple seeds (from computePoseidonHash output)
const randoms = utils.generateRandomFromSeed([seed1, seed2, seed3], 1000n);
// Returns: BigInt[] - array of values in [0, N)
```

#### `createCircuitInputs(inputs)`

Creates properly formatted inputs for the circuit.
All fields are required: `blockHash`, `userNonce`, `N`.
Input values are truncated to 31 bytes (248 bits) if they exceed that size.

```javascript
const circuitInputs = utils.createCircuitInputs({
  blockHash: 100,
  userNonce: 200,
  N: 1000,
});
// Returns: { blockHash, userNonce, N } as strings
```

#### `generateProof(inputs, circuitName)`

Generates a Groth16 proof. Both parameters are required.

```javascript
const { proof, publicSignals } = await utils.generateProof(inputs, "random_1");
```

#### `verifyProof(vkey, proof, publicSignals)`

Verifies a proof against the verification key.

```javascript
const isValid = await utils.verifyProof(vkey, proof, publicSignals);
// Returns: boolean
```

#### `loadVerificationKey(filename)`

Loads verification key from build directory. Filename is required.

```javascript
const vkey = utils.loadVerificationKey('verification_key.json');
```

#### `getWasmPath(circuitName)` / `getFinalZkeyPath(circuitName)`

Get paths to circuit artifacts. `circuitName` is required.

```javascript
const wasmPath = utils.getWasmPath('random');
const zkeyPath = utils.getFinalZkeyPath('random');
```

#### `fullWorkflow(inputs, circuitName)`

Executes complete workflow: create inputs → generate proof → verify.
Both parameters are required.

```javascript
const result = await utils.fullWorkflow(inputs, "random_1");
// Returns: { inputs, proof, publicSignals, isValid }
```

### Setup Functions

Circuit compilation and artifact generation functions. **All parameters are required**.

#### `completeSetup(circuitName, options)`

Orchestrates complete setup workflow with smart caching (only regenerates missing artifacts).

```javascript
await setup.completeSetup('random', {
  circuitPath: 'circuits/random_1.circom',  // Required
  power: 11,                               // Required
  ptauName: 'pot11_final.ptau',           // Required
  ptauEntropy: 'my-ptau-entropy',         // Required
  setupEntropy: 'my-setup-entropy',       // Required
});
```

#### `compileCircuit(circuitName, circuitPath)`

Compiles Circom circuit to R1CS and WASM. Both parameters are required.

```javascript
const { r1csPath, wasmPath } = await setup.compileCircuit(
  'random',
  'circuits/random_1.circom'
);
```

#### `ensurePtauFile(power, ptauName, entropy)`

Creates or verifies Powers of Tau file. All parameters are required.

```javascript
await setup.ensurePtauFile(11, 'pot11_final.ptau', 'my-entropy');
```

#### `setupGroth16(r1csPath, ptauPath, zkeyPath, entropy)`

Generates Groth16 proving key (zkey) with contribution. All parameters are required.

```javascript
await setup.setupGroth16(
  'build/random.r1cs',
  'pot11_final.ptau',
  'build/random_final.zkey',
  'my-entropy'
);
```

#### `exportVerificationKey(zkeyPath, vkeyPath)`

Extracts verification key from zkey file.

```javascript
await setup.exportVerificationKey(
  'build/random_final.zkey',
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
│   ├── random_X.circom      # Circuit for proving X random numbers
│   ├── random_template.circom # Shared circuit template
│   └── circomlib/           # Circom library dependencies
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
│   ├── random_js/           # WASM and witness generator
│   ├── random.r1cs          # Circuit R1CS file
│   ├── random_final.zkey    # Groth16 proving key
│   └── verification_key.json # Verification key
└── scripts/
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
- Circuit validation tests (using `random_3.circom` with 3 outputs)
- Integration tests for complete workflows
- Edge cases and error handling

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
Only missing artifacts are regenerated (smart caching).

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
- **Proof generation**: ~1-2 seconds per proof
- **Proof verification**: ~100-200ms per proof

## Related Resources

- [Circom Documentation](https://docs.circom.io/)
- [snarkjs Documentation](https://github.com/iden3/snarkjs)
- [Poseidon Hash](https://www.poseidon-hash.info/)
- [Groth16 Protocol](https://eprint.iacr.org/2016/260.pdf)
