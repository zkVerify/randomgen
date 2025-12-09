const fs = require("fs");
const path = require("path");
const {
  computePoseidonHash,
  computePermutation,
  createCircuitInputs,
  generateProof,
  verifyProof,
  loadVerificationKey,
} = require("../lib/utils.js");
const { completeSetup } = require("../lib/setupArtifacts.js");

const rootDir = path.resolve(__dirname, "..");
const defaultBuildDir = path.join(rootDir, "build");
const defaultCircuitDir = path.join(rootDir, "circuits");

/**
 * High-level orchestrator for the complete ZK random number proof workflow.
 * 
 * Manages circuit artifact generation, proof creation, and verification.
 * All configuration is provided in the constructor - no hidden defaults in methods.
 * 
 * The circuit uses Poseidon(2) hash with blockHash and userNonce, then
 * RandomPermutate to generate shuffled unique numbers from a contiguous range.
 * 
 * @example
 * const orchestrator = new RandomCircuitOrchestrator({
 *   circuitName: 'random_5_35_1',
 *   numOutputs: 5,
 *   poolSize: 35,
 *   startValue: 1,
 *   power: 13,
 * });
 * await orchestrator.initialize();
 * const result = await orchestrator.generateRandomProof(inputs);
 */
class RandomCircuitOrchestrator {
  /**
   * Create a new orchestrator instance with explicit configuration.
   * 
   * @param {object} options - Configuration options (all optional with sensible defaults)
   * @param {string} options.circuitName - Circuit name: 'random_5_35_1' etc. (default: auto-generated)
   * @param {number} options.numOutputs - Number of random outputs from circuit (default: 5)
   * @param {number} options.poolSize - Size of the value pool to shuffle, max 50 (default: 35)
   * @param {number} options.startValue - First value in the contiguous range (default: 1)
   * @param {number} options.power - Powers of tau size for setup (default: 13)
   * @param {string} options.ptauName - Name of ptau file (default: 'pot{power}_final.ptau')
   * @param {string} options.ptauEntropy - Entropy for ptau contribution (default: timestamp-based)
   * @param {string} options.setupEntropy - Entropy for zkey contribution (default: timestamp-based)
   * @param {string} options.buildDir - Build directory for artifacts (default: ./build)
   * @param {string} options.circuitDir - Directory containing circuit files (default: ./circuits)
   */
  constructor(options = {}) {
    // Circuit configuration
    this.numOutputs = options.numOutputs ?? 5;
    this.poolSize = options.poolSize ?? 35;
    this.startValue = options.startValue ?? 1;
    this.circuitName = options.circuitName ?? `random_${this.numOutputs}_${this.poolSize}_${this.startValue}`;
    this.power = options.power ?? 13
    this.ptauName = options.ptauName ?? `pot${this.power}_final.ptau`;
    this.ptauEntropy = options.ptauEntropy ?? "random-entropy-ptau-" + Date.now();
    this.setupEntropy = options.setupEntropy ?? "random-entropy-setup-" + Date.now();

    // Directory configuration
    this.buildDir = options.buildDir ?? defaultBuildDir;
    this.circuitDir = options.circuitDir ?? defaultCircuitDir;

    // Computed paths
    this.circuitPath = options.circuitPath ?? path.join(this.circuitDir, `${this.circuitName}.circom`);

    // Runtime state
    this.vkey = null;
    this.initialized = false;
  }

  /**
   * Initialize the orchestrator by ensuring artifacts exist and loading the verification key.
   * Uses fine-grained artifact checking - only regenerates what's missing.
   * 
   * @throws {Error} If initialization or artifact generation fails
   */
  async initialize() {
    // Check if artifacts exist
    const validation = this.validateBuildArtifacts();

    if (!validation.isValid) {
      console.log(`\nMissing artifacts: ${validation.missingFiles.join(", ")}`);
      console.log("Generating missing artifacts...\n");

      await completeSetup(this.circuitName, {
        circuitPath: this.circuitPath,
        power: this.power,
        ptauName: this.ptauName,
        ptauEntropy: this.ptauEntropy,
        setupEntropy: this.setupEntropy,
      });

      console.log("\nArtifact generation complete!\n");
    }

    // Load verification key
    this.vkey = loadVerificationKey("verification_key.json");
    this.initialized = true;
  }

  /**
   * Validate that all required build artifacts exist.
   * Checks R1CS, WASM, zkey, and verification key.
   * 
   * @returns {object} { isValid: boolean, missingFiles: string[] }
   */
  validateBuildArtifacts() {
    const requiredFiles = [
      `${this.circuitName}.r1cs`,
      `${this.circuitName}_js/${this.circuitName}.wasm`,
      `${this.circuitName}_final.zkey`,
      "verification_key.json",
    ];

    const missingFiles = [];
    for (const file of requiredFiles) {
      const filepath = path.join(this.buildDir, file);
      if (!fs.existsSync(filepath)) {
        missingFiles.push(file);
      }
    }

    return {
      isValid: missingFiles.length === 0,
      missingFiles,
    };
  }

