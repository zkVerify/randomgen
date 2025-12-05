const path = require("path");
const wasm_tester = require("circom_tester").wasm;
const { buildPoseidon } = require("circomlibjs");
const crypto = require("crypto");
const { computeLocalRandomNumbers } = require("../lib/orchestrator.js");
const { computePermutation } = require("../lib/utils.js");

// =============================================================================
// TEST CIRCUIT CONFIGURATION
// =============================================================================
// Tests use random_5_35.circom which is configured with:
//   - numOutputs = 5
//   - maxOutputVal = 35
//   - power = 13
// =============================================================================
const NUM_OUTPUTS = 5;
const MAX_OUTPUT_VAL = 35;

// Helper function to compute SHA256 of input and convert to decimal
// Returns a 32-byte hash as a decimal string for circuit compatibility
const createBlockHash = (seed) => {
  // Create SHA256 hash of the seed
  const hash = crypto.createHash("sha256");
  hash.update(seed.toString());
  const hashHex = hash.digest("hex"); // 64 hex characters = 32 bytes
  // Convert hex string to decimal
  return BigInt("0x" + hashHex).toString();
};

// Helper to extract randomNumbers array from witness (outputs start at index 1)
const extractOutputs = (witness, numOutputs = NUM_OUTPUTS) => {
  return Array.from({ length: numOutputs }, (_, i) => BigInt(witness[1 + i]));
};

