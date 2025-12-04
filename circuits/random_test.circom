pragma circom 2.0.0;

include "./random_template.circom";

component main {public [blockHash, userNonce, N]} = RandomCircuit(3);

