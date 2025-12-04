/**
 * Setup utilities for compiling Circom circuits and generating Groth16 artifacts.
 * 
 * This module handles:
 * - Circuit compilation (circom -> R1CS + WASM)
 * - Powers of Tau ceremony (ptau generation)
 * - Groth16 trusted setup (zkey generation)
 * - Verification key export
 * 
 * Circuit configurations:
 * - random.circom: 15 outputs, power=15 (production default)
 * - random_test.circom: 3 outputs, power=13 (testing, faster)
 */

const fs = require("fs");
const path = require("path");
const snarkjs = require("snarkjs");
const { execSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const buildDir = path.join(rootDir, "build");
const circuitDir = path.join(rootDir, "circuits");
const ptauDir = rootDir;

/**
 * Ensure build directory exists
 * @private
 */
function ensureBuildDir() {
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }
}

/**
 * Compile Circom circuit to R1CS and WASM files.
 * Requires circom to be installed globally.
 * 
 * @param {string} circuitName - Circuit name (required): 'random' or 'random_test'
 * @param {string} circuitPath - Path to .circom file (required)
 * @returns {Promise<{r1csPath: string, wasmPath: string}>} Paths to generated files
 * @throws {Error} If parameters missing, circuit file not found, or compilation fails
 */
async function compileCircuit(circuitName, circuitPath) {
  if (!circuitName) {
    throw new Error("circuitName is required");
  }
  if (!circuitPath) {
    throw new Error("circuitPath is required");
  }

  if (!fs.existsSync(circuitPath)) {
    throw new Error(`Circuit file not found: ${circuitPath}`);
  }

  console.log(`Compiling ${circuitPath}...`);
  ensureBuildDir();

  try {
    // Compile using circom (requires circom to be installed)
    const cmd = `circom ${circuitPath} --r1cs --wasm --sym -o ${buildDir}`;
    execSync(cmd, { stdio: "inherit" });

    const r1csPath = path.join(buildDir, `${circuitName}.r1cs`);
    const wasmPath = path.join(buildDir, `${circuitName}_js`, `${circuitName}.wasm`);

    if (!fs.existsSync(r1csPath)) {
      throw new Error(`R1CS file not generated: ${r1csPath}`);
    }
    if (!fs.existsSync(wasmPath)) {
      throw new Error(`WASM file not generated: ${wasmPath}`);
    }

    console.log(`✓ Circuit compiled successfully`);
    return { r1csPath, wasmPath };
  } catch (error) {
    console.error("Circuit compilation failed:", error.message);
    throw error;
  }
}

/**
 * Ensure Powers of Tau file exists, creating one if needed.
 * 
 * Recommended power values:
 * - power=15: For random.circom (15 outputs, ~16K constraints)
 * - power=13: For random_test.circom (3 outputs, ~4K constraints)
 * 
 * @param {number} power - Power of tau (2^power constraints supported) (required)
 * @param {string} ptauName - Name of ptau file (required)
 * @param {string} entropy - Entropy for contribution (optional)
 * @returns {Promise<string>} Path to ptau file
 * @throws {Error} If parameters missing
 */
async function ensurePtauFile(power, ptauName, entropy) {
  if (power === undefined || power === null) {
    throw new Error("power is required");
  }
  if (!ptauName) {
    throw new Error("ptauName is required");
  }
  if (!entropy) {
    throw new Error("entropy is required");
  }
  const ptauPath = path.join(ptauDir, ptauName);

  if (fs.existsSync(ptauPath)) {
    console.log(`✓ Powers of tau file found: ${ptauPath}`);
    return ptauPath;
  }

  console.log(`Creating powers of tau file (power=${power})...`);

  // Create initial ptau
  const initialPtau = path.join(ptauDir, `pot${power}_0000.ptau`);
  console.log(`Generating initial ptau with power ${power}...`);
  const curve = await snarkjs.curves.getCurveFromName("bn128");
  await snarkjs.powersOfTau.newAccumulator(curve, power, initialPtau);

  // Contribute to ptau (add randomness)
  const contributedPtau = path.join(ptauDir, `pot${power}_0001.ptau`);
  console.log("Contributing to powers of tau...");
  await snarkjs.powersOfTau.contribute(initialPtau, contributedPtau, "Random contribution", entropy);

  // Prepare phase 2
  console.log("Preparing phase 2...");
  await snarkjs.powersOfTau.preparePhase2(contributedPtau, ptauPath);

  console.log(`✓ Powers of tau file created: ${ptauPath}`);
  return ptauPath;
}

