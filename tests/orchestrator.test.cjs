const fs = require("fs");
const path = require("path");
const {
    RandomCircuitOrchestrator,
    computeLocalRandomNumbers,
} = require("../lib/orchestrator.js");

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
const NUM_OUTPUTS = 5;
const MAX_OUTPUT_VAL = 35;
const TEST_POWER = 13;
const TEST_CIRCUIT_NAME = "random_5_35";

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
            expect(orch.circuitName).toBe("random_5_35");
            expect(orch.numOutputs).toBe(5);
            expect(orch.maxOutputVal).toBe(35);
            expect(orch.power).toBe(13);
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

        it("should create orchestrator with custom maxOutputVal", () => {
            const orch = new RandomCircuitOrchestrator({
                maxOutputVal: 45,
            });
            expect(orch.maxOutputVal).toBe(45);
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
                circuitName: "random_3_50",
            });
            expect(orch.circuitPath).toContain("random_3_50");
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
                numOutputs: NUM_OUTPUTS,
                maxOutputVal: MAX_OUTPUT_VAL,
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
                maxOutputVal: MAX_OUTPUT_VAL,
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

    // ===== COMPUTE LOCAL RANDOM NUMBERS TESTS =====
    describe("computeLocalRandomNumbers()", () => {
        it("should compute local random numbers with default maxOutputVal", async () => {
            const inputs = {
                blockHash: 100,
                userNonce: 200,
            };
            const result = await computeLocalRandomNumbers(inputs, NUM_OUTPUTS);
            expect(result.seed).toBeDefined();
            expect(result.randomNumbers).toBeDefined();
            expect(Array.isArray(result.randomNumbers)).toBe(true);
            expect(result.randomNumbers.length).toBe(NUM_OUTPUTS);
        });

        it("should compute local random numbers with custom maxOutputVal", async () => {
            const inputs = {
                blockHash: 100,
                userNonce: 200,
            };
            const result = await computeLocalRandomNumbers(inputs, NUM_OUTPUTS, 30);
            expect(result.randomNumbers.length).toBe(NUM_OUTPUTS);
            for (const r of result.randomNumbers) {
                expect(r).toBeGreaterThanOrEqual(1);
                expect(r).toBeLessThanOrEqual(30);
            }
        });

        it("should produce unique values (permutation guarantee)", async () => {
            const inputs = {
                blockHash: 50,
                userNonce: 100,
            };
            const result = await computeLocalRandomNumbers(inputs, 10, MAX_OUTPUT_VAL);
            const unique = new Set(result.randomNumbers);
            expect(unique.size).toBe(10);
        });

        it("should produce consistent results for same inputs", async () => {
            const inputs = {
                blockHash: 111,
                userNonce: 222,
            };
            const result1 = await computeLocalRandomNumbers(inputs, NUM_OUTPUTS);
            const result2 = await computeLocalRandomNumbers(inputs, NUM_OUTPUTS);
            expect(result1.seed).toEqual(result2.seed);
            expect(result1.randomNumbers).toEqual(result2.randomNumbers);
        });

        it("should produce different results for different inputs", async () => {
            const inputs1 = {
                blockHash: 111,
                userNonce: 222,
            };
            const inputs2 = {
                blockHash: 111,
                userNonce: 223,
            };
            const result1 = await computeLocalRandomNumbers(inputs1, NUM_OUTPUTS);
            const result2 = await computeLocalRandomNumbers(inputs2, NUM_OUTPUTS);
            // Seeds and at least some outputs should differ
            expect(result1.seed).not.toEqual(result2.seed);
        });

        it("should throw if numOutputs > maxOutputVal", async () => {
            const inputs = { blockHash: 100, userNonce: 200 };
            await expect(computeLocalRandomNumbers(inputs, 60, 50)).rejects.toThrow("numOutputs must be <= maxOutputVal");
        });

        it("should throw if numOutputs is not provided", async () => {
            const inputs = { blockHash: 100, userNonce: 200 };
            await expect(computeLocalRandomNumbers(inputs)).rejects.toThrow("numOutputs is required");
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
                publicSignals: ["5", "23", "41"],
                randomNumbers: ["5", "23", "41"],
                circuitInputs: {
                    blockHash: "123",
                    userNonce: "456",
                },
            };

            const files = await orchestrator.saveProofData(proofData, buildDir);
            expect(files).toBeDefined();
            expect(files.proof).toBeDefined();
            expect(files.publicSignals).toBeDefined();
            expect(files.randomNumbers).toBeDefined();

            expect(fs.existsSync(files.proof)).toBe(true);
            expect(fs.existsSync(files.publicSignals)).toBe(true);
            expect(fs.existsSync(files.randomNumbers)).toBe(true);
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
        let orchestrator;

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
                publicSignals: ["5", "23", "41"],
                randomNumbers: ["5", "23", "41"],
                circuitInputs: { blockHash: "123", userNonce: "456" },
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
        let orchestrator;

        beforeAll(async () => {
            orchestrator = new RandomCircuitOrchestrator({
                circuitName: TEST_CIRCUIT_NAME,
                numOutputs: NUM_OUTPUTS,
                maxOutputVal: MAX_OUTPUT_VAL,
                power: TEST_POWER,
            });
            await orchestrator.initialize();
        }, 120000);

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
        it("should generate proof successfully with randomNumbers as array", async () => {
            const inputs = {
                blockHash: "12345",
                userNonce: "67890",
            };

            const orchestrator = new RandomCircuitOrchestrator({
                circuitName: TEST_CIRCUIT_NAME,
                numOutputs: NUM_OUTPUTS,
                maxOutputVal: MAX_OUTPUT_VAL,
                power: TEST_POWER,
            });

            const result = await orchestrator.generateRandomProof(inputs);
            expect(result.proof).toBeDefined();
            expect(result.publicSignals).toBeDefined();
            expect(result.randomNumbers).toBeDefined();
            expect(result.circuitInputs).toBeDefined();

            // randomNumbers should be an array with NUM_OUTPUTS elements
            expect(Array.isArray(result.randomNumbers)).toBe(true);
            expect(result.randomNumbers.length).toBe(NUM_OUTPUTS);

            // All random numbers should be in range [1, maxOutputVal]
            for (const r of result.randomNumbers) {
                expect(BigInt(r)).toBeGreaterThanOrEqual(1n);
                expect(BigInt(r)).toBeLessThanOrEqual(BigInt(MAX_OUTPUT_VAL));
            }

            // All random numbers should be unique (permutation guarantee)
            const unique = new Set(result.randomNumbers);
            expect(unique.size).toBe(NUM_OUTPUTS);

            cleanupTestArtifacts();
        }, 120000);
    });

    // ===== INTEGRATION TESTS =====
    describe("Integration Tests", () => {

        it("should work with multiple orchestrator instances", () => {
            const orch1 = new RandomCircuitOrchestrator({ circuitName: "random_6_50" });
            const orch2 = new RandomCircuitOrchestrator({ circuitName: "custom" });

            const val1 = orch1.validateBuildArtifacts();
            const val2 = orch2.validateBuildArtifacts();

            expect(val1).toBeDefined();
            expect(val2).toBeDefined();
        });

        it("should match circuit output with local computation", async () => {
            const orchestrator = new RandomCircuitOrchestrator({
                circuitName: TEST_CIRCUIT_NAME,
                numOutputs: NUM_OUTPUTS,
                maxOutputVal: MAX_OUTPUT_VAL,
                power: TEST_POWER,
            });

            const inputs = {
                blockHash: "99999",
                userNonce: "88888",
            };

            const circuitResult = await orchestrator.generateRandomProof(inputs);
            const localResult = await computeLocalRandomNumbers(inputs, NUM_OUTPUTS, MAX_OUTPUT_VAL);

            // Circuit and local computation should match
            for (let i = 0; i < NUM_OUTPUTS; i++) {
                expect(circuitResult.randomNumbers[i]).toEqual(localResult.randomNumbers[i].toString());
            }

            cleanupTestArtifacts();
        }, 120000);
    });
});
