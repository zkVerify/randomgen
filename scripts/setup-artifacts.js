#!/usr/bin/env node

import { completeSetup } from "./lib/setupArtifacts.js";

/**
 * CLI script to generate all circuit artifacts
 * Usage: node scripts/setup-artifacts.js [circuitName] [power]
 */
async function main() {
    const args = process.argv.slice(2);
    const circuitName = args[0] || "random";
    const power = parseInt(args[1]) || 12;

    console.log(`
╔════════════════════════════════════════╗
║   ZK Circuit Artifact Generator        ║
╚════════════════════════════════════════╝
`);

    try {
        await completeSetup(circuitName, { power });
        console.log("✓ All artifacts generated successfully!");
        process.exit(0);
    } catch (error) {
        console.error("✗ Setup failed:", error.message);
        process.exit(1);
    }
}

main();
