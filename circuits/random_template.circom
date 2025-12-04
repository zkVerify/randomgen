pragma circom 2.0.0;

include "./circomlib/circuits/poseidon.circom";
include "./circomlib/circuits/comparators.circom";

// Template parameter numOutputs: number of random values to generate (1 to 15)
// PoseidonEx requires nInputs >= nOuts - 1 (since t = nInputs + 1 and nOuts <= t)
// We have 3 real inputs, so we add dummy inputs as needed to satisfy this constraint
template RandomCircuit(numOutputs) {
    // Validate numOutputs at compile time
    assert(numOutputs >= 1 && numOutputs <= 15);

    // Calculate required number of inputs for PoseidonEx
    // t = nInputs + 1 must be >= numOutputs, so nInputs >= numOutputs - 1
    // We have 3 real inputs, so we need max(3, numOutputs - 1) total inputs
    var numRealInputs = 3;
    var numTotalInputs = numOutputs > numRealInputs + 1 ? numOutputs - 1 : numRealInputs;
    var numDummyInputs = numTotalInputs - numRealInputs;

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

    // Step 1: Compute Poseidon hash with multiple outputs using PoseidonEx
    // PoseidonEx(nInputs, nOuts) - we use numTotalInputs to ensure t >= numOutputs
    component poseidon = PoseidonEx(numTotalInputs, numOutputs);
    poseidon.initialState <== 0;
    poseidon.inputs[0] <== blockHash;
    poseidon.inputs[1] <== userNonce;
    poseidon.inputs[2] <== kurierEntropy;
    
    // Add dummy inputs (zeros) to satisfy PoseidonEx requirements
    for (var i = 0; i < numDummyInputs; i++) {
        poseidon.inputs[numRealInputs + i] <== 0;
    }
    
    // Arrays for intermediate values and outputs
    signal hashes[numOutputs];
    signal quotients[numOutputs];
    signal output R[numOutputs];

    // Components for range checks
    component qCheck[numOutputs];
    component rCheck[numOutputs];
    component isLess[numOutputs];

    // Process each hash output to generate R[i] = hash[i] mod N
    for (var i = 0; i < numOutputs; i++) {
        hashes[i] <== poseidon.out[i];
        
        // Step 2: Compute R[i] = hash[i] mod N
        quotients[i] <-- hashes[i] \ N;
        R[i] <-- hashes[i] % N;

        // Ensure Quotient and Remainder fit in field to prevent overflow attacks
        qCheck[i] = Num2Bits_strict();
        qCheck[i].in <== quotients[i];
        
        rCheck[i] = Num2Bits_strict();
        rCheck[i].in <== R[i];

        // Step 3: Verify the modulo decomposition
        hashes[i] === quotients[i] * N + R[i];

        // Step 4: Ensure R[i] is in the range [0, N)
        isLess[i] = LessThan(252);
        isLess[i].in[0] <== R[i];
        isLess[i].in[1] <== N;
        isLess[i].out === 1; // R[i] < N
    }
}
