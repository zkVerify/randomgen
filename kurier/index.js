import axios from "axios";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const API_URL =
  process.env.API_URL || "https://relayer-api-testnet.horizenlabs.io/api/v1";
const API_KEY = process.env.API_KEY || process.env.RELAYER_API_KEY;
const chainIdRaw = process.env.CHAIN_ID;
const CHAIN_ID =
  chainIdRaw === undefined || chainIdRaw === "" ? null : Number(chainIdRaw);

if (!API_KEY) {
  throw new Error(
    "API_KEY (or RELAYER_API_KEY) not found. Set it in kurier/.env"
  );
}

const rootDir = path.resolve(process.cwd(), "..");
const buildDir = path.join(rootDir, "build");
const proofPath = path.join(buildDir, "proof.json");
const publicPath = path.join(buildDir, "public.json");
const vkPath = path.join(buildDir, "verification_key.json");
const cachedVkPath = path.join(process.cwd(), "circom-vkey.json");

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required file missing: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

async function registerVerificationKey() {
  if (fs.existsSync(cachedVkPath)) {
    return readJson(cachedVkPath);
  }

  const vk = readJson(vkPath);

  const payload = {
    proofType: "groth16",
    proofOptions: {
      library: "snarkjs",
      curve: "bn128",
    },
    vk,
  };

  const { data } = await axios.post(
    `${API_URL}/register-vk/${API_KEY}`,
    payload
  );

  fs.writeFileSync(cachedVkPath, JSON.stringify(data, null, 2));
  return data;
}

async function submitProof(vkMeta) {
  const proof = readJson(proofPath);
  const publicInputs = readJson(publicPath);
  const vkHash = vkMeta.vkHash || vkMeta.meta?.vkHash;

  if (!vkHash) {
    throw new Error("vkHash missing from cached VK response");
  }

  const payload = {
    proofType: "groth16",
    vkRegistered: true,
    ...(CHAIN_ID !== null && { chainId: CHAIN_ID }),
    proofOptions: {
      library: "snarkjs",
      curve: "bn128",
    },
    proofData: {
      proof,
      publicSignals: publicInputs,
      vk: vkHash,
    },
  };

  const { data } = await axios.post(
    `${API_URL}/submit-proof/${API_KEY}`,
    payload
  );
  return data;
}

async function waitForFinalization(jobId) {
  let attempts = 0;

  while (attempts < 20) {
    const { data } = await axios.get(
      `${API_URL}/job-status/${API_KEY}/${jobId}`
    );

    console.log(`Job status: ${data.status}`);

    if (data.status === "Finalized" || data.status === "Aggregated") {
      return data;
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
    attempts += 1;
  }

  throw new Error("Job did not finalize within the expected time");
}

async function main() {
  try {
    console.log("Registering verification key (if needed)...");
    const vkMeta = await registerVerificationKey();
    console.log("VK hash:", vkMeta.vkHash || vkMeta.meta?.vkHash);

    console.log("Submitting proof...");
    const submission = await submitProof(vkMeta);
    console.log("Submission response:", submission);

    if (submission.optimisticVerify !== "success") {
      throw new Error("Optimistic verification failed");
    }

    console.log("Waiting for job to finalize on zkVerify...");
    const finalStatus = await waitForFinalization(submission.jobId);
    console.log("Final job status:", finalStatus);
  } catch (error) {
    if (error.response?.data) {
      console.error("Relayer API error:", error.response.data);
    } else {
      console.error("Relayer client error:", error.message);
    }
    process.exit(1);
  }
}

main();

