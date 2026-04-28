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
    reportingMinPerCondition: 1
  },
  presentation: {
    maxConditionRun: 2,
    autoPlayAudio: true,
    fixationMs: 500,
    postResponseMs: 350,
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
    lang: 'ja',
    stop_pser: 0.01,
    quota_tol: 0.20,
    max_play_fails: 3
  }
};
