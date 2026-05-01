/* tests/storage.test.js
 *
 * Standalone Node-runnable regression tests for js/cat_session_storage.js.
 * Pure Node.js (no npm dependencies). Run with:
 *   node tests/storage.test.js
 *
 * The storage module is browser-targeted — it relies on `window` and
 * `window.localStorage`. To exercise it under Node we build a minimal
 * Map-backed `localStorage` shim and inject it into a `vm.createContext`
 * sandbox, in the same style as cat_simulation.test.js's loader for
 * cat_1f.js. This test file has no dependency on the calibration data
 * and is therefore fully isolated from the CAT engine tests.
 *
 * Each top-level `testN_*` function documents in a comment what
 * specific behaviour of LJTSessionStorage it verifies. Output format
 * mirrors cat_simulation.test.js so both suites print to the same
 * console pipeline.
 *
 * References:
 *   WHATWG Storage Living Standard — https://storage.spec.whatwg.org/
 *   HTML Living Standard, "Web storage" — https://html.spec.whatwg.org/multipage/webstorage.html
 *     (specifies QuotaExceededError DOMException semantics for setItem
 *      when the user agent's storage quota is exhausted; ~5 MB cap is
 *      typical but implementation-defined).
 */

'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

/* ------------------------------------------------------------------ *
 *  Map-backed localStorage shim
 *
 *  Implements the subset of the WebStorage API used by the module:
 *  getItem, setItem, removeItem, key, length. An optional `_quota`
 *  field caps the total stored byte length; exceeding it throws a
 *  spec-shaped error with name === 'QuotaExceededError'.
 * ------------------------------------------------------------------ */
function makeLocalStorageMock () {
  const store = new Map();
  const mock = {
    _store: store,
    _quota: Infinity,
    _setQuota (q) { this._quota = q; },
    _currentBytes () {
      let n = 0;
      store.forEach(function (v, k) { n += k.length + (v ? v.length : 0); });
      return n;
    },
    getItem (k) { return store.has(k) ? store.get(k) : null; },
    setItem (k, v) {
      const sv = String(v);
      // Compute the projected size after this write.
      const prev = store.has(k) ? (k.length + store.get(k).length) : 0;
      const next = mock._currentBytes() - prev + (k.length + sv.length);
      if (next > mock._quota) {
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        err.code = 22;
        throw err;
      }
      store.set(k, sv);
    },
    removeItem (k) { store.delete(k); },
    key (i) {
      const arr = Array.from(store.keys());
      return i >= 0 && i < arr.length ? arr[i] : null;
    },
    get length () { return store.size; }
  };
  return mock;
}

/* ------------------------------------------------------------------ *
 *  Load cat_session_storage.js into a sandbox.
 *
 *  The module ends with `})(typeof window !== 'undefined' ? window : this)`
 *  — passing a fresh `window` containing our localStorage mock causes
 *  the IIFE to attach LJTSessionStorage to it. We rebuild the module
 *  per-test so each test starts with a clean availability cache and a
 *  fresh, empty store.
 * ------------------------------------------------------------------ */
const STORAGE_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../js/cat_session_storage.js'),
  'utf8'
);

function loadStorageModule (lsMock, opts) {
  opts = opts || {};
  const win = { localStorage: lsMock };
  // Allow the test to pre-stash an injected Date.now / new Date by
  // overriding via `opts.dateNow` (used by clearOldSnapshots test).
  const sandboxDate = opts.DateCtor || Date;
  const ctx = vm.createContext({
    window: win,
    Math: Math,
    JSON: JSON,
    Date: sandboxDate,
    Array: Array,
    Object: Object,
    Number: Number,
    String: String,
    Map: Map,
    Set: Set,
    ArrayBuffer: ArrayBuffer,
    Float64Array: Float64Array,
    Int32Array: Int32Array,
    Uint8Array: Uint8Array,
    Error: Error,
    TypeError: TypeError,
    isNaN: isNaN,
    isFinite: isFinite,
    console: {
      warn: function () { /* swallow expected warnings during tests */ },
      log: function () {},
      error: function () {}
    }
  });
  vm.runInContext(STORAGE_SOURCE, ctx, { filename: 'cat_session_storage.js' });
  if (!win.LJTSessionStorage) {
    throw new Error('cat_session_storage.js did not populate window.LJTSessionStorage');
  }
  return { mod: win.LJTSessionStorage, win: win };
}

/* ------------------------------------------------------------------ *
 *  Tiny deep-equality helper (sufficient for plain JSON-shaped data).
 * ------------------------------------------------------------------ */