/**
 * Generate Groth16 setup (zkey) from R1CS and ptau.
 * Performs a trusted setup ceremony with multiple contributions for security.
 * 
 * @param {string} r1csPath - Path to R1CS file
 * @param {string} ptauPath - Path to ptau file
 * @param {string} zkeyPath - Path to output final zkey file
 * @param {string} entropy - Entropy for contributions. Note: in production we should have a proper trusted setup.
 * @returns {Promise<string>} Path to final zkey file
 */
async function setupGroth16(r1csPath, ptauPath, zkeyPath, entropy) {
  if (!fs.existsSync(r1csPath)) {
    throw new Error(`R1CS file not found: ${r1csPath}`);
  }
  if (!fs.existsSync(ptauPath)) {
    throw new Error(`PTAU file not found: ${ptauPath}`);
  }
  if (!entropy) {
    throw new Error("entropy is required");
  }

  console.log("Setting up Groth16...");

  // Extract base name for intermediate files
  const zkeyDir = path.dirname(zkeyPath);
  const zkeyBase = path.basename(zkeyPath, "_final.zkey");

  try {
    // Phase 2: Create initial zkey (contribution 0)
    const zkey0Path = path.join(zkeyDir, `${zkeyBase}_0000.zkey`);
    console.log("Creating initial zkey...");
    await snarkjs.zKey.newZKey(r1csPath, ptauPath, zkey0Path);

    // First contribution to zkey ceremony
    const zkey1Path = path.join(zkeyDir, `${zkeyBase}_0001.zkey`);
    console.log("Adding contribution 1 to zkey ceremony...");
    await snarkjs.zKey.contribute(zkey0Path, zkey1Path, "First contribution", entropy);

    // Rename final contribution to the requested output path
    fs.renameSync(zkey1Path, zkeyPath);

    // Clean up intermediate zkey files
    if (fs.existsSync(zkey0Path)) fs.unlinkSync(zkey0Path);

    console.log(`✓ Groth16 setup complete with 1 contribution: ${zkeyPath}`);
    return zkeyPath;
  } catch (error) {
    console.error("Groth16 setup failed:", error.message);
    throw error;
  }
}

/**
 * Export verification key from zkey
 * @param {string} zkeyPath - Path to zkey file
 * @param {string} vkeyPath - Path to output verification key file
 * @returns {Promise<object>} Verification key
 */
async function exportVerificationKey(zkeyPath, vkeyPath) {
  if (!fs.existsSync(zkeyPath)) {
    throw new Error(`Zkey file not found: ${zkeyPath}`);
  }

  console.log("Exporting verification key...");

  try {
    const vkey = await snarkjs.zKey.exportVerificationKey(zkeyPath);
    fs.writeFileSync(vkeyPath, JSON.stringify(vkey, null, 2));
    console.log(`✓ Verification key exported: ${vkeyPath}`);
    return vkey;
  } catch (error) {
    console.error("Export verification key failed:", error.message);
    throw error;
  }
}

/**
 * Complete setup: compile circuit, setup Groth16, and export vkey.
 * Only regenerates artifacts that are missing - existing artifacts are reused.
 * 
 * Artifact dependency chain:
 * - R1CS + WASM: Depend on circuit source
 * - PTAU: Independent (can be shared across circuits of same power)
 * - Zkey: Depends on R1CS + PTAU
 * - Vkey: Depends on Zkey
 * 
 * @param {string} circuitName - Circuit name (required, e.g., "random")
 * @param {object} options - Setup options (required)
 * @param {string} options.circuitPath - Path to circuit file (required)
 * @param {number} options.power - Powers of tau size (required)
 * @param {string} options.ptauName - PTAU filename (required)
 * @param {string} [options.ptauEntropy] - Entropy for ptau contribution (optional)
 * @param {string} [options.setupEntropy] - Entropy for zkey contribution (optional)
 * @returns {Promise<object>} Artifact paths
 * @throws {Error} If required parameters missing
 */
