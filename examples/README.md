# RandomGen Examples

This directory contains example scripts demonstrating various usage patterns for the RandomGen library.

## Quick Start

### Prerequisites

Before running the examples, ensure you have:

1. **Dependencies installed**:
   ```bash
   npm install
   ```

2. **Global tools installed**:
   ```bash
   npm install -g circom@^2 snarkjs@^0.7
   ```

3. **From the project root** (`/home/danielecker/hl-crypto/randomgen`)

## Examples

### 1. End-to-End Example (`e2e-example.js`)

The complete workflow from setup to verification.

**What it demonstrates:**
- Orchestrator initialization with artifact generation
- Zero-knowledge proof generation
- Proof verification
- Saving proof data to files
- Loading and re-verifying saved proofs
- Local hash computation verification
- Batch proof generation

**Run it:**
```bash
node examples/e2e-example.js
```

**Expected output:**
- Step-by-step console output with colored formatting
- Proof data saved to `examples/proofs/`
- Performance metrics for each operation
- Summary of all operations completed

**Time estimate:** 30-60 seconds (first run includes artifact generation)

**What to look for:**
- ✓ All steps should complete successfully
- Random values (R) should be in range [0, N)
- Verification results should show "VALID"
- Batch proofs should all verify correctly

### 2. Advanced Examples (`advanced-example.js`)

Advanced usage patterns and edge cases.

**Available scenarios:**
- `custom-config`: Custom orchestrator configuration
- `error-handling`: Error handling demonstrations
- `low-level`: Direct utility function usage
- `performance`: Measure proof generation performance
- `tampering`: Detect proof tampering
- `all`: Run all scenarios (default)

**Run specific scenario:**
```bash
# Run all scenarios
node examples/advanced-example.js

# Run specific scenario
node examples/advanced-example.js performance
node examples/advanced-example.js tampering
node examples/advanced-example.js error-handling
```

**Scenario Details:**

#### Scenario 1: Custom Configuration
Shows how to create an orchestrator with custom settings and validate artifacts.

```bash
node examples/advanced-example.js custom-config
```

#### Scenario 2: Error Handling
Demonstrates proper error handling for:
- Invalid input values
- Non-existent files
- Missing initialization

```bash
node examples/advanced-example.js error-handling
```

#### Scenario 3: Low-Level Utilities
Direct usage of utility functions without the orchestrator:
- Poseidon hashing
- Random generation
- Circuit input creation

```bash
node examples/advanced-example.js low-level
```

#### Scenario 4: Performance Measurement
Measures and reports performance metrics:
- Initialization time
- Proof generation time
- Verification time
- Statistical analysis

```bash
node examples/advanced-example.js performance
```

Expected output includes:
- Average, min, max times for each operation
- Total execution time for multiple proofs

#### Scenario 5: Proof Tampering Detection
Demonstrates the security properties of the proof system:
- What happens when proof is tampered with
- What happens when public signals are tampered with
- Verification of original proof

```bash
node examples/advanced-example.js tampering
```

Expected output:
- ✓ Tampered proofs fail verification
- ✓ Original proof still verifies correctly

## Common Usage Patterns

### Pattern 1: Simple Proof Generation

```javascript
const { RandomCircuitOrchestrator } = require("randomgen");

async function generateProof() {
  const orchestrator = new RandomCircuitOrchestrator();
  
  // Initialize (generates artifacts if needed)
  await orchestrator.initialize();
  
  // Generate proof
  const result = await orchestrator.generateRandomProof({
    blockHash: BigInt(123456),
    userNonce: 7,
    kurierEntropy: 42,
    N: 1000,
  });
  
  console.log("Proof generated:", result.isValid);
  console.log("Random value:", result.publicSignals[0]);
}

generateProof();
```

### Pattern 2: Batch Processing

```javascript
const { RandomCircuitOrchestrator } = require("randomgen");

async function batchProcess() {
  const orchestrator = new RandomCircuitOrchestrator();
  await orchestrator.initialize();
  
  const proofs = [];
  
  for (let i = 0; i < 10; i++) {
    const proof = await orchestrator.generateRandomProof({
      blockHash: BigInt(i),
      userNonce: i,
      kurierEntropy: i + 1,
      N: 1000,
    });
    
    proofs.push(proof);
  }
  
  return proofs;
}
```

