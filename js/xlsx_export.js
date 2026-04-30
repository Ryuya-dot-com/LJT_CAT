/* xlsx_export.js — Excel export via SheetJS (v2 schema)
 *
 * v2 schema: per-condition scoring + post-hoc 2F MIRT.
 * TOEIC regressions:
 *   session.reg    = regression.per_condition
 *   session.reg_2f = regression.2F
 */

(function (global) {
  'use strict';

  function flattenObject (obj, prefix, out) {
    const rows = out || [];
    const base = prefix || '';
    Object.keys(obj || {}).forEach(key => {
      const value = obj[key];
      const path = base ? base + '.' + key : key;
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
    const rule = session.stop_rule || '';
    const minText = 'min n = ' + session.min_items + ', max n = ' + session.max_items;
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
      const algorithm = session.algorithm || 'blueprint';
      const candidateSet = session.adaptive_candidate_set || session.selected_form_adaptive || 'full160_item_bank';
      return 'Adaptive selection: ' + algorithm + ' CAT over ' + candidateSet +
        ' using mod_hit / mod_cr per-condition 1D 2PL information; targetword overlap follows the delivery config; theta_hit/theta_cr: mod_hit / mod_cr; 2F output = post-hoc confirmatory MIRT';
    }
    return 'Item selection: 2F MIRT compensatory; theta_hit/theta_cr: mod_hit / mod_cr; 2F output = post-hoc confirmatory MIRT';
  }

  function downloadJSONFallback (filename, payload) {
    const jsonName = filename.replace(/\.(xlsx|json)$/i, '') + '.json';
    if (payload && payload.session) payload.session.result_filename = jsonName;
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json'
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = jsonName;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
    return { ok: true, filename: jsonName, format: 'json', fallback: true };
  }

  function exportToExcel (filename, payload) {
    if (typeof XLSX === 'undefined') {
      console.error('SheetJS (XLSX) not loaded.');
      return false;
    }

    const wb = XLSX.utils.book_new();
    const reg = payload.session.reg || {};
    const reg2f = payload.session.reg_2f || {};
    const thetaGridLabel = payload.session.theta_min !== undefined
      ? '1D [' + payload.session.theta_min + ', ' +
        payload.session.theta_max + '] step ' +
        payload.session.theta_step + ' (' +
        payload.session.theta_points + ' points)'
      : '1D [-6, 6] step 0.01';
    const theta2GridLabel = payload.session.theta2_min !== undefined
      ? '2D [' + payload.session.theta2_min + ', ' +
        payload.session.theta2_max + '] x [' +
        payload.session.theta2_min + ', ' +
        payload.session.theta2_max + '] step ' +
        payload.session.theta2_step + ' (' +
        payload.session.theta2_grid_points + ' points)'
      : '2D [-4, 4] x [-4, 4] step 0.1';
    const practiceSummary = payload.practice.summary || {};
    const thetaGapFlag = payload.final.response_pattern_theta_gap_flag !== undefined
      ? payload.final.response_pattern_theta_gap_flag
      : payload.final.aberrance_theta_gap_flag;
    const yesPatternFlag = payload.final.uniform_yes_flag !== undefined
      ? payload.final.uniform_yes_flag
      : payload.final.all_yes_flag;
    const noPatternFlag = payload.final.uniform_no_flag !== undefined
      ? payload.final.uniform_no_flag
      : payload.final.all_no_flag;

    // --- Sheet 1: summary (one row) ---
    const summary = [{
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
      result_filename:      payload.session.result_filename || filename,
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
      const ntTag = payload.session.nt_tag ||
                    ('nt' + Math.round(payload.session.nt_threshold_ms));
      const finalSrc = payload.final || {};
      const ntCols = {
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

    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.json_to_sheet(summary), 'summary');

    // --- Sheet 2: responses ---
    // Augment per-trial rows with `flagged_nt` (rt_ms < nt_threshold_ms).
    // This mirrors the auxiliary scoring path so researchers can audit
    // exactly which trials were excluded from the NT-filtered θ.
    const ntMs = payload.session && Number.isFinite(payload.session.nt_threshold_ms)
      ? payload.session.nt_threshold_ms : null;
    const responsesAugmented = (payload.responses || []).map(row => {
      const rt = Number(row && row.rt_ms);
      const flagged = (ntMs !== null && Number.isFinite(rt)) ? (rt < ntMs) : null;
      return Object.assign({}, row, { flagged_nt: flagged });
    });
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.json_to_sheet(responsesAugmented), 'responses');

    // --- Sheet 3: practice ---
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.json_to_sheet(payload.practice.log || []), 'practice');

    // --- Sheet 4: item bank / selected candidate set ---
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.json_to_sheet(payload.item_bank || []), 'item_bank');

    // --- Sheet 5: CAT trace ---
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.json_to_sheet(payload.cat_trace || []), 'cat_trace');

    // --- Sheet 6: quality flags ---
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.json_to_sheet(payload.quality_flags || []), 'quality_flags');

    // --- Sheet 7: event-level log ---
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.json_to_sheet(payload.events || []), 'events');

    // --- Sheet 8: protocol manifest ---
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.json_to_sheet(flattenObject(payload.protocol_manifest || {})),
      'protocol_manifest');

    // --- Sheet 9: metadata ---
    const meta = [
      { key: 'filename',            value: filename },
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
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.json_to_sheet(meta), 'metadata');

    try {
      XLSX.writeFile(wb, filename, { bookType: 'xlsx', compression: true });
      return { ok: true, filename: filename, format: 'xlsx', fallback: false };
    } catch (err) {
      console.error('Excel export failed.', err);
      try {
        return downloadJSONFallback(filename, payload);
      } catch (fallbackErr) {
        console.error('JSON fallback export failed.', fallbackErr);
        return { ok: false, filename: filename, format: 'xlsx', fallback: false };
      }
    }
  }

  global.LJTExcel = { export: exportToExcel };
})(window);
