template RandomCircuit() {
    // Public inputs
    signal input blockHash;
    signal input userNonce;

    // Private input (optional entropy from Kurier)
    signal input kurierEntropy;

    // Output
    signal output R;

    // Simple mixing of inputs (acts as a deterministic RNG seed)
    signal seed;
    seed <== blockHash * 1234567 + userNonce * 890123 + kurierEntropy * 456789;

    // Output the mixed value directly (you can post-process modulo 1000 off-circuit if desired)
    R <== seed;
}

component main = RandomCircuit();
