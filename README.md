# RandomGen - Zero-Knowledge Random Number Generator

A Node.js library for generating and verifying zero-knowledge proofs for a Poseidon-based random number generator using Circom and Groth16.

## Overview

RandomGen provides a secure, verifiable way to generate random numbers using zero-knowledge proofs. It combines:

- **Circom circuit**: A constraint system that computes a random number from three inputs using Poseidon hashing
- **Groth16 proofs**: Cryptographic proofs that verify the random number generation without revealing the inputs
- **Node.js library**: Easy-to-use functions for proof generation, verification, and orchestration

### Circuit Details

The circuit takes three public inputs and one private input to produce a random number:

- **Public inputs**: `blockHash`, `userNonce`, `N` (modulus)
- **Private input**: `kurierEntropy` (optional extra entropy)
- **Output**: `R` = `Poseidon(blockHash, userNonce, kurierEntropy) mod N`

The output `R` is in the range [0, N).

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
  const orchestrator = new RandomCircuitOrchestrator({
    circuitName: 'random',
  });

  // Initialize (generates artifacts if needed)
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
  console.log('Random output:', proofData.publicSignals[0]);
}

generateRandomProof().catch(console.error);
```

### Using Low-Level Utils

```javascript
const { utils } = require('randomgen');

async function lowLevelExample() {
  // Create circuit inputs
  const inputs = await utils.createCircuitInputs({
    blockHash: 100,
    userNonce: 200,
    kurierEntropy: 300,
    N: 1000,
  });

  console.log('Circuit inputs:', inputs);
  // Output: { blockHash: '100', userNonce: '200', kurierEntropy: '300', expectedR: '...' }

  // Generate proof
  const { proof, publicSignals } = await utils.generateProof(inputs);

  // Verify proof
  const vkey = utils.loadVerificationKey();
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
  // Compile circuit
  const { r1csPath, wasmPath } = await setup.compileCircuit('random');

  // Generate powers of tau
  await setup.ensurePtauFile(12, 'pot12_final.ptau');

  // Run Groth16 setup
  await setup.setupGroth16(r1csPath, 'pot12_final.ptau', 'build/random_final.zkey');

  // Export verification key
  await setup.exportVerificationKey(
    'build/random_final.zkey',
    'build/verification_key.json'
  );

  console.log('Setup complete!');
}