function deepEqual (a, b) {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a); const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(b, ka[i])) return false;
    if (!deepEqual(a[ka[i]], b[ka[i]])) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ *
 *  Test result accounting (mirrors cat_simulation.test.js).
 * ------------------------------------------------------------------ */
const results = [];
function record (id, label, passed, detail, info) {
  results.push({ id, label, passed: !!passed, detail, info: !!info });
  const tag = info ? 'INFO' : (passed ? 'PASS' : 'FAIL');
  console.log(`[${id}] ${label}: ${detail}  ${tag}`);
}

/* ================================================================== *
 *  Test 1 — isAvailable() returns true for a working localStorage and
 *  false when getItem throws.
 *
 *  Verifies the probe-key liveness check: the module writes a probe,
 *  reads it back, and removes it. Sandboxed iframes / Safari Private
 *  Browsing historically threw on setItem; we simulate the analogous
 *  failure mode by making setItem throw.
 * ================================================================== */
function test1_isAvailable () {
  const ls = makeLocalStorageMock();
  const { mod } = loadStorageModule(ls);
  const okHappy = (mod.isAvailable() === true);

  // Build a second module instance with a broken localStorage.
  const broken = makeLocalStorageMock();
  broken.setItem = function () { throw new Error('blocked'); };
  const { mod: mod2 } = loadStorageModule(broken);
  const okBroken = (mod2.isAvailable() === false);

  const ok = okHappy && okBroken;
  record(1, 'isAvailable()', ok,
    `happy=${okHappy}, broken-setItem=${okBroken}`);
}

/* ================================================================== *
 *  Test 2 — snapshotSession + loadSnapshot round-trip.
 *
 *  Writes a representative payload then reads it back. The module
 *  wraps the payload with {sessionId, savedAt, payload}; we deep-equal
 *  the inner `payload` against the original. `savedAt` is verified to
 *  be a parseable ISO string.
 * ================================================================== */
function test2_roundTrip () {
  const ls = makeLocalStorageMock();
  const { mod } = loadStorageModule(ls);
  const sessionId = 'abc-123';
  const payload = {
    partial: true,
    final: null,
    items: [{ id: 'i1', a: 1.2, b: -0.4 }, { id: 'i2', a: 0.9, b: 0.7 }],
    responses: [1, 0, 1],
    theta: 0.123,
    note: 'hello'
  };
  const wrote = mod.snapshotSession(sessionId, payload);
  const got   = mod.loadSnapshot(sessionId);
  const okWrote = (wrote === true);
  const okShape = !!(got && got.sessionId === sessionId
                  && typeof got.savedAt === 'string'
                  && !isNaN(Date.parse(got.savedAt)));
  const okPayload = okShape && deepEqual(got.payload, payload);
  const ok = okWrote && okShape && okPayload;
  record(2, 'snapshotSession + loadSnapshot round-trip', ok,
    `wrote=${okWrote}, shape=${okShape}, deepEqual=${okPayload}`);
}

/* ================================================================== *
 *  Test 3 — loadAllSnapshots returns newest first.
 *
 *  Writes 3 snapshots while advancing a mocked clock; ISO 8601 strings
 *  sort lexicographically, so the module's sort should yield ids
 *  [s3, s2, s1] (most recent first). We patch Date inside the sandbox
 *  to advance ~1 second per write.
 * ================================================================== */
function test3_loadAllSorted () {
  const ls = makeLocalStorageMock();

  // Build a Date stand-in whose new Date() returns a fixed millisecond
  // counter that the test advances explicitly.
  let nowMs = Date.UTC(2026, 0, 1, 0, 0, 0);
  function FakeDate (arg) {
    if (!(this instanceof FakeDate)) return new FakeDate(arg).toString();
    this._ms = (arg === undefined) ? nowMs : new Date(arg).getTime();
  }
  FakeDate.now = function () { return nowMs; };
  FakeDate.parse = Date.parse;
  FakeDate.UTC   = Date.UTC;
  FakeDate.prototype.toISOString = function () {
    return new Date(this._ms).toISOString();
  };
  FakeDate.prototype.getTime = function () { return this._ms; };

  const { mod } = loadStorageModule(ls, { DateCtor: FakeDate });

  mod.snapshotSession('s1', { tag: 'first' });
  nowMs += 1000;
  mod.snapshotSession('s2', { tag: 'second' });
  nowMs += 1000;
  mod.snapshotSession('s3', { tag: 'third' });

  const all = mod.loadAllSnapshots();
  const okLen = (all.length === 3);
  const okOrder = okLen
    && all[0].sessionId === 's3'
    && all[1].sessionId === 's2'
    && all[2].sessionId === 's1';
  const okPayload = okOrder
    && all[0].payload.tag === 'third'
    && all[2].payload.tag === 'first';
  const ok = okLen && okOrder && okPayload;
  record(3, 'loadAllSnapshots newest-first', ok,
    `n=${all.length}, order=[${all.map(s => s.sessionId).join(',')}]`);
}

