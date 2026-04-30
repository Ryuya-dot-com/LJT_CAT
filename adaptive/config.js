window.LJT_APP_CONFIG = {
  delivery: 'adaptive',
  assetBase: '..',
  defaultAlgorithm: 'blueprint',
  defaultStopRule: 'blueprint_pser',
  blueprint: {
    candidateSet: 'full160_item_bank',
    disallowWordOverlap: false,
    minAllowedItems: 0,
    minItems: 0,
    minHit: 0,
    minCR: 0,
    maxItems: 160,
    maxHit: 80,
    maxCR: 80,
    reportingMinPerCondition: 5
  },
  presentation: {
    maxConditionRun: 2,
    autoPlayAudio: true,
    audioRate: 1.0,
    fixationMs: 500,
    postResponseMs: 350,
    pace: 'auto',
    keymap: 'counterbalanced',
    timing: 'timed',
    responseWindowMs: 1250
  },
  defaults: {
    min_items: 0,
    max_items: 160,
    target_se: 0.30,
    timing: 'timed',
    response_window_ms: 1250,
    audio_rate: 1.0,
    lang: 'ja',
    stop_pser: 0.01,
    quota_tol: 0.20,
    max_play_fails: 3,
    theta_min: -6,
    theta_max: 6,
    theta_step: 0.01,
    theta2_min: -4,
    theta2_max: 4,
    theta2_step: 0.1,
    // NT (Normative Threshold) for rapid-guessing-aware auxiliary scoring.
    // Wise & Ma (2012). Default 350 ms; researchers can override via
    // ?nt_threshold_ms=NNN, e.g. 500 ms for lower-proficiency populations.
    // Live theta is NOT modified; auxiliary `theta_*_nt<NNN>` columns are
    // added to summary alongside the standard naive estimates.
    nt_threshold_ms: 350
  }
};
