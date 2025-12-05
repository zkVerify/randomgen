const fs = require("fs");
const path = require("path");
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
} = require("../lib/utils.js");
const { completeSetup } = require("../lib/setupArtifacts.js");
const { computeLocalRandomNumbers } = require("../lib/orchestrator.js");

const rootDir = path.resolve(__dirname, "..");
const buildDir = path.join(rootDir, "build");

// =============================================================================
// TEST CIRCUIT CONFIGURATION
// =============================================================================
// Tests use random_5_35.circom which is configured with:
//   - numOutputs = 5
//   - maxOutputVal = 35
//   - power = 13
// =============================================================================
const TEST_CIRCUIT_NAME = "random_5_35";
const TEST_POWER = 13;
const NUM_OUTPUTS = 5;
const MAX_OUTPUT_VAL = 35;
const TEST_PTAU_ENTROPY = "0x1234";
const TEST_SETUP_ENTROPY = "0xabcd";

/**
 * Cleans up test artifacts: build directory and generated ptau files
 */
function cleanupTestArtifacts() {
    // Clean up build directory
    if (fs.existsSync(buildDir)) {
        fs.rmSync(buildDir, { recursive: true });
    }
    // Clean up generated ptau files
    const ptauPattern = new RegExp(`^pot${TEST_POWER}.*\\.ptau$`);
    const files = fs.readdirSync(rootDir);
    for (const file of files) {
        if (ptauPattern.test(file)) {
            const filePath = path.join(rootDir, file);
            fs.unlinkSync(filePath);
        }
    }
}

// Helper to extract randomNumbers from publicSignals
// publicSignals format: [randomNumbers[0], randomNumbers[1], ..., randomNumbers[numOutputs-1]]
const extractOutputs = (publicSignals, numOutputs = NUM_OUTPUTS) => {
    return publicSignals.slice(0, numOutputs).map(r => BigInt(r));
};

