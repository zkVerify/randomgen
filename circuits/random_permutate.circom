// Circuit taken from https://github.com/jbaylina/random_permute/blob/main/circuits/permutation.circom

pragma circom 2.1.0;

include "./circomlib/circuits/bitify.circom";

function getNBits(a) {
    var b = 0;
    while(a) {
        a = a >> 1;
        b++;
    }
    return b;
}

template RandomPermutate(n) {
    signal input hash;
    signal input in[n];
    signal output out[n];

    // Note: The number of ways to arrange (permute) N items is N!
    // For the circuit to be able to generate every possible shuffle from a single random seed, 
    // that seed must be able to hold a value as large as N!.
    // Base field for bn128 and bls12-381 has size ~2^254, so we must ensure N! < 2^254
    // The maximum we could have is N=56 as it is representable with 249 bits, but to be safe we limit to N=50
    // To increase N we need more hashes, this could be an improvement for the future if needed.
    assert(n<=50);

    signal selectors[(1+n)*n/2];
    signal vals[(1+n)*n/2];
    signal valns[(1+n)*n/2];
    signal randStep[n];

    component n2b = Num2Bits_strict();
    n2b.in <== hash;
    component b2n = Bits2Num(250);
    for (var i=0; i<250; i++) {
        b2n.in[i] <== n2b.out[i];
    }

    signal r <== b2n.out;

    var rr = r;
    var radix = 1;
    var o = 0;
    var accRndStep = 0;
    for (var i=n; i>0; i--) {
        var a = rr % i;
        var selsSum = 0;
        for (var j=0; j<i; j++) {
            selectors[o+j] <-- a == j;
            selectors[o+j]*(selectors[o+j] - 1) === 0;
            selsSum += selectors[o+j];
            accRndStep += radix*j*selectors[o+j];
        }
        selsSum === 1;
        radix = radix*i;
        rr = rr \ i;
        o = o + i;
    }

    var bitsRadix = getNBits(radix);

    signal rem <-- rr;
    component n2bR = Num2Bits(250-bitsRadix +1);
    n2bR.in <== rem;

    rem*radix + accRndStep === b2n.out;

    for (var i=0; i<n; i++) {
        vals[i] <== in[i];
    }

    o=0;
    for (var i=n; i>0; i--) {
        var accOut = 0;
        for (var j=0; j<i; j++) {
            if (j<i-1) {
                vals[o+i+j] <== selectors[o+j] * ( vals[o+i-1] - vals[o+j] )    + vals[o+j];
            }
            valns[o+j] <== vals[o+j] * selectors[o+j];
            accOut += valns[o+j];
        }
        out[i-1] <== accOut;
        o = o + i;
    }
}
