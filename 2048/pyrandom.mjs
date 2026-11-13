// Python's `random.Random`, just the parts the 2048 game uses, bit for bit.
//
// The original game (quasarbright/2048, game.py) picks where a tile spawns with
// `random.seed(self.seed)` and then `random.choice(...)` / `random.randint(1, 10)`, where
// `self.seed` is a float. So to spawn tiles exactly where the Python would, this reproduces:
//   - hash(float), which is what CPython seeds with when you pass it a float
//   - MT19937 seeded through init_by_array (CPython's random_seed)
//   - getrandbits, _randbelow, choice and randint on top of it
// and `random.random()`, for making a fresh game's seed.

const P = (1n << 61n) - 1n; // CPython's hash modulus, 2**61 - 1

// hash(x) for a finite float, as CPython computes it (Python/pyhash.c): reduce the exact value
// x = m * 2**e modulo 2**61 - 1. Since 2**61 = 1 (mod P), 2**e is 2**(e mod 61).
export function hashFloat(x) {
  if (!Number.isFinite(x)) throw new Error("hashFloat: only finite floats");
  if (x === 0) return 0n;
  const neg = x < 0;
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, Math.abs(x));
  const hi = dv.getUint32(0), lo = dv.getUint32(4);
  const bexp = (hi >>> 20) & 0x7ff;
  let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let e;
  if (bexp === 0) e = -1074; // subnormal
  else { mant |= 1n << 52n; e = bexp - 1075; }
  const shift = BigInt(((e % 61) + 61) % 61);
  let h = ((mant % P) << shift) % P;
  if (neg) h = -h;
  if (h === -1n) h = -2n;
  return h;
}

export class PyRandom {
  constructor(seed) {
    this.mt = new Uint32Array(624);
    this.mti = 625;
    if (seed !== undefined) this.seed(seed);
  }

  // random.seed(a) for an int or a float (Modules/_randommodule.c random_seed):
  // ints use abs(a); anything else is hashed, and the hash is read as an unsigned 64-bit int
  seed(a) {
    let n;
    if (typeof a === "bigint") n = a < 0n ? -a : a;
    else if (Number.isInteger(a)) n = BigInt(Math.abs(a));
    else {
      n = hashFloat(a);
      if (n < 0n) n += 1n << 64n;
    }
    // the int as little-endian 32-bit words, at least one
    const key = [];
    do { key.push(Number(n & 0xffffffffn)); n >>= 32n; } while (n > 0n);
    this.initByArray(key);
  }

  initGenrand(s) {
    const mt = this.mt;
    mt[0] = s >>> 0;
    for (let i = 1; i < 624; i++) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = (Math.imul(1812433253, prev) + i) >>> 0;
    }
    this.mti = 624;
  }

  initByArray(key) {
    const mt = this.mt, len = key.length;
    this.initGenrand(19650218);
    let i = 1, j = 0;
    for (let k = Math.max(624, len); k; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(prev, 1664525)) + key[j] + j) >>> 0;
      i++; j++;
      if (i >= 624) { mt[0] = mt[623]; i = 1; }
      if (j >= len) j = 0;
    }
    for (let k = 623; k; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(prev, 1566083941)) - i) >>> 0;
      i++;
      if (i >= 624) { mt[0] = mt[623]; i = 1; }
    }
    mt[0] = 0x80000000;
    this.mti = 624;
  }

  genrandUint32() {
    const mt = this.mt;
    if (this.mti >= 624) {
      let kk = 0;
      for (; kk < 624 - 397; kk++) {
        const y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff);
        mt[kk] = mt[kk + 397] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      for (; kk < 623; kk++) {
        const y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff);
        mt[kk] = mt[kk + (397 - 624)] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      const y = (mt[623] & 0x80000000) | (mt[0] & 0x7fffffff);
      mt[623] = mt[396] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      this.mti = 0;
    }
    let y = mt[this.mti++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  // getrandbits(k) for 0 < k <= 32
  getrandbits(k) {
    if (k <= 0 || k > 32) throw new Error("getrandbits: 1..32 bits only");
    return this.genrandUint32() >>> (32 - k);
  }

  // random(): 53 random bits, as a float in [0, 1)
  random() {
    const a = this.genrandUint32() >>> 5, b = this.genrandUint32() >>> 6;
    return (a * 67108864 + b) / 9007199254740992;
  }

  // _randbelow_with_getrandbits(n): rejection-sample n.bit_length() bits
  randbelow(n) {
    const k = 32 - Math.clz32(n);
    let r = this.getrandbits(k);
    while (r >= n) r = this.getrandbits(k);
    return r;
  }

  choice(seq) {
    if (!seq.length) throw new Error("Cannot choose from an empty sequence");
    return seq[this.randbelow(seq.length)];
  }

  randint(a, b) {
    return a + this.randbelow(b - a + 1);
  }
}

// A seed like the Python game's `random.random()`, from the browser's crypto RNG
export function freshSeed() {
  const u = new Uint32Array(2);
  (globalThis.crypto ?? { getRandomValues: (x) => x.map(() => Math.random() * 2 ** 32) }).getRandomValues(u);
  return ((u[0] >>> 5) * 67108864 + (u[1] >>> 6)) / 9007199254740992;
}
