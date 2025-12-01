/**
 * RandomGen - Zero-Knowledge Random Number Generator Library
 * 
 * This library provides utilities for generating and verifying zero-knowledge proofs
 * for a Poseidon-based random number generator using Groth16.
 * 
 * Main exports:
 * - RandomCircuitOrchestrator: High-level orchestrator for the complete workflow
 * - Utils: Core cryptographic functions (Poseidon hashing, random generation, proof operations)
 * - SetupArtifacts: Functions for circuit compilation and setup
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
