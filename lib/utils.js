const fs = require("fs");
const path = require("path");
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");

const rootDir = path.resolve(__dirname, "..");
const buildDir = path.join(rootDir, "build");

// Singleton Poseidon instance
let poseidon = null;
let F = null;
let poseidonReady = false;

/**
 * Initialize Poseidon hash function (singleton pattern)
 * Called automatically by computePoseidonHash.
 * @returns {Promise<void>}
 * @private
 */
async function initPoseidon() {
  if (!poseidonReady) {
    const poseidonObj = await buildPoseidon();
    poseidon = poseidonObj;
    F = poseidonObj.F;
    poseidonReady = true;
  }
}

// Maximum value for 31 bytes (248 bits)
const MAX_31_BYTES = (1n << 248n) - 1n;

/**
 * Truncate a value to fit in 31 bytes (248 bits).
 * Values larger than 31 bytes are truncated by taking the lower 248 bits.
 * 
 * @param {BigInt} value - The value to truncate
 * @returns {BigInt} Value truncated to 31 bytes
 */
function truncateTo31Bytes(value) {
  const bigValue = BigInt(value);
  if (bigValue > MAX_31_BYTES) {
    return bigValue & MAX_31_BYTES;
  }
  return bigValue;
}

/**
 * Compute Poseidon hash of 2 inputs using circomlibjs.
 * Always returns an array of BigInt values.
 * 
 * This function matches the circuit's PoseidonEx behavior by automatically
 * adding dummy zero inputs when more outputs are requested. The circuit uses
 * PoseidonEx which requires: t = nInputs + 1 >= nOuts.
 * 
 * With 2 real inputs:
 *   - nOuts <= 3: Uses 2 inputs directly
 *   - nOuts > 3: Adds (nOuts - 3) dummy zero inputs
 * 
 * @param {BigInt|string|number} input1 - First input (blockHash in circuit) (required)
 * @param {BigInt|string|number} input2 - Second input (userNonce in circuit) (required)
 * @param {number} nOuts - Number of outputs (required)
 * @returns {Promise<BigInt[]>} Array of Poseidon hash results as BigInt values
 * @throws {Error} If nOuts is not provided
 * 
 * @example
 * // Single output
 * const [hash] = await computePoseidonHash(100, 200, 1);
 * 
 * // Multiple outputs (matching random_1.circom with 15 outputs)
 * const hashes = await computePoseidonHash(100, 200, 15);
 */
async function computePoseidonHash(input1, input2, nOuts) {
  if (nOuts === undefined || nOuts === null) {
    throw new Error("nOuts is required");
  }
  await initPoseidon();

  // Start with the 2 real inputs
  const numRealInputs = 2;
  const inputs = [
    BigInt(input1),
    BigInt(input2),
  ];

  // Add dummy inputs (zeros) if nOuts requires more inputs
  // PoseidonEx requires nInputs >= nOuts - 1 (since t = nInputs + 1 and nOuts <= t)
  const numTotalInputs = nOuts > numRealInputs + 1 ? nOuts - 1 : numRealInputs;
  const numDummyInputs = numTotalInputs - numRealInputs;
  for (let i = 0; i < numDummyInputs; i++) {
    inputs.push(0n);
  }

  // Use poseidon with nOuts parameter for multi-output
  const result = poseidon(inputs, F.zero, nOuts);

  // Always return an array
  if (nOuts > 1) {
    return Array.from({ length: nOuts }, (_, i) =>
      BigInt(F.toString(result[i]))
    );
  }

  // Single result case - wrap in array for consistency
  const hash = BigInt(F.toString(result));
  return [hash];
}

/**
 * Generate random numbers from seeds using modulo operation.
 * Accepts either a single seed or an array of seeds.
 * 
 * @param {BigInt|BigInt[]} seeds - The seed value(s) - can be a single value or array (required)
 * @param {BigInt|string|number} N - The modulus (required, range: [0, N))
 * @returns {BigInt[]} Array of random numbers (seed mod N for each seed)
 * @throws {Error} If N is not provided
 * 
 * @example
 * // Single seed
 * const [random] = generateRandomFromSeed(12345n, 1000n);
 * 
 * // Multiple seeds (from computePoseidonHash output)
 * const randoms = generateRandomFromSeed(hashes, 1000n);
 */
function generateRandomFromSeed(seeds, N) {
  if (N === undefined || N === null) {
    throw new Error("N is required");
  }
  const NBig = truncateTo31Bytes(BigInt(N));

  // Handle both single seed and array of seeds
  const seedArray = Array.isArray(seeds) ? seeds : [seeds];

  return seedArray.map(seed => BigInt(seed) % NBig);
}

