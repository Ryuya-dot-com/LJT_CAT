# LJT-CAT regression test suite

Pure-Node deterministic tests for the LJT-CAT JavaScript modules.  No npm
dependencies — only the Node standard library is required.  Two test files
currently live here:

* `cat_simulation.test.js` — simulation tests for `js/cat_1f.js` (the 1D
  2PL CAT engine).  Requires `data/calibration.json`.
* `storage.test.js` — unit tests for `js/cat_session_storage.js` (the
  `window.LJTSessionStorage` localStorage wrapper).  Fully isolated; **no
  calibration data needed**.  Mocks `window` and `localStorage` with a
  Map-backed shim and runs the source module inside a `vm` sandbox.

## How to run

From the repository root, run each suite directly:

```bash
node tests/cat_simulation.test.js
node tests/storage.test.js
```

or via the convenience wrapper (runs the CAT simulation suite):

```bash
bash tests/run.sh
```

Each suite exits `0` if every hard test passes, `1` otherwise.  Both
print one line per test in the form

```
[<id>] <label>: <numeric detail>  PASS|FAIL|INFO
```

and a final `SUMMARY:` line.

## What each test covers

### `cat_simulation.test.js` (CAT engine)

| # | Name | Acceptance criterion | Source |
|---|------|----------------------|--------|
| 1 | Theta recovery (1F, N=500, length=30, true theta ~ N(0,1)) | `\|bias\| < 0.05` and `RMSE < 0.40` | Wang, Chang & Boughton (2011); Babcock & Weiss (2009) — typical 2PL CAT recovery values for 30-item fixed-length tests |
| 2 | EAP posterior SD ≈ empirical RMSE (N=200, length=30) | mean posterior SD within ±20 % of empirical RMSE | Bock & Mislevy (1982): the EAP posterior SD is the effective measurement SE |
| 3 | PSER stops earlier than fixed-SE rule on average (N=200, cap=60) | `mean(items_PSER) ≤ mean(items_SE)` | Choi, Grady & Dodd (2011); Morris, Bass, Howard & Neapolitan (2020) |
| 4 | Numerical stability of log-likelihood at extreme item parameters | `theta` and `se` finite (no NaN, no ±Inf) | Guards the `logSigmoid` softplus rewrite documented in `cat_1f.js` |
| 5 | Item exposure histogram (informational, N=1000, length=40) | none — reports max / min / top-3 exposure counts | Kingsbury & Zara (1989) — baseline before randomesque is enabled |

### `storage.test.js` (session storage)

These tests are fully isolated from the CAT engine: they do not load the
calibration data and do not depend on `cat_1f.js`.  Each test rebuilds a
fresh Map-backed `localStorage` shim and re-loads the storage module
inside a `vm.createContext` sandbox so the module's per-instance
availability cache starts clean.

| # | Name | What it verifies |
|---|------|------------------|
| 1 | `isAvailable()` | Returns `true` for a working mock; returns `false` when `setItem` throws (Safari Private Browsing / sandboxed iframe analogue). |
| 2 | snapshot + load round-trip | `snapshotSession` returns `true`; `loadSnapshot` returns a wrapper with the original `sessionId`, an ISO `savedAt`, and a `payload` deep-equal to the input. |
| 3 | `loadAllSnapshots` newest-first | With Date mocked to advance 1 s per write, three snapshots come back in order `[s3, s2, s1]` (most recent first; ISO 8601 sorts lexicographically). |
| 4 | `clearSnapshot` removes only one | Returns `true` for an existing key, `false` for a missing key, leaves the other entry untouched. |
| 5 | `clearAllSnapshots` only prefixed | Writes 2 LJT snapshots plus 1 unrelated key; only the 2 prefixed entries are removed and the return value is `2`. |
| 6 | `clearOldSnapshots(7)` | One entry's `savedAt` is rewritten to ~30 days ago; `clearOldSnapshots(7)` returns `1`, removes the old entry, keeps the recent one. |
| 7 | `Float64Array` round-trip | `_stripNonSerializable` converts typed arrays to plain `Array`s before `JSON.stringify`; values are preserved within Float64 round-trip tolerance. |
| 8 | `QuotaExceededError` eviction + retry | A small `_quota` on the mock makes the second write throw `QuotaExceededError`; the module evicts via `clearOldSnapshots(0)` and retries. The first entry is gone, the second is present. |

