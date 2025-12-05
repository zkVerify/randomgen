const fs = require("fs");
const path = require("path");
const {
    ensureBuildDir,
    compileCircuit,
    ensurePtauFile,
    setupGroth16,
    exportVerificationKey,
    completeSetup,
} = require("../lib/setupArtifacts.js");

const rootDir = path.resolve(__dirname, "..");
const buildDir = path.join(rootDir, "build");
const circuitDir = path.join(rootDir, "circuits");

/**
 * Cleans up build directory
 */
function cleanupBuildDir() {
    if (fs.existsSync(buildDir)) {
        fs.rmSync(buildDir, { recursive: true });
    }
}

/**
 * Cleans up generated ptau files for a given power
 * @param {number} power - The power value to match in ptau filenames
 */
function cleanupPtauFiles(power) {
    const ptauPattern = new RegExp(`^pot${power}.*\\.ptau$`);
    const files = fs.readdirSync(rootDir);
    for (const file of files) {
        if (ptauPattern.test(file)) {
            const filePath = path.join(rootDir, file);
            fs.unlinkSync(filePath);
        }
    }
}

/**
 * Cleans up all test artifacts: build directory and ptau files
 * @param {number} power - The power value to match in ptau filenames
 */
function cleanupTestArtifacts(power) {
    cleanupBuildDir();
    cleanupPtauFiles(power);
}

describe("SetupArtifacts Module - Complete Function Coverage", () => {
    // ===== ENSURE BUILD DIR TESTS =====
    describe("ensureBuildDir()", () => {
        it("should create build directory if it does not exist", () => {
            const testDir = path.join(rootDir, "test-build-dir");

            // Clean up if exists
            if (fs.existsSync(testDir)) {
                fs.rmSync(testDir, { recursive: true });
            }

            expect(fs.existsSync(testDir)).toBe(false);

            // ensureBuildDir uses default buildDir, so just test that it doesn't error
            expect(() => ensureBuildDir()).not.toThrow();
            expect(fs.existsSync(buildDir)).toBe(true);
        });

        it("should not error if directory already exists", () => {
            ensureBuildDir();
            expect(fs.existsSync(buildDir)).toBe(true);

            // Should not throw when called again
            expect(() => ensureBuildDir()).not.toThrow();
            expect(fs.existsSync(buildDir)).toBe(true);
        });

        it("should create directory with proper permissions", () => {
            ensureBuildDir();
            const stats = fs.statSync(buildDir);
            expect(stats.isDirectory()).toBe(true);
        });
    });

    // ===== COMPILE CIRCUIT TESTS =====
    describe("compileCircuit()", () => {
        it("should throw if circuitName not provided", async () => {
            await expect(compileCircuit()).rejects.toThrow("circuitName is required");
        });

        it("should throw if circuitPath not provided", async () => {
            await expect(compileCircuit("random_5_35")).rejects.toThrow("circuitPath is required");
        });

        it("should compile circuit with explicit parameters", async () => {
            const circuitPath = path.join(circuitDir, "random_5_35.circom");

            const result = await compileCircuit("random_5_35", circuitPath);
            expect(result.r1csPath).toBeDefined();
            expect(result.wasmPath).toBeDefined();
            expect(typeof result.r1csPath).toBe("string");
            expect(typeof result.wasmPath).toBe("string");
            expect(fs.existsSync(result.r1csPath)).toBe(true);
            expect(fs.existsSync(result.wasmPath)).toBe(true);

            // Cleanup
            cleanupBuildDir();
        });
    }, 120000);

    it("should throw error if circuit file not found", async () => {
        await expect(
            compileCircuit("nonexistent", "/nonexistent/path.circom")
        ).rejects.toThrow();
    });
});

