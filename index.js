/**
 * RandomGen - Zero-Knowledge Random Number Generator Library
 * 
 * This library provides utilities for generating and verifying zero-knowledge proofs
 * for a Poseidon-based random number generator using Groth16.
 * 
 * The circuit generates unique random numbers via permutation:
 * - Uses Poseidon(2) hash of (blockHash, userNonce) as seed
 * - Applies Fisher-Yates permutation to generate unique outputs
 * - Output values are in contiguous range [startValue, startValue + poolSize - 1]
 * 
 * Circuit naming convention: random_{numOutputs}_{poolSize}_{startValue}.circom
 * Example: random_6_49_1.circom for 6 unique numbers from 1-49
 * 
 * Main exports:
 * - RandomCircuitOrchestrator: High-level orchestrator for the complete workflow
 * - computeLocalRandomNumbers: Compute expected outputs without generating a proof
 * - utils: Core cryptographic functions (Poseidon hashing, permutation, proof operations)
 * - setup: Functions for circuit compilation and setup
 * 
 * @module randomgen
 * @example
 * const { RandomCircuitOrchestrator, computeLocalRandomNumbers } = require('randomgen');
 * 
 * const orchestrator = new RandomCircuitOrchestrator();
 * await orchestrator.initialize();
 * 
 * const result = await orchestrator.generateRandomProof({
 *   blockHash: 12345n,
 *   userNonce: 7,
 * });
 * 
 * console.log(result.randomNumbers); // Array of unique random values in [startValue, startValue+poolSize-1]
 */

const { RandomCircuitOrchestrator, computeLocalRandomNumbers } = require("./lib/orchestrator");
const {
  computePoseidonHash,
  computePermutation,
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
  computeLocalRandomNumbers,

  // Utils (low-level cryptographic functions)
  utils: {
    computePoseidonHash,
    computePermutation,
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
