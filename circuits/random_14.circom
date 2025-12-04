pragma circom 2.0.0;

include "./random_template.circom";

// Circuit with 14 random outputs
component main {public [blockHash, userNonce, N]} = RandomCircuit(14);