// Or use the convenience function:
await setup.completeSetup('random', {
  power: 12,
  circuitPath: 'circuits/random.circom',
});
```

## API Reference

### RandomCircuitOrchestrator

High-level orchestrator for managing the complete ZK proof workflow.

#### Constructor

```javascript
new RandomCircuitOrchestrator(options)
```

- `options.circuitName` (string, default: `"random"`): Circuit name
- `options.buildDir` (string, default: `"./build"`): Build directory path

#### Methods

##### `initialize(options)`

Initializes the orchestrator and generates artifacts if needed.

```javascript
await orchestrator.initialize({
  circuitPath: 'circuits/random.circom',
  power: 12,
  ptauName: 'pot12_final.ptau',
});
```

Returns: `boolean` - Success status

##### `validateBuildArtifacts()`

Checks if all required build artifacts exist.

```javascript
const validation = orchestrator.validateBuildArtifacts();
// { isValid: true, missingFiles: [] }
```

##### `generateRandomProof(inputs, setupOptions)`

Generates a complete ZK proof with verification.

```javascript
const result = await orchestrator.generateRandomProof(inputs, setupOptions);
// { proof, publicSignals, witness, isValid }
```

- `inputs`: Object with `blockHash`, `userNonce`, `kurierEntropy`, `N`
- `setupOptions`: Optional setup configuration

##### `verifyRandomProof(proof, publicSignals)`

Verifies a generated proof.

```javascript
const isValid = await orchestrator.verifyRandomProof(proof, publicSignals);
```

##### `computeLocalHash(inputs)`

Computes the local Poseidon hash and random value.

```javascript
const { hash, R } = await orchestrator.computeLocalHash(inputs);
```

##### `saveProofData(proofData, outputDir)`

Saves proof data to JSON files.

```javascript
await orchestrator.saveProofData(proofData, 'proofs/');
```

##### `loadProofData(proofFile, publicSignalsFile)`

Loads proof data from JSON files.

```javascript
const { proof, publicSignals } = await orchestrator.loadProofData(
  'proofs/proof.json',
  'proofs/public.json'
);
```

### Utils Functions

Core cryptographic and utility functions.

#### `computePoseidonHash(input1, input2, input3)`

Computes Poseidon hash of three inputs.

```javascript
const hash = await computePoseidonHash(1, 2, 3);
// Returns: BigInt
```

#### `generateRandomFromSeed(seed, N)`

Generates random number from seed using modulo operation.

```javascript
const random = generateRandomFromSeed(seed, 1000);
// Returns: BigInt (value in [0, N))
```

#### `createCircuitInputs(inputs)`

Creates properly formatted inputs for the circuit.

```javascript
const circuitInputs = await createCircuitInputs({
  blockHash: 100,
  userNonce: 200,
  kurierEntropy: 300,
  N: 1000,
});
// Returns: { blockHash, userNonce, kurierEntropy, expectedR }
```

#### `generateProof(inputs, circuitName)`

Generates a Groth16 proof.

```javascript
const { proof, publicSignals } = await generateProof(inputs);
// Returns: { proof, publicSignals }
```

#### `verifyProof(vkey, proof, publicSignals)`

Verifies a proof against the verification key.

```javascript
const isValid = await verifyProof(vkey, proof, publicSignals);
// Returns: boolean
```

#### `loadVerificationKey(filename)`

Loads verification key from JSON file.

```javascript
const vkey = loadVerificationKey('verification_key.json');
```

#### `fullWorkflow(inputs, circuitName)`

Executes complete workflow: create inputs → generate proof → verify.

```javascript
const result = await fullWorkflow(inputs);
// Returns: { inputs, proof, publicSignals, isValid }
```

### Setup Functions

Circuit compilation and artifact generation functions.

#### `completeSetup(circuitName, options)`

Orchestrates complete setup workflow.

```javascript
await completeSetup('random', {
  circuitPath: 'circuits/random.circom',
  power: 12,
  ptauName: 'pot12_final.ptau',
});
```

#### `compileCircuit(circuitName, circuitPath)`

Compiles Circom circuit to R1CS and WASM.

```javascript
const { r1csPath, wasmPath } = await compileCircuit('random');
```

#### `setupGroth16(r1csPath, ptauPath, zkeyPath)`

Generates Groth16 proving key (zkey).

```javascript
await setupGroth16('build/random.r1cs', 'pot12_final.ptau', 'build/random_final.zkey');
```

#### `exportVerificationKey(zkeyPath, vkeyPath)`

Extracts verification key from zkey file.

```javascript
await exportVerificationKey('build/random_final.zkey', 'build/verification_key.json');
```

#### `ensurePtauFile(power, ptauName)`

Creates or verifies Powers of Tau file.

```javascript
await ensurePtauFile(12, 'pot12_final.ptau');
```

## Project Structure

```
randomgen/
├── index.js                 # Main entry point (library exports)
├── package.json             # Project metadata and dependencies
├── README.md                # This file
├── jest.config.cjs          # Jest configuration for tests
├── circuits/
│   └── random.circom        # Circom circuit implementation
├── lib/
│   ├── utils.js             # Core cryptographic utilities
│   ├── orchestrator.js      # High-level orchestrator
│   └── setupArtifacts.js    # Setup and compilation utilities
├── tests/
│   ├── random.test.cjs      # Circuit tests
│   ├── utils.test.cjs       # Utils function tests
│   ├── orchestrator.test.cjs # Orchestrator tests
│   └── setupArtifacts.test.cjs # Setup utility tests
├── build/                   # Generated artifacts (created at runtime)
│   ├── random.r1cs          # Circuit R1CS file
│   ├── random.wasm          # Circuit WASM file
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
- Circuit validation tests
- Integration tests for complete workflows
- Edge cases and error handling

