pragma circom 2.1.0;

include "./random_template.circom";

// Circuit: pick 5 unique random values from range [1, 35]
component main{public [blockHash, userNonce]} = RandomCircuit(5, 35, 1);