### Why these thresholds

* `|bias| < 0.05` and `RMSE < 0.40` are conservative envelopes around the
  values reported by Babcock & Weiss (2009, Table 2) and Wang et al.
  (2011, simulation 1) for 2PL CATs of comparable length.  The intent is
  to catch regressions, not to certify a publication-quality recovery
  study; tighter banks would justify tighter thresholds.
* The ±20 % tolerance on the SE/RMSE ratio is a Monte Carlo allowance for
  N=200 simulees; under Bock & Mislevy (1982) the asymptotic ratio is 1.0.
* The PSER comparison is a strict inequality on mean items administered;
  Choi et al. (2011) and Morris et al. (2020) both report that PSER
  with `stop_pser ≈ 0.01` saves several items on banks with peaked
  information functions, which the LJT bank is.

## Determinism

All randomness flows from a single Mulberry32 PRNG instance per test,
seeded with a fixed constant (`0xC0FFEE`, `0xBEEF`, `0xA11CE`, `0x515A`).
Output is therefore byte-identical across runs and machines.  Box-Muller
is used to draw N(0, 1) true thetas.

## Loading `cat_1f.js` under Node

`cat_1f.js` is browser-style — it ends with `})(window)`.  The test
harness creates a fresh `window` shim in a `vm.createContext` sandbox and
runs the file there, then reads `window.CAT1F` back out.  This means the
suite is robust against concurrent edits to `cat_1f.js` (e.g. new helper
methods being added) provided the four documented exports
(`create`, `createTwoCondition`, `scoreSubset`, `gridSpec`) keep their
shapes.

## Adding a new test

1. Add a `test<N>_<name>` function near the others.
2. Use the existing PRNG / Normal sampler helpers and **always pass a
   fresh seed**, never `Math.random()`, so the test stays deterministic.
3. Use `record(id, label, passed, detail)` for hard pass/fail tests, or
   `record(id, label, true, detail, true)` for an informational entry
   that should not affect the exit code.
4. Cite the published source (paper + section / table / equation) for
   any numerical threshold in an inline comment above the test.
5. Append a row to the table in this README and re-run the suite.

## References

* Babcock, B., & Weiss, D. J. (2009). Termination criteria in computerized
  adaptive tests: Do variable-length CATs provide efficient and effective
  measurement? *Journal of Computerized Adaptive Testing*, 1(1), 1–18.
* Bock, R. D., & Mislevy, R. J. (1982). Adaptive EAP estimation of ability
  in a microcomputer environment. *Applied Psychological Measurement*,
  6(4), 431–444.
* Choi, S. W., Grady, M. W., & Dodd, B. G. (2011). A new stopping rule for
  computerized adaptive testing. *Educational and Psychological
  Measurement*, 71(1), 37–53.
* Kingsbury, G. G., & Zara, A. R. (1989). Procedures for selecting items
  for computerized adaptive tests. *Applied Measurement in Education*,
  2(4), 359–375.
* Morris, S. B., Bass, M., Howard, E., & Neapolitan, R. E. (2020).
  Stopping rules for computer adaptive testing when item banks have
  nonuniform information. *International Journal of Testing*, 20(2),
  146–168.
* Wang, C., Chang, H.-H., & Boughton, K. A. (2011). Kullback–Leibler
  information and its applications in multi-dimensional adaptive testing.
  *Psychometrika*, 76(1), 13–39.
