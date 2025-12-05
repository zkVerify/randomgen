pragma circom 2.1.0;

include "./circomlib/circuits/poseidon.circom";
include "./random_permutate.circom";

template RandomCircuit(numOutputs, maxOutputVal) {
    assert(maxOutputVal <= 50);
    assert(numOutputs >= 1 && numOutputs <= maxOutputVal);

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
    
    // Permute the numbers 1..maxOutputVal using the seed 
    component randomPermute = RandomPermutate(maxOutputVal);
    for (var i = 0; i < maxOutputVal; i++) {
        randomPermute.in[i] <== i + 1;
    }
    randomPermute.hash <== seed;

    // Output the first numOutputs of the permuted values
    signal output randomNumbers[numOutputs];
    for (var i = 0; i < numOutputs; i++) {
        randomNumbers[i] <== randomPermute.out[i];
    }
}
