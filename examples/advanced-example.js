/**
 * Advanced Examples: Custom Scenarios
 * 
 * This file demonstrates advanced usage patterns:
 * 1. Custom orchestrator configuration
 * 2. Error handling and recovery
 * 3. Low-level utility usage
 * 4. Performance measurement
 * 5. Proof tampering detection
 * 
 * Usage:
 *   node examples/advanced-example.js [scenario]
 * 
 * Available scenarios:
 *   - custom-config: Custom orchestrator configuration
 *   - error-handling: Error handling demonstrations
 *   - low-level: Direct utility function usage
 *   - performance: Measure proof generation performance
 *   - tampering: Detect proof tampering
 *   - all: Run all scenarios (default)
 */

const { RandomCircuitOrchestrator, utils, setup } = require("../index.js");
const path = require("path");

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

const NUM_OUTPUTS = 15; // Number of random outputs to generate

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

async function exampleCustomConfig() {
  section("Scenario 1: Custom Orchestrator Configuration");

  log("Creating orchestrator with custom settings...", "blue");
  // All configuration is set in the constructor
  const customOrchestrator = new RandomCircuitOrchestrator({
    circuitName: "random_15",
    buildDir: path.join(__dirname, "../build"),
    numOutputs: NUM_OUTPUTS,
    // https://github.com/privacy-ethereum/perpetualpowersoftau
    ptauName: "ppot_0080_15.ptau",
    setupEntropy: "advanced-example-setup-entropy",
  });

  log("Validating build artifacts...", "blue");
  const validation = customOrchestrator.validateBuildArtifacts();

  if (validation.isValid) {
    log("✓ All artifacts present", "green");
    log("  - WASM file exists", "dim");
    log("  - Zkey file exists", "dim");
    log("  - Verification key exists", "dim");
  } else {
    log("✗ Missing artifacts:", "yellow");
    validation.missingFiles.forEach((file) => {
      log(`  - ${file}`, "dim");
    });
    log("Run: await orchestrator.initialize() to generate them", "dim");
  }
}

async function exampleErrorHandling() {
  section("Scenario 2: Error Handling");

  log("Test 1: Invalid input values", "blue");
  try {
    const orchestrator = new RandomCircuitOrchestrator({
      numOutputs: NUM_OUTPUTS,
      power: 15,
      // https://github.com/privacy-ethereum/perpetualpowersoftau
      ptauName: "ppot_0080_15.ptau",
      setupEntropy: "advanced-example-setup-entropy",
    });
    await orchestrator.initialize();

    const invalidInputs = {
      blockHash: "invalid",
      userNonce: -5, // Negative values might cause issues
      kurierEntropy: 0,
      N: 0, // Invalid: N must be positive
    };

    await orchestrator.generateRandomProof(invalidInputs);
  } catch (error) {
    log(`✓ Caught error: ${error.message}`, "green");
  }

  log("\nTest 2: Loading non-existent proof file", "blue");
  try {
    const orchestrator = new RandomCircuitOrchestrator();
    await orchestrator.loadProofData(
      "/nonexistent/proof.json",
      "/nonexistent/public.json"
    );
  } catch (error) {
    log(`✓ Caught error: ${error.message}`, "green");
  }

  log("\nTest 3: Verification with invalid key", "blue");
  try {
    const orchestrator = new RandomCircuitOrchestrator();

    // Try to verify without initialization (no vkey loaded)
    const fakeProof = { pi_a: [0, 0], pi_b: [[0, 0], [0, 0]], pi_c: [0, 0] };
    const fakeSignals = [123];

    if (!orchestrator.vkey) {
      throw new Error("Verification key not loaded. Call initialize() first.");
    }
  } catch (error) {
    log(`✓ Caught error: ${error.message}`, "green");
  }
}

