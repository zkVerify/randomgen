# Running the Examples - Quick Guide

## Installation

From the project root (`/home/danielecker/hl-crypto/randomgen`):

```bash
# Install dependencies
npm install

# Ensure global tools are installed
npm install -g circom@^2 snarkjs@^0.7
```

## Run End-to-End Example

This is the best place to start. It shows the complete workflow:

```bash
node examples/e2e-example.js
```

**What happens:**
1. ✓ Initializes the circuit (generates artifacts if needed)
2. ✓ Generates a zero-knowledge proof
3. ✓ Verifies the proof
4. ✓ Saves proof data to files
5. ✓ Loads and re-verifies the saved proof
6. ✓ Generates 5 proofs in batch
7. ✓ Shows performance metrics

**Time:** 30-60 seconds (first run) or 10-15 seconds (cached run)

**Output:** Colorized console output showing each step + proof files saved to `examples/proofs/`

## Run Advanced Examples

For more advanced scenarios:

```bash
# Run all scenarios
node examples/advanced-example.js

# Run specific scenario
node examples/advanced-example.js performance
node examples/advanced-example.js tampering
node examples/advanced-example.js error-handling
node examples/advanced-example.js custom-config
node examples/advanced-example.js low-level
```

## Quick Verification

To verify the examples work:

```bash
# Run tests
npm test

# This should show all tests passing (or known snarkjs issues)
```

## Troubleshooting

### circom not found
```bash
# Build and install circom from source
git clone https://github.com/iden3/circom.git
cd circom
cargo build --release
cargo install --path circom
cd ..
```

### Build artifacts missing
```bash
# They're generated automatically on first run
# Or manually regenerate:
node -e "const {setup} = require('./index'); setup.completeSetup('random');"
```

### Script permission denied
```bash
# Make executable
chmod +x examples/e2e-example.js
chmod +x examples/advanced-example.js

# Then run
./examples/e2e-example.js
```

## Expected Output Example

```
======================================================================
RandomGen End-to-End Example
======================================================================

======================================================================
Step 1: Initialize Orchestrator
======================================================================

Creating orchestrator instance...
Initializing (this may take 30-60 seconds on first run)...
✓ Orchestrator initialized successfully

======================================================================
Step 2: Generate Zero-Knowledge Proof
======================================================================

Input values:
  blockHash:     12345678901234567890
  userNonce:     7
  kurierEntropy: 42 (private)
  N (modulus):   1000

Generating proof (this may take 1-2 seconds)...
✓ Proof generated successfully
  Random value R: 475
  Valid: true

...more output...

======================================================================
Summary
======================================================================

✓ All steps completed successfully!
```

## Next Steps

1. **Review the code** - Look at `examples/e2e-example.js` to understand the workflow
2. **Modify inputs** - Change `blockHash`, `userNonce`, `kurierEntropy` to see different proofs
3. **Integrate** - Use the patterns in the examples in your own code
4. **Read docs** - Check `README.md` and `/lib` for full API reference

## Files Generated

After running the e2e example, you'll have:

```
examples/
├── proofs/
│   ├── proof.json        # The zero-knowledge proof
│   └── public.json       # Public signals and inputs
├── e2e-example.js        # Main example (start here)
├── advanced-example.js   # Advanced scenarios
└── README.md             # Detailed documentation
```

The proof files can be:
- Inspected to understand the proof structure
- Submitted to other systems for verification
- Used as test data
- Analyzed for debugging

## Performance Expectations

- **First initialization**: 30-60 seconds (includes circuit compilation and setup)
- **Subsequent initializations**: 0.5-1 second (cached artifacts)
- **Single proof generation**: 1-2 seconds
- **Single proof verification**: 100-200 milliseconds
- **5 proofs batch**: 8-15 seconds total

## Support

For detailed help:
- See `examples/README.md` for comprehensive documentation
- Run `npm test` to validate your setup
- Check the main `README.md` for API reference
- Review source code in `/lib` directory
