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
   */
  async initialize(options = {}) {
    try {
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
      return true;
    } catch (error) {
      console.error("Failed to initialize orchestrator:", error.message);
      return false;
    }
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
   * @returns {Promise<object>} { success: boolean, proof, publicSignals, R, error? }
   */
  async generateRandomProof(inputs, setupOptions = {}) {
    try {
      if (!this.vkey) {
        const initialized = await this.initialize(setupOptions);
        if (!initialized) {
          return {
            success: false,
            error: "Failed to initialize orchestrator",
          };
        }
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
        return {
          success: false,
          error: "Generated proof failed verification",
        };
      }

      return {
        success: true,
        proof,
        publicSignals,
        R: expectedR,
        circuitInputs,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Verify a proof
   * @param {object} proof - The proof object
   * @param {array} publicSignals - The public signals
   * @returns {Promise<object>} { isValid: boolean, error? }
   */
  async verifyRandomProof(proof, publicSignals) {
    try {
      if (!this.vkey) {
        await this.initialize();
      }

      const isValid = await verifyProof(this.vkey, proof, publicSignals);
      return {
        isValid,
      };
    } catch (error) {
      return {
        isValid: false,
        error: error.message,
      };
    }
  }

  /**
   * Save proof and related data to files
   * @param {object} proofData - { proof, publicSignals, R, circuitInputs }
   * @param {string} outputDir - Directory to save files
   * @returns {object} { success: boolean, files?: { proof, publicSignals, R }, error? }
   */
  async saveProofData(proofData, outputDir = buildDir) {
    try {
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
        success: true,
        files: {
          proof: proofFile,
          publicSignals: publicSignalsFile,
          R: rFile,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Load proof data from files
   * @param {string} proofFile - Path to proof.json
   * @param {string} publicSignalsFile - Path to public.json
   * @returns {object} { success: boolean, proof?, publicSignals?, error? }
   */
  loadProofData(
    proofFile = path.join(buildDir, "proof.json"),
    publicSignalsFile = path.join(buildDir, "public.json")
  ) {
    try {
      if (!fs.existsSync(proofFile)) {
        throw new Error(`Proof file not found: ${proofFile}`);
      }
      if (!fs.existsSync(publicSignalsFile)) {
        throw new Error(`Public signals file not found: ${publicSignalsFile}`);
      }

      const proof = JSON.parse(fs.readFileSync(proofFile, "utf-8"));
      const publicSignals = JSON.parse(fs.readFileSync(publicSignalsFile, "utf-8"));

      return {
        success: true,
        proof,
        publicSignals,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
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
