// Seeded random-JSON generator for simulating a live data feed. Each `tick`
// produces a new document where:
//   - every primitive VALUE changes,
//   - a fraction of object KEYS rotates to a new name every few ticks
//     (old key disappears, a new one appears, its subtree is regenerated),
//   - ARRAY lengths grow and shrink over time,
//   - the shape is an object array with multiple levels of nested object
//     arrays (and primitive arrays mixed in).
//
// Everything derives from position seeds + `tick`, so a given tick always
// yields the same document (reproducible profiling runs) while consecutive
// ticks differ in values, keys and lengths.
//
// Key churn is intentionally PARTIAL: only slots marked "volatile" (a stable
// per-slot coin flip, `volatileRatio`) rotate their key, and only once per
// `churnTicks` ticks (with a per-slot phase, so rotations are spread across
// ticks instead of all landing on the same one). This mirrors a real feed —
// most of the schema is stable — and it matters for the inspector demo: the
// expansion state is keyed by node path and seeded once, so a rotated key
// surfaces as a NEW, initially-collapsed path. Full churn would collapse the
// whole tree within a few ticks; partial churn keeps it watchable.

// mulberry32 PRNG — tiny, fast, good enough for mock data.
const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Cheap integer hash-combine, used to derive child seeds from position seeds.
const mix = (a, b) => {
  let h = (a ^ Math.imul(b, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
};

const int = (rnd, min, max) => min + Math.floor(rnd() * (max - min + 1));
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

const KEY_POOL = [
  'id',
  'name',
  'status',
  'value',
  'count',
  'items',
  'children',
  'meta',
  'config',
  'tags',
  'payload',
  'metrics',
  'user',
  'region',
  'score',
  'flags',
  'history',
  'detail',
  'cache',
  'session',
  'events',
  'params',
];
const WORD_POOL = [
  'alpha',
  'beta',
  'gamma',
  'delta',
  'omega',
  'north',
  'south',
  'east',
  'west',
  'ready',
  'busy',
  'idle',
];

export const makeRandomJson = (
  tick,
  {
    // levels of nesting below the root object array
    maxDepth = 3,
    // keys per object
    minKeys = 3,
    maxKeys = 6,
    // array lengths (both object arrays and primitive arrays)
    minLen = 2,
    maxLen = 6,
    // a volatile slot rotates its key once per this many ticks
    churnTicks = 20,
    // Fraction of object slots whose key rotates (the rest are stable).
    // Keep this low: a rotated key changes the PATH of every descendant too,
    // so path churn compounds with depth — at 0.12 roughly half of the paths
    // in a 5-deep tree survive long-term, which keeps the demo watchable.
    volatileRatio = 0.12,
  } = {}
) => {
  // Approximate count of rows the inspector renders when fully expanded:
  // one per object key and one per array element.
  let nodeCount = 0;

  // Value TYPE is stable per position; the value itself changes every tick.
  const genPrimitive = (slotSeed, tickSeed) => {
    const type = int(mulberry32(mix(slotSeed, 23)), 0, 7);
    const rnd = mulberry32(tickSeed);
    switch (type) {
      case 0:
        return +(rnd() * 1000).toFixed(3);
      case 1:
        return int(rnd, 0, 1_000_000);
      case 2:
        return rnd() < 0.5;
      case 3:
        return `${pick(rnd, WORD_POOL)}-${int(rnd, 0, 999)}`;
      case 4:
        return null;
      case 5:
        return new Date(1_700_000_000_000 + int(rnd, 0, 1e9) * 100);
      case 6:
        return +rnd().toFixed(6);
      default:
        return pick(rnd, WORD_POOL);
    }
  };

  // Length re-rolls once per churnTicks (per-array phase), so arrays grow and
  // shrink over time instead of jittering every single tick.
  const genArrayLen = (seed) => {
    const phase = int(mulberry32(mix(seed, 7)), 0, churnTicks - 1);
    const epoch = Math.floor((tick + phase) / churnTicks);
    return int(mulberry32(mix(seed, mix(29, epoch))), minLen, maxLen);
  };

  const genValue = (slotSeed, depth) => {
    // The KIND at a position is stable, so the overall shape doesn't thrash.
    const r = mulberry32(mix(slotSeed, 3))();
    if (depth > 0 && r < 0.3) {
      // array of objects
      return Array.from({ length: genArrayLen(slotSeed) }, (_, i) => {
        nodeCount++;
        return genObject(mix(slotSeed, 101 + i), depth - 1);
      });
    }
    if (depth > 0 && r < 0.5) return genObject(mix(slotSeed, 51), depth - 1);
    if (r < 0.62) {
      // array of primitives
      return Array.from({ length: genArrayLen(mix(slotSeed, 5)) }, (_, i) => {
        nodeCount++;
        return genPrimitive(mix(slotSeed, 201 + i), mix(mix(slotSeed, 201 + i), tick));
      });
    }
    return genPrimitive(slotSeed, mix(slotSeed, tick));
  };

  const genObject = (seed, depth) => {
    const struct = mulberry32(seed);
    const keyCount = int(struct, minKeys, maxKeys);
    const obj = {};
    for (let slot = 0; slot < keyCount; slot++) {
      const slotSeed = mix(seed, slot + 1);
      const isVolatile = mulberry32(mix(slotSeed, 17))() < volatileRatio;
      const phase = int(mulberry32(mix(slotSeed, 11)), 0, churnTicks - 1);
      // Stable slots stay in epoch 0 forever → same key, same subtree seed.
      const epoch = isVolatile ? Math.floor((tick + phase) / churnTicks) : 0;
      const keyRnd = mulberry32(mix(slotSeed, mix(13, epoch)));
      let key = pick(keyRnd, KEY_POOL);
      if (keyRnd() < 0.5) key = `${key}_${int(keyRnd, 0, 99)}`;
      if (key in obj) key = `${key}_${slot}`;
      nodeCount++;
      // Mixing the epoch into the child seed regenerates the whole subtree
      // when a volatile key rotates — a new key means new content.
      obj[key] = genValue(mix(slotSeed, mix(31, epoch)), depth);
    }
    return obj;
  };

  // Root: an object array whose length itself varies over time.
  const rootSeed = 0xabcdef;
  const data = Array.from({ length: genArrayLen(rootSeed) }, (_, i) => {
    nodeCount++;
    return genObject(mix(rootSeed, 100 + i), maxDepth);
  });
  return { data, nodeCount };
};
