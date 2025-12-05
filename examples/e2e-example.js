/**
 * End-to-End Example: Setup, Prove, and Verify
 * 
 * This example demonstrates the complete workflow for RandomGen:
 * 1. Initialize the orchestrator (generates artifacts if needed)
 * 2. Generate a zero-knowledge proof with multiple random outputs
 * 3. Verify the proof
 * 4. Save and load proof data
 * 
 * The circuit uses Poseidon(2) hash with blockHash and userNonce as inputs,
 * then RandomPermutate to generate unique shuffled numbers from 1 to maxOutputVal.
 * 
 * Example: random_5_35.circom generates 5 unique numbers in range [1, 35]
 * (like lottery numbers)
 * 
 * Usage:
 *   node examples/e2e-example.js
 * 
 * Requirements:
 *   - Circom v2+ (installed globally)
 *   - snarkjs (installed globally)
 *   - Node.js v14+
 */

const { RandomCircuitOrchestrator, computeLocalRandomNumbers } = require("../index.js");
const path = require("path");
const fs = require("fs");

// Color codes for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log("\n");
  log("=".repeat(70), "bright");
  log(title, "cyan");
  log("=".repeat(70), "bright");
  console.log();
}

const NUM_OUTPUTS = 5;      // Number of random outputs to generate
const MAX_OUTPUT_VAL = 35;  // Maximum value in range [1, maxOutputVal]

