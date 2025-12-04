pragma circom 2.0.0;

include "./random_template.circom";

// Circuit with 1 random output
component main {public [blockHash, userNonce, N]} = RandomCircuit(1);
