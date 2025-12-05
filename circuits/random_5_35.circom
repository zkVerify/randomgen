pragma circom 2.1.0;

include "./random_template.circom";

component main{public [blockHash, userNonce]} = RandomCircuit(5, 35);
