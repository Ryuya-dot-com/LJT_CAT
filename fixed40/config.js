window.LJT_APP_CONFIG = {
  delivery: 'fixed40',
  assetBase: '..',
  fixedPerCondition: 20,
  defaultStopRule: 'fixed_length',
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
    max_items: 40,
    target_se: 0.30,
    timing: 'timed',
    response_window_ms: 1250,
    lang: 'ja',
    max_play_fails: 3
  }
};
