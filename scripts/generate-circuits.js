#!/usr/bin/env node
/**
 * Generates Circom circuit files for different configurations.
 * 
 * Usage:
 *   node scripts/generate-circuits.js                      # Generate default (5,35,1)
 *   node scripts/generate-circuits.js 5 35 1               # Generate for numOutputs=5, poolSize=35, startValue=1
 *   node scripts/generate-circuits.js 5,35,1 6,49,1 3,10,0 # Generate multiple circuits
 */

const fs = require('fs');
const path = require('path');

const circuitsDir = path.join(__dirname, '..', 'circuits');

/**
 * Generate a circuit file for specific configuration
 * @param {number} numOutputs - Number of random outputs (1 to poolSize)
 * @param {number} poolSize - Size of the value pool to shuffle (max 50)
 * @param {number} startValue - First value in the contiguous range
 */
function generateCircuit(numOutputs, poolSize, startValue) {
  if (poolSize > 50) {
    console.error(`Invalid poolSize: ${poolSize}. Must be <= 50.`);
    return false;
  }
  if (numOutputs < 1 || numOutputs > poolSize) {
    console.error(`Invalid numOutputs: ${numOutputs}. Must be between 1 and ${poolSize}.`);
    return false;
  }

  const endValue = startValue + poolSize - 1;
  const filename = `random_${numOutputs}_${poolSize}_${startValue}.circom`;
  const filepath = path.join(circuitsDir, filename);

  const content = `pragma circom 2.0.0;

include "./random_template.circom";

// Circuit: pick ${numOutputs} unique random value${numOutputs > 1 ? 's' : ''} from range [${startValue}, ${endValue}]
component main {public [blockHash, userNonce]} = RandomCircuit(${numOutputs}, ${poolSize}, ${startValue});
`;

  fs.writeFileSync(filepath, content);
  console.log(`Generated: ${filename} (numOutputs=${numOutputs}, poolSize=${poolSize}, startValue=${startValue}, range=[${startValue}..${endValue}])`);
  return true;
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  // Generate default circuit
  console.log('Generating default circuit...\n');
  generateCircuit(5, 35, 1);
} else {
  // Generate specific circuits
  console.log('Generating specified circuits...\n');
  for (const arg of args) {
    const parts = arg.split(',');
    if (parts.length === 3) {
      const numOutputs = parseInt(parts[0], 10);
      const poolSize = parseInt(parts[1], 10);
      const startValue = parseInt(parts[2], 10);
      if (isNaN(numOutputs) || isNaN(poolSize) || isNaN(startValue)) {
        console.error(`Invalid argument: ${arg}. Use format: numOutputs,poolSize,startValue`);
      } else {
        generateCircuit(numOutputs, poolSize, startValue);
      }
    } else if (parts.length === 2) {
      // Two numbers: numOutputs,poolSize with default startValue=1
      const numOutputs = parseInt(parts[0], 10);
      const poolSize = parseInt(parts[1], 10);
      if (isNaN(numOutputs) || isNaN(poolSize)) {
        console.error(`Invalid argument: ${arg}. Use format: numOutputs,poolSize`);
      } else {
        generateCircuit(numOutputs, poolSize, 1);
      }
    } else {
      console.error(`Invalid argument: ${arg}. Use format: numOutputs,poolSize,startValue or numOutputs,poolSize`);
    }
  }
}

console.log('\nDone!');
