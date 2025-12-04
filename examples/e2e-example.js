/**
 * End-to-End Example: Setup, Prove, and Verify
 * 
 * This example demonstrates the complete workflow for RandomGen:
 * 1. Initialize the orchestrator (generates artifacts if needed)
 * 2. Generate a zero-knowledge proof with multiple random outputs
 * 3. Verify the proof
 * 4. Save and load proof data
 * 
 * The production circuit (random.circom) generates 15 random outputs per proof.
 * Each output R[i] is computed as: PoseidonEx(...)[i] mod N
 * 
 * Usage:
 *   node examples/e2e-example.js
 * 
 * Requirements:
 *   - Circom v2+ (installed globally)
 *   - snarkjs (installed globally)
 *   - Node.js v14+
 */

const { RandomCircuitOrchestrator, computeLocalHash } = require("../index.js");
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

const NUM_OUTPUTS = 15; // Number of random outputs to generate (must match circuit)

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
      circuitName: "random",
      circuitPath: path.join(__dirname, "../circuits/random.circom"),
      numOutputs: NUM_OUTPUTS,
      power: 15,
      // https://github.com/privacy-ethereum/perpetualpowersoftau
      ptauName: "ppot_0080_15.ptau",
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
      kurierEntropy: 42,
      N: 1000, // Public input: modulus (output will be in range [0, 1000))
    };

    log("Input values:", "blue");
    log(`  blockHash:     ${inputs.blockHash}`, "dim");
    log(`  userNonce:     ${inputs.userNonce}`, "dim");
    log(`  kurierEntropy: ${inputs.kurierEntropy} (private)`, "dim");
    log(`  N (modulus):   ${inputs.N}`, "dim");

    log("\nGenerating proof (this may take 1-2 seconds)...", "yellow");
    // numOutputs is already configured in constructor
    const proofResult = await orchestrator.generateRandomProof(inputs);

    log("✓ Proof generated successfully", "green");
    log(`  Random values R:`, "bright");
    proofResult.R.forEach((r, i) => {
      log(`    R[${i}]: ${r}`, "bright");
    });

    // Display proof structure
    log("\nProof structure:", "blue");
    log(`  Proof pi_a: [${proofResult.proof.pi_a[0]}, ${proofResult.proof.pi_a[1]}, ...]`, "dim");
    log(`  Proof pi_b: [[${proofResult.proof.pi_b[0][0]}, ...], ...]`, "dim");
    log(`  Proof pi_c: [${proofResult.proof.pi_c[0]}, ${proofResult.proof.pi_c[1]}, ...]`, "dim");
    log(`  Public Signals:`, "dim");
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
    // STEP 6: Demonstrate Local Hash Computation
    // ========================================================================
    section("Step 6: Local Hash Computation");

    log("Computing local hash (Poseidon + modulo)...", "blue");
    const { hashes, R } = await computeLocalHash(inputs, NUM_OUTPUTS);

    log("✓ Hash computation complete", "green");
    log(`  Poseidon hashes: [${hashes.slice(0, 3).join(", ")}, ...]`, "dim");
    log(`  Results (R):`, "dim");
    R.forEach((r, i) => {
      log(`    R[${i}]: ${r}`, "dim");
    });
    log(`  Matches proof output: ${JSON.stringify(R) === JSON.stringify(proofResult.R)}`, "dim");

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
        kurierEntropy: i + 2,
        N: 1000,
      };

      const proof = await orchestrator.generateRandomProof(batchInputs);
      batchProofs.push(proof);
      log(`  [${i + 1}/${batchSize}] Generated proof with R = [${proof.R.join(", ")}]`, "dim");
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
    log("  6. Local hash computation verification", "dim");
    log("  7. Batch proof generation workflow", "dim");

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