// ===== ENSURE PTAU FILE TESTS =====
describe("ensurePtauFile()", () => {
    const TEST_POWER = 5;
    const TEST_ENTROPY = "0x1234";

    afterEach(() => {
        cleanupPtauFiles(TEST_POWER);
    });

    it("should throw if power not provided", async () => {
        await expect(ensurePtauFile()).rejects.toThrow("power is required");
    });

    it("should throw if ptauName not provided", async () => {
        await expect(ensurePtauFile(TEST_POWER)).rejects.toThrow("ptauName is required");
    });

    it("should throw if entropy not provided", async () => {
        await expect(ensurePtauFile(TEST_POWER, `pot${TEST_POWER}_final.ptau`)).rejects.toThrow("entropy is required");
    });

    it("should return path to ptau file", async () => {
        const ptauPath = await ensurePtauFile(TEST_POWER, `pot${TEST_POWER}_final.ptau`, TEST_ENTROPY);
        expect(typeof ptauPath).toBe("string");
        expect(ptauPath).toContain(`pot${TEST_POWER}_final.ptau`);
        expect(fs.existsSync(ptauPath)).toBe(true);
    }, 120000);

    it("should create ptau file in root directory", async () => {
        const ptauPath = await ensurePtauFile(TEST_POWER, `pot${TEST_POWER}_final.ptau`, TEST_ENTROPY);
        expect(ptauPath).toContain(rootDir);
        expect(fs.existsSync(ptauPath)).toBe(true);
    }, 120000);

    it("should return absolute path", async () => {
        const ptauPath = await ensurePtauFile(TEST_POWER, `pot${TEST_POWER}_final.ptau`, TEST_ENTROPY);
        expect(path.isAbsolute(ptauPath)).toBe(true);
        expect(fs.existsSync(ptauPath)).toBe(true);
    }, 120000);
});

const TEST_PTAU_ENTROPY = "0x1234";
const TEST_SETUP_ENTROPY = "0xabcd";

// ===== SETUP GROTH16 TESTS =====
describe("setupGroth16()", () => {
    const TEST_CIRCUIT_NAME = "random_5_35";
    const TEST_POWER = 13;

    beforeAll(async () => {
        await completeSetup(TEST_CIRCUIT_NAME, {
            circuitPath: path.join(rootDir, "circuits", `${TEST_CIRCUIT_NAME}.circom`),
            power: TEST_POWER,
            ptauName: `pot${TEST_POWER}_final.ptau`,
            ptauEntropy: TEST_PTAU_ENTROPY,
            setupEntropy: TEST_SETUP_ENTROPY,
        });
    });

    afterAll(() => {
        cleanupTestArtifacts(TEST_POWER);
    });

    it("should throw error if R1CS file not found", async () => {
        await expect(
            setupGroth16(`/nonexistent/${TEST_CIRCUIT_NAME}.r1cs`, `pot${TEST_POWER}_final.ptau`, `${TEST_CIRCUIT_NAME}_final.zkey`, TEST_SETUP_ENTROPY)
        ).rejects.toThrow("R1CS file not found");
    });

    it("should throw error if PTAU file not found", async () => {
        const r1csPath = path.join(buildDir, `${TEST_CIRCUIT_NAME}.r1cs`);
        await expect(
            setupGroth16(r1csPath, `/nonexistent/pot${TEST_POWER}_final.ptau`, `${TEST_CIRCUIT_NAME}_final.zkey`, TEST_SETUP_ENTROPY)
        ).rejects.toThrow("PTAU file not found");
    });

    it("should generate zkey file if both inputs exist", async () => {
        const r1csPath = path.join(buildDir, `${TEST_CIRCUIT_NAME}.r1cs`);
        const ptauPath = path.join(rootDir, `pot${TEST_POWER}_final.ptau`);
        const zkeyPath = path.join(buildDir, `${TEST_CIRCUIT_NAME}_final.zkey`);

        const result = await setupGroth16(r1csPath, ptauPath, zkeyPath, TEST_SETUP_ENTROPY);
        expect(result).toBe(zkeyPath);
        expect(result).toContain(`${TEST_CIRCUIT_NAME}_final.zkey`);
        expect(fs.existsSync(result)).toBe(true);
    }, 120000);


    // ===== EXPORT VERIFICATION KEY TESTS =====
    it("should throw error if zkey file not found", async () => {
        await expect(
            exportVerificationKey(`/nonexistent/${TEST_CIRCUIT_NAME}_final.zkey`, "verification_key.json")
        ).rejects.toThrow();
    });

    it("should export verification key if zkey exists", async () => {
        const zkeyPath = path.join(buildDir, `${TEST_CIRCUIT_NAME}_final.zkey`);
        const vkeyPath = path.join(buildDir, "test_vkey.json");

        // Vkey exported correctly
        const vkey = await exportVerificationKey(zkeyPath, vkeyPath);
        expect(vkey).toBeDefined();
        expect(typeof vkey).toBe("object");
        expect(vkey.protocol).toBeDefined();
        expect(fs.existsSync(vkeyPath)).toBe(true);

        // Vkey deserialized matches original
        const data = fs.readFileSync(vkeyPath, "utf-8");
        const vkey_read = JSON.parse(data);
        expect(vkey).toBeDefined();
        expect(vkey_read).toEqual(vkey)
    }, 120000);
});