## Common Workflows

### 1. Generate and Verify a Random Proof

```javascript
const { RandomCircuitOrchestrator } = require('randomgen');

async function demo() {
  const orchestrator = new RandomCircuitOrchestrator();
  
  // Initialize (generates artifacts if needed)
  await orchestrator.initialize();
  
  // Generate proof
  const inputs = {
    blockHash: 12345678901234567890n,
    userNonce: 7,
    kurierEntropy: 42,
    N: 1000,
  };
  
  const result = await orchestrator.generateRandomProof(inputs);
  
  console.log('Valid:', result.isValid);
  console.log('Random value:', result.publicSignals[0]);
  
  // Save proof data
  await orchestrator.saveProofData(result, './proofs');
}

demo().catch(console.error);
```

### 2. Batch Proof Generation

```javascript
const { RandomCircuitOrchestrator } = require('randomgen');

async function generateBatch() {
  const orchestrator = new RandomCircuitOrchestrator();
  await orchestrator.initialize();
  
  const proofs = [];
  
  for (let i = 0; i < 10; i++) {
    const result = await orchestrator.generateRandomProof({
      blockHash: BigInt(i),
      userNonce: i,
      kurierEntropy: i + 1,
      N: 1000,
    });
    
    proofs.push(result);
  }
  
  return proofs;
}
```

### 3. Custom Orchestrator Configuration

```javascript
const { RandomCircuitOrchestrator } = require('randomgen');

async function customSetup() {
  const orchestrator = new RandomCircuitOrchestrator({
    circuitName: 'custom-random',
    buildDir: '/custom/build/path',
  });
  
  await orchestrator.initialize({
    circuitPath: 'circuits/custom.circom',
    power: 13,
    ptauName: 'custom_pot.ptau',
  });
  
  // Use as normal
  const result = await orchestrator.generateRandomProof({ /* ... */ });
}
```

## Troubleshooting

### "circom: command not found"
Install Circom from source (requires Rust and Cargo):
```bash
# Install Rust if needed
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Clone and build Circom
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

Or for local development, link the local package:
```bash
cd randomgen
npm link
cd /path/to/your/project
npm link randomgen
```

### Build artifacts missing
Artifacts are generated automatically on first use via `initialize()`:
```javascript
await orchestrator.initialize();
```

To manually regenerate:
```javascript
const { setup } = require('randomgen');
await setup.completeSetup('random');
```

### Verification fails
Ensure:
1. Same verification key is used as was generated during setup
2. Proof hasn't been tampered with
3. Public signals match the input values
4. Build artifacts are present and valid

## Performance Considerations

- **First run**: ~30-60 seconds (circuit compilation and setup)
- **Proof generation**: ~1-2 seconds per proof
- **Proof verification**: ~100-200ms per proof
- **Batch operations**: Process proofs sequentially or with limited concurrency

## Security Notes

⚠️ **Important**: This library is for educational and development purposes. For production use:

1. Use a secure Powers of Tau ceremony (not the dev pot files)
2. Generate your own circuit artifacts in a secure environment
3. Store verification keys securely
4. Audit the circuit implementation
5. Consider using a hardware security module (HSM) for key management

## License

ISC

## Contributing

Contributions are welcome! Please ensure:
- All tests pass (`npm test`)
- Code follows the existing style
- New features include tests
- README is updated with new functionality

## Support

For issues, questions, or contributions:
1. Check the existing tests for usage examples
2. Review the API documentation above
3. Open an issue with detailed information about your problem

## Related Resources

- [Circom Documentation](https://docs.circom.io/)
- [snarkjs Documentation](https://github.com/iden3/snarkjs)
- [Poseidon Hash](https://www.poseidon-hash.info/)
- [Groth16 Protocol](https://eprint.iacr.org/2016/260.pdf)
- [Zero-Knowledge Proofs Introduction](https://blog.cryptographyengineering.com/2014/11/27/zero-knowledge-proofs-illustrated-primer/)


