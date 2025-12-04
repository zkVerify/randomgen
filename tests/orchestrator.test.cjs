const fs = require("fs");
const path = require("path");
const {
    RandomCircuitOrchestrator,
    computeLocalHash,
} = require("../lib/orchestrator.js");

const rootDir = path.resolve(__dirname, "..");
const buildDir = path.join(rootDir, "build");

// =============================================================================
// TEST CIRCUIT CONFIGURATION
// =============================================================================
// Tests use random_3.circom which is configured with:
//   - numOutputs = 3 (smaller for faster tests)
//   - power = 13 (ptau file size)
// 
// The production circuit (random.circom) uses:
//   - numOutputs = 15 (library default)
//   - power = 15 (ptau file size)
// =============================================================================
const NUM_OUTPUTS = 3;
const TEST_POWER = 13;
const TEST_CIRCUIT_NAME = "random_3";

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

describe("Orchestrator Module - Complete Function Coverage", () => {

    // ===== CONSTRUCTOR TESTS =====
    describe("RandomCircuitOrchestrator - Constructor", () => {
        it("should create orchestrator with default options", () => {
            const orch = new RandomCircuitOrchestrator();
            expect(orch.circuitName).toBe("random_15");
            expect(orch.numOutputs).toBe(15);
            expect(orch.power).toBe(15);
            expect(orch.vkey).toBeNull();
            expect(orch.ptauEntropy).toContain("random-entropy-ptau-");
            expect(orch.setupEntropy).toContain("random-entropy-setup-");
            expect(orch.buildDir).toContain("build");
            expect(orch.initialized).toBe(false);
        });

        it("should create orchestrator with custom circuit name", () => {
            const orch = new RandomCircuitOrchestrator({
                circuitName: "custom",
            });
            expect(orch.circuitName).toBe("custom");
        });

        it("should create orchestrator with custom numOutputs", () => {
            const orch = new RandomCircuitOrchestrator({
                numOutputs: 5,
            });
            expect(orch.numOutputs).toBe(5);
        });

        it("should create orchestrator with custom power", () => {
            const orch = new RandomCircuitOrchestrator({
                power: 12,
            });
            expect(orch.power).toBe(12);
            expect(orch.ptauName).toBe("pot12_final.ptau");
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

        it("should compute circuitPath from circuitDir and circuitName", () => {
            const orch = new RandomCircuitOrchestrator({
                circuitName: "random_3",
            });
            expect(orch.circuitPath).toContain("random_3");
        });

        it("should set default ptauEntropy with timestamp", () => {
            const orch = new RandomCircuitOrchestrator();
            expect(orch.ptauEntropy).toContain("random-entropy-ptau-");
        });

        it("should set default setupEntropy with timestamp", () => {
            const orch = new RandomCircuitOrchestrator();
            expect(orch.setupEntropy).toContain("random-entropy-setup-");
        });

        it("should allow custom ptauEntropy", () => {
            const orch = new RandomCircuitOrchestrator({
                ptauEntropy: "custom-ptau-entropy",
            });
            expect(orch.ptauEntropy).toBe("custom-ptau-entropy");
        });

        it("should allow custom setupEntropy", () => {
            const orch = new RandomCircuitOrchestrator({
                setupEntropy: "custom-setup-entropy",
            });
            expect(orch.setupEntropy).toBe("custom-setup-entropy");
        });
    });

    // ===== VALIDATE BUILD ARTIFACTS TESTS =====
    describe("validateBuildArtifacts()", () => {
        let orchestrator;

        beforeEach(() => {
            orchestrator = new RandomCircuitOrchestrator({
                circuitName: TEST_CIRCUIT_NAME,
                power: TEST_POWER,
            });
        });

        it("should return validation object with isValid and missingFiles properties", () => {
            const validation = orchestrator.validateBuildArtifacts();
            expect(validation.isValid).toBeDefined();
            expect(validation.missingFiles).toBeDefined();
            expect(typeof validation.isValid).toBe("boolean");
            expect(Array.isArray(validation.missingFiles)).toBe(true);
        });

        it("should identify missing R1CS file", () => {
            const validation = orchestrator.validateBuildArtifacts();
            const hasR1cs = validation.missingFiles.some(f => f.includes(".r1cs"));
            expect(hasR1cs).toBe(true);
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

            cleanupTestArtifacts();
        }, 120000);

        it("should work with custom circuit names", () => {
            const customOrch = new RandomCircuitOrchestrator({
                circuitName: "custom",
            });
            const validation = customOrch.validateBuildArtifacts();
            expect(validation.isValid).toBeDefined();
            expect(validation.missingFiles).toBeDefined();
        });
    });

    // ===== INITIALIZE TESTS =====
    describe("initialize()", () => {
        let orchestrator;

        beforeEach(() => {
            orchestrator = new RandomCircuitOrchestrator({
                circuitName: TEST_CIRCUIT_NAME,
                numOutputs: NUM_OUTPUTS,
                power: TEST_POWER,
            });
        });

        afterEach(() => {
            cleanupTestArtifacts();
        });

        it("should initialize orchestrator without error", async () => {
            await expect(orchestrator.initialize()).resolves.not.toThrow();
        }, 120000);

        it("should load verification key on successful initialization", async () => {
            const vkeyPath = path.join(buildDir, "verification_key.json");
            await orchestrator.initialize();
            expect(orchestrator.vkey).toBeDefined();
            expect(fs.existsSync(vkeyPath)).toBe(true);
        }, 120000);

        it("should set initialized flag after successful initialization", async () => {
            expect(orchestrator.initialized).toBe(false);
            await orchestrator.initialize();
            expect(orchestrator.initialized).toBe(true);
        }, 120000);
    });

    // ===== COMPUTE LOCAL HASH TESTS =====
    describe("computeLocalHash()", () => {
        it("should compute local hash with library defaults (15 outputs)", async () => {
            const inputs = {
                blockHash: 100,
                userNonce: 200,
                kurierEntropy: 300,
            };
            // Library default: 15 outputs for random.circom
            const LIBRARY_NUM_OUTPUTS = 15;
            const result = await computeLocalHash(inputs, LIBRARY_NUM_OUTPUTS);
            expect(result.hashes).toBeDefined();
            expect(result.R).toBeDefined();
            expect(Array.isArray(result.hashes)).toBe(true);
            expect(Array.isArray(result.R)).toBe(true);
            expect(result.hashes.length).toBe(LIBRARY_NUM_OUTPUTS);
            expect(result.R.length).toBe(LIBRARY_NUM_OUTPUTS);
        });

        it("should compute local hash with test circuit numOutputs (3)", async () => {
            const inputs = {
                blockHash: 100,
                userNonce: 200,
                kurierEntropy: 300,
            };
            const result = await computeLocalHash(inputs, NUM_OUTPUTS);
            expect(result.hashes.length).toBe(NUM_OUTPUTS);
            expect(result.R.length).toBe(NUM_OUTPUTS);
        });

        it("should compute local hash with custom N", async () => {
            const inputs = {
                blockHash: 100,
                userNonce: 200,
                kurierEntropy: 300,
                N: 2000n,
            };
            const result = await computeLocalHash(inputs, NUM_OUTPUTS);
            for (const r of result.R) {
                expect(BigInt(r)).toBeLessThan(BigInt(2000));
            }
        });

        it("should respect N parameter in all outputs", async () => {
            const inputs = {
                blockHash: 50,
                userNonce: 100,
                kurierEntropy: 150,
                N: 500n,
            };
            const result = await computeLocalHash(inputs, NUM_OUTPUTS);
            for (const r of result.R) {
                const R = BigInt(r);
                expect(R).toBeLessThan(BigInt(500));
                expect(R).toBeGreaterThanOrEqual(0n);
            }
        });

        it("should produce consistent results for same inputs", async () => {
            const inputs = {
                blockHash: 111,
                userNonce: 222,
                kurierEntropy: 333,
                N: 1000n,
            };
            const result1 = await computeLocalHash(inputs, NUM_OUTPUTS);
            const result2 = await computeLocalHash(inputs, NUM_OUTPUTS);
            expect(result1.hashes).toEqual(result2.hashes);
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
            const result1 = await computeLocalHash(inputs1, NUM_OUTPUTS);
            const result2 = await computeLocalHash(inputs2, NUM_OUTPUTS);
            // At least one hash should differ
            const allSame = result1.hashes.every((h, i) => h === result2.hashes[i]);
            expect(allSame).toBe(false);
        });

        it("should handle large N values", async () => {
            const nBigNum = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495616");
            const inputs = {
                blockHash: 999,
                userNonce: 888,
                kurierEntropy: 777,
                N: nBigNum,
            };
            const result = await computeLocalHash(inputs, NUM_OUTPUTS);
            for (const r of result.R) {
                expect(BigInt(r)).toBeGreaterThanOrEqual(0n);
                expect(BigInt(r)).toBeLessThan(nBigNum);
            }
        });
    });

    // ===== SAVE PROOF DATA TESTS =====
    describe("saveProofData()", () => {
        let orchestrator;

        beforeEach(() => {
            orchestrator = new RandomCircuitOrchestrator();
        });

        afterEach(() => {
            cleanupTestArtifacts();
        });

        it("should save proof data to files", async () => {
            const proofData = {
                proof: {
                    pi_a: ["1", "2"],
                    pi_b: [["3", "4"], ["5", "6"]],
                    pi_c: ["7", "8"],
                },
                publicSignals: ["100", "200", "300", "400", "500", "1000", "2000", "3000"],
                R: ["100", "200", "300", "400", "500"],
                circuitInputs: {
                    blockHash: "123",
                    userNonce: "456",
                },
            };

            const files = await orchestrator.saveProofData(proofData, buildDir);
            expect(files).toBeDefined();
            expect(files.proof).toBeDefined();
            expect(files.publicSignals).toBeDefined();
            expect(files.R).toBeDefined();

            expect(fs.existsSync(files.proof)).toBe(true);
            expect(fs.existsSync(files.publicSignals)).toBe(true);
            expect(fs.existsSync(files.R)).toBe(true);
        });

        it("should throw error for invalid input", async () => {
            const proofData = null;
            await expect(
                orchestrator.saveProofData(proofData, "/invalid/path")
            ).rejects.toThrow();
        });
    });

    // ===== LOAD PROOF DATA TESTS =====
    describe("loadProofData()", () => {
        beforeEach(() => {
            orchestrator = new RandomCircuitOrchestrator();
        });

        afterEach(() => {
            cleanupTestArtifacts();
        });

        it("should throw error if proof file does not exist", () => {
            expect(() => orchestrator.loadProofData(
                "/nonexistent/proof.json",
                "/nonexistent/public.json"
            )).toThrow();
        });

        it("should load proof data if files exist", async () => {
            // First save proof data
            const proofData = {
                proof: {
                    pi_a: ["1", "2"],
                    pi_b: [["3", "4"], ["5", "6"]],
                    pi_c: ["7", "8"],
                },
                publicSignals: ["100", "200", "300", "400", "500", "1000", "2000", "3000"],
                R: ["100", "200", "300", "400", "500"],
                circuitInputs: { blockHash: "123" },
            };

            const files = await orchestrator.saveProofData(proofData, buildDir);
            const loaded = orchestrator.loadProofData(
                files.proof,
                files.publicSignals
            );
            expect(loaded.proof).toBeDefined();
            expect(loaded.publicSignals).toBeDefined();
        });
    });

    // ===== VERIFY PROOF TESTS =====
    describe("verifyRandomProof()", () => {
        beforeAll(async () => {
            orchestrator = new RandomCircuitOrchestrator({
                circuitName: "random_3",
                numOutputs: NUM_OUTPUTS,
                power: TEST_POWER,
            });
            await orchestrator.initialize();
        });

        afterAll(() => {
            cleanupTestArtifacts();
        });

        it("should return false for invalid proof", async () => {
            const proof = { pi_a: ["1"], pi_b: [["2"], ["3"]], pi_c: ["4"] };
            const publicSignals = ["100"];

            await expect(
                orchestrator.verifyRandomProof(proof, publicSignals)
            ).rejects.toThrow();
        }, 120000);

        it("should throw error for null inputs", async () => {
            await expect(
                orchestrator.verifyRandomProof(null, null)
            ).rejects.toThrow();
        }, 120000);
    });

    //===== GENERATE RANDOM PROOF TESTS =====
    describe("generateRandomProof()", () => {
        it("should generate proof successfully with R as array", async () => {
            const inputs = {
                blockHash: "12345",
                userNonce: "67890",
                kurierEntropy: "54321",
                N: "1000",
            };

            const orchestrator = new RandomCircuitOrchestrator({
                circuitName: "random_3",
                numOutputs: NUM_OUTPUTS,
                power: TEST_POWER,
            });

            const result = await orchestrator.generateRandomProof(inputs);
            expect(result.proof).toBeDefined();
            expect(result.publicSignals).toBeDefined();
            expect(result.R).toBeDefined();
            expect(result.circuitInputs).toBeDefined();

            // R should be an array with NUM_OUTPUTS elements
            expect(Array.isArray(result.R)).toBe(true);
            expect(result.R.length).toBe(NUM_OUTPUTS);

            // All R values should be in range [0, N)
            for (const r of result.R) {
                expect(BigInt(r)).toBeGreaterThanOrEqual(0n);
                expect(BigInt(r)).toBeLessThan(1000n);
            }

            cleanupTestArtifacts();
        }, 120000);
    });

    // ===== INTEGRATION TESTS =====
    describe("Integration Tests", () => {

        it("should work with multiple orchestrator instances", () => {
            const orch1 = new RandomCircuitOrchestrator({ circuitName: "random_15" });
            const orch2 = new RandomCircuitOrchestrator({ circuitName: "custom" });

            const val1 = orch1.validateBuildArtifacts();
            const val2 = orch2.validateBuildArtifacts();

            expect(val1).toBeDefined();
            expect(val2).toBeDefined();
        });
    });
});
