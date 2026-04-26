window.LJT_APP_CONFIG = {
  delivery: 'adaptive',
  assetBase: '..',
  defaultAlgorithm: 'blueprint',
  defaultStopRule: 'blueprint_pser',
  blueprint: {
    minAllowedItems: 20,
    minItems: 40,
    minHit: 20,
    minCR: 20,
    maxItems: 70,
    maxHit: 35,
    maxCR: 35
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
    min_items: 40,
    max_items: 70,
    target_se: 0.30,
    timing: 'timed',
    response_window_ms: 1250,
    lang: 'ja',
    stop_pser: 0.01,
    quota_tol: 0.20,
    max_play_fails: 3
  }
};
