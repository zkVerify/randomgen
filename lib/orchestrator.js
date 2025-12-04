const fs = require("fs");
const path = require("path");
const {
  computePoseidonHash,
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
 * Circuit configurations:
 * - random.circom: numOutputs=15, power=15 (production)
 * - random_test.circom: numOutputs=3, power=13 (testing)
 * 
 * @example
 * const orchestrator = new RandomCircuitOrchestrator({
 *   circuitName: 'random',
 *   numOutputs: 15,
 *   power: 15,
 * });
 * await orchestrator.initialize();
 * const result = await orchestrator.generateRandomProof(inputs);
 */
class RandomCircuitOrchestrator {
  /**
   * Create a new orchestrator instance with explicit configuration.
   * 
   * @param {object} options - Configuration options (all optional with sensible defaults)
   * @param {string} options.circuitName - Circuit name: 'random' or 'random_test' (default: 'random')
   * @param {number} options.numOutputs - Number of random outputs from circuit (default: 15)
   * @param {number} options.power - Powers of tau size for setup (default: 15)
   * @param {string} options.ptauName - Name of ptau file (default: 'pot{power}_final.ptau')
   * @param {string} options.ptauEntropy - Entropy for ptau contribution (default: timestamp-based)
   * @param {string} options.setupEntropy - Entropy for zkey contribution (default: timestamp-based)
   * @param {string} options.buildDir - Build directory for artifacts (default: ./build)
   * @param {string} options.circuitDir - Directory containing circuit files (default: ./circuits)
   */
  constructor(options = {}) {
    // Circuit configuration
    this.circuitName = options.circuitName ?? "random";
    this.numOutputs = options.numOutputs ?? 15;
    this.power = options.power ?? 15;
    this.ptauName = options.ptauName ?? `pot${this.power}_final.ptau`;
    this.ptauEntropy = options.ptauEntropy ?? "random-entropy-ptau-" + Date.now();
    this.setupEntropy = options.setupEntropy ?? "random-entropy-setup-" + Date.now();

    // Directory configuration
    this.buildDir = options.buildDir ?? defaultBuildDir;
    this.circuitDir = options.circuitDir ?? defaultCircuitDir;

    // Computed paths
    this.circuitPath = path.join(this.circuitDir, `${this.circuitName}.circom`);

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
   * The circuit computes R[i] = PoseidonEx(blockHash, userNonce, kurierEntropy)[i] mod N
   * for each output i, where R values are publicly verifiable random numbers.
   * 
   * Uses numOutputs from constructor configuration.
   * 
   * @param {object} inputs - Circuit inputs
   * @param {BigInt|string|number} inputs.blockHash - Public blockchain hash
   * @param {BigInt|string|number} inputs.userNonce - Public user nonce
   * @param {BigInt|string|number} inputs.kurierEntropy - Private entropy (hidden in proof)
   * @param {BigInt|string|number} inputs.N - Public modulus (R values will be in [0, N))
   * @returns {Promise<object>} { proof, publicSignals, R (array of strings), circuitInputs }
   * @throws {Error} If proof generation or verification fails
   */
  async generateRandomProof(inputs) {
    if (!this.initialized) {
      await this.initialize();
    }

    // Create circuit inputs
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

    // Extract R values from publicSignals
    // publicSignals format: [R[0], R[1], ..., R[numOutputs-1], blockHash, userNonce, N]
    const R = publicSignals.slice(0, this.numOutputs).map(v => BigInt(v).toString());

    return {
      proof,
      publicSignals,
      R,
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
   * @param {object} proofData - { proof, publicSignals, R, circuitInputs }
   * @param {string} outputDir - Directory to save files (required)
   * @returns {object} { proof, publicSignals, R } - File paths
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
    const rFile = path.join(outputDir, "R.json");

    fs.writeFileSync(proofFile, JSON.stringify(proofData.proof, null, 2));
    fs.writeFileSync(
      publicSignalsFile,
      JSON.stringify(proofData.publicSignals, null, 2)
    );
    fs.writeFileSync(
      rFile,
      JSON.stringify({ R: proofData.R, inputs: proofData.circuitInputs }, null, 2)
    );

    return {
      proof: proofFile,
      publicSignals: publicSignalsFile,
      R: rFile,
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
 * Compute Poseidon hash locally (useful for testing/verification).
 * 
 * Computes the same Poseidon hash that the circuit computes, returning
 * multiple random values. This function can be used to verify that
 * circuit outputs match expected values.
 * 
 * @param {object} inputs - Circuit inputs
 * @param {BigInt|string|number} inputs.blockHash - Blockchain hash
 * @param {BigInt|string|number} inputs.userNonce - User nonce
 * @param {BigInt|string|number} inputs.kurierEntropy - Entropy value
 * @param {BigInt|string|number} inputs.N - Modulus for R values (default: 1000n)
 * @param {number} numOutputs - Number of random outputs to generate (required)
 * @returns {Promise<object>} { hashes (array of BigInt strings), R (array of mod N results) }
 */
async function computeLocalHash(inputs, numOutputs) {
  if (numOutputs === undefined || numOutputs === null) {
    throw new Error("numOutputs is required");
  }

  const N = inputs.N ?? 1000n;
  const NBig = BigInt(N);

  // Compute Poseidon hash with multiple outputs (always returns array)
  const hashes = await computePoseidonHash(
    BigInt(inputs.blockHash),
    BigInt(inputs.userNonce),
    BigInt(inputs.kurierEntropy),
    numOutputs
  );

  // Apply modulo N to each hash output
  const R = hashes.map(h => (BigInt(h) % NBig).toString());

  return {
    hashes: hashes.map(h => h.toString()),
    R,
  };
}

module.exports = {
  RandomCircuitOrchestrator,
  computeLocalHash,
};
module.exports.default = RandomCircuitOrchestrator;