/* ================================================================== *
 *  Test 4 — clearSnapshot removes only the named entry.
 *
 *  Writes two snapshots, clears one by id, confirms the other survives
 *  and that clearSnapshot returns true for an existing key and false
 *  for a missing one.
 * ================================================================== */
function test4_clearSingle () {
  const ls = makeLocalStorageMock();
  const { mod } = loadStorageModule(ls);
  mod.snapshotSession('keep-me', { v: 1 });
  mod.snapshotSession('drop-me', { v: 2 });
  const removed = mod.clearSnapshot('drop-me');
  const missing = mod.clearSnapshot('never-existed');
  const stillHave = mod.loadSnapshot('keep-me');
  const dropped = mod.loadSnapshot('drop-me');
  const ok = (removed === true)
          && (missing === false)
          && !!stillHave
          && stillHave.payload.v === 1
          && dropped === null;
  record(4, 'clearSnapshot removes one', ok,
    `removed=${removed}, missing-returned=${missing}, ` +
    `keep-loaded=${!!stillHave}, drop-loaded=${dropped !== null}`);
}

/* ================================================================== *
 *  Test 5 — clearAllSnapshots removes only prefixed keys.
 *
 *  Writes 2 LJT snapshots plus 1 unrelated key (different prefix).
 *  After clearAllSnapshots(), the unrelated key must remain. The
 *  return value must equal the count of prefixed keys removed.
 * ================================================================== */
function test5_clearAllOnlyPrefixed () {
  const ls = makeLocalStorageMock();
  const { mod } = loadStorageModule(ls);
  mod.snapshotSession('aaa', { x: 1 });
  mod.snapshotSession('bbb', { x: 2 });
  // Inject an unrelated key directly into the underlying store. We
  // bypass the module entirely so it cannot influence the prefix.
  ls.setItem('UNRELATED_OTHER_APP_KEY', 'do-not-touch');

  const before = ls.length;
  const cleared = mod.clearAllSnapshots();
  const survived = ls.getItem('UNRELATED_OTHER_APP_KEY');
  const ok = (cleared === 2)
          && (survived === 'do-not-touch')
          && (ls.length === before - 2);
  record(5, 'clearAllSnapshots prefixed only', ok,
    `cleared=${cleared}, survived=${survived === 'do-not-touch'}, ` +
    `length_before=${before}, length_after=${ls.length}`);
}

/* ================================================================== *
 *  Test 6 — clearOldSnapshots(7) keeps recent and removes old.
 *
 *  Writes two snapshots then post-mutates the underlying JSON to set
 *  one entry's savedAt to ~30 days ago. clearOldSnapshots(7) should
 *  remove that one and leave the recent one intact.
 * ================================================================== */
function test6_clearOld () {
  const ls = makeLocalStorageMock();
  const { mod } = loadStorageModule(ls);
  mod.snapshotSession('recent', { v: 'r' });
  mod.snapshotSession('ancient', { v: 'a' });

  // Rewrite the 'ancient' entry's savedAt to 30 days ago. Mutating the
  // store directly is the simplest way to bypass the module's clock.
  const ancientKey = mod.STORAGE_KEY_PREFIX + 'ancient';
  const ancientWrap = JSON.parse(ls.getItem(ancientKey));
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  ancientWrap.savedAt = thirtyDaysAgo;
  ls.setItem(ancientKey, JSON.stringify(ancientWrap));

  const cleared = mod.clearOldSnapshots(7);
  const recent = mod.loadSnapshot('recent');
  const ancient = mod.loadSnapshot('ancient');
  const ok = (cleared === 1)
          && (!!recent && recent.payload.v === 'r')
          && (ancient === null);
  record(6, 'clearOldSnapshots(7)', ok,
    `cleared=${cleared}, recent_kept=${!!recent}, ancient_kept=${ancient !== null}`);
}

/* ================================================================== *
 *  Test 7 — Float64Array survives round-trip via plain-array conversion.
 *
 *  cat_session_storage.js explicitly handles ArrayBuffer.isView(value)
 *  by converting to a plain Array before JSON.stringify. We verify
 *  (a) the loaded payload is a plain Array (not a Float64Array — JSON
 *  loses that distinction anyway), and (b) the numeric values are
 *  preserved bit-equivalent within the tolerances of Float64.
 * ================================================================== */