/**
 * Create formatted circuit inputs from raw values.
 * Converts all inputs to string format required by snarkjs.
 * Values larger than 31 bytes (248 bits) are automatically truncated.
 * 
 * @param {object} inputs - Circuit inputs
 * @param {BigInt|string|number} inputs.blockHash - Public blockchain hash (required, truncated to 31 bytes)
 * @param {BigInt|string|number} inputs.userNonce - Public user nonce (required, truncated to 31 bytes)
 * @param {BigInt|string|number} inputs.N - Public modulus (required, truncated to 31 bytes)
 * @returns {object} Formatted inputs { blockHash, userNonce, N } as strings
 * @throws {Error} If required inputs are missing
 * 
 * @example
 * const circuitInputs = createCircuitInputs({
 *   blockHash: 0x123456n,
 *   userNonce: 7,
 *   N: 1000,
 * });
 */
function createCircuitInputs(inputs) {
  const { blockHash, userNonce, N } = inputs;

  if (blockHash === undefined || blockHash === null) {
    throw new Error("inputs.blockHash is required");
  }
  if (userNonce === undefined || userNonce === null) {
    throw new Error("inputs.userNonce is required");
  }
  if (N === undefined || N === null) {
    throw new Error("inputs.N is required");
  }

  // Convert to BigInt and truncate to 31 bytes if needed
  const blockHashBig = truncateTo31Bytes(BigInt(blockHash));
  const userNonceBig = truncateTo31Bytes(BigInt(userNonce));
  const NBig = truncateTo31Bytes(BigInt(N));

  return {
    blockHash: blockHashBig.toString(),
    userNonce: userNonceBig.toString(),
    N: NBig.toString(),
  };
}

/**
 * Read JSON file from build directory
 * @param {string} filename - Filename in build directory
 * @returns {object} Parsed JSON content
 * @throws {Error} If file not found
 * @private
 */
function readBuildFile(filename) {
  const filepath = path.join(buildDir, filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`File not found: ${filepath}`);
  }
  return JSON.parse(fs.readFileSync(filepath, "utf-8"));
}

/**
 * Get path to WASM file for a circuit
 * @param {string} circuitName - Circuit name (required): 'random' or 'random_3.circom'
 * @returns {string} Absolute path to wasm file
 * @throws {Error} If circuitName not provided
 */
function getWasmPath(circuitName) {
  if (!circuitName) {
    throw new Error("circuitName is required");
  }
  return path.join(buildDir, `${circuitName}_js`, `${circuitName}.wasm`);
}

/**
 * Get path to final zkey file for a circuit
 * @param {string} circuitName - Circuit name (required): 'random' or 'random_3.circom'
 * @returns {string} Absolute path to final zkey file
 * @throws {Error} If circuitName not provided
 */
function getFinalZkeyPath(circuitName) {
  if (!circuitName) {
    throw new Error("circuitName is required");
  }
  return path.join(buildDir, `${circuitName}_final.zkey`);
}

/**
 * Generate a Groth16 proof for the random circuit.
 * 
 * The publicSignals array format depends on the circuit's numOutputs:
 * - random_1.circom (15 outputs): [R[0], ..., R[14], blockHash, userNonce, N]
 * - random_3.circom (3 outputs): [R[0], R[1], R[2], blockHash, userNonce, N]
 * 
 * @param {object} inputs - Circuit inputs from createCircuitInputs (required)
 * @param {string} circuitName - Circuit name (required): 'random' or 'random_3.circom'
 * @returns {Promise<object>} { proof, publicSignals }
 * @throws {Error} If WASM or zkey files not found, or parameters missing
 */
async function generateProof(inputs, circuitName) {
  if (!inputs) {
    throw new Error("inputs is required");
  }
  if (!circuitName) {
    throw new Error("circuitName is required");
  }
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
 * @param {string} filename - Filename in build directory (required)
 * @returns {object} Verification key
 * @throws {Error} If filename not provided
 */
function loadVerificationKey(filename) {
  if (!filename) {
    throw new Error("filename is required");
  }
  return readBuildFile(filename);
}

/**
 * Full workflow: create inputs, generate proof, and verify
 * @param {object} inputs - Circuit inputs (required)
 * @param {string} circuitName - Circuit name (required): 'random' or 'random_3.circom'
 * @returns {Promise<object>} { inputs, proof, publicSignals, isValid }
 * @throws {Error} If required parameters missing
 */
async function fullWorkflow(inputs, circuitName) {
  if (!inputs) {
    throw new Error("inputs is required");
  }
  if (!circuitName) {
    throw new Error("circuitName is required");
  }
  // Create circuit inputs
  const circuitInputs = createCircuitInputs(inputs);

  // Generate proof
  const { proof, publicSignals } = await generateProof(circuitInputs, circuitName);

  // Load verification key and verify
  const vkey = loadVerificationKey("verification_key.json");
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
  truncateTo31Bytes,
  MAX_31_BYTES,
  getWasmPath,
  getFinalZkeyPath,
  generateProof,
  verifyProof,
  loadVerificationKey,
  fullWorkflow,
};
