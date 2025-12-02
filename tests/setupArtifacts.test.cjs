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

describe("SetupArtifacts Module - Complete Function Coverage", () => {
    afterEach(() => {
        // Clean up build directory after all tests
        if (fs.existsSync(buildDir)) {
            fs.rmSync(buildDir, { recursive: true });
        }
    });

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
        it("should compile circuit with default name", async () => {
            const circuitPath = path.join(circuitDir, "random.circom");

            const result = await compileCircuit("random", circuitPath);
            expect(result).toHaveProperty("r1csPath");
            expect(result).toHaveProperty("wasmPath");
            expect(typeof result.r1csPath).toBe("string");
            expect(typeof result.wasmPath).toBe("string");
            expect(fs.existsSync(result.r1csPath)).toBe(true);
            expect(fs.existsSync(result.wasmPath)).toBe(true);
        }, 120000);

        it("should throw error if circuit file not found", async () => {
            await expect(
                compileCircuit("nonexistent", "/nonexistent/path.circom")
            ).rejects.toThrow();
        });

        it("should use default circuit path if not provided", async () => {
            const result = await compileCircuit("random");
            expect(result).toHaveProperty("r1csPath");
            expect(result).toHaveProperty("wasmPath");
            expect(typeof result.r1csPath).toBe("string");
            expect(typeof result.wasmPath).toBe("string");
            expect(fs.existsSync(result.r1csPath)).toBe(true);
            expect(fs.existsSync(result.wasmPath)).toBe(true);
        }, 120000);
    });

    // ===== ENSURE PTAU FILE TESTS =====
    describe("ensurePtauFile()", () => {
        it("should return path to ptau file if it exists", async () => {
            const ptauPath = await ensurePtauFile(12, "pot12_final.ptau");
            expect(typeof ptauPath).toBe("string");
            expect(ptauPath).toContain("pot12_final.ptau");
            expect(fs.existsSync(ptauPath)).toBe(true);
        }, 120000);

        it("should use default power of 12", async () => {
            const ptauPath = await ensurePtauFile();
            expect(ptauPath).toContain("pot12_final.ptau");
            expect(fs.existsSync(ptauPath)).toBe(true);
        }, 120000);

        it("should use custom power value", async () => {
            const ptauPath = await ensurePtauFile(11, "pot11_final.ptau");
            expect(ptauPath).toContain("pot11_final.ptau");
            expect(fs.existsSync(ptauPath)).toBe(true);
        }, 120000);

        it("should create ptau file in root directory", async () => {
            const ptauPath = await ensurePtauFile();
            expect(ptauPath).toContain(rootDir);
            expect(fs.existsSync(ptauPath)).toBe(true);
        }, 120000);

        it("should return absolute path", async () => {
            const ptauPath = await ensurePtauFile();
            expect(path.isAbsolute(ptauPath)).toBe(true);
            expect(fs.existsSync(ptauPath)).toBe(true);
        }, 120000);
    });

    // ===== SETUP GROTH16 TESTS =====
    describe("setupGroth16()", () => {
        beforeEach(async () => {
            await completeSetup();
        });

        it("should throw error if R1CS file not found", async () => {
            await expect(
                setupGroth16("/nonexistent/random.r1cs", "pot12_final.ptau", "random_final.zkey")
            ).rejects.toThrow("R1CS file not found");
        });

        it("should throw error if PTAU file not found", async () => {
            const r1csPath = path.join(buildDir, "random.r1cs");
            await expect(
                setupGroth16(r1csPath, "/nonexistent/pot12_final.ptau", "random_final.zkey")
            ).rejects.toThrow("PTAU file not found");
        });

        it("should generate zkey file if both inputs exist", async () => {
            const r1csPath = path.join(buildDir, "random.r1cs");
            const ptauPath = path.join(rootDir, "pot12_final.ptau");
            const zkeyPath = path.join(buildDir, "random_final.zkey");

            const result = await setupGroth16(r1csPath, ptauPath, zkeyPath);
            expect(result).toBe(zkeyPath);
            expect(result).toContain("random_final.zkey");
            expect(fs.existsSync(result)).toBe(true);
        }, 120000);
    });

    // ===== EXPORT VERIFICATION KEY TESTS =====
    describe("exportVerificationKey()", () => {
        it("should throw error if zkey file not found", async () => {
            await expect(
                exportVerificationKey("/nonexistent/random_final.zkey", "verification_key.json")
            ).rejects.toThrow();
        });

        it("should export verification key if zkey exists", async () => {
            await completeSetup();
            const zkeyPath = path.join(buildDir, "random_final.zkey");
            const vkeyPath = path.join(buildDir, "test_vkey.json");

            // Vkey exported correctly
            const vkey = await exportVerificationKey(zkeyPath, vkeyPath);
            expect(vkey).toBeDefined();
            expect(typeof vkey).toBe("object");
            expect(vkey).toHaveProperty("protocol");
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
        it("should execute complete setup workflow", async () => {
            const result = await completeSetup("random", {
                circuitPath: path.join(circuitDir, "random.circom"),
                power: 12,
            });
            expect(result).toBeDefined();
            expect(result).toHaveProperty("r1csPath");
            expect(fs.existsSync(result.r1csPath)).toBe(true);
            expect(result).toHaveProperty("wasmPath");
            expect(fs.existsSync(result.wasmPath)).toBe(true);
            expect(result).toHaveProperty("ptauPath");
            expect(fs.existsSync(result.ptauPath)).toBe(true);
            expect(result).toHaveProperty("zkeyPath");
            expect(fs.existsSync(result.zkeyPath)).toBe(true);
            expect(result).toHaveProperty("vkeyPath");
            expect(fs.existsSync(result.vkeyPath)).toBe(true);

        }, 300000);

        it("should accept custom power value", async () => {
            const result = await completeSetup("random", {
                power: 11,
                ptauName: "pot11_final.ptau",
            });

            expect(result.ptauPath).toContain("pot11");
        }, 300000);

        it("should use default options if not provided", async () => {
            const result = await completeSetup("random");
            expect(result).toBeDefined();
            expect(result).toHaveProperty("r1csPath");
            expect(fs.existsSync(result.r1csPath)).toBe(true);
            expect(result).toHaveProperty("wasmPath");
            expect(fs.existsSync(result.wasmPath)).toBe(true);
            expect(result).toHaveProperty("ptauPath");
            expect(fs.existsSync(result.ptauPath)).toBe(true);
            expect(result).toHaveProperty("zkeyPath");
            expect(fs.existsSync(result.zkeyPath)).toBe(true);
            expect(result).toHaveProperty("vkeyPath");
            expect(fs.existsSync(result.vkeyPath)).toBe(true);
        }, 300000);

        it("should generate artifacts in build directory", async () => {
            const result = await completeSetup("random");
            expect(result.r1csPath).toContain("build");
            expect(result.wasmPath).toContain("build");
            expect(result.zkeyPath).toContain("build");
            expect(result.vkeyPath).toContain("build");

        }, 300000);
    });
});
