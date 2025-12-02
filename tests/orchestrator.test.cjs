const fs = require("fs");
const path = require("path");
const {
    RandomCircuitOrchestrator,
    computeLocalHash,
} = require("../lib/orchestrator.js");

const rootDir = path.resolve(__dirname, "..");
const buildDir = path.join(rootDir, "build");

describe("Orchestrator Module - Complete Function Coverage", () => {
    let orchestrator;

    afterEach(() => {
        // Clean up build directory after all tests
        if (fs.existsSync(buildDir)) {
            fs.rmSync(buildDir, { recursive: true });
        }
    });

    beforeEach(() => {
        orchestrator = new RandomCircuitOrchestrator({
            circuitName: "random",
        });
    });

    // ===== CONSTRUCTOR TESTS =====
    describe("RandomCircuitOrchestrator - Constructor", () => {
        it("should create orchestrator with default options", () => {
            const orch = new RandomCircuitOrchestrator();
            expect(orch.circuitName).toBe("random");
            expect(orch.vkey).toBeNull();
        });

        it("should create orchestrator with custom circuit name", () => {
            const orch = new RandomCircuitOrchestrator({
                circuitName: "custom",
            });
            expect(orch.circuitName).toBe("custom");
        });

        it("should set buildDir to default location", () => {
            const orch = new RandomCircuitOrchestrator();
            expect(orch.buildDir).toContain("build");
        });

        it("should allow custom buildDir", () => {
            const customBuildDir = "/custom/build";
            const orch = new RandomCircuitOrchestrator({
                buildDir: customBuildDir,
            });
            expect(orch.buildDir).toBe(customBuildDir);
        });
    });

    // ===== VALIDATE BUILD ARTIFACTS TESTS =====
    describe("validateBuildArtifacts()", () => {
        it("should return validation object with isValid and missingFiles properties", () => {
            const validation = orchestrator.validateBuildArtifacts();
            expect(validation).toHaveProperty("isValid");
            expect(validation).toHaveProperty("missingFiles");
            expect(typeof validation.isValid).toBe("boolean");
            expect(Array.isArray(validation.missingFiles)).toBe(true);
        });

        it("should identify missing WASM file", () => {
            const validation = orchestrator.validateBuildArtifacts();
            const hasWasm = validation.missingFiles.some(f => f.includes(".wasm"));
            expect(hasWasm).toBe(true);
        });

        it("should identify missing zkey file", () => {
            const validation = orchestrator.validateBuildArtifacts();
            const hasZkey = validation.missingFiles.some(f => f.includes(".zkey"));
            expect(hasZkey).toBe(true);
        });

        it("should identify missing verification key", () => {
            const validation = orchestrator.validateBuildArtifacts();
            const hasVkey = validation.missingFiles.some(f => f.includes("verification"));
            expect(hasVkey).toBe(true);
        });

        it("should return isValid=true when all files exist", async () => {
            await orchestrator.initialize();

            const validation = orchestrator.validateBuildArtifacts();
            expect(validation.isValid).toBe(true);
            expect(validation.missingFiles.length).toBe(0);
        }, 30000);

        it("should work with custom circuit names", () => {
            const customOrch = new RandomCircuitOrchestrator({
                circuitName: "custom",
            });
            const validation = customOrch.validateBuildArtifacts();
            expect(validation).toHaveProperty("isValid");
            expect(validation).toHaveProperty("missingFiles");
        });
    });

    // ===== INITIALIZE TESTS =====
    describe("initialize()", () => {
        it("should initialize orchestrator without error", async () => {
            const result = await orchestrator.initialize();
            expect(typeof result).toBe("boolean");
            expect(result).toBe(true);
        }, 30000);

        it("should load verification key on successful initialization", async () => {
            const vkeyPath = path.join(buildDir, "verification_key.json");
            await orchestrator.initialize();
            expect(orchestrator.vkey).toBeDefined();
            expect(fs.existsSync(vkeyPath)).toBe(true);
        }, 30000);

        it("should accept setupOptions", async () => {
            const options = {
                power: 12,
            };
            const result = await orchestrator.initialize(options);
            expect(result).toBe(true);
        }, 30000);
    });

    // ===== COMPUTE LOCAL HASH TESTS =====
    describe("computeLocalHash()", () => {
        it("should compute local hash with defaults", async () => {
            const inputs = {
                blockHash: 100,
                userNonce: 200,
                kurierEntropy: 300,
            };
            const result = await computeLocalHash(inputs);
            expect(result).toHaveProperty("hash");
            expect(result).toHaveProperty("R");
            expect(typeof result.hash).toBe("string");
            expect(typeof result.R).toBe("string");
        });

        it("should compute local hash with custom N", async () => {
            const inputs = {
                blockHash: 100,
                userNonce: 200,
                kurierEntropy: 300,
                N: 2000n,
            };
            const result = await computeLocalHash(inputs);
            expect(BigInt(result.R)).toBeLessThan(BigInt(2000));
        });

        it("should respect N parameter in output", async () => {
            const inputs = {
                blockHash: 50,
                userNonce: 100,
                kurierEntropy: 150,
                N: 500n,
            };
            const result = await computeLocalHash(inputs);
            const R = BigInt(result.R);
            expect(R).toBeLessThan(BigInt(500));
            expect(R).toBeGreaterThanOrEqual(0n);
        });

        it("should produce consistent results for same inputs", async () => {
            const inputs = {
                blockHash: 111,
                userNonce: 222,
                kurierEntropy: 333,
                N: 1000n,
            };
            const result1 = await computeLocalHash(inputs);
            const result2 = await computeLocalHash(inputs);
            expect(result1.hash).toEqual(result2.hash);
            expect(result1.R).toEqual(result2.R);
        });

        it("should produce different results for different inputs", async () => {
            const inputs1 = {
                blockHash: 111,
                userNonce: 222,
                kurierEntropy: 333,
            };
            const inputs2 = {
                blockHash: 111,
                userNonce: 222,
                kurierEntropy: 334,
            };
            const result1 = await computeLocalHash(inputs1);
            const result2 = await computeLocalHash(inputs2);
            expect(result1.hash).not.toEqual(result2.hash);
        });

        it("should handle large N values", async () => {
            const nBigNum = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495616");
            const inputs = {
                blockHash: 999,
                userNonce: 888,
                kurierEntropy: 777,
                N: nBigNum,
            };
            const result = await computeLocalHash(inputs);
            expect(BigInt(result.R)).toBeGreaterThanOrEqual(0n);
            expect(BigInt(result.R)).toBeLessThan(nBigNum);
        });

        it("should handle N=1", async () => {
            const inputs = {
                blockHash: 999,
                userNonce: 888,
                kurierEntropy: 777,
                N: 1n,
            };
            const result = await computeLocalHash(inputs);
            expect(result.R).toEqual("0");
        });
    });

    // ===== SAVE PROOF DATA TESTS =====
    describe("saveProofData()", () => {
        it("should save proof data to files", async () => {
            const proofData = {
                proof: {
                    pi_a: ["1", "2"],
                    pi_b: [["3", "4"], ["5", "6"]],
                    pi_c: ["7", "8"],
                },
                publicSignals: ["100", "200"],
                R: "42",
                circuitInputs: {
                    blockHash: "123",
                    userNonce: "456",
                },
            };

            const result = await orchestrator.saveProofData(proofData, buildDir);
            expect(result.success).toBe(true);
            expect(result.files).toBeDefined();
            expect(result.files.proof).toBeDefined();
            expect(result.files.publicSignals).toBeDefined();
            expect(result.files.R).toBeDefined();

            expect(fs.existsSync(result.files.proof)).toBe(true);
            expect(fs.existsSync(result.files.publicSignals)).toBe(true);
            expect(fs.existsSync(result.files.R)).toBe(true);
        });

        it("should handle errors gracefully", async () => {
            const proofData = null;
            const result = await orchestrator.saveProofData(proofData, "/invalid/path");
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    // ===== LOAD PROOF DATA TESTS =====
    describe("loadProofData()", () => {
        it("should return error if proof file does not exist", () => {
            const result = orchestrator.loadProofData(
                "/nonexistent/proof.json",
                "/nonexistent/public.json"
            );
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it("should load proof data if files exist", async () => {
            // First save proof data
            const proofData = {
                proof: {
                    pi_a: ["1", "2"],
                    pi_b: [["3", "4"], ["5", "6"]],
                    pi_c: ["7", "8"],
                },
                publicSignals: ["100", "200"],
                R: "42",
                circuitInputs: { blockHash: "123" },
            };

            const saveResult = await orchestrator.saveProofData(proofData, buildDir);
            const loadResult = orchestrator.loadProofData(
                saveResult.files.proof,
                saveResult.files.publicSignals
            );
            expect(loadResult.success).toBe(true);
            expect(loadResult.proof).toBeDefined();
            expect(loadResult.publicSignals).toBeDefined();
        });
    });

    // ===== VERIFY PROOF TESTS =====
    describe("verifyRandomProof()", () => {
        it("should handle verification without initialization", async () => {
            const proof = { pi_a: ["1"], pi_b: [["2"], ["3"]], pi_c: ["4"] };
            const publicSignals = ["100"];

            const result = await orchestrator.verifyRandomProof(proof, publicSignals);
            expect(result).toHaveProperty("isValid");
            expect(typeof result.isValid).toBe("boolean");
            expect(result.isValid).toBe(false);
        }, 30000);

        it("should return error for invalid proof format", async () => {
            const result = await orchestrator.verifyRandomProof(null, null);
            expect(result).toHaveProperty("isValid");
            expect(result).toHaveProperty("error");
            expect(result.isValid).toBe(false);
        }, 30000);
    });

    // ===== GENERATE RANDOM PROOF TESTS =====
    describe("generateRandomProof()", () => {
        it("should handle missing artifacts gracefully", async () => {
            const inputs = {
                blockHash: "12345",
                userNonce: "67890",
                kurierEntropy: "54321",
                N: "1000",
            };

            const result = await orchestrator.generateRandomProof(inputs);
            expect(result).toHaveProperty("success");
            expect(typeof result.success).toBe("boolean");
            expect(result.success).toBe(true);
        }, 60000);

        it("should accept setupOptions", async () => {
            const inputs = {
                blockHash: "12345",
                userNonce: "67890",
                kurierEntropy: "54321",
                N: "1000",
            };
            const options = { power: 12 };

            const result = await orchestrator.generateRandomProof(inputs, options);
            expect(result).toHaveProperty("success");
            expect(result.success).toBe(true);
        }, 60000);
    });

    // ===== INTEGRATION TESTS =====
    describe("Integration Tests", () => {

        it("should work with multiple orchestrator instances", () => {
            const orch1 = new RandomCircuitOrchestrator({ circuitName: "random" });
            const orch2 = new RandomCircuitOrchestrator({ circuitName: "custom" });

            const val1 = orch1.validateBuildArtifacts();
            const val2 = orch2.validateBuildArtifacts();

            expect(val1).toBeDefined();
            expect(val2).toBeDefined();
        });
    });
});
