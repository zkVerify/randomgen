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
 */
function ensureBuildDir() {
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }
}

/**
 * Compile circom circuit to R1CS and WASM
 * @param {string} circuitName - Circuit name (e.g., "random")
 * @param {string} circuitPath - Path to .circom file
 * @returns {Promise<{r1csPath: string, wasmPath: string}>}
 */
async function compileCircuit(
  circuitName = "random",
  circuitPath = null
) {
  if (!circuitPath) {
    circuitPath = path.join(circuitDir, `${circuitName}.circom`);
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
 * Get or create powers of tau file
 * @param {number} power - Power of tau (e.g., 12 for 2^12 constraints)
 * @param {string} ptauName - Name of ptau file (e.g., "pot12_final.ptau")
 * @returns {Promise<string>} Path to ptau file
 */
async function ensurePtauFile(power = 12, ptauName = `pot${power}_final.ptau`) {
  const ptauPath = path.join(ptauDir, ptauName);

  if (fs.existsSync(ptauPath)) {
    console.log(`✓ Powers of tau file found: ${ptauPath}`);
    return ptauPath;
  }

  console.log(`Creating powers of tau file (power=${power})...`);

  // Create initial ptau
  const initialPtau = path.join(ptauDir, `pot${power}_0000.ptau`);
  if (!fs.existsSync(initialPtau)) {
    console.log(`Generating initial ptau with power ${power}...`);
    await snarkjs.powersOfTau.new(power, initialPtau);
  }

  // Contribute to ptau (add randomness)
  const contributedPtau = path.join(ptauDir, `pot${power}_0001.ptau`);
  console.log("Contributing to powers of tau...");
  await snarkjs.powersOfTau.contribute(initialPtau, contributedPtau, "Random contribution", "0x1234");

  // Prepare phase 2
  console.log("Preparing phase 2...");
  await snarkjs.powersOfTau.preparePhase2(contributedPtau, ptauPath);

  console.log(`✓ Powers of tau file created: ${ptauPath}`);
  return ptauPath;
}

/**
 * Generate Groth16 setup (zkey) from R1CS and ptau
 * @param {string} r1csPath - Path to R1CS file
 * @param {string} ptauPath - Path to ptau file
 * @param {string} zkeyPath - Path to output zkey file
 * @returns {Promise<string>} Path to zkey file
 */
async function setupGroth16(r1csPath, ptauPath, zkeyPath) {
  if (!fs.existsSync(r1csPath)) {
    throw new Error(`R1CS file not found: ${r1csPath}`);
  }
  if (!fs.existsSync(ptauPath)) {
    throw new Error(`PTAU file not found: ${ptauPath}`);
  }

  console.log("Setting up Groth16...");

  try {
    // Create zkey from r1cs and ptau
    await snarkjs.zKey.new(r1csPath, ptauPath, zkeyPath);
    console.log(`✓ Groth16 setup complete: ${zkeyPath}`);
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
 * Complete setup: compile circuit, setup Groth16, and export vkey
 * @param {string} circuitName - Circuit name (e.g., "random")
 * @param {object} options - Setup options
 * @returns {Promise<object>} Artifact paths
 */
async function completeSetup(circuitName = "random", options = {}) {
  const {
    circuitPath = null,
    power = 12,
    ptauName = `pot${power}_final.ptau`,
  } = options;

  ensureBuildDir();

  console.log(`\n========================================`);
  console.log(`Setting up ${circuitName} circuit`);
  console.log(`========================================\n`);

  try {
    // Step 1: Compile circuit
    console.log("STEP 1: Compiling circuit...");
    const { r1csPath, wasmPath } = await compileCircuit(circuitName, circuitPath);

    // Step 2: Ensure ptau file
    console.log("\nSTEP 2: Ensuring powers of tau...");
    const ptauPath = await ensurePtauFile(power, ptauName);

    // Step 3: Setup Groth16
    console.log("\nSTEP 3: Setting up Groth16...");
    const zkeyPath = path.join(buildDir, `${circuitName}_final.zkey`);
    await setupGroth16(r1csPath, ptauPath, zkeyPath);

    // Step 4: Export verification key
    console.log("\nSTEP 4: Exporting verification key...");
    const vkeyPath = path.join(buildDir, "verification_key.json");
    await exportVerificationKey(zkeyPath, vkeyPath);

    console.log(`\n========================================`);
    console.log(`✓ Setup complete!`);
    console.log(`========================================`);
    console.log(`R1CS:            ${r1csPath}`);
    console.log(`WASM:            ${wasmPath}`);
    console.log(`PTAU:            ${ptauPath}`);
    console.log(`Zkey:            ${zkeyPath}`);
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
