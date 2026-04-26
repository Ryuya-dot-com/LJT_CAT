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

  function exportToExcel (filename, payload) {
    if (typeof XLSX === 'undefined') {
      console.error('SheetJS (XLSX) not loaded.');
      return false;
    }

    const wb = XLSX.utils.book_new();
    const reg = payload.session.reg || {};
    const reg2f = payload.session.reg_2f || {};

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
      practice_completed:   payload.practice.completed,
      practice_n_correct:   payload.practice.n_correct,
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
      aberrance_theta_gap_flag: payload.final.aberrance_theta_gap_flag,
      all_yes_flag:         payload.final.all_yes_flag,
      all_no_flag:          payload.final.all_no_flag,
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
      fixation_ms:          payload.session.fixation_ms,
      timing_mode:          payload.session.timing_mode || '',
      response_window_ms:   payload.session.response_window_ms,
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
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.json_to_sheet(summary), 'summary');

    // --- Sheet 2: responses ---
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.json_to_sheet(payload.responses || []), 'responses');

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
      { key: 'mode',                value: payload.session.mode },
      { key: 'delivery',            value: payload.session.delivery || payload.session.mode },
      { key: 'algorithm',           value: payload.session.algorithm || '' },
      { key: 'stop_rule',           value: payload.session.stop_rule || '' },
      { key: 'language',            value: payload.session.language || '' },
      { key: 'research_mode',       value: !!payload.session.research_mode },
      { key: 'theta_grid',
        value: payload.session.mode === 'fixed40'
          ? 'Fixed 40-item balanced short form'
          : payload.session.mode === '1F'
          ? '1D [-6, 6] step 0.01'
          : '2D [-4, 4] x [-4, 4] step 0.1' },
      { key: 'stopping_rule',
        value: payload.session.stop_rule === 'blueprint_pser'
          ? 'Blueprint PSER: no stopping before min n = ' +
            payload.session.min_items +
            '; stop when predicted joint-SE reduction < stop_pser; hard cap n = ' +
            payload.session.max_items
          : 'SE < ' + payload.session.target_se +
            ', min n = ' + payload.session.min_items +
            ', max n = ' + payload.session.max_items +
            (payload.session.mode === '2F_research'
               ? ' (joint SE = sqrt(se1^2 + se2^2))'
               : '') },
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
      { key: 'selected_form_fixed40',
        value: payload.session.selected_form_fixed40 || '' },
      { key: 'selected_form_adaptive',
        value: payload.session.selected_form_adaptive || '' },
      { key: 'presentation_order_policy',
        value: payload.session.presentation_order_policy || '' },
      { key: 'max_condition_run',
        value: payload.session.max_condition_run || '' },
      { key: 'auto_play_audio',
        value: payload.session.auto_play_audio },
      { key: 'fixation_ms',
        value: payload.session.fixation_ms },
      { key: 'post_response_ms',
        value: payload.session.post_response_ms },
      { key: 'timing_mode',
        value: payload.session.timing_mode || '' },
      { key: 'response_window_ms',
        value: payload.session.response_window_ms },
      { key: 'response_keymap_id',
        value: payload.session.response_keymap_id || '' },
      { key: 'response_key_appropriate',
        value: payload.session.response_key_appropriate || '' },
      { key: 'response_key_inappropriate',
        value: payload.session.response_key_inappropriate || '' },
      { key: 'scoring_backbone',
        value: payload.session.mode === 'fixed40'
          ? 'Fixed form: validated no-overlap 20 Hit + 20 CR form selected from mod_hit / mod_cr per-condition 1D 2PL; theta_hit/theta_cr: mod_hit / mod_cr; 2F output = post-hoc confirmatory MIRT'
          : payload.session.mode === '1F'
          ? 'Adaptive selection: no-overlap blueprint CAT using mod_hit / mod_cr per-condition 1D 2PL information; theta_hit/theta_cr: mod_hit / mod_cr; 2F output = post-hoc confirmatory MIRT'
          : 'Item selection: 2F MIRT compensatory; theta_hit/theta_cr: mod_hit / mod_cr; 2F output = post-hoc confirmatory MIRT' },
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
      return true;
    } catch (err) {
      console.error('Excel export failed.', err);
      try {
        const jsonName = filename.replace(/\.xlsx$/i, '.json');
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
        return true;
      } catch (fallbackErr) {
        console.error('JSON fallback export failed.', fallbackErr);
        return false;
      }
    }
  }

  global.LJTExcel = { export: exportToExcel };
})(window);