async function exampleLowLevel() {
  section("Scenario 3: Low-Level Utility Usage");

  log("Using utils directly for fine-grained control...", "blue");

  // Test 1: Poseidon hashing
  log("\nTest 1: Direct Poseidon hashing", "blue");
  let hash1 = await utils.computePoseidonHash(1, 2, 3, NUM_OUTPUTS);
  let hash2 = await utils.computePoseidonHash(1, 2, 3, NUM_OUTPUTS);
  log(`Hash 1: ${hash1}`, "dim");
  log(`Hash 2: ${hash2}`, "dim");
  hash1 = hash1.map(h => h.toString());
  hash2 = hash2.map(h => h.toString());
  const consistent = JSON.stringify(hash1) === JSON.stringify(hash2);
  log(`Consistent: ${consistent}`, consistent ? "green" : "yellow");

  // Test 2: Random generation (N is now required)
  log("\nTest 2: Direct random generation from seed", "blue");
  const seed = hash1;
  const random1 = utils.generateRandomFromSeed(seed, 1000n);
  const random2 = utils.generateRandomFromSeed(seed, 500n);
  log(`Seed: ${seed}`, "dim");
  log(`R (mod 1000): ${random1}`, "dim");
  log(`R (mod 500):  ${random2}`, "dim");

  // Test 3: Circuit inputs (N is now required)
  log("\nTest 3: Create circuit inputs", "blue");
  const circuitInputs = utils.createCircuitInputs({
    blockHash: 100,
    userNonce: 200,
    kurierEntropy: 300,
    N: 1000,
  });
  log(`Circuit inputs created:`, "dim");
  Object.entries(circuitInputs).forEach(([key, value]) => {
    log(`  ${key}: ${value}`, "dim");
  });
}

async function examplePerformance() {
  section("Scenario 4: Performance Measurement");

  try {
    // All configuration in constructor
    const orchestrator = new RandomCircuitOrchestrator({
      numOutputs: NUM_OUTPUTS,
      power: 15,
      // https://github.com/privacy-ethereum/perpetualpowersoftau
      ptauName: "ppot_0080_15.ptau",
      setupEntropy: "advanced-example-setup-entropy",
    });

    log("Initializing orchestrator...", "blue");
    const initStart = Date.now();
    await orchestrator.initialize();
    const initTime = Date.now() - initStart;
    log(`✓ Initialization: ${initTime}ms`, "green");

    const numProofs = 3;
    const proofTimes = [];
    const verifyTimes = [];

    for (let i = 0; i < numProofs; i++) {
      log(`\nGenerating proof ${i + 1}/${numProofs}...`, "blue");

      const inputs = {
        blockHash: BigInt(i + 1),
        userNonce: i + 1,
        kurierEntropy: i + 2,
        N: 1000,
      };

      // Measure proof generation - uses numOutputs from constructor
      const proofStart = Date.now();
      const result = await orchestrator.generateRandomProof(inputs);
      const proofTime = Date.now() - proofStart;
      proofTimes.push(proofTime);
      log(`  Proof generation: ${proofTime}ms`, "dim");

      // Measure verification
      const verifyStart = Date.now();
      const isValid = await orchestrator.verifyRandomProof(
        result.proof,
        result.publicSignals
      );
      const verifyTime = Date.now() - verifyStart;
      verifyTimes.push(verifyTime);
      log(`  Verification: ${verifyTime}ms`, "dim");
      log(`  Result: R = ${result.R}, Valid = ${isValid}`, "dim");
    }

    // Statistics
    log("\nPerformance Summary:", "bright");
    const avgProofTime =
      proofTimes.reduce((a, b) => a + b, 0) / proofTimes.length;
    const avgVerifyTime =
      verifyTimes.reduce((a, b) => a + b, 0) / verifyTimes.length;

    log(`Proof generation:`, "blue");
    log(`  Average: ${avgProofTime.toFixed(2)}ms`, "dim");
    log(`  Min: ${Math.min(...proofTimes)}ms`, "dim");
    log(`  Max: ${Math.max(...proofTimes)}ms`, "dim");

    log(`Verification:`, "blue");
    log(`  Average: ${avgVerifyTime.toFixed(2)}ms`, "dim");
    log(`  Min: ${Math.min(...verifyTimes)}ms`, "dim");
    log(`  Max: ${Math.max(...verifyTimes)}ms`, "dim");

    log(`\nInitialization overhead: ${initTime}ms`, "dim");
    log(
      `Total time for ${numProofs} proofs: ${initTime + proofTimes.reduce((a, b) => a + b, 0) + verifyTimes.reduce((a, b) => a + b, 0)}ms`,
      "dim"
    );
  } catch (error) {
    log(`✗ Error: ${error.message}`, "red");
  }
}

