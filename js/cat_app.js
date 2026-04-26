/* cat_app.js — LJT-CAT main orchestrator (v2)
 *
 * Stages: welcome → instructions → practice → transition → main → result
 * URL parameters are controlled by fixed40/config.js or adaptive/config.js.
 *                 ?lab=<labcode>
 *                 adaptive/: ?algorithm=blueprint|alternating|quota &stop_rule=blueprint_pser|pser|se|max_items
 *                 adaptive/: ?target_se=0.30 &min_items=40 &max_items=70
 *                 ?max_play_fails=3 (audio failure skip threshold)
 *                 ?keymap=counterbalanced|f_appropriate|j_appropriate
 *                 ?timing=timed|untimed &response_window_ms=1250
 *                 ?auto_play_audio=1|0 &fixation_ms=500 &post_response_ms=350 &max_condition_run=2
 *                 ?lang=ja|en
 *                 ?research=1 (show calibration / item-bank audit panel)
 *
 * Scoring (v2.1): fixed40 delivery uses the validated disjoint 20+20 form.
 * Adaptive delivery uses a target-word-disjoint blueprint CAT based on the
 * per-condition 1D 2PL banks (mod_hit / mod_cr). Final θ is computed
 * separately from those same per-condition banks; the combined 1F model is
 * retained only as a legacy calibration artifact.
 */