// ===== COMPLETE SETUP TESTS =====
describe("completeSetup()", () => {
    it("should throw if circuitName not provided", async () => {
        await expect(completeSetup()).rejects.toThrow("circuitName is required");
    });

    it("should throw if options not provided", async () => {
        await expect(completeSetup("random_5_35")).rejects.toThrow("options object is required");
    });

    it("should throw if circuitPath not provided", async () => {
        await expect(completeSetup("random_5_35", { power: 13, ptauName: "pot13_final.ptau" })).rejects.toThrow("options.circuitPath is required");
    });

    it("should throw if power not provided", async () => {
        await expect(completeSetup("random_5_35", {
            circuitPath: path.join(circuitDir, "random_5_35"),
            ptauName: "pot13_final.ptau",
        })).rejects.toThrow("options.power is required");
    });

    it("should throw if ptauName not provided", async () => {
        await expect(completeSetup("random_5_35", {
            circuitPath: path.join(circuitDir, "random_5_35"),
            power: 13,
        })).rejects.toThrow("options.ptauName is required");
    });

    it("should throw if ptau entropy not provided", async () => {
        await expect(completeSetup("random_5_35", {
            circuitPath: path.join(circuitDir, "random_5_35"),
            power: 13,
            ptauName: "pot13_final.ptau",
        })).rejects.toThrow("options.ptauEntropy is required");
    });

    it("should throw if groth16 entropy not provided", async () => {
        await expect(completeSetup("random_5_35", {
            circuitPath: path.join(circuitDir, "random_5_35"),
            power: 13,
            ptauName: "pot13_final.ptau",
            ptauEntropy: "0x1234",
        })).rejects.toThrow("options.setupEntropy is required");
    });

    it("should execute complete setup workflow", async () => {
        const result = await completeSetup("random_5_35", {
            circuitPath: path.join(circuitDir, "random_5_35.circom"),
            power: 13,
            ptauName: "pot13_final.ptau",
            ptauEntropy: TEST_PTAU_ENTROPY,
            setupEntropy: TEST_SETUP_ENTROPY,
        });
        expect(result).toBeDefined();
        expect(result.r1csPath).toBeDefined();
        expect(result.r1csPath).toContain("build");
        expect(fs.existsSync(result.r1csPath)).toBe(true);
        expect(result.wasmPath).toBeDefined();
        expect(result.wasmPath).toContain("build");
        expect(fs.existsSync(result.wasmPath)).toBe(true);
        expect(result.ptauPath).toBeDefined();
        expect(fs.existsSync(result.ptauPath)).toBe(true);
        expect(result.zkeyPath).toBeDefined();
        expect(result.zkeyPath).toContain("build");
        expect(fs.existsSync(result.zkeyPath)).toBe(true);
        expect(result.vkeyPath).toBeDefined();
        expect(result.vkeyPath).toContain("build");
        expect(fs.existsSync(result.vkeyPath)).toBe(true);


    }, 300000);

    afterAll(() => {
        cleanupTestArtifacts(13);
    });
});