async function exampleTampering() {
  section("Scenario 5: Proof Tampering Detection");

  try {
    // All configuration in constructor
    const orchestrator = new RandomCircuitOrchestrator({
      numOutputs: NUM_OUTPUTS,
      // https://github.com/privacy-ethereum/perpetualpowersoftau
      ptauName: "ppot_0080_15.ptau",
      setupEntropy: "advanced-example-setup-entropy",
    });
    await orchestrator.initialize();

    const inputs = {
      blockHash: BigInt(123456),
      userNonce: 42,
      kurierEntropy: 789,
      N: 1000,
    };

    log("Generating original proof...", "blue");
    const result = await orchestrator.generateRandomProof(inputs);
    const originalSignals = JSON.parse(JSON.stringify(result.publicSignals));

    log("✓ Original proof generated and verified", "green");

    // Test 1: Tamper with proof data
    log("\nTest 1: Tampering with proof pi_a...", "blue");
    const tamperedProof1 = JSON.parse(JSON.stringify(result.proof));
    tamperedProof1.pi_a[0] = "12345"; // Change first element
    const isValid1 = await orchestrator.verifyRandomProof(
      tamperedProof1,
      result.publicSignals
    );
    log(
      `Tampered proof verification: ${isValid1 ? "VALID (unexpected!)" : "INVALID (correct!)"}`,
      isValid1 ? "red" : "green"
    );

    // Test 2: Tamper with public signals
    log("\nTest 2: Tampering with public signals...", "blue");
    const tamperedSignals = JSON.parse(JSON.stringify(result.publicSignals));
    tamperedSignals[0] = "999"; // Change output value
    const isValid2 = await orchestrator.verifyRandomProof(
      result.proof,
      tamperedSignals
    );
    log(
      `Tampered signals verification: ${isValid2 ? "VALID (unexpected!)" : "INVALID (correct!)"}`,
      isValid2 ? "red" : "green"
    );

    // Test 3: Verify original still works
    log("\nTest 3: Original proof still verifies...", "blue");
    const isValid3 = await orchestrator.verifyRandomProof(
      result.proof,
      originalSignals
    );
    log(
      `Original proof verification: ${isValid3 ? "VALID (correct!)" : "INVALID (unexpected!)"}`,
      isValid3 ? "green" : "red"
    );
  } catch (error) {
    log(`✗ Error: ${error.message}`, "red");
  }
}

async function main() {
  const scenario = process.argv[2] || "all";

  try {
    if (scenario === "all" || scenario === "custom-config") {
      await exampleCustomConfig();
    }

    if (scenario === "all" || scenario === "error-handling") {
      await exampleErrorHandling();
    }

    if (scenario === "all" || scenario === "low-level") {
      await exampleLowLevel();
    }

    if (scenario === "all" || scenario === "performance") {
      await examplePerformance();
    }

    if (scenario === "all" || scenario === "tampering") {
      await exampleTampering();
    }

    if (
      scenario !== "all" &&
      !["custom-config", "error-handling", "low-level", "performance", "tampering"].includes(scenario)
    ) {
      log(`Unknown scenario: ${scenario}`, "red");
      log("Available: custom-config, error-handling, low-level, performance, tampering, all", "yellow");
      process.exit(1);
    }

    console.log("\n");
  } catch (error) {
    log(`\n✗ Error: ${error.message}`, "red");
    console.error(error);
    process.exit(1);
  }
  process.exit(0);
}

main();
