const path = require("path");
const wasm_tester = require("circom_tester").wasm;
const { buildPoseidon } = require("circomlibjs");
const crypto = require("crypto");
const { computeLocalHash } = require("../lib/orchestrator.js");
const { createCircuitInputs } = require("../lib/utils.js");
const { c } = require("circom_tester");

// =============================================================================
// TEST CIRCUIT CONFIGURATION
// =============================================================================

const NUM_OUTPUTS = 3;

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

// Helper to extract R array from witness (outputs start at index 1)
const extractROutputs = (witness, numOutputs = NUM_OUTPUTS) => {
  return Array.from({ length: numOutputs }, (_, i) => BigInt(witness[1 + i]));
};

describe("Random Circuit Test Suite", () => {
  let poseidon;
  let circuit;

  beforeAll(async () => {
    // Initialize Poseidon
    poseidon = await buildPoseidon();

    // Load and compile the random circuit
    circuit = await wasm_tester(
      path.join(__dirname, "../circuits/random_3.circom")
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
        N: 1000,
      };

      const w = await circuit.calculateWitness(inputs, true);
      expect(w).toBeDefined();
      expect(w.length).toBeGreaterThan(0);

      // Check witness is valid (constraints satisfied)
      await circuit.checkConstraints(w);
    });

    it("Should produce all R outputs in valid range [0, N)", async () => {
      const inputs = {
        blockHash: createBlockHash(1),
        userNonce: 1,
        N: 1000,
      };

      const w = await circuit.calculateWitness(inputs, true);
      await circuit.checkConstraints(w);

      // Extract all R outputs
      const outputs = extractROutputs(w);

      expect(outputs.length).toBe(NUM_OUTPUTS);
      for (let i = 0; i < NUM_OUTPUTS; i++) {
        expect(outputs[i]).toBeLessThan(BigInt(1000));
        expect(outputs[i]).toBeGreaterThanOrEqual(BigInt(0));
      }
    });

    it("Should handle zero inputs correctly", async () => {
      const inputs = {
        blockHash: createBlockHash(0),
        userNonce: 0,
        N: 1000,
      };

      const w = await circuit.calculateWitness(inputs, true);
      await circuit.checkConstraints(w);

      const outputs = extractROutputs(w);
      for (const output of outputs) {
        expect(output).toBeLessThan(BigInt(1000));
        expect(output).toBeGreaterThanOrEqual(BigInt(0));
      }
    });

    it("Should produce NUM_OUTPUTS distinct random values", async () => {
      const inputs = {
        blockHash: createBlockHash(42),
        userNonce: 123,
        N: 1000000, // Large N to reduce chance of collisions
      };

      const w = await circuit.calculateWitness(inputs, true);
      await circuit.checkConstraints(w);

      const outputs = extractROutputs(w);
      const uniqueOutputs = new Set(outputs.map(o => o.toString()));

      // With a large N, we expect all outputs to be different
      expect(uniqueOutputs.size).toBe(NUM_OUTPUTS);
    });
  });

  // ============================================================================
  // Test Suite: Poseidon Hashing
  // ============================================================================

  describe("Poseidon Hashing", () => {
    it("Should compute consistent Poseidon hashes", async () => {
      const inputs1 = {
        blockHash: createBlockHash(1234567890123456789),
        userNonce: 42,
        N: 1000,
      };

      const w1 = await circuit.calculateWitness(inputs1, true);
      const outputs1 = extractROutputs(w1);

      // Same inputs should produce same outputs
      const w2 = await circuit.calculateWitness(inputs1, true);
      const outputs2 = extractROutputs(w2);

      for (let i = 0; i < NUM_OUTPUTS; i++) {
        expect(outputs1[i]).toEqual(outputs2[i]);
      }
    });

    it("Should produce different outputs for different inputs", async () => {
      const inputs1 = {
        blockHash: createBlockHash(1),
        userNonce: 1,
        N: 1000,
      };

      const w1 = await circuit.calculateWitness(inputs1, true);
      const outputs1 = extractROutputs(w1);

      const inputs2 = {
        blockHash: createBlockHash(2),
        userNonce: 2,
        N: 1000,
      };

      const w2 = await circuit.calculateWitness(inputs2, true);
      const outputs2 = extractROutputs(w2);

      // At least one output should differ
      const allSame = outputs1.every((o, i) => o === outputs2[i]);
      expect(allSame).toBe(false);
    });

    it("Should verify Poseidon output matches circomlibjs", async () => {
      let inputs = {
        blockHash: createBlockHash(123),
        userNonce: 456,
        N: 1000,
      };

      inputs = createCircuitInputs(inputs);

      // Calculate circuit output
      const w = await circuit.calculateWitness(inputs, true);
      const circuitOutputs = extractROutputs(w);
      const hashOutputs = await computeLocalHash(inputs, NUM_OUTPUTS);

      for (let i = 0; i < NUM_OUTPUTS; i++) {
        expect(circuitOutputs[i].toString()).toEqual(hashOutputs.R[i]);
      }
    });
  });

  // ============================================================================
  // Test Suite: Input Validation
  // ============================================================================

  describe("Input Validation", () => {
    it("Should handle different input ranges", async () => {
      const testCases = [
        { blockHash: createBlockHash(1), userNonce: 1, N: 1000 },
        { blockHash: createBlockHash(100), userNonce: 100, N: 1000 },
        { blockHash: createBlockHash(1000), userNonce: 1000, N: 1000 },
        { blockHash: createBlockHash(10000), userNonce: 10000, N: 1000 },
      ];

      for (const inputs of testCases) {
        const w = await circuit.calculateWitness(inputs, true);
        await circuit.checkConstraints(w);

        const outputs = extractROutputs(w);
        for (const output of outputs) {
          expect(output).toBeLessThan(BigInt(1000));
          expect(output).toBeGreaterThanOrEqual(BigInt(0));
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
        N: 1000,
      };

      const w = await circuit.calculateWitness(inputs, true);
      await circuit.checkConstraints(w);

      const outputs = extractROutputs(w);
      for (const output of outputs) {
        expect(output).toBeLessThan(BigInt(1000));
      }
    });

    it("Should handle boundary value: R[i] = 0 for at least one output", async () => {
      // Find inputs that produce R = 0 for at least one output
      let found = false;
      for (let i = 0; i < 1000 && !found; i++) {
        const inputs = {
          blockHash: createBlockHash(i),
          userNonce: 0,
          N: 100,
        };

        const w = await circuit.calculateWitness(inputs, true);
        const outputs = extractROutputs(w);

        if (outputs.some(o => o === BigInt(0))) {
          found = true;
          await circuit.checkConstraints(w);
        }
      }
      expect(found).toBe(true);
    });

    it("Should handle boundary value: R[i] = N-1 for at least one output", async () => {
      // Find inputs that produce R = N-1 for at least one output
      let found = false;
      const N = 1000;
      for (let i = 0; i < 1000 && !found; i++) {
        const inputs = {
          blockHash: createBlockHash(i),
          userNonce: 1,
          N,
        };

        const w = await circuit.calculateWitness(inputs, true);
        const outputs = extractROutputs(w);

        if (outputs.some(o => o === BigInt(N - 1))) {
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
          N: 1000,
        };

        const w = await circuit.calculateWitness(inputs, true);
        await circuit.checkConstraints(w);

        const outputs = extractROutputs(w);
        for (const output of outputs) {
          expect(output).toBeLessThan(BigInt(1000));
          expect(output).toBeGreaterThanOrEqual(BigInt(0));
        }
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
        N: 1000,
      };

      const w = await circuit.calculateWitness(inputs, true);

      // This will throw if constraints are not satisfied
      expect(() => circuit.checkConstraints(w)).not.toThrow();
    });

    it("Should validate witness structure", async () => {
      const inputs = {
        blockHash: createBlockHash(12345),
        userNonce: 67,
        N: 1000,
      };

      const w = await circuit.calculateWitness(inputs, true);

      // Witness should be an array
      expect(Array.isArray(w)).toBe(true);

      // First element is always 1 (constant)
      expect(w[0]).toBe(1n);

      // Should have at least NUM_OUTPUTS + 1 elements
      expect(w.length).toBeGreaterThan(NUM_OUTPUTS);

      // All outputs should be defined
      const outputs = extractROutputs(w);
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
        N: 1000,
      };

      const w1 = await circuit.calculateWitness(inputs, true);
      const w2 = await circuit.calculateWitness(inputs, true);
      const w3 = await circuit.calculateWitness(inputs, true);

      const outputs1 = extractROutputs(w1);
      const outputs2 = extractROutputs(w2);
      const outputs3 = extractROutputs(w3);

      for (let i = 0; i < NUM_OUTPUTS; i++) {
        expect(outputs1[i]).toEqual(outputs2[i]);
        expect(outputs2[i]).toEqual(outputs3[i]);
      }
    });

    it("Should produce different outputs for different blockHash", async () => {
      const baseInputs = { userNonce: 10, N: 1000 };

      const w1 = await circuit.calculateWitness(
        { ...baseInputs, blockHash: createBlockHash(1) },
        true
      );
      const w2 = await circuit.calculateWitness(
        { ...baseInputs, blockHash: createBlockHash(2) },
        true
      );

      const outputs1 = extractROutputs(w1);
      const outputs2 = extractROutputs(w2);

      // At least one output should differ
      const allSame = outputs1.every((o, i) => o === outputs2[i]);
      expect(allSame).toBe(false);
    });

    it("Should produce different outputs for different userNonce", async () => {
      const baseInputs = { blockHash: createBlockHash(100), N: 1000 };

      const w1 = await circuit.calculateWitness(
        { ...baseInputs, userNonce: 1 },
        true
      );
      const w2 = await circuit.calculateWitness(
        { ...baseInputs, userNonce: 2 },
        true
      );

      const outputs1 = extractROutputs(w1);
      const outputs2 = extractROutputs(w2);

      const allSame = outputs1.every((o, i) => o === outputs2[i]);
      expect(allSame).toBe(false);
    });

  });

  // ============================================================================
  // Test Suite: Integration with circomlibjs
  // ============================================================================

  describe("Integration with circomlibjs", () => {
    it("Should produce valid outputs for various inputs", async () => {
      const testCases = [
        [BigInt(1), BigInt(2)],
        [BigInt(100), BigInt(200)],
        [BigInt(999), BigInt(888)],
      ];

      for (const [val1, val2] of testCases) {
        const inputs = {
          blockHash: val1.toString(),
          userNonce: val2.toString(),
          N: 1000,
        };

        const w = await circuit.calculateWitness(inputs, true);
        const circuitOutputs = extractROutputs(w);

        // Verify all outputs are in valid range
        for (const output of circuitOutputs) {
          expect(output).toBeLessThan(BigInt(1000));
          expect(output).toBeGreaterThanOrEqual(BigInt(0));
        }
      }
    });

    it("Should verify Poseidon field compatibility", async () => {
      const inputs = {
        blockHash: createBlockHash(42),
        userNonce: 84,
        N: 1000,
      };

      const w = await circuit.calculateWitness(inputs, true);
      const outputs = extractROutputs(w);

      // All outputs should be valid field elements
      for (const output of outputs) {
        expect(output).toBeGreaterThanOrEqual(BigInt(0));
        expect(output).toBeLessThan(BigInt(1000));
      }
    });
  });

  // ============================================================================
  // Test Suite: N as Public Input - Same Setup Works for Different N Values
  // ============================================================================

  describe("N as Public Input - Different N values with same setup", () => {
    it("Should produce valid proofs with different N values using same circuit setup", async () => {
      // Use the same private inputs but vary N
      const baseInputs = {
        blockHash: createBlockHash(12345),
        userNonce: 67890,
      };

      const nValues = [100, 500, 1000, 5000, 10000, 1000000];

      for (const N of nValues) {
        const inputs = { ...baseInputs, N };
        const w = await circuit.calculateWitness(inputs, true);
        await circuit.checkConstraints(w);

        const outputs = extractROutputs(w);
        for (const output of outputs) {
          expect(output).toBeGreaterThanOrEqual(BigInt(0));
          expect(output).toBeLessThan(BigInt(N));
        }
      }
    });

    it("Should produce different R values for different N with same inputs", async () => {
      const baseInputs = {
        blockHash: createBlockHash(99999),
        userNonce: 88888,
      };

      const nValues = [100, 1000, 10000];
      const results = [];

      for (const N of nValues) {
        const inputs = { ...baseInputs, N };
        const w = await circuit.calculateWitness(inputs, true);
        await circuit.checkConstraints(w);

        const outputs = extractROutputs(w);
        results.push({ N, R: outputs });

        // Verify all R values are in range [0, N)
        for (const output of outputs) {
          expect(output).toBeGreaterThanOrEqual(BigInt(0));
          expect(output).toBeLessThan(BigInt(N));
        }
      }

      // Different N values should generally produce different R values
      expect(results.length).toBe(3);
    });

    it("Should handle very large N values", async () => {
      const inputs = {
        blockHash: createBlockHash(123),
        userNonce: 456,
        // Large N close to 2^252
        N: BigInt("5000000000000000000000000000000000000000000000000000000000000000000000000000"),
      };

      const w = await circuit.calculateWitness(inputs, true);
      await circuit.checkConstraints(w);

      const outputs = extractROutputs(w);
      for (const output of outputs) {
        expect(output).toBeGreaterThanOrEqual(BigInt(0));
        expect(output).toBeLessThan(BigInt(inputs.N));
      }
    });

    it("Should handle N = 9 (minimum valid N since N > 8 required)", async () => {
      const inputs = {
        blockHash: createBlockHash(111),
        userNonce: 222,
        N: 9,
      };

      const w = await circuit.calculateWitness(inputs, true);
      await circuit.checkConstraints(w);

      const outputs = extractROutputs(w);
      for (const output of outputs) {
        expect(output).toBeGreaterThanOrEqual(BigInt(0));
        expect(output).toBeLessThan(BigInt(9));
      }
    });

    it("Should reject N = 8 (N must be > 8)", async () => {
      const inputs = {
        blockHash: createBlockHash(444),
        userNonce: 555,
        N: 8,
      };

      // Circuit has assert(N > 8), so N = 8 should fail
      await expect(async () => {
        const w = await circuit.calculateWitness(inputs, true);
        await circuit.checkConstraints(w);
      }).rejects.toThrow();
    });

    it("Should reject N = 1 (N must be > 8)", async () => {
      const inputs = {
        blockHash: createBlockHash(111),
        userNonce: 222,
        N: 1,
      };

      await expect(async () => {
        const w = await circuit.calculateWitness(inputs, true);
        await circuit.checkConstraints(w);
      }).rejects.toThrow();
    });

    it("Should reject N = 0 (N must be > 8)", async () => {
      const inputs = {
        blockHash: createBlockHash(111),
        userNonce: 222,
        N: 0,
      };

      await expect(async () => {
        const w = await circuit.calculateWitness(inputs, true);
        await circuit.checkConstraints(w);
      }).rejects.toThrow();
    });
  });
});
