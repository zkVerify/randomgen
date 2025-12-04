#!/usr/bin/env node
/**
 * Generates Circom circuit files for different numOutputs values.
 * 
 * Usage:
 *   node scripts/generate-circuits.js           # Generate all (1-15)
 *   node scripts/generate-circuits.js 5         # Generate only for numOutputs=5
 *   node scripts/generate-circuits.js 1 3 5 10  # Generate specific values
 */

const fs = require('fs');
const path = require('path');

const circuitsDir = path.join(__dirname, '..', 'circuits');

/**
 * Generate a circuit file for a specific numOutputs value
 * @param {number} numOutputs - Number of random outputs (1-15)
 */
function generateCircuit(numOutputs) {
  if (numOutputs < 1 || numOutputs > 15) {
    console.error(`Invalid numOutputs: ${numOutputs}. Must be between 1 and 15.`);
    return false;
  }

  const filename = numOutputs === 15
    ? 'random_15.circom'  // Default production circuit
    : `random_${numOutputs}.circom`;

  const filepath = path.join(circuitsDir, filename);

  const content = `pragma circom 2.0.0;

include "./random_template.circom";

// Circuit with ${numOutputs} random output${numOutputs > 1 ? 's' : ''}
component main {public [blockHash, userNonce, N]} = RandomCircuit(${numOutputs});
`;

  fs.writeFileSync(filepath, content);
  console.log(`Generated: ${filename} (numOutputs=${numOutputs})`);
  return true;
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  // Generate all circuits from 1 to 15
  console.log('Generating circuits for numOutputs 1-15...\n');
  for (let i = 1; i <= 15; i++) {
    generateCircuit(i);
  }
} else {
  // Generate specific circuits
  console.log('Generating specified circuits...\n');
  for (const arg of args) {
    const numOutputs = parseInt(arg, 10);
    if (isNaN(numOutputs)) {
      console.error(`Invalid argument: ${arg}`);
    } else {
      generateCircuit(numOutputs);
    }
  }
}

console.log('\nDone!');