(function () {
  'use strict';

  const APP_VERSION = '2.5.0';
  const APP_CONFIG = Object.assign({
    delivery: 'landing',
    assetBase: '.',
    defaultAlgorithm: 'blueprint',
    defaultStopRule: 'blueprint_pser',
    fixedPerCondition: 20
  }, window.LJT_APP_CONFIG || {});

  const DEFAULTS = Object.assign({
    target_se: 0.30,
    min_items: 40,
    max_items: 70,
    max_play_fails: 3,
    stop_pser: 0.01,
    quota_tol: 0.20,
    timing: 'timed',
    response_window_ms: 1250,
    lang: 'ja',
    auto_play_audio: true,
    fixation_ms: 500,
    post_response_ms: 350,
    max_condition_run: 2
  }, APP_CONFIG.defaults || {});

  const I18N = {
    ja: {
      documentTitleFixed: '語彙意味判断テスト (固定40問)',
      documentTitleAdaptive: '語彙意味判断テスト (制約付きCAT)',
      appTitle: '語彙意味判断テスト',
      subtitleFixed: '固定40問バランス短縮版',
      subtitleAdaptive: 'Blueprint CAT',
      browserWarning: 'このテストは <strong>Google Chrome</strong> のブラウザでのみご利用いただけます。<br />PC の Chrome でこのページを開き直してください。',
      welcomeTitle: 'ようこそ',
      welcomeBody: 'このテストでは、英語の短い文を聞いていただきます。それぞれの文には<strong>1つの英単語</strong>が含まれています。文の中でその英単語の使われ方が<strong>意味的に適切か、不適切か</strong>を判断してください。',
      noteAutoplay: '各問題では、中央の「+」のあと音声が<strong>自動で1回</strong>再生されます。',
      noteManualPlay: '各問題では、中央の「+」のあと表示される<strong>音声再生ボタン</strong>を押すと音声が1回再生されます。',
      notePractice: '練習が<strong>4問</strong>あり、そのあと本試行に進みます。',
      noteFixedLength: '本試行は<strong>40問</strong>です。',
      noteAdaptiveLength: '本試行の問題数は回答状況に応じて変わります。',
      noteKeys: '音声終了後、表示された単語に対してキーボードの <strong>F</strong> / <strong>J</strong> で回答します。',
      noteHeadphones: 'ヘッドホン / イヤホンの使用を強く推奨します。',
      participantInfo: '参加者情報',
      languageLabel: '表示言語',
      participantId: '参加者ID',
      participantName: 'お名前',
      consentStart: '同意して開始',
      disclaimer: '回答データは終了時にあなたのコンピュータに保存されます。ダウンロードされたファイルは研究者の指示にしたがって共有してください。',
      instructionsTitle: '教示',
      instructionsLead: 'これから4問の練習を行います。各問題では:',
      instructionFixation: '中央の <strong>+</strong> を見てください。音声は自動で再生されます。',
      instructionManualPlay: '中央の <strong>+</strong> を見てください。そのあと表示されるボタンで音声を再生してください。',
      instructionDecision: '音声が終わったら、表示される英単語の使い方が <span class="yes-color"><strong>「適切」</strong></span>か <span class="no-color"><strong>「不適切」</strong></span>かを選んでください。',
      instructionFeedback: '練習では正解・不正解のフィードバックが表示されます。本試行ではフィードバックはありません。',
      startPractice: '練習を開始する',
      transitionTitle: '練習は以上です',
      transitionBody: 'これから本試行に入ります。本試行では<strong>フィードバックは表示されません</strong>。音声は<strong>1回のみ</strong>再生されます。準備ができたら開始してください。',
      startMain: '本試行を開始する',
      resultTitle: 'テスト終了',
      resultThanks: 'ご協力ありがとうございました。',
      downloadAgain: 'もう一度ダウンロードする',
      endNote: '結果ファイルがダウンロードフォルダに保存されました。研究者の指示にしたがって共有してください。',
      appropriate: '適切',
      inappropriate: '不適切',
      keySuffix: 'キー',
      keyInstruction: '表示された単語が意味的に適切なら <strong>{yesKey}</strong>、不適切なら <strong>{noKey}</strong> を、できるだけ速く正確に押してください。',
      timedInstruction: '音声終了後は、一定時間内に回答してください。時間内に反応がない場合は次の問題に進みます。',
      untimedInstruction: '時間制限はありませんが、できるだけ速く正確に回答してください。',
      keyPromptFallback: 'F / J キーで判断してください。',
      keyPrompt: '適切 = {yesKey}、不適切 = {noKey} で判断してください。',
      autoPlaying: '自動再生中',
      playAudio: '音声を再生',
      retryRemaining: '再試行 (残り {remaining} 回)',
      playbackFailed: '音声の再生に失敗しました。「再試行」を押してください。',
      playbackUnavailable: '再生不可',
      playbackUnavailableStatus: '音声が再生できません。',
      skipTrial: 'この問題を飛ばす (回答なし)',
      audioEnded: '音声は終了しました。{prompt}',
      lookAtFixation: '中央の + を見てください。',
      playingStatus: '再生中です。集中してお聞きください...',
      clickPlay: '「音声を再生」を押してください。',
      practiceLabel: '練習',
      mainLabel: '本試行',
      questionCounter: '{n}問目',
      practiceCounter: '{n} / 4',
      timeoutFeedback: '時間切れです<br><small>正しい答えは「<strong>{answer}</strong>」でした。次の問題に進みます…</small>',
      correctFeedback: '✔ 正解です! <br><small>次の問題に進みます…</small>',
      wrongFeedback: '✘ 不正解です<br><small>正しい答えは「<strong>{answer}</strong>」でした。次の問題に進みます…</small>',
      savingStatus: '結果を保存中...',
      savedStatus: '結果ファイルを保存しました。',
      saveFailed: '⚠ 結果ファイルの保存に失敗しました。ページを更新して再試行してください。',
      xlsxLoadTitle: 'Excel 書き出しライブラリの読み込みに失敗しました',
      xlsxLoadBody: 'ネットワーク接続を確認してページを再読み込みしてください。再試行しても解決しない場合は研究者にご連絡ください。',
      dataLoadTitle: 'データの読み込みに失敗しました',
      researchBanner: '⚠ <strong>Research mode (2F compensatory)</strong> — 本モードは研究用の確認的分析モードです。通常の運用には 1F モード (デフォルト) を使用してください。',
      researchTitle: '研究用確認パネル',
      researchHiddenNote: 'このパネルは URL に research=1 がある場合のみ表示されます。通常の受験者画面には表示しません。',
      researchDelivery: '実施モード',
      researchTiming: 'Timed設定',
      researchTimedValue: 'Timed: {ms} ms',
      researchUntimedValue: 'Untimed',
      researchAutoplay: '音声自動再生',
      researchFixation: '注視点',
      researchMaxRun: '同一条件の最大連続数',
      researchSelectionModel: '項目選択モデル',
      researchForm: 'フォーム',
      researchItemsTitle: '提示語・項目パラメータ一覧',
      researchFixedNote: '固定40問版で提示される40項目です。実際の順序はセッションごとに制約付きランダム化されます。',
      researchAdaptiveNote: 'Adaptive版で候補となる70項目です。実際の提示項目と順序は回答に応じてこの候補プールから決まります。',
      researchNoItems: '表示できる項目情報がありません。',
      researchColRank: 'rank',
      researchColCondition: 'condition',
      researchColTarget: 'targetword',
      researchColAnswer: 'ANSWER',
      researchColA: '弁別力 a',
      researchColB: '困難度 b',
      researchColStimuli: '音声ファイル',
      researchProtocolTitle: '実施プロトコル設定',
      researchProtocolNote: 'ここで設定した内容は参加者用URLとExcelの protocol_manifest に保存されます。参加者画面では変更できません。',
      researchTimingModeLabel: '時間制限',
      researchDeliveryModeLabel: '実施モード',
      researchFixed40Option: '固定40問',
      researchAdaptiveOption: 'Adaptive CAT',
      researchKeymapLabel: 'F/Jキー割当',
      researchKeymapCounterbalanced: '参加者IDでカウンターバランス',
      researchKeymapFAppropriate: 'F = 適切 / J = 不適切',
      researchKeymapJAppropriate: 'F = 不適切 / J = 適切',
      researchAudioAutoplayLabel: '音声自動再生',
      researchAutoplayOn: '自動再生',
      researchAutoplayOff: '手動再生',
      researchFixationMsLabel: '注視点時間 (ms)',
      researchPostResponseMsLabel: '回答後待機時間 (ms)',
      researchMaxConditionRunLabel: '同一条件の最大連続数',
      researchMaxPlayFailsLabel: '音声再生失敗の許容回数',
      researchAdaptiveSettingsTitle: 'Adaptive設定',
      researchAlgorithmLabel: '項目選択アルゴリズム',
      researchStopRuleLabel: '停止則',
      researchMinItemsLabel: '最小項目数',
      researchMaxItemsLabel: '最大項目数',
      researchTargetSeLabel: '目標SE',
      researchStopPserLabel: 'PSER停止しきい値',
      researchQuotaTolLabel: 'Quota許容幅',
      researchTimedOption: 'Timed',
      researchUntimedOption: 'Untimed',
      researchWindowPresetLabel: 'Timed制限時間',
      researchWindowCustomLabel: 'カスタム制限時間 (ms)',
      researchApplyProtocol: '設定をURLに反映',
      researchParticipantUrlLabel: '参加者用URL',
      researchCopyUrl: 'URLをコピー',
      researchCopied: 'コピーしました',
      researchCopyFailed: 'コピーできませんでした。URL欄を選択してコピーしてください。',
      researchProtocolApplied: '設定を反映しました。',
      researchTimedHelp: '1250 ms は既定値です。比較研究では 1000 / 1250 / 1500 ms などをURLで固定してください。',
      researchUntimedHelp: 'Untimedでは制限時間を設けず、RTは通常どおり記録されます。',
      researchItemSummaryTitle: '項目プール要約',
      researchItemCount: '項目数',
      researchHitCrCount: 'Hit / CR',
      researchUniqueTargets: '一意なtargetword',
      researchOverlapCount: 'targetword重複',
      researchARange: 'a範囲',
      researchBRange: 'b範囲',
      researchFilterTitle: '項目表フィルタ',
      researchSearchLabel: '検索',
      researchSearchPlaceholder: 'targetword / 音声ファイル / item_id',
      researchConditionLabel: '条件',
      researchConditionAll: 'すべて',
      researchVisibleRows: '表示中 {visible} / {total} 項目'
    },
    en: {
      documentTitleFixed: 'Lexicosemantic Judgement Test (Fixed 40)',
      documentTitleAdaptive: 'Lexicosemantic Judgement Test (Blueprint CAT)',
      appTitle: 'Lexicosemantic Judgement Test',
      subtitleFixed: 'Fixed 40-item balanced short form',
      subtitleAdaptive: 'Blueprint CAT',
      browserWarning: 'This test is available only in <strong>Google Chrome</strong> on a desktop or laptop computer.<br />Please reopen this page in Chrome on a PC.',
      welcomeTitle: 'Welcome',
      welcomeBody: 'In this test, you will hear short English sentences. Each sentence contains <strong>one English word</strong>. Decide whether that word is used in a <strong>semantically appropriate or inappropriate</strong> way in the sentence.',
      noteAutoplay: 'On each trial, audio plays <strong>automatically once</strong> after the central “+”.',
      noteManualPlay: 'On each trial, press the <strong>play-audio button</strong> shown after the central “+”; the audio plays once.',
      notePractice: 'There are <strong>4 practice trials</strong>, followed by the main test.',
      noteFixedLength: 'The main test has <strong>40 trials</strong>.',
      noteAdaptiveLength: 'The number of main-test trials depends on your responses.',
      noteKeys: 'After the audio ends, respond to the displayed word with the <strong>F</strong> / <strong>J</strong> keys.',
      noteHeadphones: 'Headphones or earphones are strongly recommended.',
      participantInfo: 'Participant Information',
      languageLabel: 'Display language',
      participantId: 'Participant ID',
      participantName: 'Name',
      consentStart: 'Agree and start',
      disclaimer: 'At the end of the test, your response data will be saved to this computer. Please share the downloaded file according to the researcher’s instructions.',
      instructionsTitle: 'Instructions',
      instructionsLead: 'You will now complete 4 practice trials. On each trial:',
      instructionFixation: 'Look at the central <strong>+</strong>. The audio will play automatically.',
      instructionManualPlay: 'Look at the central <strong>+</strong>. Then press the displayed button to play the audio.',
      instructionDecision: 'After the audio ends, decide whether the displayed English word was used <span class="yes-color"><strong>appropriately</strong></span> or <span class="no-color"><strong>inappropriately</strong></span>.',
      instructionFeedback: 'Practice trials show correct/incorrect feedback. Main-test trials do not show feedback.',
      startPractice: 'Start practice',
      transitionTitle: 'Practice complete',
      transitionBody: 'You will now start the main test. <strong>No feedback is shown</strong> during the main test. Audio is played <strong>only once</strong>. Start when you are ready.',
      startMain: 'Start main test',
      resultTitle: 'Test complete',
      resultThanks: 'Thank you for your participation.',
      downloadAgain: 'Download again',
      endNote: 'The result file has been saved to the Downloads folder. Please share it according to the researcher’s instructions.',
      appropriate: 'Appropriate',
      inappropriate: 'Inappropriate',
      keySuffix: 'key',
      keyInstruction: 'If the displayed word is semantically appropriate, press <strong>{yesKey}</strong>. If it is inappropriate, press <strong>{noKey}</strong>. Respond as quickly and accurately as possible.',
      timedInstruction: 'After the audio ends, respond within the time limit. If no response is made in time, the test moves to the next trial.',
      untimedInstruction: 'There is no time limit, but please respond as quickly and accurately as possible.',
      keyPromptFallback: 'Respond with the F / J keys.',
      keyPrompt: 'Appropriate = {yesKey}; Inappropriate = {noKey}.',
      autoPlaying: 'Auto-playing',
      playAudio: 'Play audio',
      retryRemaining: 'Retry ({remaining} left)',
      playbackFailed: 'Audio playback failed. Please press Retry.',
      playbackUnavailable: 'Unavailable',
      playbackUnavailableStatus: 'Audio cannot be played.',
      skipTrial: 'Skip this trial (no response)',
      audioEnded: 'The audio has ended. {prompt}',
      lookAtFixation: 'Look at the central +.',
      playingStatus: 'Playing. Please listen carefully...',
      clickPlay: 'Press “Play audio”.',
      practiceLabel: 'Practice',
      mainLabel: 'Main test',
      questionCounter: 'Trial {n}',
      practiceCounter: '{n} / 4',
      timeoutFeedback: 'Time out<br><small>The correct answer was “<strong>{answer}</strong>”. Moving to the next trial…</small>',
      correctFeedback: '✔ Correct! <br><small>Moving to the next trial…</small>',
      wrongFeedback: '✘ Incorrect<br><small>The correct answer was “<strong>{answer}</strong>”. Moving to the next trial…</small>',
      savingStatus: 'Saving result file...',
      savedStatus: 'The result file has been saved.',
      saveFailed: '⚠ Failed to save the result file. Please reload the page and try again.',
      xlsxLoadTitle: 'Failed to load the Excel export library',
      xlsxLoadBody: 'Please check the network connection and reload the page. If the problem persists, contact the researcher.',
      dataLoadTitle: 'Failed to load data',
      researchBanner: '⚠ <strong>Research mode (2F compensatory)</strong> — This mode is for confirmatory research checks. Use the default 1F mode for normal administration.',
      researchTitle: 'Research Audit Panel',
      researchHiddenNote: 'This panel is shown only when the URL includes research=1. It is hidden in normal participant administration.',
      researchDelivery: 'Delivery mode',
      researchTiming: 'Timed setting',
      researchTimedValue: 'Timed: {ms} ms',
      researchUntimedValue: 'Untimed',
      researchAutoplay: 'Audio autoplay',
      researchFixation: 'Fixation',
      researchMaxRun: 'Maximum same-condition run',
      researchSelectionModel: 'Item selection model',
      researchForm: 'Form',
      researchItemsTitle: 'Presented Words and Item Parameters',
      researchFixedNote: 'These are the 40 items used in the fixed form. The actual order is constrained-randomized for each session.',
      researchAdaptiveNote: 'These are the 70 candidate items used by the adaptive version. The actual administered items and order are selected from this pool based on responses.',
      researchNoItems: 'No item information is available.',
      researchColRank: 'rank',
      researchColCondition: 'condition',
      researchColTarget: 'targetword',
      researchColAnswer: 'ANSWER',
      researchColA: 'discrimination a',
      researchColB: 'difficulty b',
      researchColStimuli: 'audio file',
      researchProtocolTitle: 'Administration Protocol Settings',
      researchProtocolNote: 'These settings are written to the participant URL and the Excel protocol_manifest sheet. Participants cannot change them.',
      researchTimingModeLabel: 'Timing mode',
      researchDeliveryModeLabel: 'Delivery mode',
      researchFixed40Option: 'Fixed 40',
      researchAdaptiveOption: 'Adaptive CAT',
      researchKeymapLabel: 'F/J key mapping',
      researchKeymapCounterbalanced: 'Counterbalanced by participant ID',
      researchKeymapFAppropriate: 'F = Appropriate / J = Inappropriate',
      researchKeymapJAppropriate: 'F = Inappropriate / J = Appropriate',
      researchAudioAutoplayLabel: 'Audio autoplay',
      researchAutoplayOn: 'Autoplay',
      researchAutoplayOff: 'Manual play',
      researchFixationMsLabel: 'Fixation duration (ms)',
      researchPostResponseMsLabel: 'Post-response delay (ms)',
      researchMaxConditionRunLabel: 'Maximum same-condition run',
      researchMaxPlayFailsLabel: 'Allowed audio playback failures',
      researchAdaptiveSettingsTitle: 'Adaptive Settings',
      researchAlgorithmLabel: 'Item-selection algorithm',
      researchStopRuleLabel: 'Stopping rule',
      researchMinItemsLabel: 'Minimum items',
      researchMaxItemsLabel: 'Maximum items',
      researchTargetSeLabel: 'Target SE',
      researchStopPserLabel: 'PSER stopping threshold',
      researchQuotaTolLabel: 'Quota tolerance',
      researchTimedOption: 'Timed',
      researchUntimedOption: 'Untimed',
      researchWindowPresetLabel: 'Timed response window',
      researchWindowCustomLabel: 'Custom window (ms)',
      researchApplyProtocol: 'Apply to URL',
      researchParticipantUrlLabel: 'Participant URL',
      researchCopyUrl: 'Copy URL',
      researchCopied: 'Copied',
      researchCopyFailed: 'Could not copy. Select and copy the URL field manually.',
      researchProtocolApplied: 'Protocol settings applied.',
      researchTimedHelp: '1250 ms is the default. For comparison studies, fix 1000 / 1250 / 1500 ms or similar values in the URL.',
      researchUntimedHelp: 'Untimed has no response deadline; RT is still recorded.',
      researchItemSummaryTitle: 'Item Pool Summary',
      researchItemCount: 'Items',
      researchHitCrCount: 'Hit / CR',
      researchUniqueTargets: 'Unique targetwords',
      researchOverlapCount: 'Targetword overlaps',
      researchARange: 'a range',
      researchBRange: 'b range',
      researchFilterTitle: 'Item Table Filter',
      researchSearchLabel: 'Search',
      researchSearchPlaceholder: 'targetword / audio file / item_id',
      researchConditionLabel: 'Condition',
      researchConditionAll: 'All',
      researchVisibleRows: 'Showing {visible} / {total} items'
    }
  };

  // ---- State ----
  const state = {
    mode: '1F',                  // '1F' | '2F_research'
    labCode: '',
    params: Object.assign({}, DEFAULTS),
    calibration: null,
    stimuliList: [],
    practiceItems: [],
    lang: 'ja',
    researchMode: false,

    delivery: APP_CONFIG.delivery,
    participant: { id: '', name: '' },
    session: {
      uuid: '', started_at: '', finished_at: '', elapsed_ms: 0,
      url_params_raw: '', user_agent: ''
    },

    practice: { log: [], currentIndex: 0, completed: false, n_correct: 0 },

    cat: null,
    currentItemRef: null,
    mainStart: 0,
    playedOnce: false,
    playFailCount: 0,            // in-trial retry counter
    currentAudioStart: 0,
    currentAudioEnd: 0,
    currentAudioDurationMs: null,
    audioStart: 0,
    questionStart: 0,
    algorithm: APP_CONFIG.defaultAlgorithm,
    stopRule: APP_CONFIG.defaultStopRule,
    fixedItems: [],
    adaptiveItems: [],
    fixedConditionSchedule: [],
    responseMapping: null,
    currentResponseCleanup: null,
    researchStatusTimer: null,
    researchFilters: { query: '', condition: 'all' },
    currentTrialContext: null,
    events: [],

    responses: []
  };

  // ---- Utilities ----
  function $ (id) { return document.getElementById(id); }

  function assetPath (path) {
    const base = (APP_CONFIG.assetBase || '.').replace(/\/$/, '');
    return base === '.' ? path : base + '/' + path.replace(/^\//, '');
  }

  function boundedNumberParam (params, name, def, min, max, integer) {
    const raw = params.get(name);
    return boundedNumberValue(raw, def, min, max, integer);
  }

  function boundedNumberValue (raw, def, min, max, integer) {
    const parsed = raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
    let out = Number.isFinite(parsed) ? parsed : def;
    out = Math.max(min, Math.min(max, out));
    return integer ? Math.round(out) : out;
  }

  function booleanParam (params, names, def) {
    const keys = Array.isArray(names) ? names : [names];
    for (let i = 0; i < keys.length; i++) {
      const raw = params.get(keys[i]);
      if (raw === null) continue;
      const value = String(raw).trim().toLowerCase();
      if (['1', 'true', 'yes', 'on', 'auto', 'autoplay'].includes(value)) return true;
      if (['0', 'false', 'no', 'off', 'manual'].includes(value)) return false;
    }
    return !!def;
  }

  function boolToParam (value) {
    return value ? '1' : '0';
  }

  function shuffleCopy (arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function tailRunLength (schedule) {
    if (!schedule.length) return { condition: null, length: 0 };
    const condition = schedule[schedule.length - 1];
    let length = 0;
    for (let i = schedule.length - 1; i >= 0; i--) {
      if (schedule[i] !== condition) break;
      length++;
    }
    return { condition, length };
  }

  function isStrictAlternating (schedule) {
    if (schedule.length < 6) return false;
    for (let i = 1; i < schedule.length; i++) {
      if (schedule[i] === schedule[i - 1]) return false;
    }
    return true;
  }

  function buildBalancedConditionSchedule (nHit, nCR, maxRun) {
    const maxAttempts = 1000;
    const runLimit = maxRun || 2;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const remaining = { Hit: nHit, CR: nCR };
      const schedule = [];
      while (remaining.Hit + remaining.CR > 0) {
        const run = tailRunLength(schedule);
        let candidates = ['Hit', 'CR'].filter(cond => {
          if (remaining[cond] <= 0) return false;
          return !(run.condition === cond && run.length >= runLimit);
        });
        if (!candidates.length) break;
        candidates = shuffleCopy(candidates);
        const total = candidates.reduce((acc, cond) => acc + remaining[cond], 0);
        let draw = Math.random() * total;
        let chosen = candidates[candidates.length - 1];
        for (let i = 0; i < candidates.length; i++) {
          draw -= remaining[candidates[i]];
          if (draw <= 0) { chosen = candidates[i]; break; }
        }
        schedule.push(chosen);
        remaining[chosen]--;
      }
      if (schedule.length === nHit + nCR && !isStrictAlternating(schedule)) {
        return schedule;
      }
    }

    const fallback = [];
    let h = nHit;
    let c = nCR;
    while (h > 0 || c > 0) {
      const run = tailRunLength(fallback);
      const preferHit = h >= c;
      let chosen = preferHit ? 'Hit' : 'CR';
      if (run.condition === chosen && run.length >= runLimit) {
        chosen = chosen === 'Hit' ? 'CR' : 'Hit';
      }
      if (chosen === 'Hit' && h <= 0) chosen = 'CR';
      if (chosen === 'CR' && c <= 0) chosen = 'Hit';
      fallback.push(chosen);
      if (chosen === 'Hit') h--; else c--;
    }
    return fallback;
  }

  function generateUUID () {
    if (window.crypto && window.crypto.getRandomValues) {
      const arr = new Uint8Array(16);
      window.crypto.getRandomValues(arr);
      arr[6] = (arr[6] & 0x0f) | 0x40;
      arr[8] = (arr[8] & 0x3f) | 0x80;
      const hex = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function nowISO () { return new Date().toISOString(); }

  function logEvent (eventType, data) {
    const trial = state.currentTrialContext || {};
    state.events.push(Object.assign({
      session_uuid: state.session.uuid || '',
      event_index: state.events.length + 1,
      event_type: eventType,
      occurred_at: nowISO(),
      performance_ms: Math.round(performance.now()),
      trial_phase: trial.phase || '',
      trial_step: trial.step || '',
      item_id: trial.item_id || '',
      targetword: trial.targetword || '',
      condition: trial.condition || ''
    }, data || {}));
  }

  /**
   * Feature-detection guarded browser check. Requires:
   *   - Web Audio
   *   - crypto.getRandomValues
   *   - HTMLAudioElement
   *   - Not iOS / Android / iOS-Chrome (CriOS) / Edge / Opera
   *   - Must advertise 'Chrome/' in UA (Chromium-based)
   */
  function isSupportedBrowser () {
    if (!('AudioContext' in window || 'webkitAudioContext' in window)) return false;
    if (!(window.crypto && window.crypto.getRandomValues)) return false;
    if (typeof Audio === 'undefined') return false;
    const ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod|Android/.test(ua)) return false;
    if (/CriOS\//.test(ua)) return false;
    if (/Edg\//.test(ua) || /OPR\//.test(ua)) return false;
    return /Chrome\//.test(ua);
  }

  function parseURLParams () {
    const u = new URL(window.location.href);
    const p = u.searchParams;
    state.lang = normalizeLanguage(p.get('lang') || DEFAULTS.lang || 'ja');
    state.researchMode = ['1', 'true', 'yes', 'on'].includes(
      String(p.get('research') || p.get('research_mode') || '').toLowerCase()
    );
    const rawMode = (p.get('mode') || '1f').toLowerCase();
    state.mode = (state.delivery !== 'fixed40' && state.delivery !== 'adaptive' &&
                  (rawMode === '2f_research' || rawMode === '2f'))
      ? '2F_research'
      : '1F';
    state.labCode = p.get('lab') || '';
    state.params.target_se = boundedNumberParam(
      p, 'target_se', DEFAULTS.target_se, 0.05, 2.0, false);
    state.params.min_items = boundedNumberParam(
      p, 'min_items', DEFAULTS.min_items, 1, 160, true);
    state.params.max_items = boundedNumberParam(
      p, 'max_items', DEFAULTS.max_items, 1, 160, true);
    state.params.max_play_fails = boundedNumberParam(
      p, 'max_play_fails', DEFAULTS.max_play_fails, 0, 10, true);
    state.params.stop_pser = boundedNumberParam(
      p, 'stop_pser', DEFAULTS.stop_pser, 0, 1, false);
    state.params.quota_tol = boundedNumberParam(
      p, 'quota_tol', DEFAULTS.quota_tol, 0, 0.49, false);
    state.params.keymap = normalizeKeymap(
      p.get('keymap') || presentationOption('keymap', 'counterbalanced')
    );
    state.params.timing = normalizeTiming(
      p.get('timing') || presentationOption('timing', DEFAULTS.timing)
    );
    state.params.response_window_ms = boundedNumberParam(
      p, 'response_window_ms',
      Number(presentationOption('responseWindowMs', DEFAULTS.response_window_ms)),
      250, 10000, true);
    state.params.auto_play_audio = booleanParam(
      p,
      ['auto_play_audio', 'autoplay'],
      !!presentationOption('autoPlayAudio', DEFAULTS.auto_play_audio)
    );
    state.params.fixation_ms = boundedNumberParam(
      p, 'fixation_ms',
      Number(presentationOption('fixationMs', DEFAULTS.fixation_ms)),
      0, 3000, true);
    state.params.post_response_ms = boundedNumberParam(
      p, 'post_response_ms',
      Number(presentationOption('postResponseMs', DEFAULTS.post_response_ms)),
      0, 5000, true);
    state.params.max_condition_run = boundedNumberParam(
      p, 'max_condition_run',
      Number(presentationOption('maxConditionRun', DEFAULTS.max_condition_run)),
      1, 10, true);
    if (state.params.min_items > state.params.max_items) {
      state.params.min_items = state.params.max_items;
    }
    if (state.delivery === 'fixed40') {
      state.params.min_items = APP_CONFIG.fixedPerCondition * 2;
      state.params.max_items = APP_CONFIG.fixedPerCondition * 2;
      state.stopRule = 'fixed_length';
    } else if (state.delivery === 'adaptive') {
      state.algorithm = normalizeAlgorithm(p.get('algorithm') || APP_CONFIG.defaultAlgorithm);
      state.stopRule = normalizeStopRule(p.get('stop_rule') || APP_CONFIG.defaultStopRule);
      const adaptiveBounds = adaptiveItemBounds();
      state.params.min_items = Math.min(
        Math.max(state.params.min_items, adaptiveBounds.floor),
        adaptiveBounds.cap
      );
      state.params.max_items = Math.min(
        Math.max(state.params.max_items, state.params.min_items),
        adaptiveBounds.cap
      );
    }
    state.session.url_params_raw = u.search || '';
  }

  function showStage (id) {
    document.querySelectorAll('.stage').forEach(s => s.classList.add('hidden'));
    const el = $(id);
    if (el) el.classList.remove('hidden');
    logEvent('stage_change', { stage_id: id });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setStatus (msg) {
    const s = $('play-status');
    if (s) s.textContent = msg;
  }

  function normalizeLanguage (raw) {
    const value = String(raw || '').trim().toLowerCase();
    return value === 'en' ? 'en' : 'ja';
  }

  function t (key, vars) {
    const dict = I18N[state.lang] || I18N.ja;
    let text = Object.prototype.hasOwnProperty.call(dict, key)
      ? dict[key]
      : (I18N.ja[key] || key);
    Object.keys(vars || {}).forEach(name => {
      text = text.replace(new RegExp('\\{' + name + '\\}', 'g'), vars[name]);
    });
    return text;
  }

  function responseLabel (response) {
    if (response === '適切') return t('appropriate');
    if (response === '不適切') return t('inappropriate');
    return '';
  }

  function applyLanguage () {
    document.documentElement.lang = state.lang;
    document.title = state.delivery === 'fixed40'
      ? t('documentTitleFixed')
      : state.delivery === 'adaptive'
      ? t('documentTitleAdaptive')
      : t('appTitle');
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    const langInput = $('input-lang');
    if (langInput) langInput.value = state.lang;
    updatePresentationInstruction();
    updateResponseLabels();
    updateKeyInstruction();
    updateTimingInstruction();
  }

  function presentationOption (name, fallback) {
    const opts = APP_CONFIG.presentation || {};
    return Object.prototype.hasOwnProperty.call(opts, name) ? opts[name] : fallback;
  }

  function autoPlayAudio () {
    return !!state.params.auto_play_audio;
  }

  function fixationMs () {
    return Number(state.params.fixation_ms);
  }

  function postResponseMs () {
    return Number(state.params.post_response_ms);
  }

  function maxConditionRun () {
    return Number(state.params.max_condition_run);
  }

  function updatePresentationInstruction () {
    const note = document.querySelector('[data-i18n-html="noteAutoplay"]');
    if (note) note.innerHTML = autoPlayAudio() ? t('noteAutoplay') : t('noteManualPlay');
    const fixation = document.querySelector('[data-i18n-html="instructionFixation"]');
    if (fixation) {
      fixation.innerHTML = autoPlayAudio()
        ? t('instructionFixation')
        : t('instructionManualPlay');
    }
  }

  function sleep (ms) {
    return new Promise(resolve => window.setTimeout(resolve, Math.max(0, ms || 0)));
  }

  function normalizeKeymap (raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (['f_yes', 'f_appropriate', 'f_teki', 'f適切'].includes(value)) return 'f_appropriate';
    if (['j_yes', 'j_appropriate', 'j_teki', 'j適切'].includes(value)) return 'j_appropriate';
    return 'counterbalanced';
  }

  function normalizeTiming (raw) {
    const value = String(raw || '').trim().toLowerCase();
    return value === 'untimed' ? 'untimed' : 'timed';
  }

  function normalizeAlgorithm (raw) {
    const value = String(raw || '').trim().toLowerCase();
    return ['blueprint', 'alternating', 'quota'].includes(value) ? value : 'blueprint';
  }

  function normalizeStopRule (raw) {
    const value = String(raw || '').trim().toLowerCase();
    return ['blueprint_pser', 'pser', 'se', 'max_items'].includes(value)
      ? value
      : 'blueprint_pser';
  }

  function normalizeDelivery (raw) {
    const value = String(raw || '').trim().toLowerCase();
    return value === 'adaptive' ? 'adaptive' : 'fixed40';
  }

  function adaptiveItemBounds () {
    const blueprint = APP_CONFIG.blueprint || {};
    const floorRaw = Number(blueprint.minAllowedItems);
    const capRaw = Number(blueprint.maxItems);
    const floor = Number.isFinite(floorRaw) && floorRaw > 0 ? Math.round(floorRaw) : 20;
    const cap = Number.isFinite(capRaw) && capRaw >= floor ? Math.round(capRaw) : 70;
    return { floor: floor, cap: Math.max(floor, cap) };
  }

  function isTimed () {
    return state.params.timing === 'timed';
  }

  function responseWindowMs () {
    return isTimed() ? state.params.response_window_ms : null;
  }

  function deliveryPathname (pathname, delivery) {
    const target = normalizeDelivery(delivery);
    const replacement = '/' + target + '/';
    if (/\/(fixed40|adaptive)\/?$/.test(pathname)) {
      return pathname.replace(/\/(fixed40|adaptive)\/?$/, replacement);
    }
    const withSlash = pathname.endsWith('/') ? pathname : pathname + '/';
    return withSlash + target + '/';
  }

  function buildProtocolURL (keepResearch, overrides) {
    const opts = overrides || {};
    const u = new URL(window.location.href);
    const delivery = normalizeDelivery(opts.delivery || state.delivery);
    const mode = normalizeTiming(opts.timing || state.params.timing);
    const ms = boundedNumberValue(
      opts.response_window_ms === undefined
        ? state.params.response_window_ms
        : opts.response_window_ms,
      DEFAULTS.response_window_ms,
      250,
      10000,
      true
    );
    const autoPlay = opts.auto_play_audio === undefined
      ? autoPlayAudio()
      : !!opts.auto_play_audio;
    const fixMs = boundedNumberValue(
      opts.fixation_ms === undefined ? fixationMs() : opts.fixation_ms,
      DEFAULTS.fixation_ms,
      0,
      3000,
      true
    );
    const postMs = boundedNumberValue(
      opts.post_response_ms === undefined ? postResponseMs() : opts.post_response_ms,
      DEFAULTS.post_response_ms,
      0,
      5000,
      true
    );
    const maxRun = boundedNumberValue(
      opts.max_condition_run === undefined ? maxConditionRun() : opts.max_condition_run,
      DEFAULTS.max_condition_run,
      1,
      10,
      true
    );
    const maxFails = boundedNumberValue(
      opts.max_play_fails === undefined ? state.params.max_play_fails : opts.max_play_fails,
      DEFAULTS.max_play_fails,
      0,
      10,
      true
    );
    const keymap = normalizeKeymap(opts.keymap || state.params.keymap);
    u.pathname = deliveryPathname(u.pathname, delivery);
    u.searchParams.set('lang', state.lang);
    u.searchParams.set('timing', mode);
    u.searchParams.set('auto_play_audio', boolToParam(autoPlay));
    u.searchParams.set('fixation_ms', String(fixMs));
    u.searchParams.set('post_response_ms', String(postMs));
    u.searchParams.set('max_condition_run', String(maxRun));
    u.searchParams.set('max_play_fails', String(maxFails));
    u.searchParams.set('keymap', keymap);
    if (mode === 'timed') {
      u.searchParams.set('response_window_ms', String(ms));
    } else {
      u.searchParams.delete('response_window_ms');
    }
    if (delivery === 'adaptive') {
      const adaptiveBounds = adaptiveItemBounds();
      const defaultMinItems = Math.min(
        Math.max(DEFAULTS.min_items, adaptiveBounds.floor),
        adaptiveBounds.cap
      );
      u.searchParams.set('algorithm', opts.algorithm || state.algorithm || 'blueprint');
      u.searchParams.set('stop_rule', opts.stop_rule || state.stopRule || 'blueprint_pser');
      const minItems = boundedNumberValue(
        opts.min_items === undefined ? state.params.min_items : opts.min_items,
        defaultMinItems,
        adaptiveBounds.floor,
        adaptiveBounds.cap,
        true
      );
      let maxItems = boundedNumberValue(
        opts.max_items === undefined ? state.params.max_items : opts.max_items,
        adaptiveBounds.cap,
        adaptiveBounds.floor,
        adaptiveBounds.cap,
        true
      );
      if (maxItems < minItems) maxItems = minItems;
      u.searchParams.set('min_items', String(minItems));
      u.searchParams.set('max_items', String(maxItems));
      u.searchParams.set('target_se', String(
        boundedNumberValue(opts.target_se === undefined ? state.params.target_se : opts.target_se, DEFAULTS.target_se, 0.05, 2.0, false)
      ));
      u.searchParams.set('stop_pser', String(
        boundedNumberValue(opts.stop_pser === undefined ? state.params.stop_pser : opts.stop_pser, DEFAULTS.stop_pser, 0, 1, false)
      ));
      u.searchParams.set('quota_tol', String(
        boundedNumberValue(opts.quota_tol === undefined ? state.params.quota_tol : opts.quota_tol, DEFAULTS.quota_tol, 0, 0.49, false)
      ));
    } else {
      ['algorithm', 'stop_rule', 'min_items', 'max_items', 'target_se', 'stop_pser', 'quota_tol']
        .forEach(name => u.searchParams.delete(name));
    }
    if (keepResearch) {
      u.searchParams.set('research', '1');
    } else {
      u.searchParams.delete('research');
      u.searchParams.delete('research_mode');
    }
    return u.toString();
  }

  function updateURLFromProtocol (keepResearch, overrides) {
    const nextUrl = buildProtocolURL(keepResearch, overrides);
    const u = new URL(nextUrl);
    if (u.pathname !== window.location.pathname) {
      window.location.href = u.toString();
    } else {
      window.history.replaceState(null, '', u.toString());
      state.session.url_params_raw = u.search || '';
    }
  }

  function participantProtocolURL () {
    return buildProtocolURL(false);
  }

  function researchURL () {
    return buildProtocolURL(true);
  }

  function hashString (text) {
    let h = 2166136261;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function buildResponseMapping (participantId) {
    const keymap = normalizeKeymap(state.params.keymap);
    const fAppropriate = keymap === 'f_appropriate' ||
      (keymap === 'counterbalanced' &&
       hashString([state.labCode, participantId].join('|')) % 2 === 0);
    return fAppropriate
      ? {
          keymap_id: 'F_appropriate_J_inappropriate',
          f: '適切',
          j: '不適切',
          appropriate_key: 'f',
          inappropriate_key: 'j'
        }
      : {
          keymap_id: 'F_inappropriate_J_appropriate',
          f: '不適切',
          j: '適切',
          appropriate_key: 'j',
          inappropriate_key: 'f'
        };
  }

  function keyForResponse (response) {
    if (!state.responseMapping) return '';
    return response === '適切'
      ? state.responseMapping.appropriate_key
      : state.responseMapping.inappropriate_key;
  }

  function responseForKey (key) {
    if (!state.responseMapping) return null;
    const k = String(key || '').toLowerCase();
    if (k === 'f') return state.responseMapping.f;
    if (k === 'j') return state.responseMapping.j;
    return null;
  }

  function setResponseButtonsEnabled (enabled) {
    const y = $('btn-yes');
    const n = $('btn-no');
    if (y) y.disabled = !enabled;
    if (n) n.disabled = !enabled;
  }

  function decorateResponseButton (button, response, key) {
    if (!button || !key) return;
    const label = responseLabel(response);
    button.innerHTML =
      '<span class="response-label">' + label + '</span>' +
      '<span class="key-hint"><span class="keycap">' + key.toUpperCase() +
      '</span> ' + t('keySuffix') + '</span>';
    button.setAttribute('aria-label', label + ' (' + key.toUpperCase() + ' ' + t('keySuffix') + ')');
    button.style.order = key === 'f' ? '1' : '2';
  }

  function updateResponseLabels () {
    if (!state.responseMapping) return;
    decorateResponseButton($('btn-yes'), '適切', keyForResponse('適切'));
    decorateResponseButton($('btn-no'), '不適切', keyForResponse('不適切'));
  }

  function updateKeyInstruction () {
    const el = $('key-instruction');
    if (!el || !state.responseMapping) return;
    el.innerHTML = t('keyInstruction', {
      yesKey: keyForResponse('適切').toUpperCase(),
      noKey: keyForResponse('不適切').toUpperCase()
    });
  }

  function updateTimingInstruction () {
    const el = $('timing-instruction');
    if (!el) return;
    el.textContent = isTimed() ? t('timedInstruction') : t('untimedInstruction');
  }

  function stopResponseTimer () {
    const bar = $('response-timebar');
    const fill = $('response-timebar-fill');
    if (bar) bar.classList.add('hidden');
    if (fill) {
      fill.style.transition = 'none';
      fill.style.width = '100%';
    }
  }

  function startResponseTimer (ms) {
    const bar = $('response-timebar');
    const fill = $('response-timebar-fill');
    if (!bar || !fill || !ms) return;
    bar.classList.remove('hidden');
    fill.style.transition = 'none';
    fill.style.width = '100%';
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        fill.style.transition = 'width ' + ms + 'ms linear';
        fill.style.width = '0%';
      });
    });
  }

  function cleanupResponseInput () {
    if (typeof state.currentResponseCleanup === 'function') {
      state.currentResponseCleanup();
      state.currentResponseCleanup = null;
    }
    stopResponseTimer();
    const y = $('btn-yes');
    const n = $('btn-no');
    if (y) y.onclick = null;
    if (n) n.onclick = null;
    setResponseButtonsEnabled(false);
  }

  function wireResponseInput (respond, options) {
    cleanupResponseInput();
    updateResponseLabels();
    setResponseButtonsEnabled(true);
    const opts = options || {};
    const windowMs = Number(opts.responseWindowMs || 0);
    let answered = false;
    let timeoutId = null;
    if (windowMs > 0) startResponseTimer(windowMs);

    const finalize = (response, details) => {
      if (answered) return;
      answered = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      cleanupResponseInput();
      const responseDetails = Object.assign({
        response_key: null,
        response_modality: 'mouse',
        keymap_id: state.responseMapping ? state.responseMapping.keymap_id : null,
        timed_out: false,
        response_window_ms: windowMs || null
      }, details || {});
      logEvent(responseDetails.timed_out ? 'response_timeout' : 'response_input', {
        response: response,
        response_key: responseDetails.response_key,
        response_modality: responseDetails.response_modality,
        response_window_ms: responseDetails.response_window_ms
      });
      respond(response, responseDetails);
    };

    const onKeyDown = event => {
      const response = responseForKey(event.key);
      if (!response) return;
      event.preventDefault();
      finalize(response, {
        response_key: String(event.key).toLowerCase(),
        response_modality: 'keyboard'
      });
    };

    document.addEventListener('keydown', onKeyDown);
    const y = $('btn-yes');
    const n = $('btn-no');
    if (y) y.onclick = () => finalize('適切');
    if (n) n.onclick = () => finalize('不適切');

    if (windowMs > 0) {
      timeoutId = window.setTimeout(() => {
        finalize(null, {
          response_modality: 'timeout',
          timed_out: true
        });
      }, windowMs);
    }

    state.currentResponseCleanup = () => {
      document.removeEventListener('keydown', onKeyDown);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (y) y.onclick = null;
      if (n) n.onclick = null;
    };
  }

  // ---- Data loading ----
  async function loadJSON (path) {
    const r = await fetch(assetPath(path));
    if (!r.ok) throw new Error('Failed to fetch ' + path + ' (' + r.status + ')');
    return r.json();
  }

  async function loadCalibration () {
    state.calibration   = await loadJSON('data/calibration.json');
    state.stimuliList   = await loadJSON('data/stimuli_list.json');
    state.practiceItems = await loadJSON('data/practice_items.json');
  }

  // ---- CAT engine bootstrap ----
  function mkItemId (it) {
    return it.item_id || (it.targetword + (it.condition === 'Hit' ? '_HIT' : '_CR'));
  }

  function getSelectedForm (name) {
    return state.calibration &&
      state.calibration.selected_forms &&
      state.calibration.selected_forms[name]
      ? state.calibration.selected_forms[name]
      : null;
  }

  function itemsFromSelectedForm (form) {
    return (form.items || []).map(it => Object.assign({}, it, {
      item_id: mkItemId(it)
    }));
  }

  function withItemIds (items) {
    return (items || []).map(it => Object.assign({}, it, {
      item_id: mkItemId(it)
    }));
  }

  function adaptiveBlueprint () {
    const fixed = getSelectedForm('fixed40_disjoint');
    const extended = getSelectedForm('extended70_disjoint');
    const cfg = APP_CONFIG.blueprint || {};
    const minItems = cfg.minItems || (fixed && fixed.n_items) || 40;
    const minHit = cfg.minHit || Math.floor(minItems / 2);
    const minCR = cfg.minCR || (minItems - minHit);
    const maxItems = cfg.maxItems || (extended && extended.n_items) || 70;
    const maxHit = cfg.maxHit || (extended && extended.n_hit) || Math.floor(maxItems / 2);
    const maxCR = cfg.maxCR || (extended && extended.n_cr) || (maxItems - maxHit);
    return { minItems, minHit, minCR, maxItems, maxHit, maxCR };
  }

  function buildAdaptivePools () {
    const extended = getSelectedForm('extended70_disjoint');
    const source = extended ? itemsFromSelectedForm(extended)
                            : withItemIds(state.calibration.item_bank_hit)
                                .concat(withItemIds(state.calibration.item_bank_cr));
    const hit = source.filter(it => it.condition === 'Hit');
    const cr = source.filter(it => it.condition === 'CR');
    state.adaptiveItems = hit.concat(cr);
    return {
      hit: hit,
      cr: cr,
      form: extended
    };
  }

  function createCATSession () {
    if (state.delivery === 'fixed40') {
      state.fixedItems = buildFixed40Items();
      return createFixedSession(state.fixedItems);
    }
    if (state.delivery === 'adaptive') {
      const pools = buildAdaptivePools();
      const bp = adaptiveBlueprint();
      return window.CAT1F.createTwoCondition(pools.hit, pools.cr, {
        algorithm: state.algorithm,
        quotaTol: state.params.quota_tol,
        disallowWordOverlap: true,
        maxConditionRun: maxConditionRun(),
        randomizeConditionTies: true,
        minItems: state.params.min_items,
        minHit: Math.floor(state.params.min_items / 2),
        minCR: state.params.min_items - Math.floor(state.params.min_items / 2),
        maxItems: state.params.max_items,
        maxHit: state.params.max_items === bp.maxItems ? bp.maxHit
          : Math.floor(state.params.max_items / 2),
        maxCR: state.params.max_items === bp.maxItems ? bp.maxCR
          : state.params.max_items - Math.floor(state.params.max_items / 2)
      });
    }
    if (state.mode === '1F') {
      return window.CAT1F.create(state.calibration.item_bank_1f, {
        algorithm: state.delivery === 'adaptive' ? state.algorithm : 'plain',
        quotaTol: state.params.quota_tol
      });
    }
    const rho = state.calibration.regression.factor_cor_2F;
    return window.CAT2F.create(state.calibration.item_bank_2f, rho);
  }

  function buildFixed40Items () {
    const selected = getSelectedForm('fixed40_disjoint');
    if (selected && selected.items && selected.items.length) {
      const rows = itemsFromSelectedForm(selected);
      const hit = rows.filter(it => it.condition === 'Hit')
        .sort((a, b) => a.rank - b.rank);
      const cr = rows.filter(it => it.condition === 'CR')
        .sort((a, b) => a.rank - b.rank);
      const out = [];
      const maxRun = maxConditionRun();
      const schedule = buildBalancedConditionSchedule(hit.length, cr.length, maxRun);
      state.fixedConditionSchedule = schedule.slice();
      let ih = 0;
      let ic = 0;
      for (let i = 0; i < schedule.length; i++) {
        if (schedule[i] === 'Hit' && hit[ih]) out.push(hit[ih++]);
        if (schedule[i] === 'CR' && cr[ic]) out.push(cr[ic++]);
      }
      return out;
    }

    const n = APP_CONFIG.fixedPerCondition || 20;
    const topHit = state.calibration.item_bank_hit
      .slice().sort((a, b) => b.a - a.a).slice(0, n)
      .map(it => Object.assign({ item_id: mkItemId(it) }, it));
    const topCR = state.calibration.item_bank_cr
      .slice().sort((a, b) => b.a - a.a).slice(0, n)
      .map(it => Object.assign({ item_id: mkItemId(it) }, it));
    const out = [];
    const maxRun = maxConditionRun();
    const schedule = buildBalancedConditionSchedule(topHit.length, topCR.length, maxRun);
    state.fixedConditionSchedule = schedule.slice();
    let ih = 0;
    let ic = 0;
    for (let i = 0; i < schedule.length; i++) {
      if (schedule[i] === 'Hit' && topHit[ih]) out.push(topHit[ih++]);
      if (schedule[i] === 'CR' && topCR[ic]) out.push(topCR[ic++]);
    }
    return out;
  }

  function createFixedSession (items) {
    const used = new Set();
    const log = [];
    function nextSequentialIndex () {
      for (let i = 0; i < items.length; i++) {
        if (!used.has(i)) return i;
      }
      return -1;
    }
    function logRow (idx, correct, extra, skipped) {
      used.add(idx);
      const it = items[idx];
      log.push(Object.assign({
        step: log.length + 1,
        item_index: idx,
        item_id: it.item_id,
        targetword: it.targetword,
        condition: it.condition,
        stimuli: it.stimuli,
        ANSWER: it.ANSWER,
        correct: correct,
        a: it.a,
        b: it.b,
        theta_after: null,
        se_after: null,
        item_info: null,
        skipped: !!skipped
      }, extra || {}));
    }
    return {
      selectNext: () => {
        const idx = nextSequentialIndex();
        return idx >= 0 ? { index: idx, info: null, theta: null, se: null } : null;
      },
      update: (idx, correct, extra) => logRow(idx, correct, extra, false),
      markUsed: (idx, extra) => logRow(idx, null, extra, true),
      currentTheta: () => NaN,
      currentSE: () => Infinity,
      usedCount: () => used.size,
      finalize: () => ({ theta: NaN, se: NaN, n_items: used.size, log: log.slice() }),
      mode: 'fixed40'
    };
  }

  function escapeHtml (value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtNum (value) {
    return Number.isFinite(value) ? Number(value).toFixed(3) : '';
  }

  function researchItemRows () {
    if (!state.calibration) return [];
    const formName = state.delivery === 'fixed40'
      ? 'fixed40_disjoint'
      : 'extended70_disjoint';
    const form = getSelectedForm(formName);
    const source = form && form.items && form.items.length
      ? itemsFromSelectedForm(form)
      : (state.delivery === 'adaptive'
          ? withItemIds(state.calibration.item_bank_hit)
              .concat(withItemIds(state.calibration.item_bank_cr))
          : []);
    return source.slice()
      .sort((a, b) => {
        if (a.condition !== b.condition) return a.condition === 'Hit' ? -1 : 1;
        return (a.rank || 9999) - (b.rank || 9999);
      })
      .map((it, idx) => ({
        form_id: form ? form.form_id : '',
        candidate_set: formName,
        display_order: idx + 1,
        rank: it.rank || '',
        item_id: mkItemId(it),
        targetword: it.targetword || '',
        condition: it.condition || '',
        stimuli: it.stimuli || '',
        ANSWER: it.ANSWER || '',
        ANSWER_label: responseLabel(it.ANSWER || ''),
        a: it.a,
        b: it.b,
        g: it.g,
        u: it.u
      }));
  }

  function summarizeResearchItems (rows) {
    const hit = rows.filter(row => row.condition === 'Hit').length;
    const cr = rows.filter(row => row.condition === 'CR').length;
    const byWord = {};
    rows.forEach(row => {
      const w = String(row.targetword || '').toLowerCase();
      if (!w) return;
      if (!byWord[w]) byWord[w] = {};
      byWord[w][row.condition || ''] = true;
    });
    const uniqueTargets = Object.keys(byWord).length;
    const overlap = Object.keys(byWord).filter(w => byWord[w].Hit && byWord[w].CR).length;
    const rangeText = values => {
      const finite = values.filter(Number.isFinite);
      if (!finite.length) return '';
      return Number(Math.min.apply(null, finite)).toFixed(3) +
        ' to ' + Number(Math.max.apply(null, finite)).toFixed(3);
    };
    return {
      n: rows.length,
      hit: hit,
      cr: cr,
      uniqueTargets: uniqueTargets,
      overlap: overlap,
      aRange: rangeText(rows.map(row => row.a)),
      bRange: rangeText(rows.map(row => row.b))
    };
  }

  function responseWindowPreset () {
    const ms = responseWindowMs() || DEFAULTS.response_window_ms;
    return [750, 1000, 1250, 1500, 2000].includes(ms) ? String(ms) : 'custom';
  }

  function setResearchStatus (messageKey, isError) {
    const el = $('research-protocol-status');
    if (!el) return;
    el.textContent = messageKey ? t(messageKey) : '';
    el.classList.toggle('error', !!isError);
    if (state.researchStatusTimer) {
      window.clearTimeout(state.researchStatusTimer);
      state.researchStatusTimer = null;
    }
    if (messageKey) {
      state.researchStatusTimer = window.setTimeout(() => {
        if (el) el.textContent = '';
      }, 2500);
    }
  }

  function bindResearchPanelControls () {
    const deliveryEl = $('research-delivery-mode');
    const timingEl = $('research-timing-mode');
    const presetEl = $('research-window-preset');
    const customEl = $('research-window-custom');
    const keymapEl = $('research-keymap');
    const autoPlayEl = $('research-auto-play-audio');
    const fixationEl = $('research-fixation-ms');
    const postResponseEl = $('research-post-response-ms');
    const maxRunEl = $('research-max-condition-run');
    const maxFailsEl = $('research-max-play-fails');
    const algorithmEl = $('research-algorithm');
    const stopRuleEl = $('research-stop-rule');
    const minItemsEl = $('research-min-items');
    const maxItemsEl = $('research-max-items');
    const targetSeEl = $('research-target-se');
    const stopPserEl = $('research-stop-pser');
    const quotaTolEl = $('research-quota-tol');
    const applyEl = $('research-apply-protocol');
    const copyEl = $('research-copy-url');
    const urlEl = $('research-participant-url');
    const helpEl = $('research-timing-help');
    if (!timingEl || !presetEl || !customEl || !urlEl) return;

    const readOverrides = () => {
      const delivery = normalizeDelivery(deliveryEl ? deliveryEl.value : state.delivery);
      const targetAdaptive = delivery === 'adaptive';
      return {
        delivery: delivery,
        timing: timingEl.value,
        response_window_ms: presetEl.value === 'custom' ? customEl.value : presetEl.value,
        keymap: keymapEl ? keymapEl.value : state.params.keymap,
        auto_play_audio: autoPlayEl ? autoPlayEl.value === '1' : autoPlayAudio(),
        fixation_ms: fixationEl ? fixationEl.value : fixationMs(),
        post_response_ms: postResponseEl ? postResponseEl.value : postResponseMs(),
        max_condition_run: maxRunEl ? maxRunEl.value : maxConditionRun(),
        max_play_fails: maxFailsEl ? maxFailsEl.value : state.params.max_play_fails,
        algorithm: algorithmEl ? algorithmEl.value : 'blueprint',
        stop_rule: stopRuleEl ? stopRuleEl.value : 'blueprint_pser',
        min_items: minItemsEl ? minItemsEl.value : (targetAdaptive ? 40 : state.params.min_items),
        max_items: maxItemsEl ? maxItemsEl.value : (targetAdaptive ? 70 : state.params.max_items),
        target_se: targetSeEl ? targetSeEl.value : DEFAULTS.target_se,
        stop_pser: stopPserEl ? stopPserEl.value : DEFAULTS.stop_pser,
        quota_tol: quotaTolEl ? quotaTolEl.value : DEFAULTS.quota_tol
      };
    };

    const refreshControls = () => {
      const timed = normalizeTiming(timingEl.value) === 'timed';
      const custom = presetEl.value === 'custom';
      presetEl.disabled = !timed;
      customEl.disabled = !timed || !custom;
      customEl.parentElement.classList.toggle('hidden', !timed || !custom);
      helpEl.textContent = timed ? t('researchTimedHelp') : t('researchUntimedHelp');
      urlEl.value = buildProtocolURL(false, readOverrides());
    };

    if (deliveryEl) deliveryEl.addEventListener('change', refreshControls);
    timingEl.addEventListener('change', refreshControls);
    presetEl.addEventListener('change', refreshControls);
    customEl.addEventListener('input', refreshControls);
    [
      keymapEl, autoPlayEl, fixationEl, postResponseEl, maxRunEl, maxFailsEl,
      algorithmEl, stopRuleEl, minItemsEl, maxItemsEl, targetSeEl, stopPserEl, quotaTolEl
    ].forEach(el => {
      if (!el) return;
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', refreshControls);
    });

    if (applyEl) {
      applyEl.addEventListener('click', () => {
        const overrides = readOverrides();
        if (normalizeDelivery(overrides.delivery) !== state.delivery) {
          logEvent('research_protocol_mode_switch', {
            from_delivery: state.delivery,
            to_delivery: overrides.delivery,
            participant_url: buildProtocolURL(false, overrides)
          });
          updateURLFromProtocol(true, overrides);
          return;
        }
        state.params.timing = normalizeTiming(overrides.timing);
        if (state.params.timing === 'timed') {
          state.params.response_window_ms = boundedNumberValue(
            overrides.response_window_ms,
            DEFAULTS.response_window_ms,
            250,
            10000,
            true
          );
        }
        state.params.keymap = normalizeKeymap(overrides.keymap);
        state.params.auto_play_audio = !!overrides.auto_play_audio;
        state.params.fixation_ms = boundedNumberValue(
          overrides.fixation_ms, DEFAULTS.fixation_ms, 0, 3000, true);
        state.params.post_response_ms = boundedNumberValue(
          overrides.post_response_ms, DEFAULTS.post_response_ms, 0, 5000, true);
        state.params.max_condition_run = boundedNumberValue(
          overrides.max_condition_run, DEFAULTS.max_condition_run, 1, 10, true);
        state.params.max_play_fails = boundedNumberValue(
          overrides.max_play_fails, DEFAULTS.max_play_fails, 0, 10, true);
        if (state.delivery === 'adaptive') {
          const adaptiveBounds = adaptiveItemBounds();
          const defaultMinItems = Math.min(
            Math.max(DEFAULTS.min_items, adaptiveBounds.floor),
            adaptiveBounds.cap
          );
          state.algorithm = normalizeAlgorithm(overrides.algorithm);
          state.stopRule = normalizeStopRule(overrides.stop_rule);
          state.params.min_items = boundedNumberValue(
            overrides.min_items, defaultMinItems, adaptiveBounds.floor, adaptiveBounds.cap, true);
          state.params.max_items = boundedNumberValue(
            overrides.max_items, adaptiveBounds.cap, adaptiveBounds.floor, adaptiveBounds.cap, true);
          if (state.params.max_items < state.params.min_items) {
            state.params.max_items = state.params.min_items;
          }
          state.params.target_se = boundedNumberValue(overrides.target_se, DEFAULTS.target_se, 0.05, 2.0, false);
          state.params.stop_pser = boundedNumberValue(overrides.stop_pser, DEFAULTS.stop_pser, 0, 1, false);
          state.params.quota_tol = boundedNumberValue(overrides.quota_tol, DEFAULTS.quota_tol, 0, 0.49, false);
        }
        updateURLFromProtocol(true, overrides);
        applyLanguage();
        updateTimingInstruction();
        updatePresentationInstruction();
        logEvent('research_protocol_applied', {
          delivery: state.delivery,
          timing_mode: state.params.timing,
          response_window_ms: responseWindowMs(),
          auto_play_audio: autoPlayAudio(),
          fixation_ms: fixationMs(),
          post_response_ms: postResponseMs(),
          max_condition_run: maxConditionRun(),
          max_play_fails: state.params.max_play_fails,
          keymap: state.params.keymap,
          participant_url: participantProtocolURL()
        });
        renderResearchPanel();
        setResearchStatus('researchProtocolApplied');
      });
    }

    if (copyEl) {
      copyEl.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(urlEl.value);
          setResearchStatus('researchCopied');
        } catch (err) {
          setResearchStatus('researchCopyFailed', true);
        }
      });
    }

    refreshControls();
  }

  function applyResearchTableFilter () {
    const queryEl = $('research-item-search');
    const conditionEl = $('research-condition-filter');
    const countEl = $('research-visible-count');
    const rows = Array.from(document.querySelectorAll('#research-item-table tbody tr'));
    const query = String(queryEl ? queryEl.value : '').trim().toLowerCase();
    const condition = conditionEl ? conditionEl.value : 'all';
    state.researchFilters = { query: query, condition: condition };

    let visible = 0;
    rows.forEach(row => {
      const rowCondition = row.getAttribute('data-condition') || '';
      const search = row.getAttribute('data-search') || '';
      const conditionMatch = condition === 'all' || rowCondition === condition;
      const queryMatch = !query || search.indexOf(query) >= 0;
      const show = conditionMatch && queryMatch;
      row.classList.toggle('hidden', !show);
      if (show) visible++;
    });
    if (countEl) {
      countEl.textContent = t('researchVisibleRows', { visible: visible, total: rows.length });
    }
  }

  function bindResearchTableFilters () {
    const queryEl = $('research-item-search');
    const conditionEl = $('research-condition-filter');
    if (queryEl) {
      queryEl.addEventListener('input', applyResearchTableFilter);
    }
    if (conditionEl) {
      conditionEl.addEventListener('change', applyResearchTableFilter);
    }
    applyResearchTableFilter();
  }

  function renderResearchPanel () {
    const panel = $('research-panel');
    if (!panel) return;
    if (!state.researchMode) {
      panel.classList.add('hidden');
      panel.innerHTML = '';
      return;
    }

    const form = state.delivery === 'fixed40'
      ? getSelectedForm('fixed40_disjoint')
      : getSelectedForm('extended70_disjoint');
    const rows = researchItemRows();
    const itemSummary = summarizeResearchItems(rows);
    const timing = isTimed()
      ? t('researchTimedValue', { ms: responseWindowMs() })
      : t('researchUntimedValue');
    const model = state.delivery === 'adaptive'
      ? 'per-condition 1D 2PL blueprint CAT (mod_hit / mod_cr)'
      : 'per-condition 1D 2PL disjoint fixed form (mod_hit / mod_cr)';
    const note = state.delivery === 'adaptive'
      ? t('researchAdaptiveNote')
      : t('researchFixedNote');
    const preset = responseWindowPreset();
    const currentWindow = responseWindowMs() || DEFAULTS.response_window_ms;
    const keymap = normalizeKeymap(state.params.keymap);
    const adaptiveBounds = adaptiveItemBounds();
    const adaptiveProtocolHtml = state.delivery === 'adaptive'
      ? '<div class="research-protocol-subsection">' +
          '<h5>' + escapeHtml(t('researchAdaptiveSettingsTitle')) + '</h5>' +
          '<div class="research-control-grid">' +
            '<label><span>' + escapeHtml(t('researchAlgorithmLabel')) + '</span>' +
              '<select id="research-algorithm">' +
                ['blueprint', 'alternating', 'quota'].map(value =>
                  '<option value="' + value + '"' + (state.algorithm === value ? ' selected' : '') +
                    '>' + value + '</option>'
                ).join('') +
              '</select></label>' +
            '<label><span>' + escapeHtml(t('researchStopRuleLabel')) + '</span>' +
              '<select id="research-stop-rule">' +
                ['blueprint_pser', 'pser', 'se', 'max_items'].map(value =>
                  '<option value="' + value + '"' + (state.stopRule === value ? ' selected' : '') +
                    '>' + value + '</option>'
                ).join('') +
              '</select></label>' +
            '<label><span>' + escapeHtml(t('researchMinItemsLabel')) + '</span>' +
              '<input type="number" id="research-min-items" min="' + adaptiveBounds.floor +
                '" max="' + adaptiveBounds.cap + '" step="1" value="' +
                escapeHtml(state.params.min_items) + '" /></label>' +
            '<label><span>' + escapeHtml(t('researchMaxItemsLabel')) + '</span>' +
              '<input type="number" id="research-max-items" min="' + adaptiveBounds.floor +
                '" max="' + adaptiveBounds.cap + '" step="1" value="' +
                escapeHtml(state.params.max_items) + '" /></label>' +
            '<label><span>' + escapeHtml(t('researchTargetSeLabel')) + '</span>' +
              '<input type="number" id="research-target-se" min="0.05" max="2" step="0.01" value="' +
                escapeHtml(state.params.target_se) + '" /></label>' +
            '<label><span>' + escapeHtml(t('researchStopPserLabel')) + '</span>' +
              '<input type="number" id="research-stop-pser" min="0" max="1" step="0.001" value="' +
                escapeHtml(state.params.stop_pser) + '" /></label>' +
            '<label><span>' + escapeHtml(t('researchQuotaTolLabel')) + '</span>' +
              '<input type="number" id="research-quota-tol" min="0" max="0.49" step="0.01" value="' +
                escapeHtml(state.params.quota_tol) + '" /></label>' +
          '</div>' +
        '</div>'
      : '';
    const protocolHtml =
      '<div class="research-protocol">' +
        '<h4>' + escapeHtml(t('researchProtocolTitle')) + '</h4>' +
        '<p class="research-model">' + escapeHtml(t('researchProtocolNote')) + '</p>' +
        '<div class="research-control-grid">' +
          '<label><span>' + escapeHtml(t('researchDeliveryModeLabel')) + '</span>' +
            '<select id="research-delivery-mode">' +
              '<option value="fixed40"' + (state.delivery === 'fixed40' ? ' selected' : '') + '>' +
                escapeHtml(t('researchFixed40Option')) + '</option>' +
              '<option value="adaptive"' + (state.delivery === 'adaptive' ? ' selected' : '') + '>' +
                escapeHtml(t('researchAdaptiveOption')) + '</option>' +
            '</select></label>' +
          '<label><span>' + escapeHtml(t('researchTimingModeLabel')) + '</span>' +
            '<select id="research-timing-mode">' +
              '<option value="timed"' + (isTimed() ? ' selected' : '') + '>' +
                escapeHtml(t('researchTimedOption')) + '</option>' +
              '<option value="untimed"' + (!isTimed() ? ' selected' : '') + '>' +
                escapeHtml(t('researchUntimedOption')) + '</option>' +
            '</select></label>' +
          '<label><span>' + escapeHtml(t('researchWindowPresetLabel')) + '</span>' +
            '<select id="research-window-preset">' +
              [750, 1000, 1250, 1500, 2000].map(ms =>
                '<option value="' + ms + '"' + (preset === String(ms) ? ' selected' : '') +
                '>' + ms + ' ms</option>'
              ).join('') +
              '<option value="custom"' + (preset === 'custom' ? ' selected' : '') +
                '>custom</option>' +
            '</select></label>' +
          '<label><span>' + escapeHtml(t('researchWindowCustomLabel')) + '</span>' +
            '<input type="number" id="research-window-custom" min="250" max="10000" step="50" value="' +
              escapeHtml(currentWindow) + '" /></label>' +
          '<label><span>' + escapeHtml(t('researchAudioAutoplayLabel')) + '</span>' +
            '<select id="research-auto-play-audio">' +
              '<option value="1"' + (autoPlayAudio() ? ' selected' : '') + '>' +
                escapeHtml(t('researchAutoplayOn')) + '</option>' +
              '<option value="0"' + (!autoPlayAudio() ? ' selected' : '') + '>' +
                escapeHtml(t('researchAutoplayOff')) + '</option>' +
            '</select></label>' +
          '<label><span>' + escapeHtml(t('researchFixationMsLabel')) + '</span>' +
            '<input type="number" id="research-fixation-ms" min="0" max="3000" step="50" value="' +
              escapeHtml(fixationMs()) + '" /></label>' +
          '<label><span>' + escapeHtml(t('researchPostResponseMsLabel')) + '</span>' +
            '<input type="number" id="research-post-response-ms" min="0" max="5000" step="50" value="' +
              escapeHtml(postResponseMs()) + '" /></label>' +
          '<label><span>' + escapeHtml(t('researchMaxConditionRunLabel')) + '</span>' +
            '<input type="number" id="research-max-condition-run" min="1" max="10" step="1" value="' +
              escapeHtml(maxConditionRun()) + '" /></label>' +
          '<label><span>' + escapeHtml(t('researchMaxPlayFailsLabel')) + '</span>' +
            '<input type="number" id="research-max-play-fails" min="0" max="10" step="1" value="' +
              escapeHtml(state.params.max_play_fails) + '" /></label>' +
          '<label><span>' + escapeHtml(t('researchKeymapLabel')) + '</span>' +
            '<select id="research-keymap">' +
              '<option value="counterbalanced"' + (keymap === 'counterbalanced' ? ' selected' : '') + '>' +
                escapeHtml(t('researchKeymapCounterbalanced')) + '</option>' +
              '<option value="f_appropriate"' + (keymap === 'f_appropriate' ? ' selected' : '') + '>' +
                escapeHtml(t('researchKeymapFAppropriate')) + '</option>' +
              '<option value="j_appropriate"' + (keymap === 'j_appropriate' ? ' selected' : '') + '>' +
                escapeHtml(t('researchKeymapJAppropriate')) + '</option>' +
            '</select></label>' +
        '</div>' +
        adaptiveProtocolHtml +
        '<p id="research-timing-help" class="research-model"></p>' +
        '<div class="research-url-row">' +
          '<label><span>' + escapeHtml(t('researchParticipantUrlLabel')) + '</span>' +
            '<input type="text" id="research-participant-url" readonly value="' +
              escapeHtml(participantProtocolURL()) + '" /></label>' +
        '</div>' +
        '<div class="research-action-row">' +
          '<button type="button" id="research-apply-protocol" class="secondary-btn">' +
            escapeHtml(t('researchApplyProtocol')) + '</button>' +
          '<button type="button" id="research-copy-url" class="secondary-btn">' +
            escapeHtml(t('researchCopyUrl')) + '</button>' +
          '<span id="research-protocol-status" class="research-protocol-status" role="status" aria-live="polite"></span>' +
        '</div>' +
      '</div>';
    const itemSummaryHtml =
      '<h4>' + escapeHtml(t('researchItemSummaryTitle')) + '</h4>' +
      '<div class="research-summary-grid research-item-summary-grid">' +
        '<div><span>' + escapeHtml(t('researchItemCount')) + '</span><strong>' +
          escapeHtml(itemSummary.n) + '</strong></div>' +
        '<div><span>' + escapeHtml(t('researchHitCrCount')) + '</span><strong>' +
          escapeHtml(itemSummary.hit + ' / ' + itemSummary.cr) + '</strong></div>' +
        '<div><span>' + escapeHtml(t('researchUniqueTargets')) + '</span><strong>' +
          escapeHtml(itemSummary.uniqueTargets) + '</strong></div>' +
        '<div><span>' + escapeHtml(t('researchOverlapCount')) + '</span><strong>' +
          escapeHtml(itemSummary.overlap) + '</strong></div>' +
        '<div><span>' + escapeHtml(t('researchARange')) + '</span><strong>' +
          escapeHtml(itemSummary.aRange) + '</strong></div>' +
        '<div><span>' + escapeHtml(t('researchBRange')) + '</span><strong>' +
          escapeHtml(itemSummary.bRange) + '</strong></div>' +
      '</div>';
    const filterHtml =
      '<div class="research-filter-panel">' +
        '<h4>' + escapeHtml(t('researchFilterTitle')) + '</h4>' +
        '<div class="research-control-grid research-filter-grid">' +
          '<label><span>' + escapeHtml(t('researchSearchLabel')) + '</span>' +
            '<input type="text" id="research-item-search" value="' +
              escapeHtml(state.researchFilters.query || '') + '" placeholder="' +
              escapeHtml(t('researchSearchPlaceholder')) + '" /></label>' +
          '<label><span>' + escapeHtml(t('researchConditionLabel')) + '</span>' +
            '<select id="research-condition-filter">' +
              '<option value="all"' + (state.researchFilters.condition === 'all' ? ' selected' : '') + '>' +
                escapeHtml(t('researchConditionAll')) + '</option>' +
              '<option value="Hit"' + (state.researchFilters.condition === 'Hit' ? ' selected' : '') + '>Hit</option>' +
              '<option value="CR"' + (state.researchFilters.condition === 'CR' ? ' selected' : '') + '>CR</option>' +
            '</select></label>' +
        '</div>' +
        '<p id="research-visible-count" class="research-model"></p>' +
      '</div>';

    const rowHtml = rows.map(row => (
      '<tr data-condition="' + escapeHtml(row.condition) + '" data-search="' +
        escapeHtml([
          row.item_id,
          row.targetword,
          row.condition,
          row.ANSWER,
          row.stimuli
        ].join(' ').toLowerCase()) + '">' +
        '<td>' + escapeHtml(row.rank) + '</td>' +
        '<td>' + escapeHtml(row.condition) + '</td>' +
        '<td>' + escapeHtml(row.targetword) + '</td>' +
        '<td>' + escapeHtml(responseLabel(row.ANSWER)) + '</td>' +
        '<td>' + escapeHtml(fmtNum(row.a)) + '</td>' +
        '<td>' + escapeHtml(fmtNum(row.b)) + '</td>' +
        '<td>' + escapeHtml(row.stimuli) + '</td>' +
      '</tr>'
    )).join('');

    panel.classList.remove('hidden');
    panel.innerHTML =
      '<div class="research-panel-header">' +
        '<h3>' + escapeHtml(t('researchTitle')) + '</h3>' +
        '<p>' + escapeHtml(t('researchHiddenNote')) + '</p>' +
      '</div>' +
      protocolHtml +
      '<div class="research-summary-grid">' +
        '<div><span>' + escapeHtml(t('researchDelivery')) + '</span><strong>' +
          escapeHtml(state.delivery) + '</strong></div>' +
        '<div><span>' + escapeHtml(t('researchTiming')) + '</span><strong>' +
          escapeHtml(timing) + '</strong></div>' +
        '<div><span>' + escapeHtml(t('researchAutoplay')) + '</span><strong>' +
          escapeHtml(autoPlayAudio() ? t('researchAutoplayOn') : t('researchAutoplayOff')) + '</strong></div>' +
        '<div><span>' + escapeHtml(t('researchFixation')) + '</span><strong>' +
          escapeHtml(fixationMs() + ' ms') + '</strong></div>' +
        '<div><span>' + escapeHtml(t('researchPostResponseMsLabel')) + '</span><strong>' +
          escapeHtml(postResponseMs() + ' ms') + '</strong></div>' +
        '<div><span>' + escapeHtml(t('researchMaxRun')) + '</span><strong>' +
          escapeHtml(maxConditionRun()) + '</strong></div>' +
        '<div><span>' + escapeHtml(t('researchMaxPlayFailsLabel')) + '</span><strong>' +
          escapeHtml(state.params.max_play_fails) + '</strong></div>' +
        '<div><span>' + escapeHtml(t('researchKeymapLabel')) + '</span><strong>' +
          escapeHtml(normalizeKeymap(state.params.keymap)) + '</strong></div>' +
        '<div><span>' + escapeHtml(t('researchForm')) + '</span><strong>' +
          escapeHtml(form ? form.form_id : '') + '</strong></div>' +
      '</div>' +
      '<p class="research-model"><strong>' + escapeHtml(t('researchSelectionModel')) +
        ':</strong> ' + escapeHtml(model) + '</p>' +
      itemSummaryHtml +
      '<h4>' + escapeHtml(t('researchItemsTitle')) + '</h4>' +
      '<p class="research-model">' + escapeHtml(note) + '</p>' +
      (rows.length
        ? filterHtml + '<div class="research-table-wrap"><table id="research-item-table" class="research-table">' +
            '<thead><tr>' +
              '<th>' + escapeHtml(t('researchColRank')) + '</th>' +
              '<th>' + escapeHtml(t('researchColCondition')) + '</th>' +
              '<th>' + escapeHtml(t('researchColTarget')) + '</th>' +
              '<th>' + escapeHtml(t('researchColAnswer')) + '</th>' +
              '<th>' + escapeHtml(t('researchColA')) + '</th>' +
              '<th>' + escapeHtml(t('researchColB')) + '</th>' +
              '<th>' + escapeHtml(t('researchColStimuli')) + '</th>' +
            '</tr></thead><tbody>' + rowHtml + '</tbody></table></div>'
        : '<p>' + escapeHtml(t('researchNoItems')) + '</p>');
    bindResearchPanelControls();
    bindResearchTableFilters();
  }

  // ---- Audio helpers with recovery ----
  function playAudio (path) {
    return new Promise((resolve, reject) => {
      const el = $('audio-player');
      const onEnd = () => {
        state.currentAudioEnd = Date.now();
        state.currentAudioDurationMs = Math.round(performance.now() - state.audioStart);
        el.removeEventListener('ended', onEnd);
        el.removeEventListener('error', onErr);
        logEvent('audio_play_end', {
          audio_path: path,
          audio_duration_ms: state.currentAudioDurationMs
        });
        resolve();
      };
      const onErr = () => {
        el.removeEventListener('ended', onEnd);
        el.removeEventListener('error', onErr);
        logEvent('audio_play_error', { audio_path: path });
        reject(new Error('audio element error'));
      };
      el.addEventListener('ended', onEnd);
      el.addEventListener('error', onErr);
      el.src = path;
      state.audioStart = performance.now();
      state.currentAudioStart = Date.now();
      state.currentAudioEnd = 0;
      state.currentAudioDurationMs = null;
      logEvent('audio_play_start', { audio_path: path });
      const p = el.play();
      if (p && typeof p.then === 'function') {
        p.catch(err => {
          el.removeEventListener('ended', onEnd);
          el.removeEventListener('error', onErr);
          logEvent('audio_play_error', {
            audio_path: path,
            error_message: err && err.message ? err.message : String(err || '')
          });
          reject(err);
        });
      }
    });
  }

  function presentStimulus (audioPath, targetword, onReveal) {
    const area = $('target-word-area');
    const fixation = $('fixation-cross');
    const btnPlay = $('btn-play');
    const autoPlay = autoPlayAudio();
    const fixationDurationMs = fixationMs();

    cleanupResponseInput();
    updateResponseLabels();
    if (area) area.classList.add('hidden');
    if (fixation) fixation.classList.add('hidden');
    $('feedback-area').classList.add('hidden');
    $('play-status').textContent = '';
    state.playedOnce = false;
    state.playFailCount = 0;

    // Per-trial re-entry guard. Any call to `commit(result)` disables itself
    // so that duplicate skip paths cannot call `onReveal` twice.
    let committed = false;
    let readySent = false;
    const commit = (result) => {
      if (committed) return;
      committed = true;
      logEvent('trial_commit', {
        targetword: targetword,
        commit_result: result === null ? 'skip' : 'ready'
      });
      cleanupResponseInput();
      const skipEl = area ? area.querySelector('#btn-skip') : null;
      if (skipEl) skipEl.disabled = true;
      if (typeof onReveal === 'function') onReveal(result);
    };

    const sendReady = () => {
      if (committed || readySent) return;
      readySent = true;
      if (typeof onReveal === 'function') onReveal(undefined /* ready */);
    };

    const staleSkip = area ? area.querySelector('#btn-skip') : null;
    if (staleSkip) staleSkip.remove();

    btnPlay.disabled = true;
    btnPlay.textContent = autoPlay ? t('autoPlaying') : t('playAudio');
    btnPlay.classList.toggle('hidden', autoPlay);

    function responseKeyPrompt () {
      if (!state.responseMapping) return t('keyPromptFallback');
      return t('keyPrompt', {
        yesKey: keyForResponse('適切').toUpperCase(),
        noKey: keyForResponse('不適切').toUpperCase()
      });
    }

    function attachAudioFailureUI () {
      if (fixation) fixation.classList.add('hidden');
      const remaining = state.params.max_play_fails - state.playFailCount;
      btnPlay.classList.remove('hidden');
      if (remaining > 0) {
        btnPlay.disabled = false;
        btnPlay.textContent = t('retryRemaining', { remaining: remaining });
        setStatus(t('playbackFailed'));
      } else {
        btnPlay.disabled = true;
        btnPlay.textContent = t('playbackUnavailable');
        setStatus(t('playbackUnavailableStatus'));
        $('target-word-display').textContent = targetword;
        if (area) area.classList.remove('hidden');
        addOrUpdateSkipOption();
      }
    }

    function addOrUpdateSkipOption () {
      if (!area) return;
      let skip = area.querySelector('#btn-skip');
      if (!skip) {
        skip = document.createElement('button');
        skip.id = 'btn-skip';
        skip.className = 'secondary-btn';
        skip.style.marginTop = '12px';
        skip.textContent = t('skipTrial');
        area.appendChild(skip);
      }
      skip.disabled = false;
      skip.onclick = () => commit(null /* skipped */);
    }

    function revealTarget () {
      if (committed) return;
      btnPlay.disabled = true;
      btnPlay.classList.add('hidden');
      $('target-word-display').textContent = targetword;
      if (area) area.classList.remove('hidden');
      setStatus(t('audioEnded', { prompt: responseKeyPrompt() }));
      state.questionStart = performance.now();
      logEvent('target_onset', {
        targetword: targetword,
        response_window_ms: responseWindowMs()
      });
      sendReady();
    }

    async function startPlayback () {
      if (state.playedOnce || committed) return;
      btnPlay.disabled = true;
      btnPlay.classList.add('hidden');
      if (fixation) fixation.classList.remove('hidden');
      setStatus(t('lookAtFixation'));
      logEvent('fixation_onset', {
        targetword: targetword,
        fixation_ms: fixationDurationMs
      });
      await sleep(fixationDurationMs);
      if (committed) return;
      if (fixation) fixation.classList.add('hidden');
      logEvent('fixation_offset', { targetword: targetword });
      setStatus(t('playingStatus'));
      try {
        await playAudio(audioPath);
        state.playedOnce = true;
        revealTarget();
      } catch (err) {
        state.playFailCount++;
        console.error('Audio playback failed', err);
        attachAudioFailureUI();
      }
    }

    btnPlay.onclick = startPlayback;
    if (autoPlay) {
      window.setTimeout(startPlayback, 0);
    } else {
      btnPlay.disabled = false;
      btnPlay.classList.remove('hidden');
      setStatus(t('clickPlay'));
    }
  }

  // ---- Practice trials ----
  function startPractice () {
    state.practice.currentIndex = 0;
    state.practice.log = [];
    state.practice.n_correct = 0;
    state.currentTrialContext = null;
    logEvent('practice_start');
    showStage('stage-trial');
    $('trial-label').textContent = t('practiceLabel');
    showPracticeItem();
  }

  function showPracticeItem () {
    const idx = state.practice.currentIndex;
    const item = state.practice.items[idx];
    state.currentTrialContext = {
      phase: 'practice',
      step: idx + 1,
      item_id: item.item_id || ('practice_' + (idx + 1)),
      targetword: item.targetword,
      condition: item.condition || ''
    };
    $('trial-counter').textContent = t('practiceCounter', { n: idx + 1 });

    presentStimulus(assetPath('audio/practice/' + item.stimuli), item.targetword, (signal) => {
      if (signal === null) {
        // Audio failed past retry budget during practice — just log an empty
        // practice row and advance; practice is formative, no CAT state here.
        state.practice.log.push({
          step: state.practice.currentIndex + 1,
          display: item.display, stimuli: item.stimuli,
          targetword: item.targetword, ANSWER: item.ANSWER,
          response: null, correct: null, rt_ms: null,
          response_key: null,
          response_modality: null,
          keymap_id: state.responseMapping ? state.responseMapping.keymap_id : null,
          timed_out: false,
          response_window_ms: responseWindowMs(),
          audio_failed: true
        });
        state.practice.currentIndex++;
        if (state.practice.currentIndex < state.practice.items.length) {
          showPracticeItem();
        } else {
          state.practice.completed = true;
          showStage('stage-transition');
        }
        return;
      }
      // Audio played — wire Yes/No with a per-trial re-entry guard so a
      // double-click never fires the response callback twice.
      let answered = false;
      const respond = (r, details) => {
        if (answered) return;
        answered = true;
        onPracticeResponse(item, r, details);
      };
      wireResponseInput(respond, { responseWindowMs: responseWindowMs() });
    });
  }

  function onPracticeResponse (item, response, details) {
    const rt = performance.now() - state.questionStart;
    const d = details || {};
    const timedOut = !!d.timed_out;
    const correct = response === null ? null : (response === item.ANSWER ? 1 : 0);
    state.practice.log.push({
      step: state.practice.currentIndex + 1,
      display: item.display,
      stimuli: item.stimuli,
      targetword: item.targetword,
      ANSWER: item.ANSWER,
      response: response,
      correct: correct,
      rt_ms: Math.round(rt),
      response_key: d.response_key || null,
      response_modality: d.response_modality || null,
      keymap_id: d.keymap_id || (state.responseMapping ? state.responseMapping.keymap_id : null),
      timed_out: timedOut,
      response_window_ms: d.response_window_ms || responseWindowMs()
    });
    logEvent('practice_response_committed', {
      step: state.practice.currentIndex + 1,
      targetword: item.targetword,
      response: response,
      correct: correct,
      rt_ms: Math.round(rt),
      timed_out: timedOut
    });
    if (correct) state.practice.n_correct++;

    cleanupResponseInput();

    const fb = $('feedback-area');
    fb.classList.remove('hidden', 'correct', 'wrong');
    if (timedOut) {
      fb.classList.add('wrong');
      fb.innerHTML = t('timeoutFeedback', { answer: responseLabel(item.ANSWER) });
    } else if (correct) {
      fb.classList.add('correct');
      fb.innerHTML = t('correctFeedback');
    } else {
      fb.classList.add('wrong');
      fb.innerHTML = t('wrongFeedback', { answer: responseLabel(item.ANSWER) });
    }

    setTimeout(() => {
      state.practice.currentIndex++;
      if (state.practice.currentIndex < state.practice.items.length) {
        showPracticeItem();
      } else {
        state.practice.completed = true;
        showStage('stage-transition');
      }
    }, 2200);
  }

  // ---- Main CAT ----
  function startMain () {
    state.cat = createCATSession();
    state.responses = [];
    state.mainStart = performance.now();
    state.session.started_at = nowISO();
    state.currentTrialContext = null;
    logEvent('main_start', {
      delivery: state.delivery,
      timing_mode: state.params.timing,
      response_window_ms: responseWindowMs(),
      min_items: state.params.min_items,
      max_items: state.params.max_items
    });
    showStage('stage-trial');
    $('trial-label').textContent = t('mainLabel');
    nextItem();
  }

  function currentPrecisionSE () {
    if (state.cat && typeof state.cat.jointSE === 'function') return state.cat.jointSE();
    // 1F mode: single-axis posterior SD
    if (state.mode === '1F') return state.cat.currentSE();
    // 2F mode: joint precision (both factors matter for TOEIC estimate)
    return state.cat.jointSE();
  }

  function shouldStop () {
    const n = state.cat.usedCount();
    if (state.delivery === 'fixed40') {
      return n >= state.params.max_items
        ? { stop: true, reason: 'fixed_length' }
        : { stop: false };
    }
    if (n >= state.params.max_items) return { stop: true, reason: 'max_items' };
    if (n < state.params.min_items) return { stop: false };
    if (state.stopRule === 'max_items') return { stop: false };
    const se = currentPrecisionSE();
    if (state.stopRule === 'se' && se < state.params.target_se) {
      return { stop: true, reason: 'precision' };
    }
    return { stop: false };
  }

  function shouldStopAfterCandidate (sel) {
    if (state.delivery !== 'adaptive' ||
        !['pser', 'blueprint_pser'].includes(state.stopRule)) {
      return { stop: false };
    }
    const n = state.cat.usedCount();
    if (n < state.params.min_items || !sel || !Number.isFinite(sel.info)) {
      return { stop: false };
    }
    const pred = typeof state.cat.predictedSeReduction === 'function'
      ? state.cat.predictedSeReduction(sel)
      : null;
    if (pred && Number.isFinite(pred.reduction)) {
      return pred.reduction < state.params.stop_pser
        ? { stop: true, reason: state.stopRule }
        : { stop: false };
    }
    const se = currentPrecisionSE();
    if (!Number.isFinite(se) || se <= 0) return { stop: false };
    const seNew = 1 / Math.sqrt(1 / (se * se) + sel.info);
    return (se - seNew) < state.params.stop_pser
      ? { stop: true, reason: 'pser' }
      : { stop: false };
  }

  function nextItem () {
    const s = shouldStop();
    if (s.stop) return finishMain(s.reason);
    const sel = state.cat.selectNext();
    if (!sel) return finishMain('bank_exhausted');
    const s2 = shouldStopAfterCandidate(sel);
    if (s2.stop) return finishMain(s2.reason);
    state.currentItemRef = sel;

    const it = state.delivery === 'fixed40'
      ? state.fixedItems[sel.index]
      : (state.delivery === 'adaptive'
          ? state.adaptiveItems[sel.index]
      : (state.mode === '1F'
          ? state.calibration.item_bank_1f[sel.index]
          : state.calibration.item_bank_2f[sel.index]));
    state.currentTrialContext = {
      phase: 'main',
      step: state.cat.usedCount() + 1,
      item_id: it.item_id || mkItemId(it),
      targetword: it.targetword,
      condition: it.condition || ''
    };

    $('trial-counter').textContent = t('questionCounter', { n: state.cat.usedCount() + 1 });
    logEvent('main_trial_selected', {
      step: state.cat.usedCount() + 1,
      item_index: sel.index,
      item_id: it.item_id || mkItemId(it),
      targetword: it.targetword,
      condition: it.condition,
      item_info: sel.info,
      theta_before: sel.theta,
      se_before: sel.se
    });

    presentStimulus(assetPath('audio/main/' + it.stimuli), it.targetword, (skipSignal) => {
      if (skipSignal === null) {
        // Skipped via fail path: record missing response and move on. The
        // presentStimulus `commit` guard has already disabled the skip button
        // to prevent re-entry here.
        recordSkippedItem(it);
        setTimeout(nextItem, 300);
        return;
      }
      // Audio played — wire Yes/No with a per-trial re-entry guard so a
      // double-click never dispatches two updates for the same item.
      let answered = false;
      const respond = (r, details) => {
        if (answered) return;
        answered = true;
        onMainResponse(it, r, details);
      };
      wireResponseInput(respond, { responseWindowMs: responseWindowMs() });
    });
  }

  function recordSkippedItem (item) {
    // The CAT engine's markUsed() already appends a complete log entry to
    // `fin.log` (used later by finishMain). We purposely do NOT push to
    // state.responses here, otherwise the skip would be recorded twice.
    if (state.currentItemRef && typeof state.cat.markUsed === 'function') {
      logEvent('main_audio_failure_skip', {
        item_id: item.item_id || mkItemId(item),
        targetword: item.targetword,
        condition: item.condition
      });
      state.cat.markUsed(state.currentItemRef.index, {
        response: null,
        response_at: nowISO(),
        audio_played_at: null,
        audio_ended_at: null,
        audio_duration_ms: null,
        audio_failed: true,
        rt_ms: null,
        response_key: null,
        response_modality: null,
        keymap_id: state.responseMapping ? state.responseMapping.keymap_id : null,
        timed_out: false,
        response_window_ms: responseWindowMs()
      });
    }
  }

  function onMainResponse (item, response, details) {
    const rt = performance.now() - state.questionStart;
    const d = details || {};
    const timedOut = !!d.timed_out;
    const extras = {
      response: response,
      rt_ms: Math.round(rt),
      audio_played_at: new Date(state.currentAudioStart).toISOString(),
      audio_ended_at: state.currentAudioEnd
        ? new Date(state.currentAudioEnd).toISOString()
        : null,
      audio_duration_ms: state.currentAudioDurationMs,
      response_at: nowISO(),
      audio_failed: false,
      response_key: d.response_key || null,
      response_modality: d.response_modality || null,
      keymap_id: d.keymap_id || (state.responseMapping ? state.responseMapping.keymap_id : null),
      timed_out: timedOut,
      response_window_ms: d.response_window_ms || responseWindowMs()
    };
    if (response === null) {
      state.cat.markUsed(state.currentItemRef.index, extras);
    } else {
      state.cat.update(state.currentItemRef.index, response === item.ANSWER ? 1 : 0, extras);
    }
    logEvent('main_response_committed', {
      step: state.cat.usedCount(),
      item_id: item.item_id || mkItemId(item),
      targetword: item.targetword,
      condition: item.condition,
      response: response,
      correct: response === null ? null : (response === item.ANSWER ? 1 : 0),
      rt_ms: Math.round(rt),
      timed_out: timedOut
    });
    cleanupResponseInput();
    setTimeout(nextItem, postResponseMs());
  }

  // ---- Finalization ----
  function percentile (value, refSorted) {
    let lo = 0, hi = refSorted.length;
    while (lo < hi) {
      const m = (lo + hi) >>> 1;
      if (refSorted[m] < value) lo = m + 1; else hi = m;
    }
    return Math.round(100 * lo / refSorted.length);
  }

  /**
   * Post-CAT per-condition scoring.
   * Separates administered items into Hit / CR subsets and runs
   * condition-specific EAP on the per-condition banks.
   */
  function perConditionScore (catLog) {
    const hitBank = state.calibration.item_bank_hit;
    const crBank  = state.calibration.item_bank_cr;
    // Build item arrays keyed by item_id = targetword (per-condition bank uses
    // bare targetword as identifier).
    const hitItemsWithIds = hitBank.map(it => ({
      item_id:    it.targetword,
      a: it.a, b: it.b, targetword: it.targetword
    }));
    const crItemsWithIds = crBank.map(it => ({
      item_id:    it.targetword,
      a: it.a, b: it.b, targetword: it.targetword
    }));

    // Remap catLog responses to targetword keys
    const hitResp = {}, crResp = {};
    catLog.forEach(row => {
      if (row.correct !== 0 && row.correct !== 1) return;
      if (row.condition === 'Hit') hitResp[row.targetword] = row.correct;
      else                         crResp[row.targetword]  = row.correct;
    });

    const hitScore = window.CAT1F.scoreSubset(hitItemsWithIds, hitResp);
    const crScore  = window.CAT1F.scoreSubset(crItemsWithIds,  crResp);
    return { hit: hitScore, cr: crScore };
  }

  function scorePostHoc2F (catLog) {
    const rho = state.calibration.regression.factor_cor_2F;
    const items2F = state.calibration.item_bank_2f.map(it => ({
      item_id: it.item_id,
      a1: it.a1,
      a2: it.a2,
      d: it.d
    }));
    const responses = {};
    catLog.forEach(row => {
      if (row.correct === 0 || row.correct === 1) responses[row.item_id] = row.correct;
    });
    return window.CAT2F.scoreSubset(items2F, responses, rho);
  }

  function summarizeResponseCoverage (catLog) {
    const out = {
      administered: catLog.length,
      answered: 0,
      skipped: 0,
      audio_failed: 0,
      timed_out: 0,
      hit: { administered: 0, answered: 0, skipped: 0 },
      cr:  { administered: 0, answered: 0, skipped: 0 }
    };
    catLog.forEach(row => {
      if (!row || (row.condition !== 'Hit' && row.condition !== 'CR')) return;
      const bucket = row.condition === 'Hit' ? out.hit : out.cr;
      bucket.administered++;
      const answered = (row.correct === 0 || row.correct === 1);
      if (answered) {
        out.answered++;
        bucket.answered++;
      } else {
        out.skipped++;
        bucket.skipped++;
        if (row.audio_failed) out.audio_failed++;
        if (row.timed_out) out.timed_out++;
      }
    });
    return out;
  }

  function countTargetwordOverlap (catLog) {
    const byWord = {};
    catLog.forEach(row => {
      if (!row || !row.targetword || !row.condition) return;
      if (!byWord[row.targetword]) byWord[row.targetword] = {};
      byWord[row.targetword][row.condition] = true;
    });
    return Object.keys(byWord).filter(w => byWord[w].Hit && byWord[w].CR).length;
  }

  function summarizeResponseBehavior (catLog, per, validForReporting) {
    const answered = catLog.filter(row => row.correct === 0 || row.correct === 1);
    const rt = answered.map(row => row.rt_ms).filter(Number.isFinite).sort((a, b) => a - b);
    const nYes = answered.filter(row => row.response === '適切').length;
    const nNo = answered.filter(row => row.response === '不適切').length;
    const median = values => {
      const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
      return sorted.length
        ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2]
                             : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
        : null;
    };
    const medianRt = median(rt);
    const hitRt = answered
      .filter(row => row.condition === 'Hit')
      .map(row => row.rt_ms);
    const crRt = answered
      .filter(row => row.condition === 'CR')
      .map(row => row.rt_ms);
    const timedOut = catLog.filter(row => row.timed_out).length;
    const tooFast = answered.filter(row => Number.isFinite(row.rt_ms) && row.rt_ms < 200).length;
    const mouse = answered.filter(row => row.response_modality === 'mouse').length;
    const keyboard = answered.filter(row => row.response_modality === 'keyboard').length;
    const focusLoss = state.events.filter(ev =>
      ev.event_type === 'window_blur' ||
      (ev.event_type === 'visibility_change' && ev.visibility_state === 'hidden')
    ).length;
    const thetaGap = validForReporting &&
      Number.isFinite(per.hit.theta) && Number.isFinite(per.cr.theta)
      ? Math.abs(per.hit.theta - per.cr.theta)
      : null;
    return {
      theta_gap: thetaGap,
      aberrance_theta_gap_flag: thetaGap !== null ? thetaGap > 1 : null,
      all_yes_flag: answered.length > 0 && nYes === answered.length,
      all_no_flag: answered.length > 0 && nNo === answered.length,
      yes_response_rate: answered.length ? nYes / answered.length : null,
      median_rt_ms: medianRt,
      median_rt_hit_ms: median(hitRt),
      median_rt_cr_ms: median(crRt),
      too_fast_response_rate: answered.length ? tooFast / answered.length : null,
      timeout_rate: catLog.length ? timedOut / catLog.length : null,
      mouse_response_rate: answered.length ? mouse / answered.length : null,
      keyboard_response_rate: answered.length ? keyboard / answered.length : null,
      focus_loss_count: focusLoss
    };
  }

  function computeTOEICEstimate (per) {
    const reg = state.calibration.regression.per_condition;
    // θ_Hit or θ_CR may be NaN if that condition had no administered items;
    // substitute reference-mean (0) with a large SE for that axis.
    const t_hit = Number.isFinite(per.hit.theta) ? per.hit.theta : 0;
    const t_cr  = Number.isFinite(per.cr.theta)  ? per.cr.theta  : 0;
    const se_hit = Number.isFinite(per.hit.se) ? per.hit.se : 1;
    const se_cr  = Number.isFinite(per.cr.se)  ? per.cr.se  : 1;

    const mean = reg.intercept + reg.slope_hit * t_hit + reg.slope_cr * t_cr;
    // Compound SE: Var(pred) = beta_h^2 Var(theta_h) + beta_c^2 Var(theta_c) + residual_sd^2
    const varCompound = reg.slope_hit * reg.slope_hit * se_hit * se_hit +
                        reg.slope_cr  * reg.slope_cr  * se_cr  * se_cr +
                        reg.residual_sd * reg.residual_sd;
    const se = Math.sqrt(varCompound);
    const stat = state.calibration.toeic_stats;
    const clipped = Math.max(0, Math.min(100, mean));
    return { estimate: clipped, se: se, raw: mean, range: [stat.min, stat.max] };
  }

  function computeTOEICEstimate2F (mirt2f) {
    const reg = state.calibration.regression['2F'];
    const f1 = Number.isFinite(mirt2f.theta1) ? mirt2f.theta1 : 0;
    const f2 = Number.isFinite(mirt2f.theta2) ? mirt2f.theta2 : 0;
    const se1 = Number.isFinite(mirt2f.se1) ? mirt2f.se1 : 1;
    const se2 = Number.isFinite(mirt2f.se2) ? mirt2f.se2 : 1;
    const cov12 = Number.isFinite(mirt2f.cov12) ? mirt2f.cov12 : 0;

    const mean = reg.intercept + reg.slope_F1 * f1 + reg.slope_F2 * f2;
    const varCompound = reg.slope_F1 * reg.slope_F1 * se1 * se1 +
                        reg.slope_F2 * reg.slope_F2 * se2 * se2 +
                        2 * reg.slope_F1 * reg.slope_F2 * cov12 +
                        reg.residual_sd * reg.residual_sd;
    const se = Math.sqrt(Math.max(varCompound, 0));
    const stat = state.calibration.toeic_stats;
    const clipped = Math.max(0, Math.min(100, mean));
    return { estimate: clipped, se: se, raw: mean, range: [stat.min, stat.max] };
  }

  function buildProtocolManifest () {
    const fixedForm = getSelectedForm('fixed40_disjoint');
    const adaptiveForm = getSelectedForm('extended70_disjoint');
    return {
      generated_at: nowISO(),
      app_version: APP_VERSION,
      calibration_version: state.calibration ? (state.calibration.version || 'unknown') : '',
      delivery: state.delivery,
      mode: state.mode,
      language: state.lang,
      research_mode: state.researchMode,
      lab_code: state.labCode,
      participant_url: participantProtocolURL(),
      research_url: researchURL(),
      timing: {
        mode: state.params.timing,
        response_window_ms: responseWindowMs(),
        default_response_window_ms: DEFAULTS.response_window_ms,
        lower_bound_ms: 250,
        upper_bound_ms: 10000
      },
      presentation: {
        auto_play_audio: autoPlayAudio(),
        fixation_ms: fixationMs(),
        post_response_ms: postResponseMs(),
        max_condition_run: maxConditionRun(),
        keymap_policy: state.params.keymap || 'counterbalanced',
        response_keymap_id: state.responseMapping ? state.responseMapping.keymap_id : ''
      },
      adaptive: {
        algorithm: state.delivery === 'adaptive' ? state.algorithm : '',
        stop_rule: state.stopRule,
        min_items: state.params.min_items,
        max_items: state.params.max_items,
        target_se: state.params.target_se,
        stop_pser: state.params.stop_pser,
        quota_tol: state.params.quota_tol
      },
      selected_forms: {
        fixed40: fixedForm ? fixedForm.form_id : '',
        adaptive: adaptiveForm ? adaptiveForm.form_id : ''
      },
      item_selection_model: state.session.item_selection_model || '',
      presentation_order_policy: state.session.presentation_order_policy || '',
      url_params_raw: state.session.url_params_raw || ''
    };
  }

  function buildCatTrace (allResponses) {
    return allResponses.map(row => ({
      session_uuid: state.session.uuid,
      step: row.step,
      item_id: row.item_id,
      targetword: row.targetword,
      condition: row.condition,
      selected_model: state.session.item_selection_model || '',
      correct: row.correct,
      answered: row.correct === 0 || row.correct === 1,
      timed_out: !!row.timed_out,
      audio_failed: !!row.audio_failed,
      rt_ms: row.rt_ms,
      a: row.a,
      b: row.b,
      item_info: row.item_info,
      theta_after: row.theta_after,
      se_after: row.se_after,
      theta_hit_after: row.theta_hit_after,
      se_hit_after: row.se_hit_after,
      theta_cr_after: row.theta_cr_after,
      se_cr_after: row.se_cr_after,
      joint_se_after: row.joint_se_after,
      theta1_after: row.theta1_after,
      theta2_after: row.theta2_after,
      se1_after: row.se1_after,
      se2_after: row.se2_after,
      response_window_ms: row.response_window_ms
    }));
  }

  function buildQualityFlags (finalObj, minPerCondition) {
    const rows = [];
    const add = (flag, status, value, threshold, note) => {
      rows.push({
        session_uuid: state.session.uuid,
        flag: flag,
        status: status,
        value: value,
        threshold: threshold,
        note: note
      });
    };
    add(
      'valid_for_reporting',
      finalObj.valid_for_reporting ? 'ok' : 'error',
      finalObj.valid_for_reporting,
      'true',
      finalObj.scoring_status || ''
    );
    add(
      'hit_condition_coverage',
      finalObj.n_hit_answered >= minPerCondition ? 'ok' : 'error',
      finalObj.n_hit_answered,
      '>=' + minPerCondition,
      'Minimum answered Hit items required for reporting.'
    );
    add(
      'cr_condition_coverage',
      finalObj.n_cr_answered >= minPerCondition ? 'ok' : 'error',
      finalObj.n_cr_answered,
      '>=' + minPerCondition,
      'Minimum answered CR items required for reporting.'
    );
    add(
      'targetword_overlap',
      finalObj.targetword_overlap_count === 0 ? 'ok' : 'error',
      finalObj.targetword_overlap_count,
      '0',
      'Hit and CR should not reuse the same targetword in the same session.'
    );
    add(
      'all_yes_response_pattern',
      finalObj.all_yes_flag ? 'warn' : 'ok',
      finalObj.all_yes_flag,
      'false',
      'All responses were Appropriate.'
    );
    add(
      'all_no_response_pattern',
      finalObj.all_no_flag ? 'warn' : 'ok',
      finalObj.all_no_flag,
      'false',
      'All responses were Inappropriate.'
    );
    add(
      'hit_cr_theta_gap',
      Number.isFinite(finalObj.theta_gap) && finalObj.theta_gap > 1 ? 'warn' : 'ok',
      finalObj.theta_gap,
      '<=1',
      'Large Hit/CR theta gap may indicate condition-specific aberrance.'
    );
    add(
      'too_fast_response_rate',
      Number.isFinite(finalObj.too_fast_response_rate) && finalObj.too_fast_response_rate > 0.10 ? 'warn' : 'ok',
      finalObj.too_fast_response_rate,
      '<=0.10',
      'RT < 200 ms is treated as too fast for a considered response.'
    );
    add(
      'timeout_rate',
      Number.isFinite(finalObj.timeout_rate) && finalObj.timeout_rate > 0.20 ? 'warn' : 'ok',
      finalObj.timeout_rate,
      '<=0.20',
      'High timeout rate suggests the timing condition may be too strict or the session was disrupted.'
    );
    add(
      'mouse_response_rate',
      Number.isFinite(finalObj.mouse_response_rate) && finalObj.mouse_response_rate > 0.20 ? 'warn' : 'ok',
      finalObj.mouse_response_rate,
      '<=0.20',
      'Keyboard F/J responses are preferred; mouse responses are retained as fallback.'
    );
    add(
      'focus_loss_count',
      finalObj.focus_loss_count > 0 ? 'warn' : 'ok',
      finalObj.focus_loss_count,
      '0',
      'Window blur or hidden-page events occurred during the session.'
    );
    add(
      'audio_failed_items',
      finalObj.n_audio_failed_items > 0 ? 'warn' : 'ok',
      finalObj.n_audio_failed_items,
      '0',
      'Audio failures were skipped and not scored.'
    );
    return rows;
  }

  function finishMain (stopReason) {
    state.session.finished_at = nowISO();
    state.session.elapsed_ms  = Math.round(performance.now() - state.mainStart);
    const fin = state.cat.finalize();

    // Combine CAT log with skip records to produce the full response list
    const allResponses = state.responses.concat(fin.log.map(r => Object.assign({}, r)));

    // Per-condition scoring
    const coverage = summarizeResponseCoverage(allResponses);
    const per = perConditionScore(allResponses);
    const mirt2f = scorePostHoc2F(allResponses);

    // Reporting is valid only when (a) the total number of answered
    // items clears the minimum, AND (b) each condition has at least
    // MIN_PER_CONDITION answered items. The second check prevents
    // sessions that hit the floor by accumulating items in a single
    // condition from silently imputing theta = 0 / SE = 1 for the
    // unobserved condition in computeTOEICEstimate().
    const MIN_PER_CONDITION =
      (state.delivery === 'fixed40' || state.delivery === 'adaptive')
        ? Math.floor(state.params.min_items / 2)
        : 3;
    const enoughTotal       = coverage.answered >= state.params.min_items;
    const enoughHit         = coverage.hit.answered >= MIN_PER_CONDITION;
    const enoughCR          = coverage.cr.answered  >= MIN_PER_CONDITION;
    const validForReporting = enoughTotal && enoughHit && enoughCR;

    let invalidReason = null;
    if (!enoughTotal) invalidReason = 'insufficient_total_items';
    else if (!enoughHit || !enoughCR) invalidReason = 'insufficient_condition_coverage';

    // TOEIC estimates with compounded SE
    const toeic = validForReporting ? computeTOEICEstimate(per) : null;
    const toeic2f = validForReporting ? computeTOEICEstimate2F(mirt2f) : null;
    const behavior = summarizeResponseBehavior(allResponses, per, validForReporting);

    // Percentile from predicted-TOEIC reference distribution
    const refTOEIC = state.calibration.reference_predicted_toeic;
    const pct = (toeic && Number.isFinite(toeic.raw)) ? percentile(toeic.raw, refTOEIC) : null;

    // Assemble final object. theta_hit / theta_cr / theta_mirt_* are
    // ONLY written when the session is valid_for_reporting; otherwise
    // they are suppressed so the xlsx summary cannot mislead a reader
    // who does not inspect scoring_status.
    const finalObj = {
      scoring_status:     validForReporting ? 'ok' : invalidReason,
      valid_for_reporting: validForReporting,
      stop_reason:        stopReason,
      n_items:            fin.n_items,
      n_answered_items:   coverage.answered,
      n_skipped_items:    coverage.skipped,
      n_audio_failed_items: coverage.audio_failed,
      n_timed_out_items:  coverage.timed_out,
      n_hit_items:        coverage.hit.administered,
      n_cr_items:         coverage.cr.administered,
      n_hit_answered:     coverage.hit.answered,
      n_cr_answered:      coverage.cr.answered,
      n_hit_skipped:      coverage.hit.skipped,
      n_cr_skipped:       coverage.cr.skipped,
      targetword_overlap_count: countTargetwordOverlap(allResponses),
      theta_gap:          behavior.theta_gap !== null ? round6(behavior.theta_gap) : null,
      aberrance_theta_gap_flag: behavior.aberrance_theta_gap_flag,
      all_yes_flag:       behavior.all_yes_flag,
      all_no_flag:        behavior.all_no_flag,
      yes_response_rate:  behavior.yes_response_rate !== null ? round6(behavior.yes_response_rate) : null,
      median_rt_ms:       behavior.median_rt_ms,
      median_rt_hit_ms:   behavior.median_rt_hit_ms,
      median_rt_cr_ms:    behavior.median_rt_cr_ms,
      too_fast_response_rate: behavior.too_fast_response_rate !== null ? round6(behavior.too_fast_response_rate) : null,
      timeout_rate:       behavior.timeout_rate !== null ? round6(behavior.timeout_rate) : null,
      mouse_response_rate: behavior.mouse_response_rate !== null ? round6(behavior.mouse_response_rate) : null,
      keyboard_response_rate: behavior.keyboard_response_rate !== null ? round6(behavior.keyboard_response_rate) : null,
      focus_loss_count:   behavior.focus_loss_count,
      theta_hit:          (validForReporting && Number.isFinite(per.hit.theta)) ? round6(per.hit.theta) : null,
      se_hit:             (validForReporting && Number.isFinite(per.hit.se))    ? round6(per.hit.se)    : null,
      theta_cr:           (validForReporting && Number.isFinite(per.cr.theta))  ? round6(per.cr.theta)  : null,
      se_cr:              (validForReporting && Number.isFinite(per.cr.se))     ? round6(per.cr.se)     : null,
      theta_backbone:     (validForReporting && state.mode === '1F' && Number.isFinite(fin.theta))
        ? round6(fin.theta) : null,
      se_backbone:        (validForReporting && state.mode === '1F' && Number.isFinite(fin.se))
        ? round6(fin.se) : null,
      theta_mirt_f1:      (validForReporting && Number.isFinite(mirt2f.theta1)) ? round6(mirt2f.theta1) : null,
      se_mirt_f1:         (validForReporting && Number.isFinite(mirt2f.se1))    ? round6(mirt2f.se1)    : null,
      theta_mirt_f2:      (validForReporting && Number.isFinite(mirt2f.theta2)) ? round6(mirt2f.theta2) : null,
      se_mirt_f2:         (validForReporting && Number.isFinite(mirt2f.se2))    ? round6(mirt2f.se2)    : null,
      reached_precision:  (stopReason === 'precision'),
      percentile:         pct,
      toeic_estimate:     toeic ? round2(toeic.estimate) : null,
      toeic_estimate_se:  toeic ? round2(toeic.se) : null,
      toeic_estimate_2f:    toeic2f ? round2(toeic2f.estimate) : null,
      toeic_estimate_2f_se: toeic2f ? round2(toeic2f.se) : null
    };

    // Session meta
    state.session.user_agent = navigator.userAgent;
    state.session.calibration_version = state.calibration.version || 'unknown';
    state.session.app_version = APP_VERSION;
    state.session.language = state.lang;
    state.session.research_mode = state.researchMode;
    state.session.reg = state.calibration.regression.per_condition;
    state.session.reg_2f = state.calibration.regression['2F'];
    state.session.reference_n = refTOEIC.length;
    state.session.selected_form_fixed40 = getSelectedForm('fixed40_disjoint')
      ? getSelectedForm('fixed40_disjoint').form_id
      : '';
    state.session.selected_form_adaptive = getSelectedForm('extended70_disjoint')
      ? getSelectedForm('extended70_disjoint').form_id
      : '';
    state.session.item_selection_model = state.delivery === 'adaptive'
      ? 'per-condition 1D 2PL blueprint CAT (mod_hit / mod_cr)'
      : state.delivery === 'fixed40'
      ? 'per-condition 1D 2PL disjoint fixed form (mod_hit / mod_cr)'
      : 'legacy combined 1F / 2F research mode';
    state.session.presentation_order_policy = state.delivery === 'fixed40'
      ? 'balanced_random_condition_order'
      : state.delivery === 'adaptive'
      ? 'blueprint_random_tie_condition_order'
      : 'model_selected_condition_order';
    state.session.max_condition_run = maxConditionRun();
    state.session.auto_play_audio = autoPlayAudio();
    state.session.fixation_ms = fixationMs();
    state.session.post_response_ms = postResponseMs();
    state.session.timing_mode = state.params.timing;
    state.session.response_window_ms = responseWindowMs();
    state.session.response_keymap_id = state.responseMapping ? state.responseMapping.keymap_id : '';
    state.session.response_key_appropriate = state.responseMapping
      ? state.responseMapping.appropriate_key
      : '';
    state.session.response_key_inappropriate = state.responseMapping
      ? state.responseMapping.inappropriate_key
      : '';
    state.session.backbone_model = state.delivery === 'fixed40'
      ? 'fixed40_disjoint_balanced_short_form'
      : (state.delivery === 'adaptive'
          ? 'per_condition_1d_2pl_disjoint_blueprint'
          : (state.mode === '1F' ? 'combined_1f_2pl' : 'compensatory_2f_mirt'));
    state.session.min_answered_required = state.params.min_items;
    state.session.min_answered_per_condition_required = MIN_PER_CONDITION;
    state.session.delivery = state.delivery;
    state.session.algorithm = state.delivery === 'adaptive' ? state.algorithm : '';
    state.session.stop_rule = state.stopRule;
    state.session.stop_pser = state.params.stop_pser;
    state.session.quota_tol = state.params.quota_tol;
    logEvent('main_finish', {
      stop_reason: stopReason,
      n_items: fin.n_items,
      n_answered_items: coverage.answered,
      valid_for_reporting: validForReporting
    });
    state.currentTrialContext = null;

    // UI display (user-facing: percentile + TOEIC only). The percentile is
    // computed against the reference distribution of **predicted TOEIC**
    // (from the per-condition regression applied to calibration θ), NOT
    // against latent ability θ directly. Label it so the user understands
    // what the percentile actually represents.
    showStage('stage-result');

    // Build Excel payload
    const safeName = (state.participant.name || 'anonymous')
      .replace(/[^A-Za-z0-9_\-\u3040-\u30ff\u4e00-\u9faf]/g, '_').slice(0, 32);
    const safeId = (state.participant.id || 'na')
      .replace(/[^A-Za-z0-9_\-]/g, '_').slice(0, 32);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const modeForFile = state.delivery === 'adaptive' ? state.algorithm : state.delivery;
    const filename = 'LJT_CAT_' + modeForFile + '_' + safeName + '_' + safeId + '_' + ts + '.xlsx';
    const fnEl = $('filename-display');
    if (fnEl) fnEl.textContent = filename;
    logEvent('download_prepare', { filename: filename });

    // Flatten responses for Excel
    const flatResponses = allResponses.map(row => {
      const base = {
        session_uuid:     state.session.uuid,
        step:             row.step,
        item_id:          row.item_id,
        targetword:       row.targetword,
        condition:        row.condition,
        stimuli:          row.stimuli,
        ANSWER:           row.ANSWER,
        ANSWER_label:     responseLabel(row.ANSWER),
        response:         row.response,
        response_label:   row.response ? responseLabel(row.response) : null,
        correct:          row.correct,
        rt_ms:            row.rt_ms,
        response_key:     row.response_key,
        response_modality: row.response_modality,
        keymap_id:        row.keymap_id,
        timed_out:        !!row.timed_out,
        response_window_ms: row.response_window_ms,
        audio_played_at:  row.audio_played_at,
        audio_ended_at:   row.audio_ended_at,
        audio_duration_ms: row.audio_duration_ms,
        response_at:      row.response_at,
        audio_failed:     !!row.audio_failed
      };
      if (state.mode === '1F') {
        Object.assign(base, {
          a: row.a, b: row.b,
          theta_after: row.theta_after,
          se_after:    row.se_after,
          theta_hit_after: row.theta_hit_after,
          se_hit_after:    row.se_hit_after,
          theta_cr_after:  row.theta_cr_after,
          se_cr_after:     row.se_cr_after,
          joint_se_after:  row.joint_se_after,
          item_info:   row.item_info
        });
      } else if (state.mode === '2F_research') {
        Object.assign(base, {
          a1: row.a1, a2: row.a2, d: row.d,
          theta1_after: row.theta1_after,
          theta2_after: row.theta2_after,
          se1_after:    row.se1_after,
          se2_after:    row.se2_after
        });
      }
      return base;
    });
    const catTrace = buildCatTrace(allResponses);
    const qualityFlags = buildQualityFlags(finalObj, MIN_PER_CONDITION);
    const protocolManifest = buildProtocolManifest();

    const payload = {
      participant: state.participant,
      session: Object.assign({}, state.session, {
        uuid:           state.session.uuid,
        mode:           state.delivery === 'adaptive' ? state.mode : state.delivery,
        lab_code:       state.labCode,
        target_se:      state.params.target_se,
        min_items:      state.params.min_items,
        max_items:      state.params.max_items,
        max_play_fails: state.params.max_play_fails,
        timing_mode:    state.params.timing,
        response_window_ms: responseWindowMs()
      }),
      practice:  state.practice,
      final:     finalObj,
      responses: flatResponses,
      item_bank: researchItemRows(),
      cat_trace: catTrace,
      quality_flags: qualityFlags,
      events: state.events.slice(),
      protocol_manifest: protocolManifest
    };

    // Trigger download
    const ok = window.LJTExcel.export(filename, payload);
    const ds = $('download-status');
    if (ok) {
      ds.textContent = t('savedStatus');
      ds.classList.add('done');
      $('btn-download-again').classList.remove('hidden');
      $('btn-download-again').onclick = () => window.LJTExcel.export(filename, payload);
    } else {
      ds.textContent = t('saveFailed');
    }
  }

  function round6 (x) { return (typeof x === 'number') ? Number(x.toFixed(6)) : x; }
  function round2 (x) { return (typeof x === 'number') ? Number(x.toFixed(2)) : x; }

  // ---- Boot ----
  async function boot () {
    parseURLParams();
    applyLanguage();

    if (!isSupportedBrowser()) {
      $('browser-warning').classList.remove('hidden');
      $('app').classList.add('hidden');
      return;
    }

    if (typeof XLSX === 'undefined') {
      document.body.innerHTML =
        '<div class="container"><div class="stage" style="background:#fee2e2;color:#7f1d1d">' +
        '<h2>' + t('xlsxLoadTitle') + '</h2>' +
        '<p>' + t('xlsxLoadBody') + '</p></div></div>';
      return;
    }

    // Research-mode visible indicator
    if (state.mode === '2F_research') {
      const banner = document.createElement('div');
      banner.className = 'research-banner';
      banner.setAttribute('role', 'status');
      banner.setAttribute('aria-live', 'polite');
      banner.innerHTML = t('researchBanner');
      document.querySelector('.container').insertBefore(
        banner, document.querySelector('header').nextSibling
      );
    }

    try {
      await loadCalibration();
    } catch (err) {
      document.body.innerHTML =
        '<div class="container"><div class="stage" style="background:#fee2e2;color:#7f1d1d">' +
        '<h2>' + t('dataLoadTitle') + '</h2>' +
        '<p>' + err.message + '</p></div></div>';
      return;
    }

    state.session.uuid = generateUUID();
    logEvent('session_initialized', {
      delivery: state.delivery,
      language: state.lang,
      timing_mode: state.params.timing,
      response_window_ms: responseWindowMs()
    });
    document.addEventListener('visibilitychange', () => {
      logEvent('visibility_change', { visibility_state: document.visibilityState });
    });
    window.addEventListener('blur', () => logEvent('window_blur'));
    window.addEventListener('focus', () => logEvent('window_focus'));
    state.practice.items = state.practiceItems || [];
    renderResearchPanel();

    showStage('stage-welcome');

    const langInput = $('input-lang');
    if (langInput) {
      langInput.addEventListener('change', e => {
        state.lang = normalizeLanguage(e.target.value);
        if (state.researchMode) updateURLFromProtocol(true);
        applyLanguage();
        renderResearchPanel();
        logEvent('language_changed', { language: state.lang });
      });
    }

    $('participant-form').addEventListener('submit', e => {
      e.preventDefault();
      const id   = $('input-pid').value.trim();
      const name = $('input-name').value.trim();
      if (!id || !name) return;
      state.participant = { id: id, name: name, language: state.lang };
      state.responseMapping = buildResponseMapping(id);
      logEvent('participant_registered', {
        participant_id: id,
        keymap_id: state.responseMapping.keymap_id
      });
      updateResponseLabels();
      updateKeyInstruction();
      updateTimingInstruction();
      showStage('stage-instructions');
    });

    $('btn-start-practice').addEventListener('click', startPractice);
    $('btn-start-main').addEventListener('click', startMain);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
