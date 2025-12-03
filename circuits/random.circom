pragma circom 2.0.0;

include "./circomlib/circuits/poseidon.circom";
include "./circomlib/circuits/comparators.circom";

template RandomCircuit() {
    // Public inputs
    signal input blockHash;
    signal input userNonce;
    signal input N;
    // Ensure N is greater than 2^3 s.t. quotient and remainder can fit in 252 bits
    // which is the maximum for Num2Bits_strict and LessThan templates for both
    // bn128 and bls12-381 fields
    assert(N > 8 && N < (2**252)); 
    
    // Private input
    signal input kurierEntropy;

    // Step 1: Compute Poseidon hash of the three inputs
    component poseidon = Poseidon(3);
    poseidon.inputs[0] <== blockHash;
    poseidon.inputs[1] <== userNonce;
    poseidon.inputs[2] <== kurierEntropy;
    
    signal hash <== poseidon.out;

    // Step 2: Compute R = hash mod N
    // We need: hash = quotient * N + R, where 0 < R < N
    signal quotient <-- hash \ N;
    signal output R <-- hash % N;

    // Ensure Quotient and Remainder fit in 'n' bits to prevent overflow attacks
    component qCheck = Num2Bits_strict();
    qCheck.in <== quotient;
    
    component rCheck = Num2Bits_strict();
    rCheck.in <== R;

    // Step 3: Verify the modulo decomposition
    hash === quotient * N + R;

    // Step 4: Ensure R is in the range [0, N)
    component isLess = LessThan(252);
    isLess.in[0] <== R;
    isLess.in[1] <== N;
    isLess.out === 1; // R < N
}

component main {public [blockHash, userNonce, N]} = RandomCircuit();

