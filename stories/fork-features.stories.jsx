import React from 'react';

import { Inspector } from '../src';
import { makeRandomJson } from './randomJson';

// Demos specific to this fork (`react-live-inspector`): high-frequency refresh,
// full virtualization, safe "expand all", and expand/collapse state decoupled
// from `data`. Kept separate from the upstream type/example showcases in
// `object-inspector.stories.jsx`.
export default {
  title: 'react-live-inspector',
  component: Inspector,
};

// ---- Performance: rich, deeply-nested object with many data types ----

// A grab-bag of every interesting JS value type, including binary.
const makeBinary = (seed) => {
  const buf = new ArrayBuffer(16);
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < u8.length; i++) u8[i] = (seed + i * 31) % 256;
  return {
    arrayBuffer: buf,
    uint8: u8,
    int16: new Int16Array(buf),
    float32: new Float32Array(buf),
    dataView: new DataView(buf),
    // base64-ish string standing in for an encoded blob
    base64: btoa(String.fromCharCode(...u8)),
  };
};

const makeRichLeaf = (i) => ({
  // primitives
  index: i,
  float: i + 0.1234,
  bigint: BigInt(i) * 1000000000000n,
  label: `item-${i}`,
  active: i % 2 === 0,
  nothing: null,
  notDefined: undefined,
  tag: Symbol(`sym-${i}`),
  // dates & regex
  createdAt: new Date(2020, 0, 1 + i),
  pattern: /^[a-z]+\d{2,4}$/gi,
  // arrays (mixed + nested)
  scores: [i, i * 2, i * 3, i % 7 === 0 ? null : i / 2],
  matrix: [
    [i, i + 1],
    [i + 2, i + 3],
  ],
  tags: ['alpha', 'beta', { nested: true, level: i }],
  // collections
  lookup: new Map([
    ['one', i],
    ['two', { deep: { value: i } }],
  ]),
  unique: new Set([i, i + 1, i + 2]),
  // function
  compute: function compute(x) {
    return x * i;
  },
  // binary
  binary: makeBinary(i),
});

// Plan B: build the data ONCE at module load and cache it, so re-rendering
// (e.g. clicking Storybook's refresh) measures the component, not data
// construction. depth 5 × breadth 10 => 10^5 = 100,000 leaves (~111k nodes).
// Data is sized by ACTUAL rendered-node count (rows the inspector draws when
// fully expanded), not by leaf count. A single rich leaf expands to ~76 nodes,
// so leaves = round(target / 76). Built lazily and cached, so opening one story
// doesn't construct the data for the others.
const NODES_PER_LEAF = 76;
const cache = {};
const getDataByNodes = (targetNodes) =>
  (cache[targetNodes] ??= Array.from({ length: Math.max(1, Math.round(targetNodes / NODES_PER_LEAF)) }, (_, i) =>
    makeRichLeaf(i)
  ));

// Fully expand everything. The deepest path (e.g. $.<i>.lookup.two.deep.value)
// is ~6 levels, so 12 fully expands. A huge value is now safe too — expandLevel
// is resolved in a single bounded tree walk (see the "Verify - safe expand all"
// story), so it no longer carries the old O(expandLevel²) string-work cost.
const FULLY_EXPANDED = 12;

export const PerfNodes100 = {
  render: () => <Inspector data={getDataByNodes(100)} expandLevel={FULLY_EXPANDED} />,
  name: 'Perf - ~100 rendered nodes',
};

export const PerfNodes1k = {
  render: () => <Inspector data={getDataByNodes(1000)} expandLevel={FULLY_EXPANDED} />,
  name: 'Perf - ~1k rendered nodes',
};

export const PerfNodes10k = {
  render: () => <Inspector data={getDataByNodes(10000)} expandLevel={FULLY_EXPANDED} />,
  name: 'Perf - ~10k rendered nodes',
};

export const PerfNodes100k = {
  render: () => <Inspector data={getDataByNodes(100000)} expandLevel={FULLY_EXPANDED} />,
  name: 'Perf - ~100k rendered nodes',
};

// Single rich leaf, fully expanded — good for inspecting every type at once.
export const PerfRichLeaf = {
  render: () => <Inspector data={makeRichLeaf(42)} expandLevel={4} />,
  name: 'Perf - single rich leaf (all types)',
};

// ---- Perf: high-frequency refresh (~10 Hz) ----
// Simulates live data: every tick we generate a NEW random-JSON document (see
// ./randomJson.js) and feed it to <Inspector>. Unlike a same-shape refresh,
// this one also rotates object keys, grows/shrinks array lengths, and nests
// object arrays several levels deep — the messy end of the live-feed spectrum.
// Note: expansion state is keyed by node path and seeded once, so a rotated
// key (or a newly grown array index) shows up as a fresh, collapsed node —
// that's the "expand/collapse decoupled from data" behavior working as
// intended. A React <Profiler> overlay reports the real commit duration so
// you can watch it live; also open DevTools Performance / React Profiler.

