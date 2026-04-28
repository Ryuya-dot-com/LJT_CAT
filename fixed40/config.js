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
    pace: 'auto',
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
    max_play_fails: 3,
    theta_min: -6,
    theta_max: 6,
    theta_step: 0.01,
    theta2_min: -4,
    theta2_max: 4,
    theta2_step: 0.1
  }
};