describe("Utils Module - Complete Function Coverage", () => {
    let circuitInputs;
    let vkey;

    beforeAll(async () => {
        // Perform setup ONCE for all tests in this suite
        await completeSetup(TEST_CIRCUIT_NAME, {
            circuitPath: path.join(rootDir, "circuits", `${TEST_CIRCUIT_NAME}.circom`),
            power: TEST_POWER,
            ptauName: `pot${TEST_POWER}_final.ptau`,
            ptauEntropy: TEST_PTAU_ENTROPY,
            setupEntropy: TEST_SETUP_ENTROPY,
        });
        circuitInputs = createCircuitInputs({
            blockHash: 12345,
            userNonce: 67890,
        });
        vkey = loadVerificationKey("verification_key.json");
    }, 300000);

    afterAll(() => {
        cleanupTestArtifacts();
    });

    // ===== POSEIDON HASH TESTS =====
    describe("computePoseidonHash()", () => {
        it("should throw if blockHash is not provided", async () => {
            await expect(computePoseidonHash(undefined, 2)).rejects.toThrow("blockHash is required");
        });

        it("should throw if userNonce is not provided", async () => {
            await expect(computePoseidonHash(1, undefined)).rejects.toThrow("userNonce is required");
        });

        it("should return a BigInt", async () => {
            const hash = await computePoseidonHash(1, 2);
            expect(typeof hash).toBe("bigint");
        });

        it("should compute consistent Poseidon hash for same inputs", async () => {
            const hash1 = await computePoseidonHash(1, 2);
            const hash2 = await computePoseidonHash(1, 2);
            expect(hash1).toEqual(hash2);
        });

        it("should produce different hashes for different inputs", async () => {
            const hash1 = await computePoseidonHash(1, 2);
            const hash2 = await computePoseidonHash(1, 3);
            expect(hash1).not.toEqual(hash2);
        });

        it("should accept string and number inputs", async () => {
            const hash1 = await computePoseidonHash("100", "200");
            const hash2 = await computePoseidonHash(BigInt(100), BigInt(200));
            expect(hash1).toEqual(hash2);
        });

        it("should handle zero inputs", async () => {
            const hash = await computePoseidonHash(0, 0);
            expect(hash).toBeDefined();
            expect(typeof hash).toBe("bigint");
        });

        it("should handle large numbers", async () => {
            const largeNum = BigInt("12345678901234567890123456789012345678901234567890");
            const hash = await computePoseidonHash(largeNum, 1);
            expect(hash).toBeDefined();
            expect(typeof hash).toBe("bigint");
            expect(hash).toBeGreaterThan(0n);
        });

        it("should be deterministic across multiple calls", async () => {
            const results = [];
            for (let i = 0; i < 5; i++) {
                results.push(await computePoseidonHash(100, 200));
            }
            const firstHash = results[0];
            results.forEach(r => expect(r).toEqual(firstHash));
        });
    });

    // ===== PERMUTATION TESTS =====
    describe("computePermutation()", () => {
        it("should throw if n > 50", () => {
            expect(() => computePermutation(12345n, 51)).toThrow("n must be <= 50");
        });

        it("should return array of length n", () => {
            const permuted = computePermutation(12345n, 10);
            expect(Array.isArray(permuted)).toBe(true);
            expect(permuted.length).toBe(10);
        });

        it("should return values from 1 to n", () => {
            const permuted = computePermutation(12345n, 10);
            const sorted = [...permuted].sort((a, b) => a - b);
            expect(sorted).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        });

        it("should return unique values (permutation property)", () => {
            const permuted = computePermutation(99999n, 50);
            const unique = new Set(permuted);
            expect(unique.size).toBe(50);
        });

        it("should be deterministic for same seed", () => {
            const perm1 = computePermutation(12345n, 20);
            const perm2 = computePermutation(12345n, 20);
            expect(perm1).toEqual(perm2);
        });

        it("should produce different permutations for different seeds", () => {
            const perm1 = computePermutation(12345n, 20);
            const perm2 = computePermutation(54321n, 20);
            expect(perm1).not.toEqual(perm2);
        });

        it("should handle n = 1", () => {
            const permuted = computePermutation(12345n, 1);
            expect(permuted).toEqual([1]);
        });

        it("should handle seed = 0", () => {
            const permuted = computePermutation(0n, 10);
            expect(permuted.length).toBe(10);
            const sorted = [...permuted].sort((a, b) => a - b);
            expect(sorted).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        });

        it("should produce fair distribution over many trials", async () => {
            // Count how often each position contains value 1
            const counts = Array(10).fill(0);
            for (let i = 0; i < 1000; i++) {
                const permuted = await computeLocalRandomNumbers({ blockHash: BigInt(i), userNonce: BigInt(i+1) }, 10, 10);
                const pos = permuted.randomNumbers.indexOf(1);
                counts[pos]++;
            }
            // Each position should have roughly 100 occurrences (±50 for randomness)
            counts.forEach(c => {
                expect(c).toBeGreaterThan(50);
                expect(c).toBeLessThan(150);
            });
        });
    });

    // ===== CREATE CIRCUIT INPUTS TESTS =====
    describe("createCircuitInputs()", () => {
        it("should throw if blockHash is not provided", () => {
            const inputs = {
                userNonce: 456,
            };
            expect(() => createCircuitInputs(inputs)).toThrow("inputs.blockHash is required");
        });

        it("should throw if userNonce is not provided", () => {
            const inputs = {
                blockHash: 123,
            };
            expect(() => createCircuitInputs(inputs)).toThrow("inputs.userNonce is required");
        });

        it("should create circuit inputs with required fields", () => {
            const inputs = {
                blockHash: 123,
                userNonce: 456,
            };
            const circuitInputs = createCircuitInputs(inputs);
            expect(circuitInputs.blockHash).toBeDefined();
            expect(circuitInputs.userNonce).toBeDefined();
        });

        it("should convert all inputs to strings", () => {
            const inputs = {
                blockHash: 123,
                userNonce: 456,
            };
            const circuitInputs = createCircuitInputs(inputs);
            expect(typeof circuitInputs.blockHash).toBe("string");
            expect(typeof circuitInputs.userNonce).toBe("string");
        });

        it("should accept hex string for blockHash", () => {
            const inputs = {
                blockHash: "0x7b",
                userNonce: 100,
            };
            const circuitInputs = createCircuitInputs(inputs);
            expect(circuitInputs.blockHash).toBe("123");
        });

        it("should create consistent inputs for same data", () => {
            const inputs = {
                blockHash: 555,
                userNonce: 666,
            };
            const result1 = createCircuitInputs(inputs);
            const result2 = createCircuitInputs(inputs);
            expect(result1).toEqual(result2);
        });

        it("should handle all zero inputs", () => {
            const inputs = {
                blockHash: 0,
                userNonce: 0,
            };
            const circuitInputs = createCircuitInputs(inputs);
            expect(circuitInputs).toBeDefined();
        });

        it("should handle large input values", () => {
            const largeNum = "123456789012345678901234567890";
            const inputs = {
                blockHash: largeNum,
                userNonce: largeNum,
            };
            const circuitInputs = createCircuitInputs(inputs);
            expect(circuitInputs).toBeDefined();
        });
    });

    // ===== PATH HELPER TESTS =====
    describe("getWasmPath() and getFinalZkeyPath()", () => {
        it("should throw if circuitName not provided", () => {
            expect(() => getWasmPath()).toThrow("circuitName is required");
            expect(() => getFinalZkeyPath()).toThrow("circuitName is required");
        });

        it("should return correct wasm path with circuit name", () => {
            const wasmPath = getWasmPath("random_6_50");
            expect(wasmPath).toContain("build");
            expect(wasmPath).toContain("random_6_50_js");
            expect(wasmPath).toContain("random_6_50.wasm");
        });

        it("should return correct wasm path with custom circuit name", () => {
            const wasmPath = getWasmPath("custom");
            expect(wasmPath).toContain("custom_js");
            expect(wasmPath).toContain("custom.wasm");
        });

        it("should return correct zkey path with circuit name", () => {
            const zkeyPath = getFinalZkeyPath("random_6_50");
            expect(zkeyPath).toContain("build");
            expect(zkeyPath).toContain("random_6_50_final.zkey");
        });

        it("should return correct zkey path with custom circuit name", () => {
            const zkeyPath = getFinalZkeyPath("custom");
            expect(zkeyPath).toContain("custom_final.zkey");
        });

        it("should generate absolute paths", () => {
            const wasmPath = getWasmPath("random_6_50");
            const zkeyPath = getFinalZkeyPath("random_6_50");
            expect(path.isAbsolute(wasmPath)).toBe(true);
            expect(path.isAbsolute(zkeyPath)).toBe(true);
        });
    });

    // ===== VERIFICATION KEY TESTS =====
    describe("loadVerificationKey()", () => {
        it("should throw if filename not provided", () => {
            expect(() => loadVerificationKey()).toThrow("filename is required");
        });

        it("should load verification key if it exists", () => {
            const vkey = loadVerificationKey("verification_key.json");
            expect(vkey).toBeDefined();
            expect(typeof vkey).toBe("object");
        });

        it("should return error if file does not exist", () => {
            expect(() => {
                loadVerificationKey("nonexistent.json");
            }).toThrow();
        });
    });

    // ===== GENERATE AND VERIFY PROOF TESTS =====
    describe("generateProof() and verifyProof()", () => {
        it("should generate proof if artifacts exist", async () => {
            const { proof, publicSignals } = await generateProof(circuitInputs, TEST_CIRCUIT_NAME);
            expect(proof).toBeDefined();
            expect(publicSignals).toBeDefined();
            expect(Array.isArray(publicSignals)).toBe(true);
        }, 60000);

        it("should verify valid proof if artifacts exist", async () => {
            const { proof, publicSignals } = await generateProof(circuitInputs, TEST_CIRCUIT_NAME);
            const isValid = await verifyProof(vkey, proof, publicSignals);
            expect(isValid).toBe(true);
        }, 60000);

        it("should reject tampered proof", async () => {
            const { proof, publicSignals } = await generateProof(circuitInputs, TEST_CIRCUIT_NAME);
            const tamperedProof = JSON.parse(JSON.stringify(proof));

            if (tamperedProof.pi_a && tamperedProof.pi_a[0]) {
                tamperedProof.pi_a[0] = "0";
            }

            const isValid = await verifyProof(vkey, tamperedProof, publicSignals);
            expect(isValid).toBe(false);
        }, 60000);

        it("should produce outputs in range [1, maxOutputVal]", async () => {
            const { publicSignals } = await generateProof(circuitInputs, TEST_CIRCUIT_NAME);
            const outputs = extractOutputs(publicSignals);

            for (const output of outputs) {
                expect(output).toBeGreaterThanOrEqual(BigInt(1));
                expect(output).toBeLessThanOrEqual(BigInt(MAX_OUTPUT_VAL));
            }
        }, 60000);

        it("should produce unique outputs (permutation guarantee)", async () => {
            const { publicSignals } = await generateProof(circuitInputs, TEST_CIRCUIT_NAME);
            const outputs = extractOutputs(publicSignals);
            const unique = new Set(outputs.map(o => o.toString()));
            expect(unique.size).toBe(NUM_OUTPUTS);
        }, 60000);
    });

    // ===== FULL WORKFLOW TEST =====
    describe("fullWorkflow()", () => {
        it("should throw if circuitName not provided", async () => {
            await expect(fullWorkflow({ blockHash: 1, userNonce: 2 })).rejects.toThrow("circuitName is required");
        });

        it("should execute complete workflow if artifacts exist", async () => {
            await completeSetup(TEST_CIRCUIT_NAME, {
                circuitPath: path.join(rootDir, "circuits", `${TEST_CIRCUIT_NAME}.circom`),
                power: TEST_POWER,
                ptauName: `pot${TEST_POWER}_final.ptau`,
                ptauEntropy: TEST_PTAU_ENTROPY,
                setupEntropy: TEST_SETUP_ENTROPY,
            });
            const inputs = {
                blockHash: 99999,
                userNonce: 88888,
            };

            const result = await fullWorkflow(inputs, TEST_CIRCUIT_NAME);
            expect(result).toBeDefined();
            expect(result.inputs).toBeDefined();
            expect(result.proof).toBeDefined();
            expect(result.publicSignals).toBeDefined();
            expect(result.isValid).toBe(true);
        }, 60000);
    });

    // ===== PERMUTATION-BASED OUTPUT VERIFICATION =====
    describe("Permutation-based outputs", () => {
        it("should match local Poseidon + permutation computation", async () => {
            const inputs = {
                blockHash: 12345,
                userNonce: 67890,
            };
            const circuitInputs = createCircuitInputs(inputs);

            const { publicSignals } = await generateProof(circuitInputs, TEST_CIRCUIT_NAME);
            const circuitOutputs = extractOutputs(publicSignals);

            // Compute locally
            const seed = await computePoseidonHash(inputs.blockHash, inputs.userNonce);
            const permuted = computePermutation(seed, MAX_OUTPUT_VAL);
            const expectedOutputs = permuted.slice(0, NUM_OUTPUTS);

            for (let i = 0; i < NUM_OUTPUTS; i++) {
                expect(circuitOutputs[i].toString()).toEqual(expectedOutputs[i].toString());
            }
        }, 60000);

        it("should produce different outputs for different inputs", async () => {
            const inputs1 = createCircuitInputs({ blockHash: 11111, userNonce: 22222 });
            const inputs2 = createCircuitInputs({ blockHash: 33333, userNonce: 44444 });

            const result1 = await generateProof(inputs1, TEST_CIRCUIT_NAME);
            const result2 = await generateProof(inputs2, TEST_CIRCUIT_NAME);

            const outputs1 = extractOutputs(result1.publicSignals);
            const outputs2 = extractOutputs(result2.publicSignals);

            // At least one output should differ
            const allSame = outputs1.every((o, i) => o === outputs2[i]);
            expect(allSame).toBe(false);
        }, 120000);

        it("should verify that same inputs produce same outputs", async () => {
            const inputs = {
                blockHash: 77777,
                userNonce: 88888,
            };

            const circuitInputs1 = createCircuitInputs(inputs);
            const circuitInputs2 = createCircuitInputs(inputs);

            const result1 = await generateProof(circuitInputs1, TEST_CIRCUIT_NAME);
            const result2 = await generateProof(circuitInputs2, TEST_CIRCUIT_NAME);

            // Public signals should be identical
            expect(result1.publicSignals).toEqual(result2.publicSignals);

            // Both proofs should be valid
            const isValid1 = await verifyProof(vkey, result1.proof, result1.publicSignals);
            const isValid2 = await verifyProof(vkey, result2.proof, result2.publicSignals);
            expect(isValid1).toBe(true);
            expect(isValid2).toBe(true);
        }, 60000);
    });
});
