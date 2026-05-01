/**
 * xlsx_export.js — Excel export via SheetJS (v2 schema)
 *
 * PURPOSE
 *   Serialize an LJT-CAT session payload to a multi-sheet .xlsx workbook
 *   with column-type discipline appropriate for psychometric secondary
 *   analysis (R: mirt, TAM, catR; Python: girth, py-irt). On any
 *   SheetJS / browser failure, falls back to a sibling JSON download so
 *   that no participant data is silently lost.
 *
 * SHEETS PRODUCED
 *   1. summary             — one-row session-level summary
 *   2. responses           — one row per delivered trial (+ flagged_nt)
 *   3. practice            — practice trial log
 *   4. item_bank           — selected candidate set / full bank
 *   5. cat_trace           — long-form trace of theta/SE per step
 *                            (long-form follows mirt::mirtCAT and catR
 *                            convention; one row per (trial, factor)
 *                            update where applicable)
 *   6. quality_flags       — boolean flags per detector
 *   7. events              — event-level log (UI focus, audio, etc.)
 *   8. protocol_manifest   — flattened key/value of session manifest
 *   9. metadata            — workbook-level provenance & methods
 *
 * COLUMN TYPE CONVENTIONS
 *   - Booleans serialized as 1 / 0 integers for analytic friendliness.
 *     This mirrors SPSS/Stata conventions and the tidyverse `haven`
 *     export defaults, where logical TRUE/FALSE round-trips as 1/0
 *     because downstream IRT packages (mirt, TAM) expect numeric.
 *     Affected columns: correct, timed_out, skipped, flagged_nt,
 *     valid_for_reporting, research_mode, self_paced, auto_play_audio,
 *     practice_completed, *_flag (uniform_yes_flag, etc.).
 *   - NA handling: JavaScript null / undefined are written as truly
 *     empty cells (not 0, not the string "null"). SheetJS json_to_sheet
 *     skips undefined cells by default; we additionally normalize null
 *     -> undefined so that R `read_excel` returns NA rather than 0.
 *   - theta_* / se_* / joint_se / cov12 / lz_* / lzstar_* numeric
 *     columns: number-format z = '0.0000' (4 decimals, no thousand
 *     separator, locale-independent — Excel format codes are not
 *     localized in the file even though they may render localized).
 *   - Date-like ISO strings (started_at, finished_at) are forced to
 *     text type to prevent Excel's "smart" date auto-conversion which
 *     would otherwise mangle timezone offsets.
 *   - Participant IDs are forced to text to preserve leading zeros.
 *
 * LONG-STRING PROTECTION
 *   Excel hard-caps a single cell at 32,767 characters
 *   (https://support.microsoft.com/office Excel-specifications).
 *   Any string field exceeding that is truncated in-cell with an
 *   explicit "[truncated@<n>chars]" suffix; the JSON fallback path
 *   preserves the full payload uncut.
 *
 * WORKBOOK PROPERTIES
 *   wb.Props = { Title, Subject, Author: 'LJT-CAT Web', CreatedDate,
 *                Comments } are populated. See README §Export schema.
 *
 * EXPORT API
 *   window.LJTExcel.export(filename, payload, options?) returns
 *   { ok, filename, format, fallback }. Backward-compatible: a
 *   2-argument call is identical to the original signature. The
 *   third argument enables three robustness features used by the
 *   cat_app.js auto-retry chain:
 *     - options.jsonOnly      Skip xlsx and emit only a JSON blob.
 *                             Used after two consecutive xlsx
 *                             failures so we never block egress on
 *                             SheetJS. Returns fallback: 'jsonOnly'.
 *     - options.retryAttempt  Append `_retry{n}` to the filename
 *                             stem to dodge browser duplicate-name
 *                             refusal (Chrome normally appends
 *                             " (1)" but security policies / forced
 *                             redirects can drop the download).
 *     - options.onProgress    Callback fired with one of
 *                             'building' | 'writing' | 'done' |
 *                             'failed' for UI status indicators.
 *
 * BLOB-WRITE VERIFICATION
 *   Anchor-click downloads (Blob URL + a.click()) are wrapped in
 *   try/catch and the Blob URL is revoked after a 5 s setTimeout
 *   (MDN: revoke must follow consumption — see URL.createObjectURL
 *   docs at https://developer.mozilla.org/docs/Web/API/URL/createObjectURL).
 *   document.hasFocus() === false after dispatch is logged as
 *   xlsx_export_unfocused (some Safari builds suppress
 *   programmatic-click downloads when the page is not foreground).
 *
 * REFERENCES
 *   - SheetJS docs: https://docs.sheetjs.com/ (utils.json_to_sheet,
 *     cell types 'n'/'s'/'b', cell.z number format, !cols widths,
 *     writeFile browser-side anchor dispatch).
 *   - MDN URL.createObjectURL / revokeObjectURL lifecycle:
 *     https://developer.mozilla.org/docs/Web/API/URL/createObjectURL
 *   - Excel cell-string limit (32,767 chars): Microsoft Excel
 *     specifications and limits.
 *   - mirt / catR long-form trace convention: Chalmers (2012) JSS;
 *     Magis & Raiche (2012) JSS for catR.
 *   - haven SPSS export of logical -> 1/0: Wickham et al., haven docs.
 */