  /**
   * Generate a zero-knowledge proof for random number generation.
   * 
   * The circuit computes:
   * 1. seed = Poseidon(blockHash, userNonce)
   * 2. Permutes [startValue, startValue+1, ..., startValue+poolSize-1] using seed
   * 3. Returns first numOutputs values from permutation
   * 
   * Outputs are unique values in range [startValue, startValue + poolSize - 1].
   * 
   * @param {object} inputs - Circuit inputs
   * @param {BigInt|string|number|Buffer|Uint8Array} inputs.blockHash - Blockchain hash
   * @param {BigInt|string|number|Buffer|Uint8Array} inputs.userNonce - User nonce
   * @returns {Promise<object>} { proof, publicSignals, randomNumbers (array of strings), circuitInputs }
   * @throws {Error} If proof generation or verification fails
   */
  async generateRandomProof(inputs) {
    if (!this.initialized) {
      await this.initialize();
    }

    // Create circuit inputs (only blockHash and userNonce)
    const circuitInputs = createCircuitInputs(inputs);

    // Generate proof
    const { proof, publicSignals } = await generateProof(
      circuitInputs,
      this.circuitName
    );

    // Verify proof
    const isValid = await verifyProof(this.vkey, proof, publicSignals);

    if (!isValid) {
      throw new Error("Generated proof failed verification");
    }

    // Extract random numbers from publicSignals
    // publicSignals format: [randomNumbers[0], ..., randomNumbers[numOutputs-1]]
    const randomNumbers = publicSignals.slice(0, this.numOutputs).map(v => BigInt(v).toString());

    return {
      proof,
      publicSignals,
      randomNumbers,
      circuitInputs,
    };
  }

  /**
   * Verify a proof.
   * 
   * @param {object} proof - The proof object
   * @param {array} publicSignals - The public signals
   * @returns {Promise<boolean>} True if proof is valid
   * @throws {Error} If verification fails
   */
  async verifyRandomProof(proof, publicSignals) {
    if (!this.initialized) {
      await this.initialize();
    }

    return await verifyProof(this.vkey, proof, publicSignals);
  }

  /**
   * Save proof and related data to files.
   * 
   * @param {object} proofData - { proof, publicSignals, randomNumbers, circuitInputs }
   * @param {string} outputDir - Directory to save files (required)
   * @returns {object} { proof, publicSignals, randomNumbers } - File paths
   * @throws {Error} If saving fails
   */
  async saveProofData(proofData, outputDir) {
    if (!outputDir) {
      throw new Error("outputDir is required");
    }

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const proofFile = path.join(outputDir, "proof.json");
    const publicSignalsFile = path.join(outputDir, "public.json");
    const randomNumbersFile = path.join(outputDir, "randomNumbers.json");

    fs.writeFileSync(proofFile, JSON.stringify(proofData.proof, null, 2));
    fs.writeFileSync(
      publicSignalsFile,
      JSON.stringify(proofData.publicSignals, null, 2)
    );
    fs.writeFileSync(
      randomNumbersFile,
      JSON.stringify({ randomNumbers: proofData.randomNumbers, inputs: proofData.circuitInputs }, null, 2)
    );

    return {
      proof: proofFile,
      publicSignals: publicSignalsFile,
      randomNumbers: randomNumbersFile,
    };
  }

  /**
   * Load proof data from files.
   * 
   * @param {string} proofFile - Path to proof.json (required)
   * @param {string} publicSignalsFile - Path to public.json (required)
   * @returns {object} { proof, publicSignals }
   * @throws {Error} If loading fails
   */
  loadProofData(proofFile, publicSignalsFile) {
    if (!proofFile || !publicSignalsFile) {
      throw new Error("proofFile and publicSignalsFile are required");
    }

    if (!fs.existsSync(proofFile)) {
      throw new Error(`Proof file not found: ${proofFile}`);
    }
    if (!fs.existsSync(publicSignalsFile)) {
      throw new Error(`Public signals file not found: ${publicSignalsFile}`);
    }

    const proof = JSON.parse(fs.readFileSync(proofFile, "utf-8"));
    const publicSignals = JSON.parse(fs.readFileSync(publicSignalsFile, "utf-8"));

    return {
      proof,
      publicSignals,
    };
  }
}

/**
 * Compute random numbers locally (useful for testing/verification).
 * 
 * Computes the same random numbers that the circuit computes:
 * 1. seed = Poseidon(blockHash, userNonce)
 * 2. Permute [startValue, startValue+1, ..., startValue+poolSize-1] using seed
 * 3. Return first numOutputs values
 * 
 * Inputs are truncated to 31 bytes (248 bits) to fit in a field element.
 * Accepts: BigInt, number, hex string (0x...), decimal string, Buffer, Uint8Array.
 * 
 * @param {object} inputs - Circuit inputs
 * @param {BigInt|string|number|Buffer|Uint8Array} inputs.blockHash - Blockchain hash
 * @param {BigInt|string|number|Buffer|Uint8Array} inputs.userNonce - User nonce
 * @param {number} numOutputs - Number of random outputs to generate (required)
 * @param {number} poolSize - Size of the value pool to shuffle (default: 50)
 * @param {number} startValue - First value in the contiguous range (default: 1)
 * @returns {Promise<object>} { seed (BigInt string), randomNumbers (array of numbers) }
 */
async function computeLocalRandomNumbers(inputs, numOutputs, poolSize = 50, startValue = 1) {
  if (numOutputs === undefined || numOutputs === null) {
    throw new Error("numOutputs is required");
  }
  if (numOutputs > poolSize) {
    throw new Error("numOutputs must be <= poolSize");
  }

  // Compute Poseidon hash (truncation happens inside computePoseidonHash)
  const seed = await computePoseidonHash(
    inputs.blockHash,
    inputs.userNonce
  );

  // Compute permutation with startValue
  const permuted = computePermutation(seed, poolSize, startValue);

  // Return first numOutputs values
  const randomNumbers = permuted.slice(0, numOutputs);

  return {
    seed: seed.toString(),
    randomNumbers,
  };
}

module.exports = {
  RandomCircuitOrchestrator,
  computeLocalRandomNumbers,
};
module.exports.default = RandomCircuitOrchestrator;
