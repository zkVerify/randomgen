/**
 * RandomGen - Zero-Knowledge Random Number Generator Library
 * 
 * This library provides utilities for generating and verifying zero-knowledge proofs
 * for a Poseidon-based random number generator using Groth16.
 * 
 * The circuit generates multiple random numbers per proof:
 * - random.circom: 15 outputs (production default, power=15)
 * - random_test.circom: 3 outputs (testing, power=13)
 * 
 * Main exports:
 * - RandomCircuitOrchestrator: High-level orchestrator for the complete workflow
 * - computeLocalHash: Compute expected outputs without generating a proof
 * - utils: Core cryptographic functions (Poseidon hashing, proof operations)
 * - setup: Functions for circuit compilation and setup
 * 
 * @module randomgen
 * @example
 * const { RandomCircuitOrchestrator, computeLocalHash } = require('randomgen');
 * 
 * const orchestrator = new RandomCircuitOrchestrator();
 * await orchestrator.initialize();
 * 
 * const result = await orchestrator.generateRandomProof({
 *   blockHash: 12345n,
 *   userNonce: 7,
 *   kurierEntropy: 42,
 *   N: 1000,
 * });
 * 
 * console.log(result.R); // Array of 15 random values in [0, 1000)
 */

const { RandomCircuitOrchestrator, computeLocalHash } = require("./lib/orchestrator");
const {
  computePoseidonHash,
  generateRandomFromSeed,
  createCircuitInputs,
  getWasmPath,
  getFinalZkeyPath,
  generateProof,
  verifyProof,
  loadVerificationKey,
  fullWorkflow,
} = require("./lib/utils");
const {
  ensureBuildDir,
  compileCircuit,
  ensurePtauFile,
  setupGroth16,
  exportVerificationKey,
  completeSetup,
} = require("./lib/setupArtifacts");

// Main exports
module.exports = {
  // Orchestrator (recommended for most use cases)
  RandomCircuitOrchestrator,
  computeLocalHash,

  // Utils (low-level cryptographic functions)
  utils: {
    computePoseidonHash,
    generateRandomFromSeed,
    createCircuitInputs,
    getWasmPath,
    getFinalZkeyPath,
    generateProof,
    verifyProof,
    loadVerificationKey,
    fullWorkflow,
  },

  // Setup utilities (for circuit compilation and artifact generation)
  setup: {
    ensureBuildDir,
    compileCircuit,
    ensurePtauFile,
    setupGroth16,
    exportVerificationKey,
    completeSetup,
  },
};

// Default export for ES6 compatibility
module.exports.default = RandomCircuitOrchestrator;