async function completeSetup(circuitName, options) {
  if (!circuitName) {
    throw new Error("circuitName is required");
  }
  if (!options) {
    throw new Error("options object is required");
  }
  const { circuitPath, power, ptauName, ptauEntropy, setupEntropy } = options;
  if (!circuitPath) {
    throw new Error("options.circuitPath is required");
  }
  if (power === undefined || power === null) {
    throw new Error("options.power is required");
  }
  if (!ptauName) {
    throw new Error("options.ptauName is required");
  }
  if (!ptauEntropy) {
    throw new Error("Warning: options.ptauEntropy is required");
  }
  if (!setupEntropy) {
    throw new Error("Warning: options.setupEntropy is required");
  }

  ensureBuildDir();

  // Define all artifact paths
  const r1csPath = path.join(buildDir, `${circuitName}.r1cs`);
  const wasmPath = path.join(buildDir, `${circuitName}_js`, `${circuitName}.wasm`);
  const ptauPath = path.join(ptauDir, ptauName);
  const zkeyPath = path.join(buildDir, `${circuitName}_final.zkey`);
  const vkeyPath = path.join(buildDir, "verification_key.json");

  // Check which artifacts exist
  const hasR1cs = fs.existsSync(r1csPath);
  const hasWasm = fs.existsSync(wasmPath);
  const hasPtau = fs.existsSync(ptauPath);
  const hasZkey = fs.existsSync(zkeyPath);
  const hasVkey = fs.existsSync(vkeyPath);

  console.log(`\n========================================`);
  console.log(`Setting up ${circuitName} circuit`);
  console.log(`========================================`);
  console.log(`Checking existing artifacts...`);
  console.log(`  R1CS:  ${hasR1cs ? "✓ found" : "✗ missing"}`);
  console.log(`  WASM:  ${hasWasm ? "✓ found" : "✗ missing"}`);
  console.log(`  PTAU:  ${hasPtau ? "✓ found" : "✗ missing"}`);
  console.log(`  Zkey:  ${hasZkey ? "✓ found" : "✗ missing"}`);
  console.log(`  Vkey:  ${hasVkey ? "✓ found" : "✗ missing"}`);
  console.log(`========================================\n`);

  try {
    // Step 1: Compile circuit (only if R1CS or WASM missing)
    if (!hasR1cs || !hasWasm) {
      console.log("STEP 1: Compiling circuit...");
      await compileCircuit(circuitName, circuitPath);
    } else {
      console.log("STEP 1: Circuit already compiled, skipping...");
    }

    // Step 2: Ensure ptau file (ensurePtauFile already handles this internally)
    console.log("\nSTEP 2: Ensuring powers of tau...");
    await ensurePtauFile(power, ptauName, ptauEntropy);

    // Step 3: Setup Groth16 (only if zkey missing)
    // Note: If R1CS was regenerated, we should also regenerate zkey
    const needsZkey = !hasZkey || (!hasR1cs || !hasWasm);
    if (needsZkey) {
      console.log("\nSTEP 3: Setting up Groth16...");
      await setupGroth16(r1csPath, ptauPath, zkeyPath, setupEntropy);
    } else {
      console.log("\nSTEP 3: Zkey already exists, skipping...");
    }

    // Step 4: Export verification key (only if vkey missing or zkey was regenerated)
    const needsVkey = !hasVkey || needsZkey;
    if (needsVkey) {
      console.log("\nSTEP 4: Exporting verification key...");
      await exportVerificationKey(zkeyPath, vkeyPath);
    } else {
      console.log("\nSTEP 4: Verification key already exists, skipping...");
    }

    console.log(`\n========================================`);
    console.log(`✓ Setup complete!`);
    console.log(`========================================`);
    console.log(`R1CS:             ${r1csPath}`);
    console.log(`WASM:             ${wasmPath}`);
    console.log(`PTAU:             ${ptauPath}`);
    console.log(`Zkey:             ${zkeyPath}`);
    console.log(`Verification Key: ${vkeyPath}`);
    console.log(`========================================\n`);

    return {
      r1csPath,
      wasmPath,
      ptauPath,
      zkeyPath,
      vkeyPath,
    };
  } catch (error) {
    console.error(`Setup failed: ${error.message}`);
    throw error;
  }
}

module.exports = {
  ensureBuildDir,
  compileCircuit,
  ensurePtauFile,
  setupGroth16,
  exportVerificationKey,
  completeSetup,
};
