include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/bitify.circom";

template RandomCircuit() {
    signal input blockHash;
    signal input userNonce;
    signal input kurierEntropy;
    signal output R;

    // Hash the 3 inputs with Poseidon
    component poseidon = Poseidon(3);
    poseidon.inputs[0] <== blockHash;
    poseidon.inputs[1] <== userNonce;
    poseidon.inputs[2] <== kurierEntropy;

    // Seed is the hash output
    signal seed;
    seed <== poseidon.out;

    // R = seed mod 1000
    signal quotient;
    component quotientBits = Num2Bits(254);
    quotientBits.in <== quotient;
    seed === quotient * 1000 + R;

    // Ensure R < 1000
    component lt = LessThan(16);
    lt.in[0] <== R;
    lt.in[1] <== 1000;
    lt.out === 1;
}

component main = RandomCircuit();