function test7_float64ArrayRoundTrip () {
  const ls = makeLocalStorageMock();
  const { mod } = loadStorageModule(ls);
  const original = new Float64Array([0.0, 1.5, -3.14159, 1e-12, 1e12]);
  const payload = {
    grid: original,
    nested: { weights: new Float64Array([0.25, 0.5, 0.25]) }
  };
  const wrote = mod.snapshotSession('typed', payload);
  const got = mod.loadSnapshot('typed');
  const okWrote = (wrote === true);
  const isArr = okWrote && Array.isArray(got.payload.grid)
             && Array.isArray(got.payload.nested.weights);
  const lenOK = isArr && got.payload.grid.length === original.length;
  let valuesOK = lenOK;
  if (lenOK) {
    for (let i = 0; i < original.length; i++) {
      if (Math.abs(got.payload.grid[i] - original[i]) > 1e-15 * Math.max(1, Math.abs(original[i]))) {
        valuesOK = false; break;
      }
    }
  }
  const nestedOK = isArr
    && got.payload.nested.weights.length === 3
    && got.payload.nested.weights[0] === 0.25
    && got.payload.nested.weights[1] === 0.5
    && got.payload.nested.weights[2] === 0.25;
  const ok = okWrote && isArr && lenOK && valuesOK && nestedOK;
  record(7, 'Float64Array round-trip via plain-array', ok,
    `wrote=${okWrote}, isPlainArray=${isArr}, len=${lenOK}, ` +
    `values=${valuesOK}, nested=${nestedOK}`);
}

/* ================================================================== *
 *  Test 8 — QuotaExceededError triggers eviction + retry.
 *
 *  Sets a small _quota on the mock so two snapshots cannot coexist.
 *  After the first snapshot fills most of the quota, the second
 *  setItem call throws QuotaExceededError; the module's catch path
 *  invokes clearOldSnapshots(0) (full eviction) and retries. The
 *  second snapshot must therefore land successfully, and the first
 *  must have been evicted.
 *
 *  This guards the eviction loop in snapshotSession's catch branch.
 * ================================================================== */
function test8_quotaEvictAndRetry () {
  const ls = makeLocalStorageMock();
  // Compute a quota that comfortably fits ONE typical wrapper but not
  // two. We size the payload so its serialized JSON dominates the
  // stored bytes; setting quota = approx 1.5x one entry forces the
  // eviction path on the second write.
  const bigPayload = {
    note: 'X'.repeat(2000),
    arr: new Array(50).fill(0).map((_, i) => i)
  };
  const { mod: probe } = loadStorageModule(makeLocalStorageMock());
  probe.snapshotSession('sizing', bigPayload);
  // Approximate one-entry size by inspecting the probe's underlying
  // store; we don't have direct access here, so we reuse the same
  // payload and let the mock measure. Since we cannot peek into a
  // module-private store, set a quota that's a sensible function of
  // the JSON length.
  const oneJSON = JSON.stringify({
    sessionId: 'first',
    savedAt: new Date().toISOString(),
    payload: bigPayload
  });
  // Quota fits one wrapper plus its key, with no slack for a second.
  ls._setQuota(oneJSON.length + ('LJT_CAT_session_v1__first').length + 50);

  const { mod } = loadStorageModule(ls);
  const w1 = mod.snapshotSession('first', bigPayload);
  const w2 = mod.snapshotSession('second', bigPayload);

  const got1 = mod.loadSnapshot('first');
  const got2 = mod.loadSnapshot('second');
  const ok = (w1 === true)
          && (w2 === true)
          && (got1 === null)              // evicted
          && !!got2 && got2.sessionId === 'second';
  record(8, 'QuotaExceededError eviction + retry', ok,
    `w1=${w1}, w2=${w2}, first_evicted=${got1 === null}, second_present=${!!got2}`);
}

/* ------------------------------------------------------------------ *
 *  Run all tests.
 * ------------------------------------------------------------------ */
test1_isAvailable();
test2_roundTrip();
test3_loadAllSorted();
test4_clearSingle();
test5_clearAllOnlyPrefixed();
test6_clearOld();
test7_float64ArrayRoundTrip();
test8_quotaEvictAndRetry();

const hard = results.filter(r => !r.info);
const passed = hard.filter(r => r.passed).length;
const failed = hard.length - passed;
const infos  = results.length - hard.length;
console.log(`SUMMARY: ${passed} passed, ${failed} failed (${infos} informational)`);
if (failed > 0) process.exitCode = 1;
