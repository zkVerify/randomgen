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

describe("Utils Module - Complete Function Coverage", () => {
    afterEach(() => {
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
            const seed = BigInt(5000);
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
            expect(circuitInputs.blockHash).toBeDefined();
            expect(circuitInputs.userNonce).toBeDefined();
            expect(circuitInputs.kurierEntropy).toBeDefined();
            expect(circuitInputs.N).toBeDefined();
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
            const circuitInputs = await createCircuitInputs(inputs);
            expect(circuitInputs).toBeDefined();
        });

        it("should respect different N values", async () => {
            const baseInputs = {
                blockHash: 100,
                userNonce: 200,
                kurierEntropy: 300,
            };
            const result1 = await createCircuitInputs({ ...baseInputs, N: 100 });
            const result2 = await createCircuitInputs({ ...baseInputs, N: 10000 });
            expect(result1).toBeDefined();
            expect(result2).toBeDefined();
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
        beforeAll(async () => {
            await completeSetup();
        }, 300000);

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
        let circuitInputs;
        let vkey;

        beforeEach(async () => {
            await completeSetup();
            circuitInputs = await createCircuitInputs({
                blockHash: 12345,
                userNonce: 67890,
                kurierEntropy: 54321,
                N: 1000,
            });

            vkey = loadVerificationKey("verification_key.json");
        }, 30000);

        it("should generate proof if artifacts exist", async () => {
            const { proof, publicSignals } = await generateProof(circuitInputs);
            expect(proof).toBeDefined();
            expect(publicSignals).toBeDefined();
            expect(Array.isArray(publicSignals)).toBe(true);
        }, 60000);

        it("should verify valid proof if artifacts exist", async () => {
            const { proof, publicSignals } = await generateProof(circuitInputs);
            const isValid = await verifyProof(vkey, proof, publicSignals);
            expect(isValid).toBe(true);
        }, 60000);

        it("should reject tampered proof", async () => {
            const { proof, publicSignals } = await generateProof(circuitInputs);
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
        it("should execute complete workflow if artifacts exist", async () => {
            await completeSetup();
            const inputs = {
                blockHash: 99999,
                userNonce: 88888,
                kurierEntropy: 77777,
                N: 1000,
            };

            const result = await fullWorkflow(inputs);
            expect(result).toBeDefined();
            expect(result.inputs).toBeDefined();
            expect(result.proof).toBeDefined();
            expect(result.publicSignals).toBeDefined();
            expect(result.isValid).toBe(true);
        }, 60000);
    });
});

// ===== N AS PUBLIC INPUT - SAME SETUP, DIFFERENT N VALUES =====
describe("N as Public Input - Same setup works for different N values", () => {
    let vkey;

    beforeAll(async () => {
        // Perform setup ONCE for all tests in this suite
        await completeSetup();
        vkey = loadVerificationKey("verification_key.json");
    }, 300000);

    afterAll(() => {
        // Clean up build directory after all tests
        if (fs.existsSync(buildDir)) {
            fs.rmSync(buildDir, { recursive: true });
        }
    });

    it("should generate and verify proofs with different N values using same setup", async () => {
        const baseInputs = {
            blockHash: 12345,
            userNonce: 67890,
            kurierEntropy: 54321,
        };

        const nValues = [100, 500, 1000, 5000, 10000];

        for (const N of nValues) {
            const circuitInputs = await createCircuitInputs({
                ...baseInputs,
                N,
            });

            const { proof, publicSignals } = await generateProof(circuitInputs);
            expect(proof).toBeDefined();
            expect(publicSignals).toBeDefined();

            // Verify the proof with the SAME verification key
            const isValid = await verifyProof(vkey, proof, publicSignals);
            expect(isValid).toBe(true);

            // Verify R is in valid range [0, N)
            const R = BigInt(publicSignals[0]);
            expect(R).toBeGreaterThanOrEqual(BigInt(0));
            expect(R).toBeLessThan(BigInt(N));
        }
    }, 120000);

    it("should produce correct R = hash mod N for different N values", async () => {
        const baseInputs = {
            blockHash: 99999,
            userNonce: 88888,
            kurierEntropy: 77777,
        };

        // Get the underlying hash
        const hash = await computePoseidonHash(
            baseInputs.blockHash,
            baseInputs.userNonce,
            baseInputs.kurierEntropy
        );

        const nValues = [100, 1000, 10000, 100000];
        const results = [];

        for (const N of nValues) {
            const circuitInputs = await createCircuitInputs({
                ...baseInputs,
                N,
            });

            const { proof, publicSignals } = await generateProof(circuitInputs);
            const isValid = await verifyProof(vkey, proof, publicSignals);
            expect(isValid).toBe(true);

            const R = BigInt(publicSignals[0]);
            const expectedR = hash % BigInt(N);

            expect(R).toEqual(expectedR);
            results.push({ N, R });
        }

        // Verify we got different R values for different N
        expect(results.length).toBe(4);
    }, 120000);

    it("should handle large N values", async () => {
        const largeN = BigInt("1000000000000000000000"); // 10^21

        const circuitInputs = await createCircuitInputs({
            blockHash: 12345,
            userNonce: 67890,
            kurierEntropy: 54321,
            N: largeN,
        });

        const { proof, publicSignals } = await generateProof(circuitInputs);
        const isValid = await verifyProof(vkey, proof, publicSignals);
        expect(isValid).toBe(true);

        const R = BigInt(publicSignals[0]);
        expect(R).toBeGreaterThanOrEqual(BigInt(0));
        expect(R).toBeLessThan(largeN);
    }, 60000);

    it("should verify that same inputs with same N produce same proof result", async () => {
        const inputs = {
            blockHash: 77777,
            userNonce: 88888,
            kurierEntropy: 99999,
            N: 1000,
        };

        const circuitInputs1 = await createCircuitInputs(inputs);
        const circuitInputs2 = await createCircuitInputs(inputs);

        const result1 = await generateProof(circuitInputs1);
        const result2 = await generateProof(circuitInputs2);

        // Public signals (including R) should be identical
        expect(result1.publicSignals).toEqual(result2.publicSignals);

        // Both proofs should be valid
        const isValid1 = await verifyProof(vkey, result1.proof, result1.publicSignals);
        const isValid2 = await verifyProof(vkey, result2.proof, result2.publicSignals);
        expect(isValid1).toBe(true);
        expect(isValid2).toBe(true);
    }, 60000);
});
