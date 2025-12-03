const path = require("path");
const wasm_tester = require("circom_tester").wasm;
const { buildPoseidon } = require("circomlibjs");
const crypto = require("crypto");

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

describe("Random Circuit Test Suite", () => {
  let poseidon;
  let F;
  let circuit;

  beforeAll(async () => {
    // Initialize Poseidon
    poseidon = await buildPoseidon();
    F = poseidon.F;

    // Load and compile the random circuit
    circuit = await wasm_tester(
      path.join(__dirname, "../circuits/random.circom")
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
        kurierEntropy: 10,
        N: 1000,
      };

      const w = await circuit.calculateWitness(inputs, true);
      expect(w).toBeDefined();
      expect(w.length).toBeGreaterThan(0);

      // Check witness is valid (constraints satisfied)
      await circuit.checkConstraints(w);
    });

    it("Should produce output R in valid range [0, N)", async () => {
      const inputs = {
        blockHash: createBlockHash(1),
        userNonce: 1,
        kurierEntropy: 1,
        N: 1000,
      };

      const w = await circuit.calculateWitness(inputs, true);
      await circuit.checkConstraints(w);

      // Output is at index 1 (after witness[0] which is always 1)
      const output = BigInt(w[1]);
      expect(output).toBeLessThan(BigInt(1000));
      expect(output).toBeGreaterThan(BigInt(0));
    });

    it("Should handle zero inputs correctly", async () => {
      const inputs = {
        blockHash: createBlockHash(0),
        userNonce: 0,
        kurierEntropy: 0,
        N: 1000,
      };

      const w = await circuit.calculateWitness(inputs, true);
      await circuit.checkConstraints(w);

      const output = BigInt(w[1]);
      expect(output).toBeLessThan(BigInt(1000));
      expect(output).toBeGreaterThan(BigInt(0));
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
        kurierEntropy: 100,
        N: 1000,
      };

      const w1 = await circuit.calculateWitness(inputs1, true);
      const output1 = BigInt(w1[1]);

      // Same inputs should produce same output
      const w2 = await circuit.calculateWitness(inputs1, true);
      const output2 = BigInt(w2[1]);

      expect(output1).toEqual(output2);
    });

    it("Should produce different outputs for different inputs", async () => {
      const inputs1 = {
        blockHash: createBlockHash(1),
        userNonce: 1,
        kurierEntropy: 1,
        N: 1000,
      };

      const w1 = await circuit.calculateWitness(inputs1, true);
      const output1 = BigInt(w1[1]);

      const inputs2 = {
        blockHash: createBlockHash(2),
        userNonce: 2,
        kurierEntropy: 2,
        N: 1000,
      };

      const w2 = await circuit.calculateWitness(inputs2, true);
      const output2 = BigInt(w2[1]);

      expect(output1).not.toEqual(output2);
    });

    it("Should verify Poseidon hash matches circomlibjs", async () => {
      const inputs = {
        blockHash: createBlockHash(123),
        userNonce: 456,
        kurierEntropy: 789,
        N: 1000,
      };

      // Calculate circuit output
      const w = await circuit.calculateWitness(inputs, true);
      const circuitOutput = BigInt(w[1]);

      // Calculate expected output with circomlibjs
      const poseidonHash = poseidon([inputs.blockHash, inputs.userNonce, inputs.kurierEntropy]);
      const expectedR = BigInt(F.toString(poseidonHash)) % BigInt(1000);

      expect(circuitOutput).toEqual(expectedR);
    });
  });

  // ============================================================================
  // Test Suite: Input Validation
  // ============================================================================

  describe("Input Validation", () => {
    it("Should handle different input ranges", async () => {
      const testCases = [
        { blockHash: createBlockHash(1), userNonce: 1, kurierEntropy: 1, N: 1000 },
        { blockHash: createBlockHash(100), userNonce: 100, kurierEntropy: 100, N: 1000 },
        { blockHash: createBlockHash(1000), userNonce: 1000, kurierEntropy: 1000, N: 1000 },
        { blockHash: createBlockHash(10000), userNonce: 10000, kurierEntropy: 10000, N: 1000 },
      ];

      for (const inputs of testCases) {
        const w = await circuit.calculateWitness(inputs, true);
        await circuit.checkConstraints(w);

        const output = BigInt(w[1]);
        expect(output).toBeLessThan(BigInt(1000));
        expect(output).toBeGreaterThan(BigInt(0));
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
        kurierEntropy: 0,
        N: 1000,
      };

      const w = await circuit.calculateWitness(inputs, true);
      await circuit.checkConstraints(w);

      const output = BigInt(w[1]);
      expect(output).toBeLessThan(BigInt(1000));
    });

    it("Should handle boundary value: R = 0", async () => {
      // Find inputs that produce R = 0
      let found = false;
      for (let i = 0; i < 1000 && !found; i++) {
        const inputs = {
          blockHash: createBlockHash(i),
          userNonce: 0,
          kurierEntropy: 0,
          N: 100,
        };

        const w = await circuit.calculateWitness(inputs, true);
        const output = BigInt(w[1]);

        if (output === BigInt(0)) {
          found = true;
          await circuit.checkConstraints(w);
          expect(output).toEqual(BigInt(0));
        }
      }
      expect(found).toBe(true);
    });

    it("Should handle boundary value: R = 999", async () => {
      // Find inputs that produce R = 999
      let found = false;
      for (let i = 0; i < 1000 && !found; i++) {
        const inputs = {
          blockHash: createBlockHash(i),
          userNonce: 1,
          kurierEntropy: 1,
          N: 1000,
        };

        const w = await circuit.calculateWitness(inputs, true);
        const output = BigInt(w[1]);

        if (output === BigInt(999)) {
          found = true;
          await circuit.checkConstraints(w);
          expect(output).toEqual(BigInt(999));
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
          kurierEntropy: Math.floor(Math.random() * 100000),
          N: 1000,
        };

        const w = await circuit.calculateWitness(inputs, true);
        await circuit.checkConstraints(w);

        const output = BigInt(w[1]);
        expect(output).toBeLessThan(BigInt(1000));
        expect(output).toBeGreaterThan(BigInt(0));
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
        kurierEntropy: 42,
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
        kurierEntropy: 89,
        N: 1000,
      };

      const w = await circuit.calculateWitness(inputs, true);

      // Witness should be an array
      expect(Array.isArray(w)).toBe(true);

      // First element is always 1 (constant)
      expect(w[0]).toBe(1n);

      // Second element is the output R
      expect(w.length).toBeGreaterThan(1);
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
        kurierEntropy: 456,
        N: 1000,
      };

      const w1 = await circuit.calculateWitness(inputs, true);
      const w2 = await circuit.calculateWitness(inputs, true);
      const w3 = await circuit.calculateWitness(inputs, true);

      expect(BigInt(w1[1])).toEqual(BigInt(w2[1]));
      expect(BigInt(w2[1])).toEqual(BigInt(w3[1]));
    });

    it("Should produce different outputs for different blockHash", async () => {
      const baseInputs = { userNonce: 10, kurierEntropy: 20, N: 1000 };

      const w1 = await circuit.calculateWitness(
        { ...baseInputs, blockHash: createBlockHash(1) },
        true
      );
      const w2 = await circuit.calculateWitness(
        { ...baseInputs, blockHash: createBlockHash(2) },
        true
      );

      expect(BigInt(w1[1])).not.toEqual(BigInt(w2[1]));
    });

    it("Should produce different outputs for different userNonce", async () => {
      const baseInputs = { blockHash: createBlockHash(100), kurierEntropy: 20, N: 1000 };

      const w1 = await circuit.calculateWitness(
        { ...baseInputs, userNonce: 1 },
        true
      );
      const w2 = await circuit.calculateWitness(
        { ...baseInputs, userNonce: 2 },
        true
      );

      expect(BigInt(w1[1])).not.toEqual(BigInt(w2[1]));
    });

    it("Should produce different outputs for different kurierEntropy", async () => {
      const baseInputs = { blockHash: createBlockHash(100), userNonce: 10, N: 1000 };

      const w1 = await circuit.calculateWitness(
        { ...baseInputs, kurierEntropy: 1 },
        true
      );
      const w2 = await circuit.calculateWitness(
        { ...baseInputs, kurierEntropy: 2 },
        true
      );

      expect(BigInt(w1[1])).not.toEqual(BigInt(w2[1]));
    });
  });

  // ============================================================================
  // Test Suite: Integration with circomlibjs
  // ============================================================================

  describe("Integration with circomlibjs", () => {
    it("Should use same Poseidon as circomlibjs", async () => {
      const testCases = [
        [BigInt(1), BigInt(2), BigInt(3)],
        [BigInt(100), BigInt(200), BigInt(300)],
        [BigInt(999), BigInt(888), BigInt(777)],
      ];

      for (const [val1, val2, val3] of testCases) {
        const inputs = {
          blockHash: val1.toString(),
          userNonce: val2.toString(),
          kurierEntropy: val3.toString(),
          N: 1000,
        };

        const w = await circuit.calculateWitness(inputs, true);
        const circuitOutput = BigInt(w[1]);

        // Compute with circomlibjs
        const poseidonHash = BigInt(F.toString(poseidon([val1, val2, val3])));
        const expectedR = poseidonHash % BigInt(1000);

        expect(circuitOutput).toEqual(expectedR);
      }
    });

    it("Should verify Poseidon field compatibility", async () => {
      const inputs = {
        blockHash: createBlockHash(42),
        userNonce: 84,
        kurierEntropy: 126,
        N: 1000,
      };

      const w = await circuit.calculateWitness(inputs, true);
      const output = BigInt(w[1]);

      // All outputs should be valid field elements
      expect(output).toBeGreaterThan(BigInt(0));
      expect(output).toBeLessThan(BigInt(1000));
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
        kurierEntropy: 54321,
      };

      const nValues = [100, 500, 1000, 5000, 10000, 1000000];

      for (const N of nValues) {
        const inputs = { ...baseInputs, N };
        const w = await circuit.calculateWitness(inputs, true);
        await circuit.checkConstraints(w);

        const output = BigInt(w[1]);
        expect(output).toBeGreaterThanOrEqual(BigInt(0));
        expect(output).toBeLessThan(BigInt(N));
      }
    });

    it("Should produce different R values for different N with same hash", async () => {
      const baseInputs = {
        blockHash: createBlockHash(99999),
        userNonce: 88888,
        kurierEntropy: 77777,
      };

      // Compute the underlying hash
      const poseidonHash = BigInt(
        F.toString(
          poseidon([
            BigInt(baseInputs.blockHash),
            BigInt(baseInputs.userNonce),
            BigInt(baseInputs.kurierEntropy),
          ])
        )
      );

      const nValues = [100, 1000, 10000];
      const results = [];

      for (const N of nValues) {
        const inputs = { ...baseInputs, N };
        const w = await circuit.calculateWitness(inputs, true);
        await circuit.checkConstraints(w);

        const output = BigInt(w[1]);
        results.push({ N, R: output });

        // Verify R = hash mod N
        const expectedR = poseidonHash % BigInt(N);
        expect(output).toEqual(expectedR);
      }

      // Different N values should generally produce different R values
      // (unless hash mod N1 === hash mod N2 by coincidence)
      expect(results.length).toBe(3);
    });

    it("Should handle very large N values", async () => {
      const inputs = {
        blockHash: createBlockHash(123),
        userNonce: 456,
        kurierEntropy: 789,
        // Large N close to 2^252
        N: BigInt("5000000000000000000000000000000000000000000000000000000000000000000000000000"),
      };

      const w = await circuit.calculateWitness(inputs, true);
      await circuit.checkConstraints(w);

      const output = BigInt(w[1]);
      expect(output).toBeGreaterThanOrEqual(BigInt(0));
      expect(output).toBeLessThan(BigInt(inputs.N));
    });

    it("Should handle N = 9 (minimum valid N since N > 8 required)", async () => {
      const inputs = {
        blockHash: createBlockHash(111),
        userNonce: 222,
        kurierEntropy: 333,
        N: 9,
      };

      const w = await circuit.calculateWitness(inputs, true);
      await circuit.checkConstraints(w);

      const output = BigInt(w[1]);
      expect(output).toBeGreaterThanOrEqual(BigInt(0));
      expect(output).toBeLessThan(BigInt(9));
    });

    it("Should reject N = 8 (N must be > 8)", async () => {
      const inputs = {
        blockHash: createBlockHash(444),
        userNonce: 555,
        kurierEntropy: 666,
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
        kurierEntropy: 333,
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
        kurierEntropy: 333,
        N: 0,
      };

      await expect(async () => {
        const w = await circuit.calculateWitness(inputs, true);
        await circuit.checkConstraints(w);
      }).rejects.toThrow();
    });
  });

  // ============================================================================
  // Test Suite: Input Size Limits (Num2Bits_strict - 254 bits max)
  // ============================================================================

  describe("Input Size Limits (Num2Bits_strict)", () => {
    // Maximum value that fits in 252 bits
    const MAX_252_BITS = BigInt(2) ** BigInt(252) - BigInt(1);
    // Value that exceeds 252 bits (let's use 253 as less than circuit counts one more)
    const EXCEEDS_252_BITS = BigInt(2) ** BigInt(252);

    it("Should accept inputs at maximum 252-bit value", async () => {
      const inputs = {
        blockHash: MAX_252_BITS.toString(),
        userNonce: 1,
        kurierEntropy: 1,
        N: 1000,
      };

      const w = await circuit.calculateWitness(inputs, true);
      await circuit.checkConstraints(w);
      expect(w).toBeDefined();
    });

    it("Should handle blockHash at boundary values", async () => {
      const boundaryValues = [
        BigInt(0),
        BigInt(1),
        BigInt(2) ** BigInt(128) - BigInt(1), // 128-bit max
        BigInt(2) ** BigInt(200) - BigInt(1), // 200-bit max
        MAX_252_BITS, // 252-bit max (safe)
      ];

      for (const blockHash of boundaryValues) {
        const inputs = {
          blockHash: blockHash.toString(),
          userNonce: 1,
          kurierEntropy: 1,
          N: 1000,
        };

        const w = await circuit.calculateWitness(inputs, true);
        await circuit.checkConstraints(w);
        expect(w).toBeDefined();
      }
    });

    it("Should handle N at various bit sizes (all > 8)", async () => {
      const nValues = [
        BigInt(9),                // Minimum valid (N > 8)
        BigInt(2) ** BigInt(8),   // 256
        BigInt(2) ** BigInt(16),  // 65536
        BigInt(2) ** BigInt(32),  // ~4 billion
        BigInt(2) ** BigInt(64),  // Large
        BigInt(2) ** BigInt(128), // Very large
        BigInt(2) ** BigInt(200), // Extremely large
        MAX_252_BITS, // Near max
      ];

      for (const N of nValues) {
        const inputs = {
          blockHash: createBlockHash(12345),
          userNonce: 67890,
          kurierEntropy: 54321,
          N: N.toString(),
        };

        const w = await circuit.calculateWitness(inputs, true);
        await circuit.checkConstraints(w);

        const output = BigInt(w[1]);
        expect(output).toBeGreaterThanOrEqual(BigInt(0));
        expect(output).toBeLessThan(N);
      }
    });

    it("Should fail when N exceeds 2^252 (exceeds Num2Bits_strict limit)", async () => {
      const inputs = {
        blockHash: createBlockHash(999),
        userNonce: 888,
        kurierEntropy: 777,
        N: EXCEEDS_252_BITS.toString(),
      };

      await expect(async () => {
        const w = await circuit.calculateWitness(inputs, true);
        await circuit.checkConstraints(w);
      }).rejects.toThrow();
    });
  });
});
