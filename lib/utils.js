const fs = require("fs");
const path = require("path");
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");

const rootDir = path.resolve(__dirname, "..");
const buildDir = path.join(rootDir, "build");

let poseidon = null;
let F = null;
let poseidonReady = false;

/**
 * Initialize Poseidon hash function
 * @returns {Promise<void>}
 */
async function initPoseidon() {
  if (!poseidonReady) {
    const poseidonObj = await buildPoseidon();
    poseidon = poseidonObj;
    F = poseidonObj.F;
    poseidonReady = true;
  }
}

/**
 * Compute Poseidon hash of 3 inputs using circomlibjs
 * @param {BigInt|string|number} input1 - First input
 * @param {BigInt|string|number} input2 - Second input
 * @param {BigInt|string|number} input3 - Third input
 * @returns {BigInt} Poseidon hash result
 */
async function computePoseidonHash(input1, input2, input3) {
  await initPoseidon();
  const inputs = [
    BigInt(input1),
    BigInt(input2),
    BigInt(input3),
  ];
  const result = poseidon(inputs);
  // poseidon returns an array representation, convert to decimal using field
  return BigInt(F.toString(result));
}

/**
 * Generate random number from seed using modulo operation
 * @param {BigInt|string|number} seed - The seed value
 * @param {BigInt|string|number} N - The modulus (range: [0, N))
 * @returns {BigInt} Random number (seed mod N)
 */
function generateRandomFromSeed(seed, N = 1000n) {
  const seedBig = BigInt(seed);
  const NBig = BigInt(N);
  return seedBig % NBig;
}

/**
 * Create circuit witness from inputs
 * @param {object} inputs - Circuit inputs { blockHash, userNonce, kurierEntropy, N }
 * @returns {Promise<object>} Witness object with expected outputs
 */
async function createCircuitInputs(inputs) {
  const { blockHash, userNonce, kurierEntropy, N = 1000 } = inputs;

  // Convert hex blockHash to number if needed
  let blockHashBig;
  if (typeof blockHash === "string" && blockHash.startsWith("0x")) {
    blockHashBig = BigInt(blockHash);
  } else {
    blockHashBig = BigInt(blockHash);
  }

  const userNonceBig = BigInt(userNonce);
  const kurierEntropyBig = BigInt(kurierEntropy);
  const NBig = BigInt(N);

  // Compute the expected output
  const hash = await computePoseidonHash(blockHashBig, userNonceBig, kurierEntropyBig);
  const expectedR = generateRandomFromSeed(hash, NBig);

  return {
    blockHash: blockHashBig.toString(),
    userNonce: userNonceBig.toString(),
    kurierEntropy: kurierEntropyBig.toString(),
    N: NBig.toString(),
    expectedR: expectedR.toString(),
    hash: hash.toString(),
  };
}

/**
 * Read JSON file from build directory
 * @param {string} filename - Filename in build directory
 * @returns {object} Parsed JSON content
 */
function readBuildFile(filename) {
  const filepath = path.join(buildDir, filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`File not found: ${filepath}`);
  }
  return JSON.parse(fs.readFileSync(filepath, "utf-8"));
}

/**
 * Get path to wasm file
 * @param {string} circuitName - Circuit name (default: "random")
 * @returns {string} Path to wasm file
 */
function getWasmPath(circuitName = "random") {
  return path.join(buildDir, `${circuitName}_js`, `${circuitName}.wasm`);
}

/**
 * Get path to final zkey file
 * @param {string} circuitName - Circuit name (default: "random")
 * @returns {string} Path to final zkey file
 */
function getFinalZkeyPath(circuitName = "random") {
  return path.join(buildDir, `${circuitName}_final.zkey`);
}

/**
 * Generate a proof using Groth16
 * @param {object} inputs - Circuit inputs
 * @param {string} circuitName - Circuit name (default: "random")
 * @returns {Promise<object>} { proof, publicSignals }
 */
async function generateProof(inputs, circuitName = "random") {
  const wasmFile = getWasmPath(circuitName);
  const zkeyFile = getFinalZkeyPath(circuitName);

  if (!fs.existsSync(wasmFile)) {
    throw new Error(
      `WASM file not found: ${wasmFile}. Run 'npm run compile' first.`
    );
  }
  if (!fs.existsSync(zkeyFile)) {
    throw new Error(
      `Zkey file not found: ${zkeyFile}. Run 'npm run setup' first.`
    );
  }

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    inputs,
    wasmFile,
    zkeyFile
  );

  return { proof, publicSignals };
}

/**
 * Verify a proof using Groth16
 * @param {object} vkey - Verification key
 * @param {object} proof - Proof object
 * @param {array} publicSignals - Public signals
 * @returns {Promise<boolean>} True if proof is valid
 */
async function verifyProof(vkey, proof, publicSignals) {
  const isValid = await snarkjs.groth16.verify(
    vkey,
    publicSignals,
    proof
  );
  return isValid;
}

/**
 * Load verification key from build directory
 * @param {string} filename - Filename in build directory (default: "verification_key.json")
 * @returns {object} Verification key
 */
function loadVerificationKey(filename = "verification_key.json") {
  return readBuildFile(filename);
}

/**
 * Full workflow: create inputs, generate proof, and verify
 * @param {object} inputs - Circuit inputs
 * @param {string} circuitName - Circuit name (default: "random")
 * @returns {Promise<object>} { inputs, proof, publicSignals, isValid }
 */
async function fullWorkflow(inputs, circuitName = "random") {
  // Create circuit inputs
  const circuitInputs = createCircuitInputs(inputs);

  // Generate proof
  const { proof, publicSignals } = await generateProof(circuitInputs, circuitName);

  // Load verification key and verify
  const vkey = loadVerificationKey();
  const isValid = await verifyProof(vkey, proof, publicSignals);

  return {
    inputs: circuitInputs,
    proof,
    publicSignals,
    isValid,
  };
}

module.exports = {
  computePoseidonHash,
  generateRandomFromSeed,
  createCircuitInputs,
  getWasmPath,
  getFinalZkeyPath,
  generateProof,
  verifyProof,
  loadVerificationKey,
  fullWorkflow,
};
