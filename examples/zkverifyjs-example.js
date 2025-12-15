/**
 * zkVerify Example: Generate and Submit Proof to zkVerify Network
 *
 * This example demonstrates how to:
 * 1. Generate a zero-knowledge proof using RandomGen
 * 2. Submit the proof to zkVerify's Volta testnet for verification
 * 3. Listen for aggregation events and retrieve the statement path
 *
 * The zkVerify network aggregates proofs and provides attestations that can
 * be verified on-chain on various blockchains.
 *
 * Usage:
 *   1. Edit line SEED_PHRASE="your 12/24 word seed phrase here"
 *
 *   2. Make sure your account has $tVFY tokens on Volta testnet
 *      (Get tokens from: https://faucet.zkverify.io/)
 *
 *   3. Run the example:
 *      node examples/zkverify-example.js
 *
 * Requirements:
 *   - Node.js v20+ (recommended v24+)
 *   - Circom v2+ (installed globally)
 *   - snarkjs (installed globally)
 *   - zkverifyjs package
 *
 * Install dependencies:
 *   npm install zkverifyjs
 */

const { zkVerifySession, Library, CurveType, ZkVerifyEvents } = require("zkverifyjs");
const path = require("path");

const SEED_PHRASE = ""; // Fill with your seed phrase

const { RandomCircuitOrchestrator } = require("../index.js");
const { MAX_31_BYTES } = require("../lib/utils.js");

// Color codes for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
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

// Circuit configuration
const NUM_OUTPUTS = 1;
const POWER = 11;

async function main() {
  try {
    section("zkVerify Proof Submission Example");

    // ========================================================================
    // STEP 1: Initialize RandomGen Orchestrator
    // ========================================================================
    section("Step 1: Initialize RandomGen Orchestrator");

    log("Creating orchestrator instance...", "blue");
    const orchestrator = new RandomCircuitOrchestrator({
      circuitName: `random_${NUM_OUTPUTS}`,
      circuitPath: path.join(__dirname, `../circuits/random_${NUM_OUTPUTS}.circom`),
      numOutputs: NUM_OUTPUTS,
      power: POWER,
      // https://github.com/privacy-ethereum/perpetualpowersoftau
      ptauName: `ppot_0080_${POWER}.ptau`,
      setupEntropy: "zkverify-example-entropy",
    });

    log("Initializing (this may take 30-60 seconds on first run)...", "yellow");
    await orchestrator.initialize();
    log("✓ Orchestrator initialized successfully", "green");

    // ========================================================================
    // STEP 2: Generate Zero-Knowledge Proof
    // ========================================================================
    section("Step 2: Generate Zero-Knowledge Proof");

    const inputs = {
      blockHash: BigInt("12345678901234567890"),
      userNonce: 42,
      N: MAX_31_BYTES,
    };

    log("Input values:", "blue");
    log(`  blockHash: ${inputs.blockHash}`, "dim");
    log(`  userNonce: ${inputs.userNonce}`, "dim");

    log("\nGenerating proof...", "yellow");
    const proofResult = await orchestrator.generateRandomProof(inputs);

    log("✓ Proof generated successfully", "green");
    log(`  Random numbers`, "bright");
    proofResult.R.forEach((r, i) => {
      log(`    [${i}]: ${r}`, "bright");
    });

    // ========================================================================
    // STEP 3: Connect to zkVerify Network
    // ========================================================================
    section("Step 3: Connect to zkVerify Volta Testnet");

    log("Connecting to zkVerify Volta testnet...", "blue");
    const session = await zkVerifySession.start().Volta().withAccount(SEED_PHRASE);
    log("✓ Connected to zkVerify", "green");

    // ========================================================================
    // STEP 4: Submit Proof to zkVerify
    // ========================================================================
    section("Step 4: Submit Proof for Verification");

    let statement;

    log("Submitting proof to zkVerify...", "yellow");
    log(`  Using Groth16 with snarkjs library on BN128 curve`, "dim");

    const { events } = await session
      .verify()
      .groth16({ library: Library.snarkjs, curve: CurveType.bn128 })
      .execute({
        proofData: {
          vk: orchestrator.vkey,
          proof: proofResult.proof,
          publicSignals: proofResult.publicSignals,
        },
      });

    // Listen for transaction events
    events.on(ZkVerifyEvents.IncludedInBlock, (eventData) => {
      log("\n✓ Proof included in block!", "green");
      log(`  Block hash: ${eventData.blockHash}`, "dim");
      log(`  Transaction hash: ${eventData.txHash}`, "dim");
      statement = eventData.statement;
      log(`  Statement: ${statement}`, "dim");
    });

    events.on(ZkVerifyEvents.Finalized, (eventData) => {
      log("\n✓ Transaction finalized!", "green");
      log(`  Block hash: ${eventData.blockHash}`, "dim");
      log(`  Check on explorer: https://zkverify-testnet.subscan.io/`, "yellow");
    });

    events.on("error", (error) => {
      log(`\n✗ Error: ${error.message}`, "red");
    });

    // ========================================================================
    // STEP 6: Wait for Events
    // ========================================================================
    section("Step 6: Waiting for Verification Events");

    log("Waiting for block inclusion and finalization...", "blue");
    log("\nPress Ctrl+C to exit after receiving events.\n", "yellow");

    // Keep the process running to receive events
    await new Promise((resolve) => {
      // Set a timeout to exit after 2 minutes
      setTimeout(() => {
        log("\n⏱️  Timeout reached. Exiting...", "yellow");
        log("The aggregation event may still be processed on the network.", "dim");
        resolve();
      }, 120000);
    });

  } catch (error) {
    log(`\n✗ Error: ${error.message}`, "red");
    console.error(error);
    process.exit(1);
  }
}

main();