async function main() {
  try {
    section("RandomGen End-to-End Example");

    // ========================================================================
    // STEP 1: Initialize the Orchestrator
    // ========================================================================
    section("Step 1: Initialize Orchestrator");

    log("Creating orchestrator instance...", "blue");
    // All configuration is set in the constructor
    const orchestrator = new RandomCircuitOrchestrator({
      circuitName: "random_5_35",
      circuitPath: path.join(__dirname, "../circuits/random_5_35.circom"),
      numOutputs: NUM_OUTPUTS,
      maxOutputVal: MAX_OUTPUT_VAL,
      power: 13,
      // https://github.com/privacy-ethereum/perpetualpowersoftau
      ptauName: "ppot_0080_13.ptau",
      setupEntropy: "e2e-example-setup-entropy",
    });

    log("Initializing (this may take 30-60 seconds on first run)...", "yellow");
    await orchestrator.initialize();

    log("✓ Orchestrator initialized successfully", "green");

    // ========================================================================
    // STEP 2: Generate a Proof
    // ========================================================================
    section("Step 2: Generate Zero-Knowledge Proof");

    const inputs = {
      blockHash: BigInt("12345678901234567890"),
      userNonce: 7,
    };

    log("Input values:", "blue");
    log(`  blockHash: ${inputs.blockHash}`, "dim");
    log(`  userNonce: ${inputs.userNonce}`, "dim");

    log("\nGenerating proof (this may take 1-2 seconds)...", "yellow");
    const proofResult = await orchestrator.generateRandomProof(inputs);

    log("✓ Proof generated successfully", "green");
    log(`  Random numbers (unique values in [1, ${MAX_OUTPUT_VAL}]):`, "bright");
    proofResult.randomNumbers.forEach((r, i) => {
      log(`    [${i}]: ${r}`, "bright");
    });

    // Display proof structure
    log("\nProof structure:", "blue");
    log(`  Proof pi_a: [${proofResult.proof.pi_a[0].substring(0, 20)}..., ...]`, "dim");
    log(`  Proof pi_b: [[...], ...]`, "dim");
    log(`  Proof pi_c: [${proofResult.proof.pi_c[0].substring(0, 20)}..., ...]`, "dim");
    log(`  Public Signals (randomNumbers):`, "dim");
    proofResult.publicSignals.forEach((signal, index) => {
      log(`    [${index}]: ${signal}`, "dim");
    });

    // ========================================================================
    // STEP 3: Verify the Proof
    // ========================================================================
    section("Step 3: Verify the Proof");

    log("Verifying proof...", "blue");
    const isValid = await orchestrator.verifyRandomProof(
      proofResult.proof,
      proofResult.publicSignals
    );

    if (isValid) {
      log("✓ Proof is VALID", "green");
    } else {
      log("✗ Proof is INVALID", "yellow");
    }

    // ========================================================================
    // STEP 4: Save Proof Data
    // ========================================================================
    section("Step 4: Save Proof Data");

    const proofsDir = path.join(__dirname, "../examples/proofs");
    log(`Saving proof to ${proofsDir}...`, "blue");

    await orchestrator.saveProofData(proofResult, proofsDir);

    log("✓ Proof data saved successfully", "green");
    log(`  Proof file: ${path.join(proofsDir, "proof.json")}`, "dim");
    log(`  Public signals file: ${path.join(proofsDir, "public.json")}`, "dim");

    // ========================================================================
    // STEP 5: Load and Re-verify Proof Data
    // ========================================================================
    section("Step 5: Load and Re-verify Saved Proof");

    log("Loading proof from files...", "blue");
    const loaded = orchestrator.loadProofData(
      path.join(proofsDir, "proof.json"),
      path.join(proofsDir, "public.json")
    );

    log("✓ Proof loaded successfully", "green");

    log("Re-verifying loaded proof...", "blue");
    const isRevalidated = await orchestrator.verifyRandomProof(
      loaded.proof,
      loaded.publicSignals
    );

    if (isRevalidated) {
      log("✓ Loaded proof is VALID", "green");
    } else {
      log("✗ Loaded proof is INVALID", "yellow");
    }

    // ========================================================================
    // STEP 6: Demonstrate Local Computation
    // ========================================================================
    section("Step 6: Local Random Number Computation");

    log("Computing random numbers locally (Poseidon + Permutation)...", "blue");
    const localResult = await computeLocalRandomNumbers(inputs, NUM_OUTPUTS, MAX_OUTPUT_VAL);

    log("✓ Local computation complete", "green");
    log(`  Poseidon seed: ${localResult.seed.substring(0, 40)}...`, "dim");
    log(`  Random numbers:`, "dim");
    localResult.randomNumbers.forEach((r, i) => {
      log(`    [${i}]: ${r}`, "dim");
    });

    const circuitNumbers = proofResult.randomNumbers.map(r => parseInt(r, 10));
    const matches = JSON.stringify(circuitNumbers) === JSON.stringify(localResult.randomNumbers);
    log(`  Matches proof output: ${matches}`, matches ? "green" : "yellow");

    // ========================================================================
    // STEP 7: Batch Proof Generation
    // ========================================================================
    section("Step 7: Batch Proof Generation (5 proofs)");

    log("Generating multiple proofs...", "blue");
    const batchSize = 5;
    const batchProofs = [];

    for (let i = 0; i < batchSize; i++) {
      const batchInputs = {
        blockHash: BigInt(i + 1),
        userNonce: i + 1,
      };

      const proof = await orchestrator.generateRandomProof(batchInputs);
      batchProofs.push(proof);
      log(`  [${i + 1}/${batchSize}] Generated proof with numbers = [${proof.randomNumbers.join(", ")}]`, "dim");
    }

    log(`✓ Generated ${batchSize} proofs`, "green");

    // ========================================================================
    // FINAL SUMMARY
    // ========================================================================
    section("Summary");

    log("✓ All steps completed successfully!", "green");
    log("\nWhat was demonstrated:", "bright");
    log("  1. Orchestrator initialization with artifact generation", "dim");
    log("  2. Zero-knowledge proof generation", "dim");
    log("  3. Proof verification", "dim");
    log("  4. Saving proof data to files", "dim");
    log("  5. Loading and re-verifying saved proofs", "dim");
    log("  6. Local random number computation verification", "dim");
    log("  7. Batch proof generation workflow", "dim");

    log("\nCircuit Features:", "bright");
    log(`  - Generates ${NUM_OUTPUTS} unique random numbers per proof`, "dim");
    log(`  - Output range: [1, ${MAX_OUTPUT_VAL}] (like lottery numbers)`, "dim");
    log("  - Outputs are guaranteed unique (permutation-based)", "dim");
    log("  - Only 2 inputs: blockHash and userNonce (no private entropy)", "dim");

    log("\nNext steps:", "bright");
    log("  - Review the generated proof files in examples/proofs/", "dim");
    log("  - Modify inputs to test different random values", "dim");
    log("  - Integrate RandomGen into your application", "dim");
    log("  - Check examples/advanced-example.js for more scenarios", "dim");

    console.log("\n");
    process.exit(0);

  } catch (error) {
    log(`\n✗ Error: ${error.message}`, "yellow");
    console.error(error);
    process.exit(1);
  }
}

// Run the example
main();
