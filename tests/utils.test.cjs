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

const rootDir = path.resolve(__dirname, "..");
const buildDir = path.join(rootDir, "build");

describe("Utils Module - Complete Function Coverage", () => {
    afterAll(() => {
        // Clean up build directory after all tests
        if (fs.existsSync(buildDir)) {
            fs.rmSync(buildDir, { recursive: true });
        }
    });

    // ===== POSEIDON HASH TESTS =====
    describe("computePoseidonHash()", () => {
        it("should compute consistent Poseidon hash for same inputs", async () => {
            const hash1 = await computePoseidonHash(1, 2, 3);
            const hash2 = await computePoseidonHash(1, 2, 3);
            expect(hash1).toEqual(hash2);
            expect(typeof hash1).toBe("bigint");
        });

        it("should produce different hashes for different inputs", async () => {
            const hash1 = await computePoseidonHash(1, 2, 3);
            const hash2 = await computePoseidonHash(1, 2, 4);
            expect(hash1).not.toEqual(hash2);
        });

        it("should accept string and number inputs", async () => {
            const hash1 = await computePoseidonHash("100", "200", "300");
            const hash2 = await computePoseidonHash(BigInt(100), BigInt(200), BigInt(300));
            expect(hash1).toEqual(hash2);
        });

        it("should handle zero inputs", async () => {
            const hash = await computePoseidonHash(0, 0, 0);
            expect(hash).toBeDefined();
            expect(typeof hash).toBe("bigint");
        });

        it("should handle large numbers", async () => {
            const largeNum = BigInt("12345678901234567890123456789012345678901234567890");
            const hash = await computePoseidonHash(largeNum, 1, 1);
            expect(hash).toBeDefined();
            expect(typeof hash).toBe("bigint");
            expect(hash).toBeGreaterThan(0n);
        });

        it("should be deterministic across multiple calls", async () => {
            const hashes = [];
            for (let i = 0; i < 5; i++) {
                hashes.push(await computePoseidonHash(100, 200, 300));
            }
            const firstHash = hashes[0];
            hashes.forEach(h => expect(h).toEqual(firstHash));
        });
    });

    // ===== RANDOM FROM SEED TESTS =====
    describe("generateRandomFromSeed()", () => {
        it("should generate random number with default N=1000", () => {
            const seed = BigInt(5000);
            const random = generateRandomFromSeed(seed);
            expect(random).toEqual(BigInt(0));
            expect(random).toBeLessThan(BigInt(1000));
        });

        it("should generate random number with custom N", () => {
            const seed = BigInt(2000);
            const N = BigInt(2000);
            const random = generateRandomFromSeed(seed, N);
            expect(random).toBeLessThan(N);
            expect(random).toBeGreaterThanOrEqual(0n);
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
            expect(random).toEqual(BigInt(55));
        });

        it("should return 0 when seed is multiple of N", () => {
            const seed = BigInt(1000);
            const N = BigInt(100);
            const random = generateRandomFromSeed(seed, N);
            expect(random).toEqual(BigInt(0));
        });

        it("should handle large N values", () => {
            const seed = BigInt(12345);
            const N = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
            const random = generateRandomFromSeed(seed, N);
            expect(random).toBeLessThan(N);
        });

        it("should handle N=1", () => {
            const random = generateRandomFromSeed(999n, 1n);
            expect(random).toEqual(0n);
        });

        it("should always return result in range [0, N)", () => {
            const N = BigInt(10000);
            for (let i = 0; i < 20; i++) {
                const seed = BigInt(Math.floor(Math.random() * 1000000));
                const random = generateRandomFromSeed(seed, N);
                expect(random).toBeGreaterThanOrEqual(0n);
                expect(random).toBeLessThan(N);
            }
        });
    });

    // ===== CREATE CIRCUIT INPUTS TESTS =====
    describe("createCircuitInputs()", () => {
        it("should create circuit inputs with all required fields", async () => {
            const inputs = {
                blockHash: 123,
                userNonce: 456,
                kurierEntropy: 789,
                N: 1000,
            };
            const circuitInputs = await createCircuitInputs(inputs);
            expect(circuitInputs).toHaveProperty("blockHash");
            expect(circuitInputs).toHaveProperty("userNonce");
            expect(circuitInputs).toHaveProperty("kurierEntropy");
            expect(circuitInputs).toHaveProperty("N");
            expect(circuitInputs).toHaveProperty("expectedR");
            expect(circuitInputs).toHaveProperty("hash");
        });

        it("should use default N=1000 if not provided", async () => {
            const inputs = {
                blockHash: 100,
                userNonce: 200,
                kurierEntropy: 300,
            };
            const circuitInputs = await createCircuitInputs(inputs);
            expect(circuitInputs.N).toBe("1000");
        });

        it("should convert all inputs to strings", async () => {
            const inputs = {
                blockHash: 123,
                userNonce: 456,
                kurierEntropy: 789,
                N: 1000,
            };
            const circuitInputs = await createCircuitInputs(inputs);
            expect(typeof circuitInputs.blockHash).toBe("string");
            expect(typeof circuitInputs.userNonce).toBe("string");
            expect(typeof circuitInputs.kurierEntropy).toBe("string");
            expect(typeof circuitInputs.N).toBe("string");
            expect(typeof circuitInputs.expectedR).toBe("string");
            expect(typeof circuitInputs.hash).toBe("string");
        });

        it("should accept hex string for blockHash", async () => {
            const inputs = {
                blockHash: "0x7b",
                userNonce: 100,
                kurierEntropy: 200,
                N: 1000,
            };
            const circuitInputs = await createCircuitInputs(inputs);
            expect(circuitInputs.blockHash).toBe("123");
        });

        it("should ensure expectedR is less than N", async () => {
            for (let i = 0; i < 10; i++) {
                const inputs = {
                    blockHash: Math.floor(Math.random() * 1000000),
                    userNonce: Math.floor(Math.random() * 1000000),
                    kurierEntropy: Math.floor(Math.random() * 1000000),
                    N: 1000,
                };
                const circuitInputs = await createCircuitInputs(inputs);
                const expectedR = BigInt(circuitInputs.expectedR);
                const N = BigInt(circuitInputs.N);
                expect(expectedR).toBeLessThan(N);
                expect(expectedR).toBeGreaterThanOrEqual(0n);
            }
        });

        it("should create consistent inputs for same data", async () => {
            const inputs = {
                blockHash: 555,
                userNonce: 666,
                kurierEntropy: 777,
                N: 2000,
            };
            const result1 = await createCircuitInputs(inputs);
            const result2 = await createCircuitInputs(inputs);
            expect(result1).toEqual(result2);
        });

        it("should handle all zero inputs", async () => {
            const inputs = {
                blockHash: 0,
                userNonce: 0,
                kurierEntropy: 0,
                N: 1000,
            };
            const circuitInputs = await createCircuitInputs(inputs);
            expect(circuitInputs.blockHash).toBe("0");
            expect(BigInt(circuitInputs.expectedR)).toBeLessThan(BigInt(1000));
        });

        it("should handle large input values", async () => {
            const largeNum = "123456789012345678901234567890";
            const inputs = {
                blockHash: largeNum,
                userNonce: largeNum,
                kurierEntropy: largeNum,
                N: 1000,
            };
            const circuitInputs = await createCircuitInputs(inputs);
            expect(circuitInputs).toBeDefined();
            expect(BigInt(circuitInputs.expectedR)).toBeLessThan(BigInt(1000));
        });

        it("should respect different N values", async () => {
            const baseInputs = {
                blockHash: 100,
                userNonce: 200,
                kurierEntropy: 300,
            };
            const result1 = await createCircuitInputs({ ...baseInputs, N: 100 });
            const result2 = await createCircuitInputs({ ...baseInputs, N: 10000 });
            expect(BigInt(result1.expectedR)).toBeLessThan(BigInt(100));
            expect(BigInt(result2.expectedR)).toBeLessThan(BigInt(10000));
        });
    });

    // ===== PATH HELPER TESTS =====
    describe("getWasmPath() and getFinalZkeyPath()", () => {
        it("should return correct wasm path with default circuit name", () => {
            const wasmPath = getWasmPath();
            expect(wasmPath).toContain("build");
            expect(wasmPath).toContain("random_js");
            expect(wasmPath).toContain("random.wasm");
        });

        it("should return correct wasm path with custom circuit name", () => {
            const wasmPath = getWasmPath("custom");
            expect(wasmPath).toContain("custom_js");
            expect(wasmPath).toContain("custom.wasm");
        });

        it("should return correct zkey path with default circuit name", () => {
            const zkeyPath = getFinalZkeyPath();
            expect(zkeyPath).toContain("build");
            expect(zkeyPath).toContain("random_final.zkey");
        });

        it("should return correct zkey path with custom circuit name", () => {
            const zkeyPath = getFinalZkeyPath("custom");
            expect(zkeyPath).toContain("custom_final.zkey");
        });

        it("should generate absolute paths", () => {
            const wasmPath = getWasmPath();
            const zkeyPath = getFinalZkeyPath();
            expect(path.isAbsolute(wasmPath)).toBe(true);
            expect(path.isAbsolute(zkeyPath)).toBe(true);
        });
    });

    // ===== VERIFICATION KEY TESTS =====
    describe("loadVerificationKey()", () => {
        it("should load verification key if it exists", () => {
            const vkeyPath = path.join(buildDir, "verification_key.json");
            if (fs.existsSync(vkeyPath)) {
                const vkey = loadVerificationKey("verification_key.json");
                expect(vkey).toBeDefined();
                expect(typeof vkey).toBe("object");
            }
        });

        it("should return error if file does not exist", () => {
            expect(() => {
                loadVerificationKey("nonexistent.json");
            }).toThrow();
        });
    });

    // ===== GENERATE AND VERIFY PROOF TESTS =====
    describe("generateProof() and verifyProof()", () => {
        let circuitInputs;
        let vkey;

        beforeAll(async () => {
            circuitInputs = await createCircuitInputs({
                blockHash: 12345,
                userNonce: 67890,
                kurierEntropy: 54321,
                N: 1000,
            });

            const vkeyPath = path.join(buildDir, "verification_key.json");
            if (fs.existsSync(vkeyPath)) {
                vkey = loadVerificationKey("verification_key.json");
            }
        }, 30000);

        it("should generate proof if artifacts exist", async () => {
            const wasmPath = getWasmPath();
            const zkeyPath = getFinalZkeyPath();

            if (fs.existsSync(wasmPath) && fs.existsSync(zkeyPath)) {
                const { proof, publicSignals } = await generateProof(circuitInputs);
                expect(proof).toBeDefined();
                expect(publicSignals).toBeDefined();
                expect(Array.isArray(publicSignals)).toBe(true);
            }
        }, 60000);

        it("should verify valid proof if artifacts exist", async () => {
            if (vkey) {
                const { proof, publicSignals } = await generateProof(circuitInputs);
                const isValid = await verifyProof(vkey, proof, publicSignals);
                expect(isValid).toBe(true);
            }
        }, 60000);

        it("should reject tampered proof", async () => {
            if (vkey) {
                const { proof, publicSignals } = await generateProof(circuitInputs);
                const tamperedProof = JSON.parse(JSON.stringify(proof));

                if (tamperedProof.pi_a && tamperedProof.pi_a[0]) {
                    tamperedProof.pi_a[0] = "0";
                }

                const isValid = await verifyProof(vkey, tamperedProof, publicSignals);
                expect(isValid).toBe(false);
            }
        }, 60000);
    });

    // ===== FULL WORKFLOW TEST =====
    describe("fullWorkflow()", () => {
        it("should execute complete workflow if artifacts exist", async () => {
            const inputs = {
                blockHash: 99999,
                userNonce: 88888,
                kurierEntropy: 77777,
                N: 1000,
            };

            const vkeyPath = path.join(buildDir, "verification_key.json");
            const wasmPath = getWasmPath();
            const zkeyPath = getFinalZkeyPath();

            if (fs.existsSync(vkeyPath) && fs.existsSync(wasmPath) && fs.existsSync(zkeyPath)) {
                const result = await fullWorkflow(inputs);
                expect(result).toBeDefined();
                expect(result.inputs).toBeDefined();
                expect(result.proof).toBeDefined();
                expect(result.publicSignals).toBeDefined();
                expect(result.isValid).toBe(true);
            }
        }, 60000);
    });

    // ===== INTEGRATION TESTS =====
    describe("Integration Tests", () => {
        it("should compute different expectedR for different blockHash", async () => {
            const inputs1 = await createCircuitInputs({
                blockHash: 100,
                userNonce: 200,
                kurierEntropy: 300,
                N: 1000,
            });
            const inputs2 = await createCircuitInputs({
                blockHash: 101,
                userNonce: 200,
                kurierEntropy: 300,
                N: 1000,
            });
            expect(inputs1.expectedR).not.toEqual(inputs2.expectedR);
        });

        it("should compute different hashes for different inputs", async () => {
            const hash1 = await computePoseidonHash(100, 200, 300);
            const hash2 = await computePoseidonHash(100, 200, 301);
            expect(hash1).not.toEqual(hash2);
        });

        it("should produce expected output within N bounds", async () => {
            for (let i = 0; i < 5; i++) {
                const N = 1000 + i * 1000;
                const inputs = await createCircuitInputs({
                    blockHash: 1000 + i,
                    userNonce: 2000 + i,
                    kurierEntropy: 3000 + i,
                    N: N,
                });
                const R = BigInt(inputs.expectedR);
                expect(R).toBeGreaterThanOrEqual(0n);
                expect(R).toBeLessThan(BigInt(N));
            }
        });
    });
});