const HighFrequencyDemo = ({ hz = 10, gen, expandLevel = 12 }) => {
  const [tick, setTick] = React.useState(0);
  const stats = React.useRef({ commits: 0, total: 0, last: 0, max: 0 });
  const [, force] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), Math.round(1000 / hz));
    return () => clearInterval(id);
  }, [hz]);

  const { data, nodeCount } = React.useMemo(() => makeRandomJson(tick, gen), [tick, gen]);

  const onRender = (_id, _phase, actualDuration) => {
    const s = stats.current;
    s.commits += 1;
    s.total += actualDuration;
    s.last = actualDuration;
    s.max = Math.max(s.max, actualDuration);
  };

  // refresh the on-screen stats once per second (separate from data ticks)
  React.useEffect(() => {
    const id = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const s = stats.current;
  const avg = s.commits ? (s.total / s.commits).toFixed(2) : '0';

  return (
    <div>
      <div
        style={{
          font: '12px/1.6 monospace',
          background: '#111',
          color: '#0f0',
          padding: '8px 12px',
          marginBottom: 8,
          borderRadius: 4,
        }}>
        refresh: {hz} Hz &nbsp;|&nbsp; nodes: {nodeCount} &nbsp;|&nbsp; commits: {s.commits} &nbsp;|&nbsp; last:{' '}
        {s.last.toFixed(2)} ms &nbsp;|&nbsp; avg: {avg} ms &nbsp;|&nbsp; max: {s.max.toFixed(2)} ms
        <br />
        <span style={{ color: s.last > 1000 / hz ? '#f55' : '#0f0' }}>
          {s.last > 1000 / hz ? '⚠ commit longer than frame budget — dropping frames' : 'within frame budget'}
        </span>
      </div>
      <React.Profiler id="inspector" onRender={onRender}>
        <Inspector data={data} expandLevel={expandLevel} />
      </React.Profiler>
    </div>
  );
};

// Module-constant generator options so the useMemo dep stays referentially
// stable across renders. The live node count is shown in the overlay.
const GEN_SMALL = { maxDepth: 2, minKeys: 3, maxKeys: 5, minLen: 2, maxLen: 4 };
const GEN_LARGE = { maxDepth: 3, minKeys: 3, maxKeys: 6, minLen: 2, maxLen: 6 };

export const PerfRefresh10Hz = {
  render: () => <HighFrequencyDemo hz={10} gen={GEN_SMALL} />,
  name: 'Perf - live random JSON 10 Hz (small)',
};

export const PerfRefresh10HzLarge = {
  render: () => <HighFrequencyDemo hz={10} gen={GEN_LARGE} />,
  name: 'Perf - live random JSON 10 Hz (large)',
};

// ---- Perf: large live JSON with variable-height strings ----
// This deliberately changes row heights while the virtualizer is recycling
// visible rows. Some message fields are very long single lines, while others
// contain real newline characters. The text category rotates on every tick so
// the same path can repeatedly grow and shrink during a high-frequency feed.
const LONG_TEXT =
  'A deliberately long, unbroken stream of diagnostic text used to exercise wrapping and dynamic row measurement. '.repeat(
    40
  );
const MULTILINE_TEXT = [
  'request accepted',
  'processing stage: decode payload',
  'warning: upstream timestamp is older than the current frame',
  'stack:',
  '  at decodeMessage (decoder.js:128:17)',
  '  at updateSnapshot (store.js:64:9)',
  '  at renderFrame (viewer.js:241:5)',
].join('\n');

const makeLargeStringJson = (tick, recordCount) => ({
  tick,
  updatedAt: new Date().toISOString(),
  records: Array.from({ length: recordCount }, (_, index) => {
    const textKind = (index + tick) % 12;
    const message =
      textKind === 0
        ? `${MULTILINE_TEXT}\nrecord: ${index}\ntick: ${tick}`
        : textKind <= 2
          ? `${LONG_TEXT} record=${index} tick=${tick}`
          : `record ${index} refreshed at tick ${tick}`;

    return {
      id: `record-${index}`,
      status: (index + tick) % 5 === 0 ? 'warning' : 'ready',
      message,
      detail: {
        source: `sensor-${index % 32}`,
        sequence: tick * recordCount + index,
        metrics: {
          latencyMs: (tick * 17 + index * 7) % 250,
          confidence: +(((tick + index) % 100) / 100).toFixed(2),
        },
        tags: [`group-${index % 10}`, `partition-${index % 4}`, `tick-${tick}`],
      },
    };
  }),
});

const LargeStringRefreshDemo = ({ hz = 10, recordCount = 1000 }) => {
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => setTick((value) => value + 1), Math.round(1000 / hz));
    return () => clearInterval(id);
  }, [hz]);

  const data = React.useMemo(() => makeLargeStringJson(tick, recordCount), [tick, recordCount]);

  return (
    <div>
      <div
        style={{
          font: '12px/1.6 monospace',
          background: '#111',
          color: '#0f0',
          padding: '8px 12px',
          marginBottom: 8,
          borderRadius: 4,
        }}>
        refresh: {hz} Hz &nbsp;|&nbsp; records: {recordCount.toLocaleString()} &nbsp;|&nbsp; tick: {tick}
        <br />
        <span style={{ color: '#fd0' }}>
          Every tick rotates message fields between short, very long, and explicit multiline strings.
        </span>
      </div>
      <Inspector data={data} expandLevel={5} multiline height={600} />
    </div>
  );
};

