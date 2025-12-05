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

/**
 * Compute Poseidon hash of 2 inputs using circomlibjs.
 * This matches the circuit's Poseidon(2) behavior.
 * 
 * @param {BigInt|string|number} blockHash - First input (blockHash in circuit) (required)
 * @param {BigInt|string|number} userNonce - Second input (userNonce in circuit) (required)
 * @returns {Promise<BigInt>} Poseidon hash result as BigInt
 * 
 * @example
 * const hash = await computePoseidonHash(100, 200);
 */
async function computePoseidonHash(blockHash, userNonce) {
  if (blockHash === undefined || blockHash === null) {
    throw new Error("blockHash is required");
  }
  if (userNonce === undefined || userNonce === null) {
    throw new Error("userNonce is required");
  }
  await initPoseidon();

  const inputs = [
    BigInt(blockHash),
    BigInt(userNonce),
  ];

  const result = poseidon(inputs);
  return BigInt(F.toString(result));
}

/**
 * Compute a random permutation from a seed using the circuit's algorithm.
 * This mirrors the RandomPermutate circuit logic in JavaScript exactly.
 * 
 * The algorithm uses factorial number system decomposition to generate
 * a permutation from the seed. This produces unique shuffled values.
 * 
 * Note: The circuit uses only the lower 250 bits of the seed.
 * 
 * @param {BigInt} seed - The hash seed for permutation
 * @param {number} poolSize - Size of permutation pool (poolSize <= 50)
 * @param {number} [startValue=1] - First value in the contiguous range
 * @returns {number[]} Permuted array of values [startValue..startValue+poolSize-1]
 * @throws {Error} If poolSize > 50
 * 
 * @example
 * const permuted = computePermutation(12345n, 10, 1);
 * // Returns shuffled array like [3, 7, 1, 9, 4, 2, 10, 6, 8, 5]
 * 
 * const zeroIndexed = computePermutation(12345n, 10, 0);
 * // Returns shuffled array like [2, 6, 0, 8, 3, 1, 9, 5, 7, 4]
 */
function computePermutation(seed, poolSize, startValue = 1) {
  if (poolSize > 50) {
    throw new Error("poolSize must be <= 50 for RandomPermutate circuit");
  }

  // Circuit uses only lower 250 bits of the hash
  // This matches: Bits2Num(250) in the circuit
  const MASK_250_BITS = (1n << 250n) - 1n;
  const r = seed & MASK_250_BITS;

  // Initialize input array [startValue, startValue+1, ..., startValue+poolSize-1]
  // This matches circuit's in[i] <== startValue + i
  const inArr = Array.from({ length: poolSize }, (_, i) => startValue + i);

  // vals array - same as circuit, will grow as we process
  // Total size needed: n + (n-1) + (n-2) + ... + 1 = n*(n+1)/2
  const vals = [...inArr];

  let rr = r;
  const out = new Array(poolSize);
  let o = 0;

  // Mirror the circuit's algorithm exactly
  for (let i = poolSize; i > 0; i--) {
    // Get selector index using factorial number system
    const a = Number(rr % BigInt(i));
    rr = rr / BigInt(i);

    // Circuit logic: select vals[o+a] and output to out[i-1]
    // Then prepare vals for next iteration
    let accOut = 0;
    for (let j = 0; j < i; j++) {
      const selector = (a === j) ? 1 : 0;
      // For j < i-1, compute next level vals by shuffling
      // vals[o+i+j] = selector * (vals[o+i-1] - vals[o+j]) + vals[o+j]
      // This effectively moves the last element to replace the selected one
      if (j < i - 1) {
        vals[o + i + j] = selector * (vals[o + i - 1] - vals[o + j]) + vals[o + j];
      }
      accOut += vals[o + j] * selector;
    }
    out[i - 1] = accOut;
    o = o + i;
  }

  return out;
}

/**
 * Create formatted circuit inputs from raw values.
 * Converts all inputs to string format required by snarkjs.
 * 
 * @param {object} inputs - Circuit inputs
 * @param {BigInt|string|number} inputs.blockHash - Public blockchain hash (required)
 * @param {BigInt|string|number} inputs.userNonce - Public user nonce (required)
 * @returns {object} Formatted inputs { blockHash, userNonce } as strings
 * @throws {Error} If required inputs are missing
 * 
 * @example
 * const circuitInputs = createCircuitInputs({
 *   blockHash: 0x123456n,
 *   userNonce: 7,
 * });
 */
function createCircuitInputs(inputs) {
  const { blockHash, userNonce } = inputs;

  if (blockHash === undefined || blockHash === null) {
    throw new Error("inputs.blockHash is required");
  }
  if (userNonce === undefined || userNonce === null) {
    throw new Error("inputs.userNonce is required");
  }

  // Convert hex blockHash to number if needed
  const blockHashBig = BigInt(blockHash);
  const userNonceBig = BigInt(userNonce);

  return {
    blockHash: blockHashBig.toString(),
    userNonce: userNonceBig.toString(),
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
 * @param {string} circuitName - Circuit name (required): 'random_5_35_1' etc.
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
 * @param {string} circuitName - Circuit name (required): 'random_3_50' etc.
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
 * The publicSignals array format:
 * - [randomNumbers[0], randomNumbers[1], ..., randomNumbers[numOutputs-1]]
 * 
 * @param {object} inputs - Circuit inputs from createCircuitInputs (required)
 * @param {string} circuitName - Circuit name (required): 'random_3_50' etc.
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
 * @param {string} circuitName - Circuit name (required): 'random_3_50' etc.
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
  computePermutation,
  createCircuitInputs,
  getWasmPath,
  getFinalZkeyPath,
  generateProof,
  verifyProof,
  loadVerificationKey,
  fullWorkflow,
};