### Pattern 3: Custom Circuit Parameters

```javascript
const { RandomCircuitOrchestrator } = require("randomgen");
const path = require("path");

async function customCircuit() {
  const orchestrator = new RandomCircuitOrchestrator({
    circuitName: "random",
    buildDir: "/custom/build/path",
  });
  
  // Generate with custom parameters
  await orchestrator.initialize({
    circuitPath: path.join(__dirname, "circuits/random.circom"),
    power: 12,
    ptauName: "pot12_final.ptau",
  });
  
  const proof = await orchestrator.generateRandomProof({
    blockHash: BigInt(999),
    userNonce: 555,
    kurierEntropy: 333,
    N: 10000, // Custom modulus
  });
  
  return proof;
}
```

### Pattern 4: Low-Level Usage

```javascript
const { utils, setup } = require("randomgen");

async function lowLevel() {
  // Compute hash directly
  const hash = await utils.computePoseidonHash(1, 2, 3);
  console.log("Hash:", hash);
  
  // Generate random from seed
  const random = utils.generateRandomFromSeed(hash, 1000);
  console.log("Random:", random);
  
  // Compile and setup custom circuit
  const { r1csPath, wasmPath } = await setup.compileCircuit("random");
  console.log("R1CS:", r1csPath);
  console.log("WASM:", wasmPath);
}
```

## Troubleshooting

### "Module not found: randomgen"
```bash
# Make sure you're in the project root
cd /home/danielecker/hl-crypto/randomgen

# Install dependencies
npm install

# Run example
node examples/e2e-example.js
```

### "circom: command not found"
```bash
# Install Circom from source
git clone https://github.com/iden3/circom.git
cd circom
cargo build --release
cargo install --path circom
```

### "Build artifacts missing"
The examples automatically generate artifacts on first run. If they fail:

```bash
# Manual artifact generation
cd /home/danielecker/hl-crypto/randomgen
npm run build
# or
node -e "const {setup} = require('./index'); setup.completeSetup('random');"
```

### "Proof verification failed"
1. Ensure you're using the same verification key that was generated with the artifacts
2. Don't modify proof or public signals between generation and verification
3. Verify that artifacts were generated correctly (re-run initialization)

## Performance Tips

1. **First run is slower** - Circuit compilation and setup happen on first initialization
2. **Batch operations** - Generate multiple proofs in sequence (not parallel) for best performance
3. **Reuse orchestrator** - Create once, use multiple times to avoid re-initialization
4. **Monitor memory** - For large batch operations, consider garbage collection

## Next Steps

1. **Try the examples:**
   ```bash
   node examples/e2e-example.js
   node examples/advanced-example.js
   ```

2. **Modify inputs:**
   - Change `blockHash`, `userNonce`, `kurierEntropy`
   - Try different values for `N` (modulus)
   - Observe how output changes

3. **Integrate into your application:**
   - Use the patterns above as templates
   - Handle errors appropriately
   - Consider performance requirements

4. **Review the tests:**
   - Run `npm test` to see comprehensive test coverage
   - Test files in `/tests` show additional usage patterns

5. **Read the documentation:**
   - Check `/README.md` for full API reference
   - Review `/lib` source code for implementation details

## Performance Baseline

On a typical machine:
- **Initialization** (first run): 30-60 seconds
- **Initialization** (cached): 0.5-1 second
- **Proof generation**: 1-2 seconds
- **Verification**: 100-200 milliseconds
- **Batch of 10 proofs**: 15-25 seconds

Actual times depend on:
- Hardware capabilities (CPU speed, available memory)
- System load (other processes running)
- Circom/snarkjs versions
- Circuit complexity

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review example output to understand expected behavior
3. Run tests with `npm test` to verify setup
4. Check `/lib` source code for implementation details
5. Open an issue with detailed information

## Additional Resources

- [RandomGen API Documentation](/README.md)
- [Circom Documentation](https://docs.circom.io/)
- [snarkjs GitHub](https://github.com/iden3/snarkjs)
- [Zero-Knowledge Proof Concepts](https://en.wikipedia.org/wiki/Zero-knowledge_proof)