export const PerfRefresh10HzLargeLongAndMultilineStrings = {
  render: () => <LargeStringRefreshDemo hz={10} recordCount={1000} />,
  name: 'Perf - large JSON 10 Hz (long + multiline strings)',
};

// ---- Verify: collapse state survives high-frequency refresh ----
// Regression demo for the "expandPaths/expandLevel re-applied on every data
// change" bug. The tree starts fully expanded and its values change ~3×/sec.
// Collapse any node (click its arrow) and watch it STAY collapsed across
// refreshes. Before the fix it would pop back open on the very next tick.
const CollapsePersistenceDemo = ({ hz = 3 }) => {
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), Math.round(1000 / hz));
    return () => clearInterval(id);
  }, [hz]);

  // New object reference every tick, same shape, changing values.
  const data = React.useMemo(
    () => ({
      tick,
      updatedAt: new Date(),
      user: {
        id: 1,
        name: 'Ada',
        score: +Math.sin(tick / 3).toFixed(4),
        prefs: { theme: tick % 2 ? 'dark' : 'light', volume: tick % 11 },
      },
      metrics: {
        cpu: (tick * 7) % 100,
        mem: (tick * 13) % 100,
        queue: [tick, tick + 1, tick + 2],
      },
      tags: ['alpha', 'beta', { nested: true, level: tick % 5 }],
    }),
    [tick]
  );

  return (
    <div>
      <div
        style={{
          font: '12px/1.6 monospace',
          background: '#111',
          color: '#0f0',
          padding: '8px 12px',
          marginBottom: 8,
          borderRadius: 4,
        }}>
        refresh: {hz} Hz &nbsp;|&nbsp; tick: {tick}
        <br />
        <span style={{ color: '#fd0' }}>
          Test: collapse e.g. <code>user</code> or <code>metrics</code>, then watch it stay collapsed while values keep
          changing. (Before the fix it re-opened every tick.)
        </span>
      </div>
      <Inspector data={data} expandLevel={4} />
    </div>
  );
};

export const VerifyCollapsePersistsUnderRefresh = {
  render: () => <CollapsePersistenceDemo hz={3} />,
  name: 'Verify - collapse persists under refresh',
};

// ---- Verify: safe "expand all" ----
// A deliberately deep chain plus an absurd expandLevel. Upstream resolved
// expandLevel by re-walking the tree once per level (O(level × n)), so a huge
// value would stall the UI before a single row rendered. The fork resolves it
// in one bounded walk, so even expandLevel=100000 on a deep tree is instant.
// The overlay reports the time spent computing expanded paths on mount.
const makeDeepChain = (depth) => {
  let node = { value: 'leaf' };
  for (let d = depth; d > 0; d--) node = { depth: d, child: node };
  return node;
};

const SafeExpandAllDemo = ({ depth = 200, expandLevel = 100000 }) => {
  const data = React.useMemo(() => makeDeepChain(depth), [depth]);

  // Time from just before mount to the first committed frame. The expandLevel
  // resolution runs in TreeView's mount effect, so this captures its cost.
  const mountStart = React.useRef(performance.now());
  const [renderMs, setRenderMs] = React.useState(null);
  React.useEffect(() => {
    setRenderMs((performance.now() - mountStart.current).toFixed(1));
  }, []);

  return (
    <div>
      <div
        style={{
          font: '12px/1.6 monospace',
          background: '#111',
          color: '#0f0',
          padding: '8px 12px',
          marginBottom: 8,
          borderRadius: 4,
        }}>
        depth: {depth} &nbsp;|&nbsp; expandLevel: {expandLevel.toLocaleString()} &nbsp;|&nbsp; mount→paint:{' '}
        {renderMs ?? '…'} ms
        <br />
        <span style={{ color: '#fd0' }}>
          A {expandLevel.toLocaleString()}-level "expand all" on a {depth}-deep tree resolves in one bounded walk — no
          stall. (Upstream would re-walk the tree {expandLevel.toLocaleString()} times.)
        </span>
      </div>
      <Inspector data={data} expandLevel={expandLevel} />
    </div>
  );
};

export const VerifySafeExpandAll = {
  render: () => <SafeExpandAllDemo depth={200} expandLevel={100000} />,
  name: 'Verify - safe expand all',
};
