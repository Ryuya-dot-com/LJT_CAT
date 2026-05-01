# Changelog

All notable changes to LJT-CAT Web are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Methodological references section in README and researcher panel
  (Bock & Mislevy, 1982; Choi et al., 2011; Morris et al., 2020;
  Babcock & Weiss, 2009; van der Linden & Glas, 2010; Wainer et al., 2000;
  Weiss, 1982; Wise & DeMars, 2006; Wise & Kong, 2005; Wise & Ma, 2012).
- Stable softplus-based `logSigmoid` helper in `cat_1f.js` and `cat_2f.js`
  to replace the prior `Math.log(p + 1e-300)` pattern that biased the
  posterior at extreme item parameters by up to ~10 log-units.
- Cached normalized-weight computation in `posteriorStats`,
  `posteriorStatsFor`, `summarizePosterior`, and `scoreSubset` (3 exp
  loops collapsed to 1, ~1.5-3x speedup with no semantic change).
- `predictedSeReduction` JSDoc clarifying it implements the
  computationally inexpensive first-order PSER variant of
  Choi et al. (2011), which Morris et al. (2020) tune `stop_pser` against.
- Researcher panel: clickable DOI links, themed reference grouping
  (Estimation / Stopping rules / CAT theory), per-stop-rule tooltips,
  computational-cost warnings for large theta grids.
- Response-time zero point captured *before* DOM mutation in
  `revealTarget()` so the gap between HTML5 `ended` and RT 0 drops
  to microseconds.
- README "Response Time Measurement" section documenting the exact
  RT semantics for methods sections.
- Person-fit statistics (lz, lz\*) per condition, computed from
  Drasgow et al. (1985) and Snijders (2001) and exposed via session
  finalize output.
- Optional randomesque item selection (Kingsbury & Zara, 1989) in
  the two-condition session API; default off for backward compatibility.
- Posterior boundary diagnostic exposed via session finalize output
  (flags > 1% mass at grid edges).
- Calibration JSON schema validation and content-hashing on load;
  hash propagated to the Excel `metadata` sheet for reproducibility.
- Build / reproducibility metadata fields in Excel output:
  `app_version`, `asset_cache_version`, `calibration_hash`,
  `build_timestamp`, `user_agent`, `tz_offset_minutes`.
- Collapsible `<details>` sections in the researcher panel.
- Tightened `stop_pser` acceptable range to [0.0001, 0.1] with
  out-of-recommended-range visual warning.
- Deterministic Node-based regression test suite under `tests/`
  covering theta recovery, EAP SE calibration, PSER efficiency vs
  SE, and log-likelihood numerical stability.
- **Auto-download retry chain**: 4-attempt retry on result-file save
  (1.5 s, 4 s, 10 s with JSON-only fallback) so transient browser
  permission issues no longer drop research data. Each attempt is
  logged as a `result_save_attempt` event.
  (`cat_app.js`, `xlsx_export.js`)
- **Crash-recoverable session snapshots**: every 5 trials, the partial
  session payload is written to browser localStorage. If the browser
  tab closes mid-session, the next visit to the app surfaces the
  orphan and offers to save its data as Excel. Snapshots are cleared
  after a successful final save and garbage-collected after 7 days.
  New module `js/cat_session_storage.js` exposes
  `window.LJTSessionStorage` with `snapshotSession`, `loadAllSnapshots`,
  `clearSnapshot`, `clearOldSnapshots`.
- **Audio prefetch**: candidate items' audio is preloaded so
  trial-to-trial latency is dominated by participant response time,
  not network or disk I/O. Telemetry events: `audio_prefetch_*`.
- **Median-aware progress indicator**: the trial counter now reads
  "Question N / approximately 20" until N exceeds the median; the
  median is calibrated to the Morris et al. (2020) PSER ≈ 20-item
  finding.
- **ARIA live region** (`#sr-announcer`) for screen-reader phase
  announcements (practice → main → result file saved).
- **Reduced-motion support**: `@media (prefers-reduced-motion: reduce)`
  disables transitions and animations for participants who request
  reduced motion at the OS level.
- **Visible focus indicators**: WCAG 2.2 SC 2.4.7-compliant
  `:focus-visible` outline on all interactive controls.
- **Skip-to-main link** for keyboard users.
- **`jsonOnly` mode** in `LJTExcel.export(...)` for forced JSON-only
  output during the final retry attempt.
- **Filename collision avoidance**: `_retry{n}` suffix added when a
  duplicate filename is rejected.

### Changed

- `cat_2f.js` header docstring corrected: item selection criterion is
  **A-optimality** (trace of Fisher info matrix), not D-optimality -
  the determinant collapses to zero for confirmatory 2PL items
  loading on a single factor, so the trace was already in use; the
  docstring now matches the implementation.
- `Math.max(...arr)` spread on Float64Array replaced with explicit
  loops (avoids potential stack pressure at 6,561 elements in 2F).
- `LJTExcel.export(filename, payload)` signature extended to optional
  `LJTExcel.export(filename, payload, { jsonOnly?, retryAttempt?, onProgress? })`.
  Backward-compatible: existing 2-argument calls behave as before.
- Color tokens audited against WCAG 2.2 SC 1.4.3 (minimum contrast
  4.5:1). The previous `#94a3b8` secondary-text color was replaced
  with `#64748b` where it appeared on white backgrounds.

### Removed

- Unused `logSumExp` helper in `cat_1f.js`.

### Fixed

- `adaptive/index.html` was missing the `<script>` tag for
  `js/cat_session_storage.js`, which would have made the new
  crash-recovery and session-snapshot features non-functional in the
  deployed build. The script tag is now loaded before `cat_app.js`.
- The example URL in the README that previously used a specific lab
  identifier (`?lab=UCL_Komuro`) has been generalized to
  `?lab=YOUR_LAB_CODE` so the documentation does not advertise a
  particular study site.

### Documentation

- Added `LICENSE` (MIT) covering all source code.
- Added `LICENSE-MATERIALS.md` (CC BY-NC 4.0) covering the audio
  stimuli and IRT calibration JSON files. The two-license arrangement
  is documented in the README.

## [2.8.2] - 2026-04-28

Initial public release.