(function (global) {
  'use strict';

  // Excel hard limit per cell (Microsoft Excel specifications).
  var EXCEL_CELL_CHAR_LIMIT = 32767;

  // Columns that should render with 4-decimal number format.
  // Matches any column starting with these prefixes OR equal to these
  // exact names; checked case-sensitively against header text.
  var THETA_SE_PREFIXES = [
    'theta_', 'se_', 'lz_', 'lzstar_'
  ];
  var THETA_SE_EXACT = [
    'joint_se', 'cov12', 'theta_gap', 'lz', 'lzstar',
    'toeic_estimate_se', 'toeic_estimate_2f_se',
    'toeic_residual_sd', 'toeic_R_multiple',
    'toeic_2f_residual_sd', 'toeic_2f_R_multiple'
  ];

  // Columns that should be forced to TEXT type to prevent Excel's
  // date / number auto-conversion (leading-zero strip, ISO->date).
  var FORCE_TEXT_COLUMNS = [
    'participant_id', 'session_uuid', 'lab_code',
    'started_at', 'finished_at', 'item_id', 'response_keymap_id',
    'app_version', 'calibration_version', 'instruction_version',
    'user_agent'
  ];

  // Columns that should be coerced from boolean to 1/0 integer.
  // Booleans serialized as 1/0 for analytic-friendliness; cf.
  // tidyverse / haven conventions for SPSS export of logical type.
  var BOOL_TO_INT_COLUMNS = [
    'correct', 'timed_out', 'skipped', 'flagged_nt',
    'valid_for_reporting', 'research_mode', 'self_paced',
    'auto_play_audio', 'practice_completed',
    'uniform_yes_flag', 'uniform_no_flag', 'all_yes_flag', 'all_no_flag',
    'response_pattern_theta_gap_flag', 'aberrance_theta_gap_flag',
    'reached_precision'
  ];

  function isThetaSeHeader (h) {
    if (!h) return false;
    if (THETA_SE_EXACT.indexOf(h) !== -1) return true;
    for (var i = 0; i < THETA_SE_PREFIXES.length; i++) {
      if (h.indexOf(THETA_SE_PREFIXES[i]) === 0) return true;
    }
    return false;
  }

  function flattenObject (obj, prefix, out) {
    var rows = out || [];
    var base = prefix || '';
    Object.keys(obj || {}).forEach(function (key) {
      var value = obj[key];
      var path = base ? base + '.' + key : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        flattenObject(value, path, rows);
      } else {
        rows.push({
          key: path,
          value: Array.isArray(value) ? JSON.stringify(value) : value
        });
      }
    });
    return rows;
  }

  function stoppingRuleDescription (session) {
    var rule = session.stop_rule || '';
    var minText = 'min n = ' + session.min_items + ', max n = ' + session.max_items;
    if (rule === 'blueprint_pser') {
      return 'Blueprint PSER: ' + minText +
        '; stop when predicted joint-SE reduction < stop_pser (' +
        session.stop_pser + ')';
    }
    if (rule === 'pser') {
      return 'PSER: ' + minText +
        '; stop when predicted SE reduction < stop_pser (' +
        session.stop_pser + ')';
    }
    if (rule === 'max_items') {
      return 'Fixed length within adaptive engine: stop only at max n = ' +
        session.max_items;
    }
    if (rule === 'se') {
      return 'SE < ' + session.target_se + ', ' + minText +
        (session.mode === '2F_research'
          ? ' (joint SE = sqrt(se1^2 + se2^2))'
          : '');
    }
    return rule || '';
  }

  function scoringBackboneDescription (session) {
    if (session.mode === '1F') {
      var algorithm = session.algorithm || 'blueprint';
      var candidateSet = session.adaptive_candidate_set || session.selected_form_adaptive || 'full160_item_bank';
      return 'Adaptive selection: ' + algorithm + ' CAT over ' + candidateSet +
        ' using mod_hit / mod_cr per-condition 1D 2PL information; targetword overlap follows the delivery config; theta_hit/theta_cr: mod_hit / mod_cr; 2F output = post-hoc confirmatory MIRT';
    }
    return 'Item selection: 2F MIRT compensatory; theta_hit/theta_cr: mod_hit / mod_cr; 2F output = post-hoc confirmatory MIRT';
  }

  // Truncate any oversize string-cell in-place to keep Excel from
  // rejecting the workbook. The JSON fallback path always keeps the
  // full content, so nothing is lost — only the .xlsx cell is clipped.
  function clipLongStrings (rows, eventLog) {
    if (!Array.isArray(rows)) return rows;
    return rows.map(function (row) {
      if (!row || typeof row !== 'object') return row;
      var copy = {};
      Object.keys(row).forEach(function (k) {
        var v = row[k];
        if (typeof v === 'string' && v.length > EXCEL_CELL_CHAR_LIMIT) {
          var keep = EXCEL_CELL_CHAR_LIMIT - 32;
          copy[k] = v.slice(0, keep) +
            ' [truncated@' + v.length + 'chars]';
          if (eventLog && typeof eventLog.push === 'function') {
            eventLog.push({
              ts: new Date().toISOString(),
              type: 'xlsx_export_truncated',
              column: k,
              original_length: v.length
            });
          }
        } else {
          copy[k] = v;
        }
      });
      return copy;
    });
  }

  // Booleans -> 1/0 ints, null -> undefined (so SheetJS writes empty),
  // for any column listed in BOOL_TO_INT_COLUMNS. Other booleans are
  // left untouched (they remain TRUE/FALSE in Excel).
  function normalizeRow (row) {
    if (!row || typeof row !== 'object') return row;
    var copy = {};
    Object.keys(row).forEach(function (k) {
      var v = row[k];
      if (BOOL_TO_INT_COLUMNS.indexOf(k) !== -1) {
        if (v === true)  { copy[k] = 1; return; }
        if (v === false) { copy[k] = 0; return; }
        if (v === null || v === undefined) { copy[k] = undefined; return; }
        copy[k] = v;
        return;
      }
      // Explicit NA: null -> empty cell (json_to_sheet skips
      // undefined; we leverage that to keep R `read_excel` -> NA).
      if (v === null) { copy[k] = undefined; return; }
      copy[k] = v;
    });
    return copy;
  }

  function normalizeRows (rows) {
    if (!Array.isArray(rows)) return rows;
    return rows.map(normalizeRow);
  }

  // Apply per-column number format and forced text type to a worksheet
  // built by json_to_sheet. Walks row 1 (header) to discover columns,
  // then iterates the data range and tags each cell.
  function applyColumnFormatting (ws) {
    if (!ws || !ws['!ref']) return ws;
    var range = XLSX.utils.decode_range(ws['!ref']);
    var headers = [];
    var col;
    for (col = range.s.c; col <= range.e.c; col++) {
      var addr = XLSX.utils.encode_cell({ r: range.s.r, c: col });
      var cell = ws[addr];
      headers[col] = cell ? String(cell.v) : '';
    }
    var maxLens = headers.map(function (h) { return h ? h.length : 0; });
    var r;
    for (r = range.s.r + 1; r <= range.e.r; r++) {
      for (col = range.s.c; col <= range.e.c; col++) {
        var a = XLSX.utils.encode_cell({ r: r, c: col });
        var c = ws[a];
        if (!c) continue;
        var h2 = headers[col];
        if (FORCE_TEXT_COLUMNS.indexOf(h2) !== -1 && c.v !== undefined && c.v !== null) {
          c.t = 's';
          c.v = String(c.v);
          c.w = c.v;
          c.z = '@';
        } else if (isThetaSeHeader(h2) && typeof c.v === 'number') {
          c.t = 'n';
          c.z = '0.0000';
        }
        var w = c.w !== undefined ? String(c.w)
              : (c.v !== undefined && c.v !== null) ? String(c.v) : '';
        if (w.length > maxLens[col]) maxLens[col] = w.length;
      }
    }
    // Auto-size columns: SheetJS uses character-width units for !cols.
    // Cap at 50 chars to keep the workbook usable.
    ws['!cols'] = maxLens.map(function (n) {
      return { wch: Math.min(Math.max(n + 2, 8), 50) };
    });
    return ws;
  }

  function appendSheet (wb, rows, name, eventLog) {
    var clean = clipLongStrings(normalizeRows(rows || []), eventLog);
    var ws = XLSX.utils.json_to_sheet(clean);
    applyColumnFormatting(ws);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }

  // Append `_retry{n}` to the filename stem before the extension. Used
  // when the browser's default duplicate-name policy (Chrome appends
  // " (1)", " (2)" — see Chromium download_target_determiner.cc) is
  // bypassed by a security policy or forced redirect and the download
  // is silently dropped. If `attempt` is 0/undefined the filename is
  // returned untouched so the caller's first try is unchanged.
  function _withRetrySuffix (filename, attempt) {
    if (!attempt) return filename;
    var dot = filename.lastIndexOf('.');
    if (dot < 0) return filename + '_retry' + attempt;
    return filename.slice(0, dot) + '_retry' + attempt + filename.slice(dot);
  }

  // Best-effort blob-write verification. Wraps URL.createObjectURL +
  // anchor.click() in try/catch and schedules a delayed revocation so
  // the browser has time to actually start the download before the
  // blob URL is invalidated (immediate revoke can race the download
  // dispatch in some Chromium / Safari builds — MDN: "make sure to
  // not revoke the URL until the resource has been fully consumed").
  // 5s is the conservative interval used by SheetJS docs example.
  // Returns { ok: bool, unfocused: bool, error: Error|null }.
  function _writeBlobWithVerify (blob, downloadName, eventLog) {
    var a = document.createElement('a');
    var url = null;
    try {
      url = URL.createObjectURL(blob);
      a.href = url;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      // Schedule revoke after 5s — see MDN URL.createObjectURL note.
      setTimeout(function () {
        try { URL.revokeObjectURL(url); } catch (_revErr) { /* noop */ }
      }, 5000);
      try { a.remove(); } catch (_rmErr) { /* noop */ }
      // hasFocus() === false signals the user switched tabs / app and
      // some browsers (Safari) suppress programmatic-click downloads
      // when the page is not the foreground document.
      var unfocused = false;
      try {
        unfocused = (typeof document.hasFocus === 'function')
          ? !document.hasFocus() : false;
      } catch (_focusErr) { unfocused = false; }
      if (unfocused && eventLog && typeof eventLog.push === 'function') {
        try {
          eventLog.push({
            ts: new Date().toISOString(),
            type: 'xlsx_export_unfocused',
            filename: downloadName
          });
        } catch (_logErr) { /* noop */ }
      }
      return { ok: true, unfocused: unfocused, error: null };
    } catch (writeErr) {
      // Click dispatch threw — log and report failure so the caller
      // can route to the JSON fallback / retry path.
      try {
        if (eventLog && typeof eventLog.push === 'function') {
          eventLog.push({
            ts: new Date().toISOString(),
            type: 'xlsx_export_blob_write_failed',
            filename: downloadName,
            message: (writeErr && writeErr.message) ? writeErr.message : String(writeErr)
          });
        }
      } catch (_logErr) { /* noop */ }
      try { if (url) URL.revokeObjectURL(url); } catch (_revErr) { /* noop */ }
      try { a.remove(); } catch (_rmErr) { /* noop */ }
      return { ok: false, unfocused: false, error: writeErr };
    }
  }

  function downloadJSONFallback (filename, payload, eventLog, retryAttempt) {
    var jsonName = filename.replace(/\.(xlsx|json)$/i, '') + '.json';
    jsonName = _withRetrySuffix(jsonName, retryAttempt || 0);
    if (payload && payload.session) payload.session.result_filename = jsonName;
    var blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json'
    });
    var verify = _writeBlobWithVerify(blob, jsonName, eventLog);
    if (!verify.ok) {
      return { ok: false, filename: jsonName, format: 'json', fallback: true };
    }
    return { ok: true, filename: jsonName, format: 'json', fallback: true };
  }

  /**
   * Export an LJT-CAT payload to .xlsx (with JSON fallback on failure).
   *
   * Column type conventions enforced here:
   *   - Booleans in BOOL_TO_INT_COLUMNS are coerced to 1 / 0 integers
   *     (analyst convention, cf. haven SPSS export of logical type).
   *   - null / undefined are written as empty cells (R: NA).
   *   - theta_*, se_*, joint_se, cov12, lz_*, lzstar_* numeric columns
   *     use Excel number format '0.0000'.
   *   - participant_id, session_uuid, started_at, finished_at and
   *     other ID/timestamp columns are forced to text (Excel-format
   *     code '@') to prevent leading-zero stripping or date auto-cast.
   *   - String cells exceeding 32,767 chars are truncated with an
   *     explicit '[truncated@<n>chars]' suffix; full content survives
   *     in the JSON fallback path.
   *
   * The `options` parameter is backward-compatible: callers that pass
   * only (filename, payload) get the original xlsx-with-JSON-fallback
   * behavior. The flags below are used by cat_app.js's auto-retry
   * chain (after two xlsx failures, switch to jsonOnly with an
   * incremented retryAttempt to dodge filename-collision blocks).
   *
   *   options.jsonOnly      (bool, default false) — Skip xlsx work
   *                         entirely and emit only a .json blob with
   *                         JSON.stringify(payload, null, 2). Returns
   *                         { ok, fallback: 'jsonOnly', filename }.
   *                         No XLSX dependency required.
   *   options.retryAttempt  (int, default 0) — Append `_retry{n}` to
   *                         the filename stem (before the extension)
   *                         to dodge browser duplicate-filename
   *                         refusal. Chrome normally auto-appends
   *                         " (1)" but security policies / forced
   *                         redirects can drop the download silently.
   *   options.onProgress    (function, optional) — Called with one of
   *                         'building' | 'writing' | 'done' | 'failed'
   *                         to drive UI status indicators.
   *
   * @param {string} filename  Target .xlsx filename.
   * @param {object} payload   Session payload (see results schema v2).
   * @param {object} [options] Optional flags — see above.
   * @returns {object}         { ok, filename, format, fallback }
   */
  function exportToExcel (filename, payload, options) {
    var opts = options || {};
    var retryAttempt = (opts.retryAttempt | 0) || 0;
    var onProgress = (typeof opts.onProgress === 'function') ? opts.onProgress : null;
    function _progress (stage) {
      if (!onProgress) return;
      try { onProgress(stage); } catch (_pErr) { /* noop */ }
    }

    // Ensure event log is writable so we can record any in-flight
    // truncation / formatting decisions for downstream auditing.
    // (Done up-front so jsonOnly / dependency-missing branches can
    // share the same logging surface as the xlsx happy path.)
    if (payload && !Array.isArray(payload.events)) payload.events = [];
    var eventLog = payload && payload.events;

    // Apply filename retry suffix (no-op when retryAttempt === 0).
    var effectiveName = _withRetrySuffix(filename, retryAttempt);

    // jsonOnly opt-in: short-circuit BEFORE touching XLSX so this
    // path runs even when SheetJS is missing or has crashed twice.
    // Used by cat_app.js's auto-retry chain after two xlsx failures.
    if (opts.jsonOnly === true) {
      _progress('building');
      var jsonName = effectiveName.replace(/\.(xlsx|json)$/i, '') + '.json';
      if (payload && payload.session) payload.session.result_filename = jsonName;
      try {
        _progress('writing');
        var jsonBlob = new Blob([JSON.stringify(payload, null, 2)], {
          type: 'application/json'
        });
        var jVerify = _writeBlobWithVerify(jsonBlob, jsonName, eventLog);
        if (!jVerify.ok) {
          _progress('failed');
          return { ok: false, filename: jsonName, format: 'json', fallback: 'jsonOnly' };
        }
        _progress('done');
        return { ok: true, filename: jsonName, format: 'json', fallback: 'jsonOnly' };
      } catch (jErr) {
        console.error('jsonOnly export failed.', jErr);
        try {
          if (eventLog && typeof eventLog.push === 'function') {
            eventLog.push({
              ts: new Date().toISOString(),
              type: 'xlsx_export_jsononly_failed',
              message: (jErr && jErr.message) ? jErr.message : String(jErr)
            });
          }
        } catch (_logErr) { /* noop */ }
        _progress('failed');
        return { ok: false, filename: jsonName, format: 'json', fallback: 'jsonOnly' };
      }
    }

    if (typeof XLSX === 'undefined') {
      console.error('SheetJS (XLSX) not loaded.');
      try {
        var fb = downloadJSONFallback(effectiveName, payload, eventLog, retryAttempt);
        _progress(fb && fb.ok ? 'done' : 'failed');
        return fb;
      } catch (fbErr) {
        console.error('JSON fallback export failed.', fbErr);
        _progress('failed');
        return { ok: false, filename: effectiveName, format: 'xlsx', fallback: false };
      }
    }

    try {
      _progress('building');
      var wb = XLSX.utils.book_new();

      // --- Workbook-level metadata (SheetJS supports wb.Props) ---
      // Provenance for Microsoft Office "File > Info" pane and any
      // downstream document-management indexer.
      wb.Props = {
        Title:       'LJT-CAT session export',
        Subject:     'Listening Judgement Task — CAT session results',
        Author:      'LJT-CAT Web',
        CreatedDate: new Date(),
        Comments:    'See README §Export schema for column-type ' +
                     'conventions (booleans -> 0/1, NA -> empty, ' +
                     'theta -> 4 decimals, IDs/timestamps as text).'
      };

      var reg = payload.session.reg || {};
      var reg2f = payload.session.reg_2f || {};
      var thetaGridLabel = payload.session.theta_min !== undefined
        ? '1D [' + payload.session.theta_min + ', ' +
          payload.session.theta_max + '] step ' +
          payload.session.theta_step + ' (' +
          payload.session.theta_points + ' points)'
        : '1D [-6, 6] step 0.01';
      var theta2GridLabel = payload.session.theta2_min !== undefined
        ? '2D [' + payload.session.theta2_min + ', ' +
          payload.session.theta2_max + '] x [' +
          payload.session.theta2_min + ', ' +
          payload.session.theta2_max + '] step ' +
          payload.session.theta2_step + ' (' +
          payload.session.theta2_grid_points + ' points)'
        : '2D [-4, 4] x [-4, 4] step 0.1';
      var practiceSummary = payload.practice.summary || {};
      var thetaGapFlag = payload.final.response_pattern_theta_gap_flag !== undefined
        ? payload.final.response_pattern_theta_gap_flag
        : payload.final.aberrance_theta_gap_flag;
      var yesPatternFlag = payload.final.uniform_yes_flag !== undefined
        ? payload.final.uniform_yes_flag
        : payload.final.all_yes_flag;
      var noPatternFlag = payload.final.uniform_no_flag !== undefined
        ? payload.final.uniform_no_flag
        : payload.final.all_no_flag;

      // --- Sheet 1: summary (one row) ---
      var summary = [{
        participant_id:       payload.participant.id,
        participant_name:     payload.participant.name,
        session_uuid:         payload.session.uuid,
        mode:                 payload.session.mode,
        delivery:             payload.session.delivery || payload.session.mode,
        algorithm:            payload.session.algorithm || '',
        stop_rule:            payload.session.stop_rule || '',
        lab_code:             payload.session.lab_code || '',
        language:             payload.session.language || '',
        research_mode:        !!payload.session.research_mode,
        started_at:           payload.session.started_at,
        finished_at:          payload.session.finished_at,
        elapsed_ms:           payload.session.elapsed_ms,
        scoring_status:       payload.final.scoring_status,
        valid_for_reporting:  payload.final.valid_for_reporting,
        stop_reason:          payload.final.stop_reason,
        result_filename:      payload.session.result_filename || effectiveName,
        instruction_version:  payload.session.instruction_version || payload.practice.instruction_version || '',
        practice_completed:   payload.practice.completed,
        practice_n_correct:   payload.practice.n_correct,
        practice_n_total:     practiceSummary.n_total,
        practice_n_answered:  practiceSummary.n_answered,
        practice_accuracy:    practiceSummary.accuracy,
        practice_n_timed_out: practiceSummary.n_timed_out,
        practice_n_audio_failed: practiceSummary.n_audio_failed,
        n_items:              payload.final.n_items,
        n_answered_items:     payload.final.n_answered_items,
        n_skipped_items:      payload.final.n_skipped_items,
        n_audio_failed_items: payload.final.n_audio_failed_items,
        n_timed_out_items:    payload.final.n_timed_out_items,
        n_hit_items:          payload.final.n_hit_items,
        n_cr_items:           payload.final.n_cr_items,
        n_hit_answered:       payload.final.n_hit_answered,
        n_cr_answered:        payload.final.n_cr_answered,
        n_hit_skipped:        payload.final.n_hit_skipped,
        n_cr_skipped:         payload.final.n_cr_skipped,
        targetword_overlap_count: payload.final.targetword_overlap_count,
        theta_gap:            payload.final.theta_gap,
        response_pattern_theta_gap_flag: thetaGapFlag,
        aberrance_theta_gap_flag: thetaGapFlag,
        uniform_yes_flag:     yesPatternFlag,
        uniform_no_flag:      noPatternFlag,
        all_yes_flag:         yesPatternFlag,
        all_no_flag:          noPatternFlag,
        yes_response_rate:    payload.final.yes_response_rate,
        median_rt_ms:         payload.final.median_rt_ms,
        median_rt_hit_ms:     payload.final.median_rt_hit_ms,
        median_rt_cr_ms:      payload.final.median_rt_cr_ms,
        too_fast_response_rate: payload.final.too_fast_response_rate,
        timeout_rate:         payload.final.timeout_rate,
        mouse_response_rate:  payload.final.mouse_response_rate,
        keyboard_response_rate: payload.final.keyboard_response_rate,
        focus_loss_count:     payload.final.focus_loss_count,
        response_keymap_id:   payload.session.response_keymap_id || '',
        response_key_appropriate: payload.session.response_key_appropriate || '',
        response_key_inappropriate: payload.session.response_key_inappropriate || '',
        auto_play_audio:      payload.session.auto_play_audio,
        audio_playback_rate:  payload.session.audio_playback_rate,
        fixation_ms:          payload.session.fixation_ms,
        timing_mode:          payload.session.timing_mode || '',
        response_window_ms:   payload.session.response_window_ms,
        pace:                 payload.session.pace || '',
        self_paced:           !!payload.session.self_paced,
        advance_key:          payload.session.advance_key || '',
        theta_min:            payload.session.theta_min,
        theta_max:            payload.session.theta_max,
        theta_step:           payload.session.theta_step,
        theta_points:         payload.session.theta_points,
        theta2_min:           payload.session.theta2_min,
        theta2_max:           payload.session.theta2_max,
        theta2_step:          payload.session.theta2_step,
        theta2_axis_points:   payload.session.theta2_axis_points,
        theta2_grid_points:   payload.session.theta2_grid_points,
        theta_hit:            payload.final.theta_hit,
        se_hit:               payload.final.se_hit,
        theta_cr:             payload.final.theta_cr,
        se_cr:                payload.final.se_cr,
        theta_backbone:       payload.final.theta_backbone,
        se_backbone:          payload.final.se_backbone,
        theta_mirt_f1:        payload.final.theta_mirt_f1,
        se_mirt_f1:           payload.final.se_mirt_f1,
        theta_mirt_f2:        payload.final.theta_mirt_f2,
        se_mirt_f2:           payload.final.se_mirt_f2,
        reached_precision:    payload.final.reached_precision,
        percentile:           payload.final.percentile,
        toeic_estimate:       payload.final.toeic_estimate,
        toeic_estimate_se:    payload.final.toeic_estimate_se,
        toeic_estimate_2f:    payload.final.toeic_estimate_2f,
        toeic_estimate_2f_se: payload.final.toeic_estimate_2f_se,
        user_agent:           payload.session.user_agent,
        app_version:          payload.session.app_version,
        calibration_version:  payload.session.calibration_version
      }];

      // Auxiliary NT-filtered scoring (Wise & Ma 2012). Live theta is unaffected.
      // Column tag is dynamic based on the actual NT threshold (e.g. nt350 / nt500).
      // Calibration was fitted on RT in [200, 10000] ms without rapid-guess
      // removal, so these are "naive-calibration + filtered-scoring" hybrids;
      // see README §Auxiliary NT-filtered scoring.
      if (payload.session && Number.isFinite(payload.session.nt_threshold_ms)) {
        var ntTag = payload.session.nt_tag ||
                    ('nt' + Math.round(payload.session.nt_threshold_ms));
        var finalSrc = payload.final || {};
        var ntCols = {
          nt_threshold_ms:                 payload.session.nt_threshold_ms,
          nt_filtered_scoring_status:      finalSrc.nt_filtered_scoring_status,
          rte_hit:                         finalSrc.rte_hit,
          rte_cr:                          finalSrc.rte_cr,
          n_flagged_nt_hit:                finalSrc.n_flagged_nt_hit,
          n_flagged_nt_cr:                 finalSrc.n_flagged_nt_cr,
          n_valid_after_nt_hit:            finalSrc.n_valid_after_nt_hit,
          n_valid_after_nt_cr:             finalSrc.n_valid_after_nt_cr
        };
        ntCols['theta_hit_' + ntTag]               = finalSrc['theta_hit_' + ntTag];
        ntCols['se_hit_' + ntTag]                  = finalSrc['se_hit_' + ntTag];
        ntCols['theta_cr_' + ntTag]                = finalSrc['theta_cr_' + ntTag];
        ntCols['se_cr_' + ntTag]                   = finalSrc['se_cr_' + ntTag];
        ntCols['theta_mirt_f1_' + ntTag]           = finalSrc['theta_mirt_f1_' + ntTag];
        ntCols['se_mirt_f1_' + ntTag]              = finalSrc['se_mirt_f1_' + ntTag];
        ntCols['theta_mirt_f2_' + ntTag]           = finalSrc['theta_mirt_f2_' + ntTag];
        ntCols['se_mirt_f2_' + ntTag]              = finalSrc['se_mirt_f2_' + ntTag];
        ntCols['toeic_estimate_' + ntTag]          = finalSrc['toeic_estimate_' + ntTag];
        ntCols['toeic_estimate_se_' + ntTag]       = finalSrc['toeic_estimate_se_' + ntTag];
        ntCols['toeic_estimate_2f_' + ntTag]       = finalSrc['toeic_estimate_2f_' + ntTag];
        ntCols['toeic_estimate_2f_se_' + ntTag]    = finalSrc['toeic_estimate_2f_se_' + ntTag];
        Object.assign(summary[0], ntCols);
      }

      appendSheet(wb, summary, 'summary', eventLog);

      // --- Sheet 2: responses ---
      // Augment per-trial rows with `flagged_nt` (rt_ms < nt_threshold_ms).
      // This mirrors the auxiliary scoring path so researchers can audit
      // exactly which trials were excluded from the NT-filtered theta.
      var ntMs = payload.session && Number.isFinite(payload.session.nt_threshold_ms)
        ? payload.session.nt_threshold_ms : null;
      var responsesAugmented = (payload.responses || []).map(function (row) {
        var rt = Number(row && row.rt_ms);
        var flagged = (ntMs !== null && Number.isFinite(rt)) ? (rt < ntMs) : null;
        return Object.assign({}, row, { flagged_nt: flagged });
      });
      appendSheet(wb, responsesAugmented, 'responses', eventLog);

      // --- Sheet 3: practice ---
      appendSheet(wb, payload.practice.log || [], 'practice', eventLog);

      // --- Sheet 4: item bank / selected candidate set ---
      appendSheet(wb, payload.item_bank || [], 'item_bank', eventLog);

      // --- Sheet 5: CAT trace ---
      // Long-form (one row per step) follows mirtCAT / catR convention
      // for trace tables (Chalmers 2012; Magis & Raiche 2012).
      appendSheet(wb, payload.cat_trace || [], 'cat_trace', eventLog);

      // --- Sheet 6: quality flags ---
      appendSheet(wb, payload.quality_flags || [], 'quality_flags', eventLog);

      // --- Sheet 7: event-level log ---
      appendSheet(wb, payload.events || [], 'events', eventLog);

      // --- Sheet 8: protocol manifest ---
      appendSheet(wb,
        flattenObject(payload.protocol_manifest || {}),
        'protocol_manifest', eventLog);

      // --- Sheet 9: metadata ---
      var meta = [
        { key: 'filename',            value: effectiveName },
        { key: 'app_version',         value: payload.session.app_version },
        { key: 'calibration_version', value: payload.session.calibration_version },
        { key: 'instruction_version', value: payload.session.instruction_version || payload.practice.instruction_version || '' },
        { key: 'practice_summary',    value: JSON.stringify(practiceSummary) },
        { key: 'mode',                value: payload.session.mode },
        { key: 'delivery',            value: payload.session.delivery || payload.session.mode },
        { key: 'algorithm',           value: payload.session.algorithm || '' },
        { key: 'stop_rule',           value: payload.session.stop_rule || '' },
        { key: 'language',            value: payload.session.language || '' },
        { key: 'research_mode',       value: !!payload.session.research_mode },
        { key: 'theta_grid',
          value: payload.session.mode === '1F'
            ? thetaGridLabel
            : theta2GridLabel },
        { key: 'stopping_rule',
          value: stoppingRuleDescription(payload.session) },
        { key: 'max_play_fails_per_item',
          value: payload.session.max_play_fails },
        { key: 'min_answered_required',
          value: payload.session.min_answered_required },
        { key: 'min_answered_per_condition_required',
          value: payload.session.min_answered_per_condition_required },
        { key: 'stop_pser',
          value: payload.session.stop_pser },
        { key: 'quota_tol',
          value: payload.session.quota_tol },
        { key: 'theta_scale',
          value: 'Per-condition 1D EAP + confirmatory 2F MIRT EAP (standard normal priors) — logits' },
        { key: 'backbone_model',
          value: payload.session.backbone_model || '' },
        { key: 'item_selection_model',
          value: payload.session.item_selection_model || '' },
        { key: 'selected_form_adaptive',
          value: payload.session.selected_form_adaptive || '' },
        { key: 'presentation_order_policy',
          value: payload.session.presentation_order_policy || '' },
        { key: 'max_condition_run',
          value: payload.session.max_condition_run || '' },
        { key: 'auto_play_audio',
          value: payload.session.auto_play_audio },
        { key: 'audio_playback_rate',
          value: payload.session.audio_playback_rate },
        { key: 'fixation_ms',
          value: payload.session.fixation_ms },
        { key: 'post_response_ms',
          value: payload.session.post_response_ms },
        { key: 'pace',
          value: payload.session.pace || '' },
        { key: 'self_paced',
          value: !!payload.session.self_paced },
        { key: 'advance_key',
          value: payload.session.advance_key || '' },
        { key: 'theta_min',
          value: payload.session.theta_min },
        { key: 'theta_max',
          value: payload.session.theta_max },
        { key: 'theta_step',
          value: payload.session.theta_step },
        { key: 'theta_points',
          value: payload.session.theta_points },
        { key: 'theta2_min',
          value: payload.session.theta2_min },
        { key: 'theta2_max',
          value: payload.session.theta2_max },
        { key: 'theta2_step',
          value: payload.session.theta2_step },
        { key: 'theta2_axis_points',
          value: payload.session.theta2_axis_points },
        { key: 'theta2_grid_points',
          value: payload.session.theta2_grid_points },
        { key: 'timing_mode',
          value: payload.session.timing_mode || '' },
        { key: 'response_window_ms',
          value: payload.session.response_window_ms },
        // NT (Normative Threshold) for auxiliary rapid-guessing-aware theta
        // (Wise & Ma 2012 / Wise & DeMars 2006 / Wise & Kong 2005). Live theta
        // is unaffected. Calibration was fitted on RT in [200, 10000] ms with
        // no rapid-guess removal; auxiliary scores are therefore "naive
        // calibration + filtered scoring" hybrids — see README.
        { key: 'nt_threshold_ms',
          value: payload.session.nt_threshold_ms },
        { key: 'nt_filter_method',
          value: 'Wise & DeMars (2006) effort-moderated: trials with rt_ms < nt_threshold_ms are excluded; auxiliary theta_*_<NT_TAG> are computed via the same per-condition / 2F EAP pipeline. Calibration NOT re-fitted with rapid-guess removal — flagged as a "naive-calibration + filtered-scoring" hybrid for transparency.' },
        { key: 'nt_filtered_scoring_status',
          value: payload.session.nt_filtered_scoring_status || '' },
        { key: 'response_keymap_id',
          value: payload.session.response_keymap_id || '' },
        { key: 'response_key_appropriate',
          value: payload.session.response_key_appropriate || '' },
        { key: 'response_key_inappropriate',
          value: payload.session.response_key_inappropriate || '' },
        { key: 'scoring_backbone',
          value: scoringBackboneDescription(payload.session) },
        { key: 'toeic_regression',
          value: 'Per-condition: TOEIC ~ intercept + slope_hit * theta_hit + slope_cr * theta_cr' },
        { key: 'toeic_intercept',   value: reg.intercept    },
        { key: 'toeic_slope_hit',   value: reg.slope_hit    },
        { key: 'toeic_slope_cr',    value: reg.slope_cr     },
        { key: 'toeic_residual_sd', value: reg.residual_sd  },
        { key: 'toeic_R_multiple',  value: reg.R            },
        { key: 'toeic_reg_n',       value: reg.n            },
        { key: 'toeic_se_formula',
          value: 'sqrt(slope_hit^2 * SE_hit^2 + slope_cr^2 * SE_cr^2 + residual_sd^2)' },
        { key: 'toeic_regression_2f',
          value: 'Confirmatory 2F MIRT: TOEIC ~ intercept + slope_F1 * theta_mirt_f1 + slope_F2 * theta_mirt_f2' },
        { key: 'toeic_2f_intercept',   value: reg2f.intercept   },
        { key: 'toeic_2f_slope_F1',    value: reg2f.slope_F1    },
        { key: 'toeic_2f_slope_F2',    value: reg2f.slope_F2    },
        { key: 'toeic_2f_residual_sd', value: reg2f.residual_sd },
        { key: 'toeic_2f_R_multiple',  value: reg2f.R           },
        { key: 'toeic_2f_reg_n',       value: reg2f.n           },
        { key: 'toeic_2f_se_formula',
          value: 'sqrt(slope_F1^2 * SE_F1^2 + slope_F2^2 * SE_F2^2 + 2 * slope_F1 * slope_F2 * Cov(F1,F2) + residual_sd^2)' },
        { key: 'percentile_reference',
          value: 'Calibration predicted-TOEIC distribution, n = ' +
                 (payload.session.reference_n || '?') },
        { key: 'participant_url',
          value: payload.protocol_manifest && payload.protocol_manifest.participant_url
            ? payload.protocol_manifest.participant_url
            : '' },
        { key: 'research_url',
          value: payload.protocol_manifest && payload.protocol_manifest.research_url
            ? payload.protocol_manifest.research_url
            : '' },
        { key: 'url_params',        value: payload.session.url_params_raw }
      ];
      appendSheet(wb, meta, 'metadata', eventLog);

      _progress('writing');
      // SheetJS XLSX.writeFile internally constructs a Blob and
      // dispatches an anchor click in the browser build (see
      // https://docs.sheetjs.com/docs/api/write-options/). We
      // wrap it so an unfocused-tab download suppression is logged
      // to the event log but still reported as ok=true (the file
      // may have been delivered — best-effort verification only).
      XLSX.writeFile(wb, effectiveName, { bookType: 'xlsx', compression: true });
      try {
        var stillFocused = (typeof document !== 'undefined' &&
          typeof document.hasFocus === 'function') ? document.hasFocus() : true;
        if (!stillFocused && eventLog && typeof eventLog.push === 'function') {
          eventLog.push({
            ts: new Date().toISOString(),
            type: 'xlsx_export_unfocused',
            filename: effectiveName
          });
        }
      } catch (_focusErr) { /* noop */ }
      _progress('done');
      return { ok: true, filename: effectiveName, format: 'xlsx', fallback: false };
    } catch (err) {
      console.error('Excel export failed.', err);
      // Record the failure in the session event log so the audit trail
      // does not silently lose the reason for falling back to JSON.
      try {
        if (eventLog && typeof eventLog.push === 'function') {
          eventLog.push({
            ts: new Date().toISOString(),
            type: 'xlsx_export_failed',
            message: (err && err.message) ? err.message : String(err),
            stack: (err && err.stack) ? err.stack : null
          });
        }
      } catch (_logErr) { /* best-effort logging only */ }
      try {
        var fbResult = downloadJSONFallback(effectiveName, payload, eventLog, retryAttempt);
        _progress(fbResult && fbResult.ok ? 'done' : 'failed');
        return fbResult;
      } catch (fallbackErr) {
        console.error('JSON fallback export failed.', fallbackErr);
        _progress('failed');
        return { ok: false, filename: effectiveName, format: 'xlsx', fallback: false };
      }
    }
  }

  global.LJTExcel = { export: exportToExcel };
})(window);
