pragma circom 2.1.0;

include "./circomlib/circuits/poseidon.circom";
include "./random_permutate.circom";

/**
 * RandomCircuit - Generates unique random numbers from a contiguous range.
 *
 * Parameters:
 *   - numOutputs: Number of random values to output (1 to poolSize)
 *   - poolSize: Size of the value pool to shuffle (max 50)
 *   - startValue: First value in the contiguous range (default concept: 0)
 *
 * The circuit shuffles values [startValue, startValue+1, ..., startValue+poolSize-1]
 * and outputs the first numOutputs values from the shuffled result.
 *
 * Example configurations:
 *   - RandomCircuit(5, 35, 1): Pick 5 from [1..35] (lottery 5/35)
 *   - RandomCircuit(6, 49, 1): Pick 6 from [1..49] (lottery 6/49)
 *   - RandomCircuit(3, 10, 0): Pick 3 from [0..9] (zero-based indices)
 *   - RandomCircuit(5, 20, 100): Pick 5 from [100..119]
 */
template RandomCircuit(numOutputs, poolSize, startValue) {
    assert(poolSize >= 1 && poolSize <= 50);
    assert(numOutputs >= 1 && numOutputs <= poolSize);

    // Public inputs
    // Note: blockHash is 256 bits, but field size is ~254 bits.
    // Circom automatically performs a modulo operation to make the value fit in a single field element.
    // Considering blockHash is the output of a cryptographic hash function, for which
    // we can assume a quasi-uniform distribution, this should not introduce significant
    // statistical bias.
    signal input blockHash;
    signal input userNonce;

    // Get Randomness by Poseidon-hashing the inputs
    component poseidon = Poseidon(2);
    poseidon.inputs[0] <== blockHash;
    poseidon.inputs[1] <== userNonce;
    signal seed <== poseidon.out;
    
    // Permute the contiguous range [startValue, startValue+poolSize-1]
    component randomPermute = RandomPermutate(poolSize);
    for (var i = 0; i < poolSize; i++) {
        randomPermute.in[i] <== startValue + i;
    }
    randomPermute.hash <== seed;

    // Output the first numOutputs of the permuted values
    signal output randomNumbers[numOutputs];
    for (var i = 0; i < numOutputs; i++) {
        randomNumbers[i] <== randomPermute.out[i];
    }
}
