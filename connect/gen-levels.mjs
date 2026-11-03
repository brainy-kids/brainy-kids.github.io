// Generates levels.js: 100 seeded levels (4x4, 5x5, 6x6 dots). Run: node gen-levels.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TIERS = [
  { n: 4, count: 30, pairs: [3, 4] },
  { n: 5, count: 30, pairs: [4, 5] },
  { n: 6, count: 30, pairs: [5, 6] },
];
const MIN_LEN = 3;
const NODE_CAP = 3_000_000;

let seed = 20261103;
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rint = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const neighbours = (n) =>
  Array.from({ length: n * n }, (_, i) => {
    const r = Math.floor(i / n), c = i % n, out = [];
    if (r > 0) out.push(i - n);
    if (r < n - 1) out.push(i + n);
    if (c > 0) out.push(i - 1);
    if (c < n - 1) out.push(i + 1);
    return out;
  });

// Random path through every point of the grid.
function hamiltonian(n, nb) {
  const total = n * n;
  for (;;) {
    const path = [rint(0, total - 1)];
    const seen = new Uint8Array(total);
    seen[path[0]] = 1;
    let nodes = 0;
    const dfs = () => {
      if (path.length === total) return true;
      if (++nodes > 5000) return false;
      for (const y of shuffle(nb[path[path.length - 1]].slice())) {
        if (seen[y]) continue;
        seen[y] = 1;
        path.push(y);
        if (dfs()) return true;
        path.pop();
        seen[y] = 0;
      }
      return false;
    };
    if (dfs()) return path;
  }
}

function cut(path, k) {
  const len = Array(k).fill(MIN_LEN);
  for (let extra = path.length - k * MIN_LEN; extra > 0; extra--) len[rint(0, k - 1)]++;
  let i = 0;
  return len.map((l) => path.slice(i, (i += l)));
}

const turns = (seg) => {
  let t = 0;
  for (let i = 2; i < seg.length; i++) if (seg[i] - seg[i - 1] !== seg[i - 1] - seg[i - 2]) t++;
  return t;
};

// 0 = every solution covers the whole grid, 1 = a solution leaves a point free, -1 = search capped.
function looseSolution(n, nb, pairs) {
  const total = n * n;
  const occ = new Uint8Array(total);
  for (const [a, b] of pairs) occ[a] = occ[b] = 1;
  const dist = ([a, b]) => Math.abs((a % n) - (b % n)) + Math.abs(Math.floor(a / n) - Math.floor(b / n));
  const order = pairs.slice().sort((p, q) => dist(p) - dist(q));
  let nodes = 0, used = pairs.length * 2, found = false;

  const reachable = ([a, b]) => {
    const seen = new Uint8Array(total);
    const stack = [a];
    seen[a] = 1;
    while (stack.length) {
      for (const y of nb[stack.pop()]) {
        if (y === b) return true;
        if (!occ[y] && !seen[y]) { seen[y] = 1; stack.push(y); }
      }
    }
    return false;
  };

  const place = (i) => {
    if (i === order.length) { if (used < total) found = true; return; }
    const [a, b] = order[i];
    const walk = (x) => {
      if (found || ++nodes > NODE_CAP) return;
      for (const y of nb[x]) {
        if (y === b) {
          if (order.slice(i + 1).every(reachable)) place(i + 1);
        } else if (!occ[y]) {
          occ[y] = 1; used++;
          walk(y);
          occ[y] = 0; used--;
        }
        if (found) return;
      }
    };
    walk(a);
  };
  place(0);
  return { result: found ? 1 : nodes > NODE_CAP ? -1 : 0, nodes };
}

function verify(n, nb, segs) {
  const seen = new Set(segs.flat());
  if (seen.size !== n * n || segs.flat().length !== n * n) throw new Error('grid not fully covered');
  if (segs.length < 3 || segs.length > 6) throw new Error('pair count out of range');
  if (segs.some((s) => s.length < MIN_LEN)) throw new Error('path too short');
  if (!segs.some((s) => turns(s) >= 2)) throw new Error('no turning path');
  if (looseSolution(n, nb, segs.map((s) => [s[0], s[s.length - 1]])).result !== 0) throw new Error('loose solution');
}

const levels = [];
for (const { n, count, pairs } of TIERS) {
  const nb = neighbours(n);
  const tier = [];
  const keys = new Set();
  let attempts = 0;
  while (tier.length < count) {
    attempts++;
    const segs = cut(hamiltonian(n, nb), rint(pairs[0], pairs[1]));
    if (!segs.some((s) => turns(s) >= 2)) continue;
    const dots = segs.map((s) => [s[0], s[s.length - 1]]);
    const key = dots.map((d) => d.slice().sort((a, b) => a - b)).sort((p, q) => p[0] - q[0]).join('|');
    if (keys.has(key)) continue;
    const { result, nodes } = looseSolution(n, nb, dots);
    if (result !== 0) continue;
    keys.add(key);
    verify(n, nb, segs);
    tier.push({ n, dots, nodes });
  }
  console.log(`${n}x${n}: ${count} levels from ${attempts} attempts`);
  tier.sort((a, b) => a.nodes - b.nodes);
  levels.push(...tier);
}

const body = levels.map((l) => `[${l.n},${JSON.stringify(l.dots)}]`).join(',\n');
const out = fileURLToPath(new URL('./levels.js', import.meta.url));
writeFileSync(out, `window.CONNECT_LEVELS = [\n${body}\n];\n`);
console.log(`${levels.length} levels written`);
