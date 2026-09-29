// Helpers of the fuzzers

// Mulberry32, a seeded random number generator (the low bits of a simple
// linear congruential generator repeat with short periods, so choices made
// with them correlate)
const random = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Random token sequences from the command line: [inputs] [seed]
const inputs = (tokens, maxLength = 14) => {
  const count = Number(process.argv[2] || 20000);
  const seed = Number(process.argv[3] || Date.now() % 1e9);
  const next = random(seed);
  const pick = (list) => list[Math.floor(next() * list.length)];
  return {
    seed,
    count,
    pick,
    *[Symbol.iterator]() {
      for (let i = 0; i < count; i++) {
        const length = 1 + Math.floor(next() * maxLength);
        yield Array.from({ length }, () => pick(tokens));
      }
    },
  };
};

// Removes tokens one at a time while the input still fails, except for the
// last `keep` ones
const shrink = (tokens, fails, keep = 0) => {
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < tokens.length - keep; i++) {
      const shorter = tokens.toSpliced(i, 1);
      if (fails(shorter)) {
        tokens = shorter;
        changed = true;
        break;
      }
    }
  }
  return tokens;
};

module.exports = { random, inputs, shrink };
