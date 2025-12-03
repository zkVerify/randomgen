const fs = require("fs");
const path = require("path");
const {
  computePoseidonHash,
  generateRandomFromSeed,
  createCircuitInputs,
  generateProof,
  verifyProof,
  loadVerificationKey,
} = require("../lib/utils.js");
const { completeSetup } = require("../lib/setupArtifacts.js");

const rootDir = path.resolve(__dirname, "..");
const buildDir = path.join(rootDir, "build");

/**
 * Circuit orchestrator for managing the complete ZK proof workflow
 */
class RandomCircuitOrchestrator {
  constructor(options = {}) {
    this.circuitName = options.circuitName || "random";
    this.buildDir = options.buildDir || buildDir;
    this.vkey = null;
  }

  /**
   * Initialize the orchestrator by loading the verification key
   * Automatically generates artifacts if they are missing
   * @throws {Error} If initialization fails
   */
  async initialize(options = {}) {
    // Check if artifacts exist
    const validation = this.validateBuildArtifacts();

    if (!validation.isValid) {
      console.log(`\nMissing artifacts: ${validation.missingFiles.join(", ")}`);
      console.log("Generating artifacts...\n");

      // Generate all artifacts
      await completeSetup(this.circuitName, options);

      console.log("\nArtifacts generated successfully!\n");
    }

    // Load verification key
    this.vkey = loadVerificationKey("verification_key.json");
  }

  /**
   * Validate that all required build artifacts exist
   * @returns {object} { isValid: boolean, missingFiles: string[] }
   */
  validateBuildArtifacts() {
    const requiredFiles = [
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
   * Generate a random proof from inputs
   * @param {object} inputs - { blockHash, userNonce, kurierEntropy, N }
   * @param {object} setupOptions - Options for artifact generation if needed
   * @returns {Promise<object>} { proof, publicSignals, R, circuitInputs }
   * @throws {Error} If proof generation or verification fails
   */
  async generateRandomProof(inputs, setupOptions = {}) {
    if (!this.validateBuildArtifacts().isValid) {
      await this.initialize(setupOptions);
    }

    // Create circuit inputs (with N as a public input now)
    const circuitInputs = await createCircuitInputs(inputs);
    const expectedR = circuitInputs.expectedR;

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

    return {
      proof,
      publicSignals,
      R: expectedR,
      circuitInputs,
    };
  }

  /**
   * Verify a proof
   * @param {object} proof - The proof object
   * @param {array} publicSignals - The public signals
   * @returns {Promise<boolean>} True if proof is valid
   * @throws {Error} If verification fails
   */
  async verifyRandomProof(proof, publicSignals) {
    if (!this.vkey) {
      await this.initialize();
    }

    return await verifyProof(this.vkey, proof, publicSignals);
  }

  /**
   * Save proof and related data to files
   * @param {object} proofData - { proof, publicSignals, R, circuitInputs }
   * @param {string} outputDir - Directory to save files
   * @returns {object} { proof, publicSignals, R } - File paths
   * @throws {Error} If saving fails
   */
  async saveProofData(proofData, outputDir = buildDir) {
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
   * Load proof data from files
   * @param {string} proofFile - Path to proof.json
   * @param {string} publicSignalsFile - Path to public.json
   * @returns {object} { proof, publicSignals }
   * @throws {Error} If loading fails
   */
  loadProofData(
    proofFile = path.join(buildDir, "proof.json"),
    publicSignalsFile = path.join(buildDir, "public.json")
  ) {
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
 * Utility function to compute hash locally for testing
 * @param {object} inputs - { blockHash, userNonce, kurierEntropy, N }
 * @returns {Promise<object>} { hash, R }
 */
async function computeLocalHash(inputs) {
  const N = inputs.N || 1000n;
  const hash = await computePoseidonHash(
    BigInt(inputs.blockHash),
    BigInt(inputs.userNonce),
    BigInt(inputs.kurierEntropy)
  );
  const R = generateRandomFromSeed(hash, N);

  return {
    hash: hash.toString(),
    R: R.toString(),
  };
}

module.exports = {
  RandomCircuitOrchestrator,
  computeLocalHash,
};
module.exports.default = RandomCircuitOrchestrator;
