#!/usr/bin/env node
/**
 * Generates Circom circuit files for different numOutputs and maxOutputVal values.
 * 
 * Usage:
 *   node scripts/generate-circuits.js                    # Generate default (5,35)
 *   node scripts/generate-circuits.js 5 50               # Generate for numOutputs=5, maxOutputVal=50
 *   node scripts/generate-circuits.js 1,50 3,50 6,50     # Generate multiple circuits
 */

const fs = require('fs');
const path = require('path');

const circuitsDir = path.join(__dirname, '..', 'circuits');

/**
 * Generate a circuit file for specific numOutputs and maxOutputVal values
 * @param {number} numOutputs - Number of random outputs (1-50)
 * @param {number} maxOutputVal - Maximum output value (numOutputs <= maxOutputVal <= 50)
 */
function generateCircuit(numOutputs, maxOutputVal) {
  if (maxOutputVal > 50) {
    console.error(`Invalid maxOutputVal: ${maxOutputVal}. Must be <= 50.`);
    return false;
  }
  if (numOutputs < 1 || numOutputs > maxOutputVal) {
    console.error(`Invalid numOutputs: ${numOutputs}. Must be between 1 and ${maxOutputVal}.`);
    return false;
  }

  const filename = `random_${numOutputs}_${maxOutputVal}.circom`;
  const filepath = path.join(circuitsDir, filename);

  const content = `pragma circom 2.0.0;

include "./random_template.circom";

// Circuit with ${numOutputs} random output${numOutputs > 1 ? 's' : ''} in range [1, ${maxOutputVal}]
component main {public [blockHash, userNonce]} = RandomCircuit(${numOutputs}, ${maxOutputVal});
`;

  fs.writeFileSync(filepath, content);
  console.log(`Generated: ${filename} (numOutputs=${numOutputs}, maxOutputVal=${maxOutputVal})`);
  return true;
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  // Generate default circuits
  console.log('Generating default circuits...\n');
  generateCircuit(5, 35);
} else {
  // Generate specific circuits
  console.log('Generating specified circuits...\n');
  for (const arg of args) {
    const parts = arg.split(',');
    if (parts.length === 2) {
      const numOutputs = parseInt(parts[0], 10);
      const maxOutputVal = parseInt(parts[1], 10);
      if (isNaN(numOutputs) || isNaN(maxOutputVal)) {
        console.error(`Invalid argument: ${arg}. Use format: numOutputs,maxOutputVal`);
      } else {
        generateCircuit(numOutputs, maxOutputVal);
      }
    } else if (parts.length === 1) {
      // Single number means numOutputs with default maxOutputVal=50
      const numOutputs = parseInt(parts[0], 10);
      if (isNaN(numOutputs)) {
        console.error(`Invalid argument: ${arg}`);
      } else {
        generateCircuit(numOutputs, 50);
      }
    } else {
      console.error(`Invalid argument: ${arg}. Use format: numOutputs,maxOutputVal or just numOutputs`);
    }
  }
}

console.log('\nDone!');
