const fs = require("fs");
const path = require("path");
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
} = require("../lib/utils.js");

const { completeSetup } = require("../lib/setupArtifacts.js");

const rootDir = path.resolve(__dirname, "..");
const buildDir = path.join(rootDir, "build");

// =============================================================================
// TEST CIRCUIT CONFIGURATION
// =============================================================================
// Tests use random_3.circom which is configured with:
//   - numOutputs = 3 (smaller for faster tests)
//   - power = 13 (ptau file size)
// 
// The production circuit (random_15.circom) uses:
//   - numOutputs = 15 (library default)
//   - power = 15 (ptau file size)
// =============================================================================
const TEST_CIRCUIT_NAME = "random_3";
const TEST_POWER = 13;
const NUM_OUTPUTS = 3;
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

// Helper to extract R outputs from publicSignals
// publicSignals format: [R[0], R[1], ..., R[numOutputs-1], blockHash, userNonce, N]
const extractROutputs = (publicSignals, numOutputs = NUM_OUTPUTS) => {
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
            kurierEntropy: 54321,
            N: 1000,
        });
        vkey = loadVerificationKey("verification_key.json");
    }, 300000);

    afterAll(() => {
        cleanupTestArtifacts();
    });

    // ===== POSEIDON HASH TESTS =====
    describe("computePoseidonHash()", () => {
        it("should throw if nOuts is not provided", async () => {
            await expect(computePoseidonHash(1, 2, 3)).rejects.toThrow("nOuts is required");
        });

        it("should return an array with single output", async () => {
            const hashes = await computePoseidonHash(1, 2, 3, 1);
            expect(Array.isArray(hashes)).toBe(true);
            expect(hashes.length).toBe(1);
            expect(typeof hashes[0]).toBe("bigint");
        });

        it("should compute consistent Poseidon hash for same inputs", async () => {
            const hash1 = await computePoseidonHash(1, 2, 3, 1);
            const hash2 = await computePoseidonHash(1, 2, 3, 1);
            expect(hash1).toEqual(hash2);
        });

        it("should produce different hashes for different inputs", async () => {
            const hash1 = await computePoseidonHash(1, 2, 3, 1);
            const hash2 = await computePoseidonHash(1, 2, 4, 1);
            expect(hash1[0]).not.toEqual(hash2[0]);
        });

        it("should accept string and number inputs", async () => {
            const hash1 = await computePoseidonHash("100", "200", "300", 1);
            const hash2 = await computePoseidonHash(BigInt(100), BigInt(200), BigInt(300), 1);
            expect(hash1).toEqual(hash2);
        });

        it("should handle zero inputs", async () => {
            const hashes = await computePoseidonHash(0, 0, 0, 1);
            expect(hashes).toBeDefined();
            expect(Array.isArray(hashes)).toBe(true);
            expect(typeof hashes[0]).toBe("bigint");
        });

        it("should handle large numbers", async () => {
            const largeNum = BigInt("12345678901234567890123456789012345678901234567890");
            const hashes = await computePoseidonHash(largeNum, 1, 1, 1);
            expect(hashes).toBeDefined();
            expect(Array.isArray(hashes)).toBe(true);
            expect(hashes[0]).toBeGreaterThan(0n);
        });

        it("should be deterministic across multiple calls", async () => {
            const results = [];
            for (let i = 0; i < 5; i++) {
                results.push(await computePoseidonHash(100, 200, 300, 1));
            }
            const firstHash = results[0][0];
            results.forEach(r => expect(r[0]).toEqual(firstHash));
        });

        it("should return multiple outputs when nOuts > 1", async () => {
            const hashes = await computePoseidonHash(1, 2, 3, 5);
            expect(Array.isArray(hashes)).toBe(true);
            expect(hashes.length).toBe(5);
            hashes.forEach(h => expect(typeof h).toBe("bigint"));
        });

        it("should return different values for each output", async () => {
            const hashes = await computePoseidonHash(1, 2, 3, 5);
            const unique = new Set(hashes.map(h => h.toString()));
            // At least some outputs should be different
            expect(unique.size).toBeGreaterThan(1);
        });

        it("should produce consistent multi-output results", async () => {
            const hashes1 = await computePoseidonHash(100, 200, 300, 3);
            const hashes2 = await computePoseidonHash(100, 200, 300, 3);
            expect(hashes1).toEqual(hashes2);
        });
    });

    // ===== RANDOM FROM SEED TESTS =====
    describe("generateRandomFromSeed()", () => {
        it("should throw if N is not provided", () => {
            expect(() => generateRandomFromSeed(5000n)).toThrow("N is required");
        });

        it("should generate random number from single seed", () => {
            const seed = BigInt(5000);
            const random = generateRandomFromSeed(seed, 1000n);
            expect(Array.isArray(random)).toBe(true);
            expect(random.length).toBe(1);
            expect(random[0]).toEqual(BigInt(0)); // 5000 % 1000 = 0
            expect(random[0]).toBeLessThan(BigInt(1000));
        });

        it("should generate random numbers from array of seeds", () => {
            const seeds = [BigInt(5000), BigInt(5001), BigInt(5002)];
            const N = BigInt(1000);
            const randoms = generateRandomFromSeed(seeds, N);
            expect(Array.isArray(randoms)).toBe(true);
            expect(randoms.length).toBe(3);
            expect(randoms[0]).toEqual(BigInt(0));   // 5000 % 1000 = 0
            expect(randoms[1]).toEqual(BigInt(1));   // 5001 % 1000 = 1
            expect(randoms[2]).toEqual(BigInt(2));   // 5002 % 1000 = 2
        });

        it("should handle string and number inputs", () => {
            const random1 = generateRandomFromSeed("1000", "100");
            const random2 = generateRandomFromSeed(1000n, 100n);
            expect(random1).toEqual(random2);
        });

        it("should produce remainder of seed mod N", () => {
            const seed = BigInt(555);
            const N = BigInt(100);
            const random = generateRandomFromSeed(seed, N);
            expect(random[0]).toEqual(BigInt(55));
        });

        it("should return 0 when seed is multiple of N", () => {
            const seed = BigInt(1000);
            const N = BigInt(100);
            const random = generateRandomFromSeed(seed, N);
            expect(random[0]).toEqual(BigInt(0));
        });

        it("should handle large N values", () => {
            const seed = BigInt(12345);
            const N = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
            const random = generateRandomFromSeed(seed, N);
            expect(random[0]).toBeLessThan(N);
        });

        it("should always return results in range [0, N)", () => {
            const N = BigInt(10000);
            const seeds = Array.from({ length: 20 }, () =>
                BigInt(Math.floor(Math.random() * 1000000))
            );
            const randoms = generateRandomFromSeed(seeds, N);
            expect(randoms.length).toBe(20);
            randoms.forEach(r => {
                expect(r).toBeGreaterThanOrEqual(0n);
                expect(r).toBeLessThan(N);
            });
        });

        it("should work with Poseidon hash outputs", async () => {
            const hashes = await computePoseidonHash(100, 200, 300, NUM_OUTPUTS);
            const N = BigInt(1000);
            const randoms = generateRandomFromSeed(hashes, N);
            expect(randoms.length).toBe(NUM_OUTPUTS);
            randoms.forEach((r, i) => {
                expect(r).toEqual(hashes[i] % N);
                expect(r).toBeGreaterThanOrEqual(0n);
                expect(r).toBeLessThan(N);
            });
        });
    });

    // ===== CREATE CIRCUIT INPUTS TESTS =====
    describe("createCircuitInputs()", () => {
        it("should throw if N is not provided", async () => {
            const inputs = {
                blockHash: 123,
                userNonce: 456,
                kurierEntropy: 789,
            };
            expect(() => createCircuitInputs(inputs)).toThrow("inputs.N is required");
        });

        it("should create circuit inputs with all required fields", async () => {
            const inputs = {
                blockHash: 123,
                userNonce: 456,
                kurierEntropy: 789,
                N: 1000,
            };
            const circuitInputs = createCircuitInputs(inputs);
            expect(circuitInputs.blockHash).toBeDefined();
            expect(circuitInputs.userNonce).toBeDefined();
            expect(circuitInputs.kurierEntropy).toBeDefined();
            expect(circuitInputs.N).toBeDefined();
        });

        it("should convert all inputs to strings", async () => {
            const inputs = {
                blockHash: 123,
                userNonce: 456,
                kurierEntropy: 789,
                N: 1000,
            };
            const circuitInputs = createCircuitInputs(inputs);
            expect(typeof circuitInputs.blockHash).toBe("string");
            expect(typeof circuitInputs.userNonce).toBe("string");
            expect(typeof circuitInputs.kurierEntropy).toBe("string");
            expect(typeof circuitInputs.N).toBe("string");
        });

        it("should accept hex string for blockHash", async () => {
            const inputs = {
                blockHash: "0x7b",
                userNonce: 100,
                kurierEntropy: 200,
                N: 1000,
            };
            const circuitInputs = createCircuitInputs(inputs);
            expect(circuitInputs.blockHash).toBe("123");
        });

        it("should create consistent inputs for same data", async () => {
            const inputs = {
                blockHash: 555,
                userNonce: 666,
                kurierEntropy: 777,
                N: 2000,
            };
            const result1 = createCircuitInputs(inputs);
            const result2 = createCircuitInputs(inputs);
            expect(result1).toEqual(result2);
        });

        it("should handle all zero inputs", async () => {
            const inputs = {
                blockHash: 0,
                userNonce: 0,
                kurierEntropy: 0,
                N: 1000,
            };
            const circuitInputs = createCircuitInputs(inputs);
            expect(circuitInputs).toBeDefined();
        });

        it("should handle large input values", async () => {
            const largeNum = "123456789012345678901234567890";
            const inputs = {
                blockHash: largeNum,
                userNonce: largeNum,
                kurierEntropy: largeNum,
                N: 1000,
            };
            const circuitInputs = createCircuitInputs(inputs);
            expect(circuitInputs).toBeDefined();
        });

        it("should respect different N values", async () => {
            const baseInputs = {
                blockHash: 100,
                userNonce: 200,
                kurierEntropy: 300,
            };
            const result1 = createCircuitInputs({ ...baseInputs, N: 100 });
            const result2 = createCircuitInputs({ ...baseInputs, N: 10000 });
            expect(result1).toBeDefined();
            expect(result2).toBeDefined();
        });
    });

    // ===== PATH HELPER TESTS =====
    describe("getWasmPath() and getFinalZkeyPath()", () => {
        it("should throw if circuitName not provided", () => {
            expect(() => getWasmPath()).toThrow("circuitName is required");
            expect(() => getFinalZkeyPath()).toThrow("circuitName is required");
        });

        it("should return correct wasm path with circuit name", () => {
            const wasmPath = getWasmPath("random_15");
            expect(wasmPath).toContain("build");
            expect(wasmPath).toContain("random_15_js");
            expect(wasmPath).toContain("random_15.wasm");
        });

        it("should return correct wasm path with custom circuit name", () => {
            const wasmPath = getWasmPath("custom");
            expect(wasmPath).toContain("custom_js");
            expect(wasmPath).toContain("custom.wasm");
        });

        it("should return correct zkey path with circuit name", () => {
            const zkeyPath = getFinalZkeyPath("random_15");
            expect(zkeyPath).toContain("build");
            expect(zkeyPath).toContain("random_15_final.zkey");
        });

        it("should return correct zkey path with custom circuit name", () => {
            const zkeyPath = getFinalZkeyPath("custom");
            expect(zkeyPath).toContain("custom_final.zkey");
        });

        it("should generate absolute paths", () => {
            const wasmPath = getWasmPath("random_15");
            const zkeyPath = getFinalZkeyPath("random_15");
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
    });

    // ===== FULL WORKFLOW TEST =====
    describe("fullWorkflow()", () => {
        it("should throw if circuitName not provided", async () => {
            await expect(fullWorkflow({ blockHash: 1, userNonce: 2, kurierEntropy: 3, N: 1000 })).rejects.toThrow("circuitName is required");
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
                kurierEntropy: 77777,
                N: 1000,
            };

            const result = await fullWorkflow(inputs, TEST_CIRCUIT_NAME);
            expect(result).toBeDefined();
            expect(result.inputs).toBeDefined();
            expect(result.proof).toBeDefined();
            expect(result.publicSignals).toBeDefined();
            expect(result.isValid).toBe(true);
        }, 60000);
    });

    // ===== N AS PUBLIC INPUT - SAME SETUP, DIFFERENT N VALUES =====
    describe("N as Public Input - Same setup works for different N values", () => {
        it("should generate and verify proofs with different N values using same setup", async () => {
            const baseInputs = {
                blockHash: 12345,
                userNonce: 67890,
                kurierEntropy: 54321,
            };

            const nValues = [100, 500, 1000, 5000, 10000];

            for (const N of nValues) {
                const circuitInputs = createCircuitInputs({
                    ...baseInputs,
                    N,
                });

                const { proof, publicSignals } = await generateProof(circuitInputs, TEST_CIRCUIT_NAME);
                expect(proof).toBeDefined();
                expect(publicSignals).toBeDefined();

                // Verify the proof with the SAME verification key
                const isValid = await verifyProof(vkey, proof, publicSignals);
                expect(isValid).toBe(true);

                // Verify all R outputs are in valid range [0, N)
                const rOutputs = extractROutputs(publicSignals);
                expect(rOutputs.length).toBe(NUM_OUTPUTS);
                for (const R of rOutputs) {
                    expect(R).toBeGreaterThanOrEqual(BigInt(0));
                    expect(R).toBeLessThan(BigInt(N));
                }
            }
        }, 120000);

        it("should produce correct R[i] = hash[i] mod N for different N values", async () => {
            const baseInputs = {
                blockHash: 99999,
                userNonce: 88888,
                kurierEntropy: 77777,
            };

            // Get the underlying hashes (NUM_OUTPUTS outputs to match circuit)
            const hashes = await computePoseidonHash(
                baseInputs.blockHash,
                baseInputs.userNonce,
                baseInputs.kurierEntropy,
                NUM_OUTPUTS
            );

            const nValues = [100, 1000, 10000, 100000];

            for (const N of nValues) {
                const circuitInputs = createCircuitInputs({
                    ...baseInputs,
                    N,
                });

                const { proof, publicSignals } = await generateProof(circuitInputs, TEST_CIRCUIT_NAME);
                const isValid = await verifyProof(vkey, proof, publicSignals);
                expect(isValid).toBe(true);

                // Verify each R[i] = hash[i] mod N
                const rOutputs = extractROutputs(publicSignals);
                for (let i = 0; i < NUM_OUTPUTS; i++) {
                    const expectedR = hashes[i] % BigInt(N);
                    expect(rOutputs[i]).toEqual(expectedR);
                }
            }
        }, 120000);

        it("should handle large N values", async () => {
            const largeN = BigInt("1000000000000000000000"); // 10^21

            const circuitInputs = createCircuitInputs({
                blockHash: 12345,
                userNonce: 67890,
                kurierEntropy: 54321,
                N: largeN,
            });

            const { proof, publicSignals } = await generateProof(circuitInputs, TEST_CIRCUIT_NAME);
            const isValid = await verifyProof(vkey, proof, publicSignals);
            expect(isValid).toBe(true);

            // Verify all R outputs are in valid range [0, largeN)
            const rOutputs = extractROutputs(publicSignals);
            expect(rOutputs.length).toBe(NUM_OUTPUTS);
            for (const R of rOutputs) {
                expect(R).toBeGreaterThanOrEqual(BigInt(0));
                expect(R).toBeLessThan(largeN);
            }
        }, 60000);

        it("should verify that same inputs with same N produce same proof result", async () => {
            const inputs = {
                blockHash: 77777,
                userNonce: 88888,
                kurierEntropy: 99999,
                N: 1000,
            };

            const circuitInputs1 = createCircuitInputs(inputs);
            const circuitInputs2 = createCircuitInputs(inputs);

            const result1 = await generateProof(circuitInputs1, TEST_CIRCUIT_NAME);
            const result2 = await generateProof(circuitInputs2, TEST_CIRCUIT_NAME);

            // Public signals (including R) should be identical
            expect(result1.publicSignals).toEqual(result2.publicSignals);

            // Both proofs should be valid
            const isValid1 = await verifyProof(vkey, result1.proof, result1.publicSignals);
            const isValid2 = await verifyProof(vkey, result2.proof, result2.publicSignals);
            expect(isValid1).toBe(true);
            expect(isValid2).toBe(true);
        }, 60000);
    });
});