describe("Random Circuit Test Suite", () => {
  let poseidon;
  let circuit;
  let F;

  beforeAll(async () => {
    // Initialize Poseidon
    const poseidonObj = await buildPoseidon();
    poseidon = poseidonObj;
    F = poseidonObj.F;

    // Load and compile the random circuit
    circuit = await wasm_tester(
      path.join(__dirname, "../circuits/random_5_35.circom")
    );
  });

  // ============================================================================
  // Test Suite: Basic Circuit Functionality
  // ============================================================================

  describe("Basic Circuit Functionality", () => {
    it("Should generate a valid witness for basic inputs", async () => {
      const inputs = {
        blockHash: createBlockHash(12345678901234567890),
        userNonce: 5,
      };

      const w = await circuit.calculateWitness(inputs, true);
      expect(w).toBeDefined();
      expect(w.length).toBeGreaterThan(0);

      // Check witness is valid (constraints satisfied)
      await circuit.checkConstraints(w);
    });

    it("Should produce all outputs in valid range [1, maxOutputVal]", async () => {
      const inputs = {
        blockHash: createBlockHash(1),
        userNonce: 1,
      };

      const w = await circuit.calculateWitness(inputs, true);
      await circuit.checkConstraints(w);

      // Extract all outputs
      const outputs = extractOutputs(w);

      expect(outputs.length).toBe(NUM_OUTPUTS);
      for (let i = 0; i < NUM_OUTPUTS; i++) {
        expect(outputs[i]).toBeGreaterThanOrEqual(BigInt(1));
        expect(outputs[i]).toBeLessThanOrEqual(BigInt(MAX_OUTPUT_VAL));
      }
    });

    it("Should handle zero inputs correctly", async () => {
      const inputs = {
        blockHash: createBlockHash(0),
        userNonce: 0,
      };

      const w = await circuit.calculateWitness(inputs, true);
      await circuit.checkConstraints(w);

      const outputs = extractOutputs(w);
      for (const output of outputs) {
        expect(output).toBeGreaterThanOrEqual(BigInt(1));
        expect(output).toBeLessThanOrEqual(BigInt(MAX_OUTPUT_VAL));
      }
    });

    it("Should produce NUM_OUTPUTS distinct random values (permutation guarantees uniqueness)", async () => {
      const inputs = {
        blockHash: createBlockHash(42),
        userNonce: 123,
      };

      const w = await circuit.calculateWitness(inputs, true);
      await circuit.checkConstraints(w);

      const outputs = extractOutputs(w);
      const uniqueOutputs = new Set(outputs.map(o => o.toString()));

      // Permutation-based outputs are ALWAYS unique
      expect(uniqueOutputs.size).toBe(NUM_OUTPUTS);
    });
  });

  // ============================================================================
  // Test Suite: Poseidon Hashing and Permutation
  // ============================================================================

  describe("Poseidon Hashing and Permutation", () => {
    it("Should compute consistent Poseidon hashes", async () => {
      const inputs1 = {
        blockHash: createBlockHash(1234567890123456789),
        userNonce: 42,
      };

      const w1 = await circuit.calculateWitness(inputs1, true);
      const outputs1 = extractOutputs(w1);

      // Same inputs should produce same outputs
      const w2 = await circuit.calculateWitness(inputs1, true);
      const outputs2 = extractOutputs(w2);

      for (let i = 0; i < NUM_OUTPUTS; i++) {
        expect(outputs1[i]).toEqual(outputs2[i]);
      }
    });

    it("Should produce different outputs for different inputs", async () => {
      const inputs1 = {
        blockHash: createBlockHash(1),
        userNonce: 1,
      };

      const w1 = await circuit.calculateWitness(inputs1, true);
      const outputs1 = extractOutputs(w1);

      const inputs2 = {
        blockHash: createBlockHash(2),
        userNonce: 2,
      };

      const w2 = await circuit.calculateWitness(inputs2, true);
      const outputs2 = extractOutputs(w2);

      // At least one output should differ
      const allSame = outputs1.every((o, i) => o === outputs2[i]);
      expect(allSame).toBe(false);
    });

    it("Should verify circuit output matches local computation", async () => {
      const inputs = {
        blockHash: createBlockHash(123),
        userNonce: 456,
      };

      // Calculate circuit output
      const w = await circuit.calculateWitness(inputs, true);
      const circuitOutputs = extractOutputs(w);

      // Calculate locally using orchestrator
      const localResult = await computeLocalRandomNumbers(inputs, NUM_OUTPUTS, MAX_OUTPUT_VAL);

      for (let i = 0; i < NUM_OUTPUTS; i++) {
        expect(circuitOutputs[i].toString()).toEqual(localResult.randomNumbers[i].toString());
      }
    });

    it("Should match the permutation algorithm exactly", async () => {
      const inputs = {
        blockHash: createBlockHash(789),
        userNonce: 321,
      };

      // Calculate circuit output
      const w = await circuit.calculateWitness(inputs, true);
      const circuitOutputs = extractOutputs(w);

      // Compute Poseidon hash locally
      const poseidonInputs = [BigInt(inputs.blockHash), BigInt(inputs.userNonce)];
      const hashResult = poseidon(poseidonInputs);
      const seed = BigInt(F.toString(hashResult));

      // Compute permutation locally
      const permuted = computePermutation(seed, MAX_OUTPUT_VAL);
      const expectedOutputs = permuted.slice(0, NUM_OUTPUTS);

      for (let i = 0; i < NUM_OUTPUTS; i++) {
        expect(circuitOutputs[i].toString()).toEqual(expectedOutputs[i].toString());
      }
    });
  });

  // ============================================================================
  // Test Suite: Input Validation
  // ============================================================================

  describe("Input Validation", () => {
    it("Should handle different input ranges", async () => {
      const testCases = [
        { blockHash: createBlockHash(1), userNonce: 1 },
        { blockHash: createBlockHash(100), userNonce: 100 },
        { blockHash: createBlockHash(1000), userNonce: 1000 },
        { blockHash: createBlockHash(10000), userNonce: 10000 },
      ];

      for (const inputs of testCases) {
        const w = await circuit.calculateWitness(inputs, true);
        await circuit.checkConstraints(w);

        const outputs = extractOutputs(w);
        for (const output of outputs) {
          expect(output).toBeGreaterThanOrEqual(BigInt(1));
          expect(output).toBeLessThanOrEqual(BigInt(MAX_OUTPUT_VAL));
        }
      }
    });
  });

  // ============================================================================
  // Test Suite: Edge Cases
  // ============================================================================

  describe("Edge Cases", () => {
    it("Should handle all zeros", async () => {
      const inputs = {
        blockHash: createBlockHash(0),
        userNonce: 0,
      };

      const w = await circuit.calculateWitness(inputs, true);
      await circuit.checkConstraints(w);

      const outputs = extractOutputs(w);
      for (const output of outputs) {
        expect(output).toBeGreaterThanOrEqual(BigInt(1));
        expect(output).toBeLessThanOrEqual(BigInt(MAX_OUTPUT_VAL));
      }
    });

    it("Should produce minimum value (1) in some output", async () => {
      // Find inputs that produce output = 1 for at least one output
      let found = false;
      for (let i = 0; i < 1000 && !found; i++) {
        const inputs = {
          blockHash: createBlockHash(i),
          userNonce: 0,
        };

        const w = await circuit.calculateWitness(inputs, true);
        const outputs = extractOutputs(w);

        if (outputs.some(o => o === BigInt(1))) {
          found = true;
          await circuit.checkConstraints(w);
        }
      }
      expect(found).toBe(true);
    });

    it("Should produce maximum value (maxOutputVal) in some output", async () => {
      // Find inputs that produce output = maxOutputVal for at least one output
      let found = false;
      for (let i = 0; i < 1000 && !found; i++) {
        const inputs = {
          blockHash: createBlockHash(i),
          userNonce: 1,
        };

        const w = await circuit.calculateWitness(inputs, true);
        const outputs = extractOutputs(w);

        if (outputs.some(o => o === BigInt(MAX_OUTPUT_VAL))) {
          found = true;
          await circuit.checkConstraints(w);
        }
      }
      expect(found).toBe(true);
    });

    it("Should maintain constraint satisfaction under stress", async () => {
      // Test multiple random inputs
      for (let i = 0; i < 20; i++) {
        const inputs = {
          blockHash: createBlockHash(Math.floor(Math.random() * 1000000)),
          userNonce: Math.floor(Math.random() * 100000),
        };

        const w = await circuit.calculateWitness(inputs, true);
        await circuit.checkConstraints(w);

        const outputs = extractOutputs(w);
        for (const output of outputs) {
          expect(output).toBeGreaterThanOrEqual(BigInt(1));
          expect(output).toBeLessThanOrEqual(BigInt(MAX_OUTPUT_VAL));
        }

        // Verify uniqueness (permutation guarantee)
        const uniqueOutputs = new Set(outputs.map(o => o.toString()));
        expect(uniqueOutputs.size).toBe(NUM_OUTPUTS);
      }
    });
  });

  // ============================================================================
  // Test Suite: Circuit Constraints
  // ============================================================================

  describe("Circuit Constraints", () => {
    it("Should verify all constraints are satisfied", async () => {
      const inputs = {
        blockHash: createBlockHash(12345),
        userNonce: 7,
      };

      const w = await circuit.calculateWitness(inputs, true);

      // This will throw if constraints are not satisfied
      expect(() => circuit.checkConstraints(w)).not.toThrow();
    });

    it("Should validate witness structure", async () => {
      const inputs = {
        blockHash: createBlockHash(12345),
        userNonce: 67,
      };

      const w = await circuit.calculateWitness(inputs, true);

      // Witness should be an array
      expect(Array.isArray(w)).toBe(true);

      // First element is always 1 (constant)
      expect(w[0]).toBe(1n);

      // Should have at least NUM_OUTPUTS + 1 elements
      expect(w.length).toBeGreaterThan(NUM_OUTPUTS);

      // All outputs should be defined
      const outputs = extractOutputs(w);
      expect(outputs.length).toBe(NUM_OUTPUTS);
      for (const output of outputs) {
        expect(output).toBeDefined();
      }
    });
  });

  // ============================================================================
  // Test Suite: Determinism and Repeatability
  // ============================================================================

  describe("Determinism and Repeatability", () => {
    it("Should produce identical outputs for identical inputs", async () => {
      const inputs = {
        blockHash: createBlockHash(0xdeadbeef),
        userNonce: 123,
      };

      const w1 = await circuit.calculateWitness(inputs, true);
      const w2 = await circuit.calculateWitness(inputs, true);
      const w3 = await circuit.calculateWitness(inputs, true);

      const outputs1 = extractOutputs(w1);
      const outputs2 = extractOutputs(w2);
      const outputs3 = extractOutputs(w3);

      for (let i = 0; i < NUM_OUTPUTS; i++) {
        expect(outputs1[i]).toEqual(outputs2[i]);
        expect(outputs2[i]).toEqual(outputs3[i]);
      }
    });

    it("Should produce different outputs for different blockHash", async () => {
      const baseInputs = { userNonce: 10 };

      const w1 = await circuit.calculateWitness(
        { ...baseInputs, blockHash: createBlockHash(1) },
        true
      );
      const w2 = await circuit.calculateWitness(
        { ...baseInputs, blockHash: createBlockHash(2) },
        true
      );

      const outputs1 = extractOutputs(w1);
      const outputs2 = extractOutputs(w2);

      // At least one output should differ
      const allSame = outputs1.every((o, i) => o === outputs2[i]);
      expect(allSame).toBe(false);
    });

    it("Should produce different outputs for different userNonce", async () => {
      const baseInputs = { blockHash: createBlockHash(100) };

      const w1 = await circuit.calculateWitness(
        { ...baseInputs, userNonce: 1 },
        true
      );
      const w2 = await circuit.calculateWitness(
        { ...baseInputs, userNonce: 2 },
        true
      );

      const outputs1 = extractOutputs(w1);
      const outputs2 = extractOutputs(w2);

      const allSame = outputs1.every((o, i) => o === outputs2[i]);
      expect(allSame).toBe(false);
    });
  });

  // ============================================================================
  // Test Suite: Permutation Properties
  // ============================================================================

  describe("Permutation Properties", () => {
    it("Should always produce unique outputs (permutation guarantee)", async () => {
      // Test many random inputs - all should produce unique outputs
      for (let i = 0; i < 50; i++) {
        const inputs = {
          blockHash: createBlockHash(Math.floor(Math.random() * 10000000)),
          userNonce: Math.floor(Math.random() * 1000000),
        };

        const w = await circuit.calculateWitness(inputs, true);
        const outputs = extractOutputs(w);

        // All outputs must be unique
        const uniqueOutputs = new Set(outputs.map(o => o.toString()));
        expect(uniqueOutputs.size).toBe(NUM_OUTPUTS);
      }
    });

    it("Should produce outputs that are valid natural numbers [1, maxOutputVal]", async () => {
      const testCases = [
        { blockHash: createBlockHash(1), userNonce: 1 },
        { blockHash: createBlockHash(999), userNonce: 999 },
        { blockHash: createBlockHash(123456), userNonce: 654321 },
      ];

      for (const inputs of testCases) {
        const w = await circuit.calculateWitness(inputs, true);
        const outputs = extractOutputs(w);

        for (const output of outputs) {
          // Must be >= 1 (natural number)
          expect(output).toBeGreaterThanOrEqual(BigInt(1));
          // Must be <= maxOutputVal
          expect(output).toBeLessThanOrEqual(BigInt(MAX_OUTPUT_VAL));
        }
      }
    });

    it("Should distribute outputs fairly across the range", async () => {
      // Generate many outputs and check they cover the full range
      const allOutputs = new Set();

      for (let i = 0; i < 500; i++) {
        const inputs = {
          blockHash: createBlockHash(i * 12345),
          userNonce: i,
        };

        const w = await circuit.calculateWitness(inputs, true);
        const outputs = extractOutputs(w);

        for (const output of outputs) {
          allOutputs.add(Number(output));
        }
      }

      // Should see outputs across a good portion of the range [1, 50]
      // With 500 * 3 = 1500 outputs, we should see most values
      expect(allOutputs.size).toBeGreaterThan(MAX_OUTPUT_VAL * 0.8);
    });
  });
});
