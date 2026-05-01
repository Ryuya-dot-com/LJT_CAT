/* cat_app.js — LJT-CAT main orchestrator (v2)
 *
 * Stages: welcome → instructions → practice → transition → main → result
 * URL parameters are controlled by adaptive/config.js.
 *                 ?lab=<labcode>
 *                 adaptive/: ?algorithm=blueprint|alternating|quota &stop_rule=blueprint_pser|pser|se|max_items
 *                 adaptive/: ?target_se=0.30 &min_items=0 &max_items=160
 *                 ?max_play_fails=3 (audio failure skip threshold)
 *                 ?keymap=counterbalanced|f_appropriate|j_appropriate
 *                 ?timing=timed|untimed &response_window_ms=1250
 *                 ?auto_play_audio=1|0 &audio_rate=1 &fixation_ms=500 &post_response_ms=350 &max_condition_run=2
 *                 ?lang=ja|en
 *                 ?research=1 (show calibration / item-bank audit panel)
 *
 * Scoring (v2.1): adaptive delivery uses the full 160-item bank with a blueprint CAT based on
 * the per-condition 1D 2PL banks (mod_hit / mod_cr). Final θ is computed
 * separately from those same per-condition banks; the combined 1F model is
 * retained only as a legacy calibration artifact.
 */

(function () {
  'use strict';

  const APP_VERSION = '2.8.2';
  const ASSET_CACHE_VERSION = '20260428k';
  const UX_INSTRUCTION_VERSION = 'practice_instructions_20260428_refined';
  // Captured at script-eval time so it can be reported as `code_loaded_at`
  // build/repro metadata in the Excel output (alongside session save time).
  const CODE_LOADED_AT = new Date().toISOString();
  const APP_CONFIG = Object.assign({
    delivery: 'landing',
    assetBase: '.',
    defaultAlgorithm: 'blueprint',
    defaultStopRule: 'blueprint_pser'
  }, window.LJT_APP_CONFIG || {});

  const DEFAULTS = Object.assign({
    target_se: 0.30,
    min_items: 0,
    max_items: 160,
    max_play_fails: 3,
    stop_pser: 0.01,
    quota_tol: 0.20,
    timing: 'timed',
    response_window_ms: 1250,
    lang: 'ja',
    auto_play_audio: true,
    audio_rate: 1.0,
    fixation_ms: 500,
    post_response_ms: 350,
    pace: 'auto',
    max_condition_run: 2,
    theta_min: -6,
    theta_max: 6,
    theta_step: 0.01,
    theta2_min: -4,
    theta2_max: 4,
    theta2_step: 0.1,
    // NT threshold (ms) for rapid-guessing-aware auxiliary theta.
    // See Wise & Ma (2012); Wise & DeMars (2006). Live theta unaffected.
    nt_threshold_ms: 350
  }, APP_CONFIG.defaults || {});

  const I18N = {
    ja: {
      documentTitleAdaptive: '語彙意味判断テスト',
      appTitle: '語彙意味判断テスト',
      subtitleAdaptive: 'リスニング形式',
      browserWarning: 'このテストは <strong>Google Chrome</strong> のブラウザでのみご利用いただけます。<br />PC の Chrome でこのページを開き直してください。',
      welcomeTitle: 'ようこそ',
      welcomeBody: 'このテストでは、英語の短い文を聞いていただきます。それぞれの文には<strong>1つの英単語</strong>が含まれています。判断対象語のスペルは表示されません。文の中でその英単語の使われ方が<strong>意味的に適切か、不適切か</strong>を、音声をもとに判断してください。',
      noteAutoplay: '各問題では、中央の「+」のあと音声が<strong>自動で1回</strong>再生されます。',
      noteManualPlay: '各問題では、中央の「+」のあと表示される<strong>音声再生ボタン</strong>を押すと音声が1回再生されます。',
      notePractice: '練習が<strong>4問</strong>あり、そのあと本試行に進みます。',
      noteAdaptiveLength: '本試行の問題数は回答状況に応じて変わります。',
      noteNoSpelling: '判断対象語のスペルは画面に表示されません。',
      noteNoScoreShown: '本試行では正誤フィードバックやスコアは表示されません。',
      noteKeys: '音声終了後、画面に表示される割り当てに従って <strong>F</strong> / <strong>J</strong> キーで回答します。',
      noteHeadphones: 'ヘッドホン / イヤホンの使用を強く推奨します。',
      participantInfo: '参加者情報',
      participantInfoLead: '研究者から指定されたIDと識別名を入力してください。',
      languageLabel: '表示言語',
      participantId: '参加者ID',
      participantName: '識別名',
      consentStart: '説明に進む',
      disclaimer: '回答データと実施条件は、終了時にExcelファイルとしてこのコンピュータへ保存されます。保存されたファイルは研究者の指示にしたがって共有してください。',
      instructionsTitle: '説明',
      instructionsLead: 'まず4問の練習を行います。練習では、音量、キー割り当て、判断方法を確認してください。',
      practiceGoalTitle: '練習で確認すること',
      practiceGoalAudio: '音声がはっきり聞こえる音量になっているか確認してください。',
      practiceGoalDecision: '文全体を聞き、文の中で聞こえた英単語の意味が自然かどうかを判断してください。',
      practiceGoalKeys: 'あなたの <strong>F</strong> / <strong>J</strong> キー割り当てを確認してください。',
      instructionFixation: '中央の <strong>+</strong> を見てください。音声は自動で再生されます。',
      instructionManualPlay: '中央の <strong>+</strong> を見てください。そのあと表示されるボタンで音声を再生してください。',
      instructionNoSpelling: '判断する英単語のスペルは画面に表示されません。音声で聞こえた単語をもとに判断してください。',
      instructionCriteria: '<strong>適切</strong>は、聞こえた英単語が文脈に合っている場合です。<strong>不適切</strong>は、聞こえた英単語が文脈に合わない場合です。',
      instructionDecision: '音声が終わったら、聞こえた英単語の使い方が <span class="yes-color"><strong>「適切」</strong></span>か <span class="no-color"><strong>「不適切」</strong></span>かを選んでください。',
      instructionFeedback: '練習では正解・不正解のフィードバックが表示されます。本試行ではフィードバックはありません。',
      instructionPracticeSupport: '練習中に音声が聞き取りにくい場合は、本試行に進む前に研究者へ知らせてください。',
      startPractice: '練習を開始する',
      transitionTitle: '練習は以上です',
      transitionBody: 'これから本試行に入ります。本試行では<strong>フィードバックは表示されません</strong>。音声は<strong>1回のみ</strong>再生されます。準備ができたら開始してください。',
      transitionReminder: '音量、キー割り当て、判断方法に問題がなければ本試行を開始してください。不安がある場合は本試行に進む前に研究者へ知らせてください。',
      practiceSummary: '練習結果: {correct} / {total} 正解',
      practiceSummaryDetails: '時間切れ {timeouts} 問、音声失敗 {audioFailed} 問',
      advancePrompt: '準備ができたら Space キーを押すか、下のボタンで次へ進んでください。',
      advanceButton: '次へ進む',
      startMain: '本試行を開始する',
      resultTitle: 'テスト終了',
      resultThanks: 'ご協力ありがとうございました。',
      downloadAgain: 'もう一度ダウンロードする',
      endNote: '結果ファイルがダウンロードフォルダに保存されました。画面に表示されたファイル名を確認し、研究者の指示にしたがって共有してください。',
      resultFilename: '保存ファイル: {filename}',
      appropriate: '適切',
      inappropriate: '不適切',
      keySuffix: 'キー',
      keyInstruction: '聞こえた英単語の使い方が意味的に適切なら <strong>{yesKey}</strong>、不適切なら <strong>{noKey}</strong> を、できるだけ速く正確に押してください。',
      decisionPrompt: '聞こえた英単語の使い方を判断してください。',
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
      questionCounter: '本試行 {n} 問目',
      practiceCounter: '練習 {n} / 4',
      timeoutFeedback: '時間切れです<br><small>正しい答えは「<strong>{answer}</strong>」でした。</small>',
      correctFeedback: '✔ 正解です!',
      wrongFeedback: '✘ 不正解です<br><small>正しい答えは「<strong>{answer}</strong>」でした。</small>',
      savingStatus: '結果を保存中...',
      savedStatus: '結果ファイルを保存しました。',
      savedJsonStatus: 'Excel保存に失敗したため、JSON形式で保存しました。画面に表示されたファイル名を確認してください。',
      saveFailed: '⚠ 結果ファイルの保存に失敗しました。ページを更新して再試行してください。',
      saveFailedActionable: '⚠ 結果ファイルの保存に複数回失敗しました。ブラウザのダウンロード許可を確認するか、研究者に連絡してください。',
      questionCounterEstimated: '問題 {n} / 約 {median} 問',
      orphanRecoveryTitle: '前回の未完了セッション',
      orphanRecoveryBody: '前回終了せずに保存されなかったデータが {n} 件見つかりました。',
      orphanRecoverySaveAll: '未完了データを保存',
      orphanRecoveryDiscard: '破棄',
      orphanRecoverySkip: '後で対応',
      orphanRecoverySaved: '保存しました。新しいセッションを開始します。',
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
      researchAdaptiveNote: 'Adaptive版で候補となる全160項目です。実際の提示項目と順序は回答に応じてこの候補プールから決まります。',
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
      researchAdaptiveOption: 'Adaptive CAT',
      researchKeymapLabel: 'F/Jキー割当',
      researchKeymapCounterbalanced: '参加者IDでカウンターバランス',
      researchKeymapFAppropriate: 'F = 適切 / J = 不適切',
      researchKeymapJAppropriate: 'F = 不適切 / J = 適切',
      researchAudioAutoplayLabel: '音声自動再生',
      researchAudioRateLabel: '音声速度',
      researchAudioRateHelp: '1.00が標準です。0.90や1.10などに変更すると聴取条件が変わるため、同じ研究内では必ず固定してください。',
      researchAudioRateGuide: '目安: 0.90 = やや遅い、1.00 = 標準、1.10 = やや速い。',
      researchAutoplayOn: '自動再生',
      researchAutoplayOff: '手動再生',
      researchFixationMsLabel: '注視点時間 (ms)',
      researchPostResponseMsLabel: '回答後待機時間 (ms)',
      researchPaceModeLabel: '回答後の進行',
      researchPaceAuto: '自動で次へ',
      researchPaceSelf: 'Spaceキーで次へ',
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
      researchStopPserHelp: '平均20問前後を優先する推奨値は0.01です。小さくすると出題数が増え、推定精度は上がります。出典: Morris et al. (2020) によるPSERチューニング指針。',
      researchStopPserGuide: '目安: 0.01 ≈ 平均20問、0.005 ≈ 平均34問、0.0025 ≈ 平均55問。',
      researchStopPserOutOfRange: '値が推奨範囲(0.001–0.05)外です。',
      researchStopRuleHelp_blueprint_pser: 'blueprint_pser: ブループリント制約付きPSER。最も推奨。',
      researchStopRuleHelp_pser: 'pser: PSER単独。Choi et al. (2011)。',
      researchStopRuleHelp_se: 'se: 標準誤差(SE)が target_se 未満で停止。',
      researchStopRuleHelp_max_items: 'max_items: 固定長(max_items まで実施)。',
      researchStopRuleAllHelp: '推奨: blueprint_pser。理論的根拠はMethodological References を参照。',
      researchGridCostWarning1D: '⚠ 1Dグリッドが大きすぎます。step を 0.005 以上にすることを推奨します(現在の点数では計算コストが急増)。',
      researchGridCostWarning2D: '⚠ 2Fグリッドが大きすぎます。step を 0.05 以上にすることを推奨します。',
      researchGridCostOk: '点数は推奨範囲内です。',
      researchNumericalSettingsTitle: 'EAP数値積分・θグリッド',
      researchNumericalSettingsNote: '通常は推奨値のまま使用してください。シミュレーションでは、主スコアの0.01刻みによる数値誤差は測定誤差に比べて十分小さいことを確認済みです。',
      researchTheta1DMinLabel: '1D θ下限',
      researchTheta1DMaxLabel: '1D θ上限',
      researchTheta1DStepLabel: '1D θ刻み',
      researchTheta1DPointsLabel: '1Dグリッド点数',
      researchTheta2DMinLabel: '2F θ下限',
      researchTheta2DMaxLabel: '2F θ上限',
      researchTheta2DStepLabel: '2F θ刻み',
      researchTheta2DPointsLabel: '2Fグリッド点数',
      researchTheta1DHelp: '主スコア theta_hit / theta_cr とCAT項目選択に使う1D EAPグリッドです。推奨: -6〜6、0.01刻み (1201点)。',
      researchTheta2DHelp: 'Excelに保存するpost-hoc 2F MIRT補助スコア用です。推奨: -4〜4、0.1刻み (81×81点)。',
      researchReferencesTitle: '方法論的参考文献',
      researchReferencesIntro: 'LJT-CATの既定設定は、CAT・IRT分野の標準的方法論に基づいています。詳細はREADMEを参照してください。',
      researchReferenceEAP: 'EAP推定 + 数値積分:',
      researchReferenceEAPCitation: 'Bock, R. D., & Mislevy, R. J. (1982). Adaptive EAP estimation of ability in a microcomputer environment. Applied Psychological Measurement, 6(4), 431–444.',
      researchReferenceEAPRole: 'EAPグリッド推定([-6, 6] step 0.01)の方法論的基盤。',
      researchReferencePSER: 'PSER停止則:',
      researchReferencePSERCitation: 'Choi, S. W., Grady, M. W., & Dodd, B. G. (2011). A new stopping rule for computerized adaptive testing. Educational and Psychological Measurement, 71(1), 37–53.',
      researchReferencePSERRole: '既定停止則 blueprint_pser の原典。',
      researchReferenceMorris: 'PSER閾値の最適化:',
      researchReferenceMorrisCitation: 'Morris, S. B., Bass, M., Howard, E., & Neapolitan, R. E. (2020). Stopping rules for computer adaptive testing when item banks have nonuniform information. International Journal of Testing, 20(2), 146–168.',
      researchReferenceMorrisRole: '既定値 stop_pser=0.01 の根拠と、項目バンク情報量が不均一な場合のチューニング指針。',
      researchReferenceBlueprint: 'ブループリントCAT:',
      researchReferenceBlueprintCitation: 'Wainer, H., et al. (2000). Computerized adaptive testing: A primer (2nd ed.). Lawrence Erlbaum.',
      researchReferenceBlueprintRole: '内容バランス制約付き項目選択(blueprint)の標準参考書。',
      researchReferenceGroupEstimation: '推定 / Estimation',
      researchReferenceGroupStopping: '停止規則 / Stopping rules',
      researchReferenceGroupTheory: 'CAT理論 / CAT theory',
      researchReferenceEAPDOI: 'https://doi.org/10.1177/014662168200600405',
      researchReferencePSERDOI: 'https://doi.org/10.1177/0013164410387338',
      researchReferenceMorrisDOI: 'https://doi.org/10.1080/15305058.2019.1635604',
      researchReferenceBlueprintDOI: '',
      researchReferenceReadmeLink: '完全な参考文献リストはREADMEを参照してください。',
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
      researchVisibleRows: '表示中 {visible} / {total} 項目',
      researchBuildInfoTitle: 'ビルド情報',
      researchBuildAppVersion: 'アプリバージョン',
      researchBuildCalibrationHash: 'キャリブレーションハッシュ',
      researchBuildAssetCacheVersion: 'アセットキャッシュ版'
    },
    en: {
      documentTitleAdaptive: 'Lexicosemantic Judgement Test',
      appTitle: 'Lexicosemantic Judgement Test',
      subtitleAdaptive: 'Listening format',
      browserWarning: 'This test is available only in <strong>Google Chrome</strong> on a desktop or laptop computer.<br />Please reopen this page in Chrome on a PC.',
      welcomeTitle: 'Welcome',
      welcomeBody: 'In this test, you will hear short English sentences. Each sentence contains <strong>one English word</strong>. The spelling of the word to judge is not shown. Use the audio to decide whether that word is used in a <strong>semantically appropriate or inappropriate</strong> way in the sentence.',
      noteAutoplay: 'On each trial, audio plays <strong>automatically once</strong> after the central “+”.',
      noteManualPlay: 'On each trial, press the <strong>play-audio button</strong> shown after the central “+”; the audio plays once.',
      notePractice: 'There are <strong>4 practice trials</strong>, followed by the main test.',
      noteAdaptiveLength: 'The number of main-test trials depends on your responses.',
      noteNoSpelling: 'The spelling of the word to judge is not shown on screen.',
      noteNoScoreShown: 'No correctness feedback or score is shown during the main test.',
      noteKeys: 'After the audio ends, respond with the <strong>F</strong> / <strong>J</strong> keys according to the mapping shown on screen.',
      noteHeadphones: 'Headphones or earphones are strongly recommended.',
      participantInfo: 'Participant Information',
      participantInfoLead: 'Enter the participant ID and identifier specified by the researcher.',
      languageLabel: 'Display language',
      participantId: 'Participant ID',
      participantName: 'Identifier',
      consentStart: 'Continue to instructions',
      disclaimer: 'At the end of the test, response data and administration settings will be saved to this computer as an Excel file. Please share the saved file according to the researcher’s instructions.',
      instructionsTitle: 'Instructions',
      instructionsLead: 'You will first complete 4 practice trials. Use them to check the audio volume, key mapping, and decision rule.',
      practiceGoalTitle: 'What to check in practice',
      practiceGoalAudio: 'Make sure the audio volume is clear and comfortable.',
      practiceGoalDecision: 'Listen to the whole sentence, then judge whether the word you heard fits the sentence context.',
      practiceGoalKeys: 'Check your assigned <strong>F</strong> / <strong>J</strong> key mapping.',
      instructionFixation: 'Look at the central <strong>+</strong>. The audio will play automatically.',
      instructionManualPlay: 'Look at the central <strong>+</strong>. Then press the displayed button to play the audio.',
      instructionNoSpelling: 'The spelling of the word to judge is not shown on screen. Base your decision on the word you heard.',
      instructionCriteria: '<strong>Appropriate</strong> means the word you heard fits the sentence context. <strong>Inappropriate</strong> means it does not fit the sentence context.',
      instructionDecision: 'After the audio ends, decide whether the English word you heard was used <span class="yes-color"><strong>appropriately</strong></span> or <span class="no-color"><strong>inappropriately</strong></span>.',
      instructionFeedback: 'Practice trials show correct/incorrect feedback. Main-test trials do not show feedback.',
      instructionPracticeSupport: 'If the audio is hard to hear during practice, tell the researcher before starting the main test.',
      startPractice: 'Start practice',
      transitionTitle: 'Practice complete',
      transitionBody: 'You will now start the main test. <strong>No feedback is shown</strong> during the main test. Audio is played <strong>only once</strong>. Start when you are ready.',
      transitionReminder: 'Start the main test when the audio volume, key mapping, and decision rule are clear. If anything is unclear, tell the researcher before starting.',
      practiceSummary: 'Practice result: {correct} / {total} correct',
      practiceSummaryDetails: '{timeouts} timed out, {audioFailed} audio failed',
      advancePrompt: 'When ready, press the Space key or use the button below to continue.',
      advanceButton: 'Next',
      startMain: 'Start main test',
      resultTitle: 'Test complete',
      resultThanks: 'Thank you for your participation.',
      downloadAgain: 'Download again',
      endNote: 'The result file has been saved to the Downloads folder. Check the filename shown on screen and share it according to the researcher’s instructions.',
      resultFilename: 'Saved file: {filename}',
      appropriate: 'Appropriate',
      inappropriate: 'Inappropriate',
      keySuffix: 'key',
      keyInstruction: 'If the word you heard was semantically appropriate, press <strong>{yesKey}</strong>. If it was inappropriate, press <strong>{noKey}</strong>. Respond as quickly and accurately as possible.',
      decisionPrompt: 'Judge the word you heard in context.',
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
      questionCounter: 'Main test trial {n}',
      practiceCounter: 'Practice {n} / 4',
      timeoutFeedback: 'Time out<br><small>The correct answer was “<strong>{answer}</strong>”.</small>',
      correctFeedback: '✔ Correct!',
      wrongFeedback: '✘ Incorrect<br><small>The correct answer was “<strong>{answer}</strong>”.</small>',
      savingStatus: 'Saving result file...',
      savedStatus: 'The result file has been saved.',
      savedJsonStatus: 'Excel export failed, so the result was saved as JSON. Check the filename shown on this screen.',
      saveFailed: '⚠ Failed to save the result file. Please reload the page and try again.',
      saveFailedActionable: '⚠ The result file failed to save after multiple attempts. Check browser download permissions or contact the researcher.',
      questionCounterEstimated: 'Question {n} / approximately {median}',
      orphanRecoveryTitle: 'Incomplete previous session',
      orphanRecoveryBody: 'Found {n} session(s) that were saved before completing.',
      orphanRecoverySaveAll: 'Save incomplete data',
      orphanRecoveryDiscard: 'Discard',
      orphanRecoverySkip: 'Skip for now',
      orphanRecoverySaved: 'Saved. Starting a new session.',
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
      researchAdaptiveNote: 'These are the full 160 candidate items used by the adaptive version. The actual administered items and order are selected from this pool based on responses.',
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
      researchAdaptiveOption: 'Adaptive CAT',
      researchKeymapLabel: 'F/J key mapping',
      researchKeymapCounterbalanced: 'Counterbalanced by participant ID',
      researchKeymapFAppropriate: 'F = Appropriate / J = Inappropriate',
      researchKeymapJAppropriate: 'F = Inappropriate / J = Appropriate',
      researchAudioAutoplayLabel: 'Audio autoplay',
      researchAudioRateLabel: 'Audio speed',
      researchAudioRateHelp: '1.00 is the standard setting. Values such as 0.90 or 1.10 change the listening condition, so keep this fixed within a study.',
      researchAudioRateGuide: 'Guide: 0.90 = slightly slower, 1.00 = standard, 1.10 = slightly faster.',
      researchAutoplayOn: 'Autoplay',
      researchAutoplayOff: 'Manual play',
      researchFixationMsLabel: 'Fixation duration (ms)',
      researchPostResponseMsLabel: 'Post-response delay (ms)',
      researchPaceModeLabel: 'Post-response advance',
      researchPaceAuto: 'Auto-advance',
      researchPaceSelf: 'Space key to continue',
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
      researchStopPserHelp: 'The recommended value for prioritizing about 20 items on average is 0.01. Smaller values increase test length and precision. Source: PSER tuning guidance from Morris et al. (2020).',
      researchStopPserGuide: 'Rule of thumb: 0.01 ≈ 20 items on average; 0.005 ≈ 34; 0.0025 ≈ 55.',
      researchStopPserOutOfRange: 'Value outside recommended range (0.001–0.05).',
      researchStopRuleHelp_blueprint_pser: 'blueprint_pser: PSER with content-blueprint constraints (recommended).',
      researchStopRuleHelp_pser: 'pser: Plain PSER, Choi et al. (2011).',
      researchStopRuleHelp_se: 'se: Stop when standard error reaches target_se.',
      researchStopRuleHelp_max_items: 'max_items: Fixed length (run to max_items).',
      researchStopRuleAllHelp: 'Recommended: blueprint_pser. See Methodological References for justification.',
      researchGridCostWarning1D: 'Warning: the 1D grid is very large. Use step >= 0.005 to avoid runaway computation cost.',
      researchGridCostWarning2D: 'Warning: the 2F grid is very large. Use step >= 0.05 to avoid runaway computation cost.',
      researchGridCostOk: 'Grid size is within the recommended range.',
      researchNumericalSettingsTitle: 'EAP Integration and Theta Grid',
      researchNumericalSettingsNote: 'Use the recommended defaults unless you are doing a numerical sensitivity check. Simulations showed that the 0.01 grid for primary scores adds negligible numerical error relative to measurement error.',
      researchTheta1DMinLabel: '1D theta min',
      researchTheta1DMaxLabel: '1D theta max',
      researchTheta1DStepLabel: '1D theta step',
      researchTheta1DPointsLabel: '1D grid points',
      researchTheta2DMinLabel: '2F theta min',
      researchTheta2DMaxLabel: '2F theta max',
      researchTheta2DStepLabel: '2F theta step',
      researchTheta2DPointsLabel: '2F grid points',
      researchTheta1DHelp: '1D EAP grid used for theta_hit / theta_cr and CAT item selection. Recommended: -6 to 6, step 0.01 (1,201 points).',
      researchTheta2DHelp: 'Grid for post-hoc 2F MIRT sensitivity scores saved in Excel. Recommended: -4 to 4, step 0.1 (81 x 81 points).',
      researchReferencesTitle: 'Methodological References',
      researchReferencesIntro: 'LJT-CAT defaults are grounded in standard CAT and IRT methodology. See the README for the full reference list.',
      researchReferenceEAP: 'EAP estimation and quadrature:',
      researchReferenceEAPCitation: 'Bock, R. D., & Mislevy, R. J. (1982). Adaptive EAP estimation of ability in a microcomputer environment. Applied Psychological Measurement, 6(4), 431–444.',
      researchReferenceEAPRole: 'Foundation for the EAP-on-grid estimator (theta in [-6, 6], step 0.01).',
      researchReferencePSER: 'PSER stopping rule:',
      researchReferencePSERCitation: 'Choi, S. W., Grady, M. W., & Dodd, B. G. (2011). A new stopping rule for computerized adaptive testing. Educational and Psychological Measurement, 71(1), 37–53.',
      researchReferencePSERRole: 'Original specification of the default `blueprint_pser` rule.',
      researchReferenceMorris: 'PSER threshold tuning:',
      researchReferenceMorrisCitation: 'Morris, S. B., Bass, M., Howard, E., & Neapolitan, R. E. (2020). Stopping rules for computer adaptive testing when item banks have nonuniform information. International Journal of Testing, 20(2), 146–168.',
      researchReferenceMorrisRole: 'Empirical basis for the default stop_pser = 0.01 and tuning guidance for nonuniform item banks.',
      researchReferenceBlueprint: 'Blueprint CAT:',
      researchReferenceBlueprintCitation: 'Wainer, H., et al. (2000). Computerized adaptive testing: A primer (2nd ed.). Lawrence Erlbaum.',
      researchReferenceBlueprintRole: 'Standard reference for content-balanced item selection.',
      researchReferenceGroupEstimation: 'Estimation',
      researchReferenceGroupStopping: 'Stopping rules',
      researchReferenceGroupTheory: 'CAT theory',
      researchReferenceEAPDOI: 'https://doi.org/10.1177/014662168200600405',
      researchReferencePSERDOI: 'https://doi.org/10.1177/0013164410387338',
      researchReferenceMorrisDOI: 'https://doi.org/10.1080/15305058.2019.1635604',
      researchReferenceBlueprintDOI: '',
      researchReferenceReadmeLink: 'See the README for the full reference list.',
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
      researchVisibleRows: 'Showing {visible} / {total} items',
      researchBuildInfoTitle: 'Build info',
      researchBuildAppVersion: 'App version',
      researchBuildCalibrationHash: 'Calibration hash',
      researchBuildAssetCacheVersion: 'Asset cache version'
    }
  };

  // ---- State ----
  const state = {
    mode: '1F',                  // '1F' | '2F_research'
    labCode: '',
    params: Object.assign({}, DEFAULTS),
    calibration: null,
    calibrationHash: '',
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

    practice: {
      log: [],
      currentIndex: 0,
      completed: false,
      n_correct: 0,
      started_at: '',
      completed_at: '',
      instruction_version: UX_INSTRUCTION_VERSION,
      summary: null
    },

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
    adaptiveItems: [],
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

  function cacheBustedAssetPath (path) {
    const resolved = assetPath(path);
    if (!/\.(json|wav)$/i.test(path)) return resolved;
    return resolved + (resolved.includes('?') ? '&' : '?') +
      'v=' + encodeURIComponent(ASSET_CACHE_VERSION);
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

  function normalizeThetaGridParams () {
    if (state.params.theta_max <= state.params.theta_min) {
      state.params.theta_min = DEFAULTS.theta_min;
      state.params.theta_max = DEFAULTS.theta_max;
    }
    if (state.params.theta2_max <= state.params.theta2_min) {
      state.params.theta2_min = DEFAULTS.theta2_min;
      state.params.theta2_max = DEFAULTS.theta2_max;
    }
  }

  function thetaGridPoints (min, max, step) {
    return Math.round((Number(max) - Number(min)) / Number(step)) + 1;
  }

  function thetaGrid1DOptions (source) {
    const p = source || state.params;
    return {
      thetaMin: Number(p.theta_min),
      thetaMax: Number(p.theta_max),
      thetaStep: Number(p.theta_step)
    };
  }

  function thetaGrid2DOptions (source) {
    const p = source || state.params;
    return {
      thetaMin: Number(p.theta2_min),
      thetaMax: Number(p.theta2_max),
      thetaStep: Number(p.theta2_step)
    };
  }

  function thetaGrid1DPointCount (source) {
    const p = source || state.params;
    return thetaGridPoints(p.theta_min, p.theta_max, p.theta_step);
  }

  function thetaGrid2DPointCount (source) {
    const p = source || state.params;
    const axis = thetaGridPoints(p.theta2_min, p.theta2_max, p.theta2_step);
    return axis * axis;
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
    state.mode = '1F';
    state.labCode = p.get('lab') || '';
    state.params.target_se = boundedNumberParam(
      p, 'target_se', DEFAULTS.target_se, 0.05, 2.0, false);
    state.params.min_items = boundedNumberParam(
      p, 'min_items', DEFAULTS.min_items, 0, 160, true);
    state.params.max_items = boundedNumberParam(
      p, 'max_items', DEFAULTS.max_items, 1, 160, true);
    state.params.max_play_fails = boundedNumberParam(
      p, 'max_play_fails', DEFAULTS.max_play_fails, 0, 10, true);
    state.params.stop_pser = boundedNumberParam(
      p, 'stop_pser', DEFAULTS.stop_pser, 0.0001, 0.1, false);
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
    state.params.audio_rate = boundedNumberValue(
      p.get('audio_rate') || p.get('playback_rate'),
      Number(presentationOption('audioRate', DEFAULTS.audio_rate)),
      0.75,
      1.25,
      false);
    state.params.fixation_ms = boundedNumberParam(
      p, 'fixation_ms',
      Number(presentationOption('fixationMs', DEFAULTS.fixation_ms)),
      0, 3000, true);
    state.params.post_response_ms = boundedNumberParam(
      p, 'post_response_ms',
      Number(presentationOption('postResponseMs', DEFAULTS.post_response_ms)),
      0, 5000, true);
    state.params.pace = booleanParam(p, 'self_paced', false)
      ? 'self'
      : normalizePace(p.get('pace') || presentationOption('pace', DEFAULTS.pace));
    state.params.max_condition_run = boundedNumberParam(
      p, 'max_condition_run',
      Number(presentationOption('maxConditionRun', DEFAULTS.max_condition_run)),
      1, 10, true);
    state.params.theta_min = boundedNumberParam(
      p, 'theta_min', DEFAULTS.theta_min, -8, 0, false);
    state.params.theta_max = boundedNumberParam(
      p, 'theta_max', DEFAULTS.theta_max, 0, 8, false);
    state.params.theta_step = boundedNumberParam(
      p, 'theta_step', DEFAULTS.theta_step, 0.001, 0.1, false);
    state.params.theta2_min = boundedNumberParam(
      p, 'theta2_min', DEFAULTS.theta2_min, -6, 0, false);
    state.params.theta2_max = boundedNumberParam(
      p, 'theta2_max', DEFAULTS.theta2_max, 0, 6, false);
    state.params.theta2_step = boundedNumberParam(
      p, 'theta2_step', DEFAULTS.theta2_step, 0.05, 0.2, false);
    // NT threshold for rapid-guessing-aware auxiliary scoring (Wise & Ma 2012).
    // Live theta is unaffected; auxiliary `theta_*_nt<NNN>` columns are added
    // in summary. Default 350 ms; lower-proficiency populations may use 500 ms.
    // Bounded to [50, 2000] ms — anything below 50 ms is implausible and any
    // threshold above 2000 ms exceeds the standard 1250 ms response window.
    state.params.nt_threshold_ms = boundedNumberParam(
      p, 'nt_threshold_ms', DEFAULTS.nt_threshold_ms, 50, 2000, true);
    normalizeThetaGridParams();
    if (state.params.min_items > state.params.max_items) {
      state.params.min_items = state.params.max_items;
    }
    if (state.delivery === 'adaptive') {
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
    try {
      state.session.url_params_raw = new URL(buildProtocolURL(state.researchMode)).search || '';
    } catch (err) {
      state.session.url_params_raw = '';
    }
  }

  function showStage (id) {
    document.querySelectorAll('.stage').forEach(s => s.classList.add('hidden'));
    const el = $(id);
    if (el) {
      el.classList.remove('hidden');
      if (id !== 'stage-trial') {
        const heading = el.querySelector('h2');
        if (heading) {
          heading.setAttribute('tabindex', '-1');
          window.setTimeout(() => heading.focus({ preventScroll: true }), 0);
        }
      }
    }
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
    document.title = state.delivery === 'adaptive'
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
    updatePracticeSummary();
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

  function audioPlaybackRate () {
    return boundedNumberValue(state.params.audio_rate, DEFAULTS.audio_rate, 0.75, 1.25, false);
  }

  function isSelfPaced () {
    return state.params.pace === 'self';
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

  function normalizePace (raw) {
    const value = String(raw || '').trim().toLowerCase();
    return ['self', 'self_paced', 'manual', 'space', '1', 'true', 'yes', 'on'].includes(value)
      ? 'self'
      : 'auto';
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
    return 'adaptive';
  }

  function adaptiveItemBounds () {
    const blueprint = APP_CONFIG.blueprint || {};
    const floorRaw = Number(blueprint.minAllowedItems);
    const capRaw = Number(blueprint.maxItems);
    const floor = Number.isFinite(floorRaw) && floorRaw >= 0 ? Math.round(floorRaw) : 0;
    const cap = Number.isFinite(capRaw) && capRaw >= Math.max(1, floor) ? Math.round(capRaw) : 160;
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
    if (/\/adaptive(\/index\.html)?\/?$/.test(pathname)) {
      return pathname.replace(/\/adaptive(\/index\.html)?\/?$/, replacement);
    }
    if (/\/index\.html\/?$/.test(pathname)) {
      return pathname.replace(/\/index\.html\/?$/, replacement);
    }
    const withSlash = pathname.endsWith('/') ? pathname : pathname + '/';
    return withSlash + target + '/';
  }

  function buildProtocolURL (keepResearch, overrides) {
    const opts = overrides || {};
    const u = new URL(window.location.href);
    u.search = '';
    u.hash = '';
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
    const audioRate = boundedNumberValue(
      opts.audio_rate === undefined ? audioPlaybackRate() : opts.audio_rate,
      DEFAULTS.audio_rate,
      0.75,
      1.25,
      false
    );
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
    const ntThresholdMs = boundedNumberValue(
      opts.nt_threshold_ms === undefined ? state.params.nt_threshold_ms : opts.nt_threshold_ms,
      DEFAULTS.nt_threshold_ms,
      50,
      2000,
      true
    );
    const pace = normalizePace(opts.pace || state.params.pace || DEFAULTS.pace);
    const keymap = normalizeKeymap(opts.keymap || state.params.keymap);
    let thetaMin = boundedNumberValue(
      opts.theta_min === undefined ? state.params.theta_min : opts.theta_min,
      DEFAULTS.theta_min, -8, 0, false);
    let thetaMax = boundedNumberValue(
      opts.theta_max === undefined ? state.params.theta_max : opts.theta_max,
      DEFAULTS.theta_max, 0, 8, false);
    const thetaStep = boundedNumberValue(
      opts.theta_step === undefined ? state.params.theta_step : opts.theta_step,
      DEFAULTS.theta_step, 0.001, 0.1, false);
    if (thetaMax <= thetaMin) {
      thetaMin = DEFAULTS.theta_min;
      thetaMax = DEFAULTS.theta_max;
    }
    let theta2Min = boundedNumberValue(
      opts.theta2_min === undefined ? state.params.theta2_min : opts.theta2_min,
      DEFAULTS.theta2_min, -6, 0, false);
    let theta2Max = boundedNumberValue(
      opts.theta2_max === undefined ? state.params.theta2_max : opts.theta2_max,
      DEFAULTS.theta2_max, 0, 6, false);
    const theta2Step = boundedNumberValue(
      opts.theta2_step === undefined ? state.params.theta2_step : opts.theta2_step,
      DEFAULTS.theta2_step, 0.05, 0.2, false);
    if (theta2Max <= theta2Min) {
      theta2Min = DEFAULTS.theta2_min;
      theta2Max = DEFAULTS.theta2_max;
    }
    u.pathname = deliveryPathname(u.pathname, delivery);
    if (state.labCode) u.searchParams.set('lab', state.labCode);
    u.searchParams.set('lang', state.lang);
    u.searchParams.set('timing', mode);
    u.searchParams.set('auto_play_audio', boolToParam(autoPlay));
    u.searchParams.set('audio_rate', String(Number(audioRate.toFixed(2))));
    u.searchParams.delete('playback_rate');
    u.searchParams.set('fixation_ms', String(fixMs));
    u.searchParams.set('post_response_ms', String(postMs));
    u.searchParams.set('pace', pace);
    u.searchParams.delete('self_paced');
    u.searchParams.set('max_condition_run', String(maxRun));
    u.searchParams.set('max_play_fails', String(maxFails));
    u.searchParams.set('nt_threshold_ms', String(ntThresholdMs));
    u.searchParams.set('keymap', keymap);
    u.searchParams.set('theta_min', String(thetaMin));
    u.searchParams.set('theta_max', String(thetaMax));
    u.searchParams.set('theta_step', String(thetaStep));
    u.searchParams.set('theta2_min', String(theta2Min));
    u.searchParams.set('theta2_max', String(theta2Max));
    u.searchParams.set('theta2_step', String(theta2Step));
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
        Math.max(1, adaptiveBounds.floor),
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
        boundedNumberValue(opts.stop_pser === undefined ? state.params.stop_pser : opts.stop_pser, DEFAULTS.stop_pser, 0.0001, 0.1, false)
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

  function clearAdvancePrompt () {
    if (typeof state.currentAdvanceCleanup === 'function') {
      state.currentAdvanceCleanup();
      state.currentAdvanceCleanup = null;
    }
    const prompt = $('advance-prompt');
    if (prompt) prompt.remove();
    const fb = $('feedback-area');
    if (fb) fb.classList.remove('advance');
  }

  function waitForTrialAdvance (next, delayMs) {
    clearAdvancePrompt();
    if (!isSelfPaced()) {
      window.setTimeout(next, Math.max(0, delayMs || 0));
      return;
    }

    const fb = $('feedback-area');
    const prompt = document.createElement('div');
    prompt.id = 'advance-prompt';
    prompt.className = 'advance-prompt';
    const text = document.createElement('p');
    text.textContent = t('advancePrompt');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary-btn advance-btn';
    button.textContent = t('advanceButton');
    prompt.appendChild(text);
    prompt.appendChild(button);
    if (fb) {
      fb.classList.remove('hidden');
      fb.classList.add('advance');
      fb.appendChild(prompt);
    }

    let done = false;
    const proceed = (source) => {
      if (done) return;
      done = true;
      logEvent('self_paced_advance', { advance_source: source || 'unknown' });
      clearAdvancePrompt();
      if (fb) fb.classList.add('hidden');
      next();
    };
    const onKeyDown = event => {
      const isSpace = event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar';
      if (!isSpace || event.repeat) return;
      const tag = event.target && event.target.tagName
        ? event.target.tagName.toLowerCase()
        : '';
      if (['input', 'textarea', 'select'].includes(tag)) return;
      event.preventDefault();
      proceed('space');
    };
    const onButtonClick = () => proceed('button');
    document.addEventListener('keydown', onKeyDown);
    button.addEventListener('click', onButtonClick);
    state.currentAdvanceCleanup = () => {
      document.removeEventListener('keydown', onKeyDown);
      button.removeEventListener('click', onButtonClick);
    };
    logEvent('self_paced_wait_start', { advance_key: 'Space' });
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
    const r = await fetch(cacheBustedAssetPath(path), { cache: 'no-cache' });
    if (!r.ok) throw new Error('Failed to fetch ' + path + ' (' + r.status + ')');
    return r.json();
  }

  // Recursively produce a canonical (sorted-key) JSON string for deterministic
  // hashing. Mirrors the spirit of RFC 8785 (JCS) for the subset of values we
  // actually emit: plain objects/arrays/numbers/strings/booleans/null. Required
  // because JSON.stringify object key order is insertion-order, so two calls
  // can disagree across browsers if the source object is reconstructed.
  function canonicalJSONStringify (value) {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'number') {
      return Number.isFinite(value) ? JSON.stringify(value) : 'null';
    }
    if (typeof value === 'string' || typeof value === 'boolean') {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return '[' + value.map(canonicalJSONStringify).join(',') + ']';
    }
    if (typeof value === 'object') {
      const keys = Object.keys(value).sort();
      const parts = [];
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        parts.push(JSON.stringify(k) + ':' + canonicalJSONStringify(value[k]));
      }
      return '{' + parts.join(',') + '}';
    }
    return 'null';
  }

  async function sha256Hex (text) {
    if (!(window.crypto && window.crypto.subtle && window.crypto.subtle.digest)) {
      return '';
    }
    const enc = new TextEncoder();
    const buf = await window.crypto.subtle.digest('SHA-256', enc.encode(text));
    const bytes = new Uint8Array(buf);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
      const h = bytes[i].toString(16);
      hex += h.length === 1 ? '0' + h : h;
    }
    return hex;
  }

  function validateCalibration (cal) {
    if (!cal || typeof cal !== 'object') {
      throw new Error('calibration.json: top-level value is not an object');
    }
    const requiredKeys = [
      'item_bank_hit', 'item_bank_cr', 'item_bank_1f', 'item_bank_2f', 'regression'
    ];
    const missing = requiredKeys.filter(k => !(k in cal));
    if (missing.length) {
      throw new Error(
        'calibration.json: missing required keys: ' + missing.join(', ')
      );
    }
    const expectedLengths = {
      item_bank_hit: 80,
      item_bank_cr: 80,
      item_bank_1f: 160,
      item_bank_2f: 160
    };
    const lengthErrors = [];
    Object.keys(expectedLengths).forEach(name => {
      const arr = cal[name];
      const len = Array.isArray(arr) ? arr.length : -1;
      if (len !== expectedLengths[name]) {
        lengthErrors.push(name + '=' + len + ' (expected ' + expectedLengths[name] + ')');
      }
    });
    if (lengthErrors.length) {
      throw new Error(
        'calibration.json: item-bank length mismatch: ' + lengthErrors.join('; ')
      );
    }
    const isFiniteNum = v => typeof v === 'number' && Number.isFinite(v);
    const checkBank1D = (bankName, bank) => {
      for (let i = 0; i < bank.length; i++) {
        const it = bank[i];
        if (!it || !isFiniteNum(it.a) || !isFiniteNum(it.b)) {
          throw new Error(
            'calibration.json: ' + bankName + '[' + i +
            '] missing finite numeric a/b'
          );
        }
      }
    };
    checkBank1D('item_bank_hit', cal.item_bank_hit);
    checkBank1D('item_bank_cr', cal.item_bank_cr);
    checkBank1D('item_bank_1f', cal.item_bank_1f);
    for (let i = 0; i < cal.item_bank_2f.length; i++) {
      const it = cal.item_bank_2f[i];
      if (!it || !isFiniteNum(it.a1) || !isFiniteNum(it.a2) || !isFiniteNum(it.d)) {
        throw new Error(
          'calibration.json: item_bank_2f[' + i +
          '] missing finite numeric a1/a2/d'
        );
      }
    }
  }

  async function loadCalibration () {
    const cal = await loadJSON('data/calibration.json');
    validateCalibration(cal);
    state.calibration = cal;
    try {
      state.calibrationHash = await sha256Hex(canonicalJSONStringify(cal));
    } catch (err) {
      state.calibrationHash = '';
    }
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

  function numberFromConfig (value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : fallback;
  }

  function adaptiveCandidateSource () {
    const cfg = APP_CONFIG.blueprint || {};
    const candidateSet = cfg.candidateSet || 'full160_item_bank';
    if (candidateSet === 'extended70_disjoint') {
      const extended = getSelectedForm('extended70_disjoint');
      if (extended && extended.items && extended.items.length) {
        return {
          candidateSet: 'extended70_disjoint',
          form: extended,
          items: itemsFromSelectedForm(extended)
        };
      }
    }
    return {
      candidateSet: 'full160_item_bank',
      form: null,
      items: withItemIds(state.calibration.item_bank_hit)
        .concat(withItemIds(state.calibration.item_bank_cr))
    };
  }

  function adaptiveDisallowWordOverlap () {
    const cfg = APP_CONFIG.blueprint || {};
    return cfg.disallowWordOverlap !== false;
  }

  function adaptiveReportingMinPerCondition () {
    const cfg = APP_CONFIG.blueprint || {};
    const n = Number(cfg.reportingMinPerCondition);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : 1;
  }

  function adaptiveBlueprint () {
    const cfg = APP_CONFIG.blueprint || {};
    const source = adaptiveCandidateSource();
    const counts = source.items.reduce((acc, it) => {
      if (it.condition === 'Hit') acc.hit++;
      if (it.condition === 'CR') acc.cr++;
      return acc;
    }, { hit: 0, cr: 0 });
    const minItems = numberFromConfig(cfg.minItems, 0);
    const minHit = numberFromConfig(cfg.minHit, Math.floor(minItems / 2));
    const minCR = numberFromConfig(cfg.minCR, minItems - minHit);
    const maxItems = numberFromConfig(cfg.maxItems, source.items.length || 160);
    const maxHit = numberFromConfig(cfg.maxHit, counts.hit || Math.floor(maxItems / 2));
    const maxCR = numberFromConfig(cfg.maxCR, counts.cr || (maxItems - maxHit));
    return { minItems, minHit, minCR, maxItems, maxHit, maxCR };
  }

  function buildAdaptivePools () {
    const source = adaptiveCandidateSource();
    const hit = source.items.filter(it => it.condition === 'Hit');
    const cr = source.items.filter(it => it.condition === 'CR');
    state.adaptiveItems = hit.concat(cr);
    return {
      hit: hit,
      cr: cr,
      form: source.form,
      candidateSet: source.candidateSet
    };
  }

  function createCATSession () {
    if (state.delivery === 'adaptive') {
      const pools = buildAdaptivePools();
      const bp = adaptiveBlueprint();
      return window.CAT1F.createTwoCondition(pools.hit, pools.cr, {
        algorithm: state.algorithm,
        quotaTol: state.params.quota_tol,
        disallowWordOverlap: adaptiveDisallowWordOverlap(),
        maxConditionRun: maxConditionRun(),
        randomizeConditionTies: true,
        minItems: state.params.min_items,
        minHit: Math.floor(state.params.min_items / 2),
        minCR: state.params.min_items - Math.floor(state.params.min_items / 2),
        maxItems: state.params.max_items,
        maxHit: state.params.max_items === bp.maxItems ? bp.maxHit
          : Math.floor(state.params.max_items / 2),
        maxCR: state.params.max_items === bp.maxItems ? bp.maxCR
          : state.params.max_items - Math.floor(state.params.max_items / 2),
        thetaMin: state.params.theta_min,
        thetaMax: state.params.theta_max,
        thetaStep: state.params.theta_step
      });
    }
    if (state.mode === '1F') {
      return window.CAT1F.create(state.calibration.item_bank_1f, {
        algorithm: state.delivery === 'adaptive' ? state.algorithm : 'plain',
        quotaTol: state.params.quota_tol,
        thetaMin: state.params.theta_min,
        thetaMax: state.params.theta_max,
        thetaStep: state.params.theta_step
      });
    }
    const rho = state.calibration.regression.factor_cor_2F;
    return window.CAT2F.create(state.calibration.item_bank_2f, rho, thetaGrid2DOptions());
  }

  function escapeHtml (value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ---- Accessibility: aria-live announcer ----
  // The polite live region is created once at boot and reused for the rest of
  // the app lifetime. Updates use textContent (not innerHTML) and include a
  // brief clear-then-set toggle so identical consecutive messages are still
  // announced by screen readers.
  function ensureSrAnnouncer () {
    let el = document.getElementById('sr-announcer');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'sr-announcer';
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
    el.setAttribute('role', 'status');
    // Visually hide while remaining accessible to assistive tech.
    el.style.position = 'absolute';
    el.style.left = '-10000px';
    el.style.top = 'auto';
    el.style.width = '1px';
    el.style.height = '1px';
    el.style.overflow = 'hidden';
    if (document.body && document.body.firstChild) {
      document.body.insertBefore(el, document.body.firstChild);
    } else if (document.body) {
      document.body.appendChild(el);
    }
    return el;
  }

  function announceForScreenReader (message) {
    const el = ensureSrAnnouncer();
    if (!el) return;
    // Clear first so identical strings re-announce on subsequent calls.
    el.textContent = '';
    window.setTimeout(() => { el.textContent = String(message || ''); }, 50);
  }

  // ---- Audio prefetch ----
  // Approach chosen: per-trial JIT prefetch via a hidden secondary <audio>
  // element. After each main response commits, we eagerly load the *current*
  // selection's audio (if not yet loaded) and additionally warm any items the
  // browser has already requested. We avoid bulk-injecting 160 <link
  // rel=preload> tags because Chrome throttles concurrent media preloads and
  // a flood of preload warnings (when items are not consumed within a few
  // seconds) clutters the console. The per-trial approach also matches the
  // PSER median (~20 items): the cache will be populated incrementally.
  function ensurePrefetchAudioElement () {
    let el = document.getElementById('audio-prefetch');
    if (el) return el;
    el = document.createElement('audio');
    el.id = 'audio-prefetch';
    el.preload = 'auto';
    el.style.display = 'none';
    el.setAttribute('aria-hidden', 'true');
    if (document.body) document.body.appendChild(el);
    return el;
  }

  function prefetchAudio (path) {
    if (!path) return;
    try {
      const el = ensurePrefetchAudioElement();
      if (el.src && el.src.indexOf(path) !== -1) return;
      el.src = path;
      // load() kicks off the network fetch without playing.
      if (typeof el.load === 'function') el.load();
      logEvent('audio_prefetch_start', { audio_path: path });
      const onLoaded = () => {
        el.removeEventListener('loadeddata', onLoaded);
        el.removeEventListener('error', onErr);
        logEvent('audio_prefetch_loaded', { audio_path: path });
      };
      const onErr = () => {
        el.removeEventListener('loadeddata', onLoaded);
        el.removeEventListener('error', onErr);
        logEvent('audio_prefetch_error', { audio_path: path });
      };
      el.addEventListener('loadeddata', onLoaded);
      el.addEventListener('error', onErr);
    } catch (err) {
      logEvent('audio_prefetch_exception', {
        audio_path: path,
        error_message: err && err.message ? err.message : String(err || '')
      });
    }
  }

  // ---- Session storage helpers (graceful degradation if module missing) ----
  function hasSessionStorageModule () {
    return !!(window.LJTSessionStorage &&
      typeof window.LJTSessionStorage.snapshotSession === 'function');
  }

  function buildPartialPayload () {
    let protocolManifest = null;
    try { protocolManifest = buildProtocolManifest(); } catch (err) { protocolManifest = null; }
    return {
      partial: true,
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
      practice:  Object.assign({}, state.practice),
      responses: (state.responses || []).slice(),
      events:    (state.events || []).slice(),
      protocol_manifest: protocolManifest,
      final:     null
    };
  }

  function snapshotPartialSession () {
    if (!hasSessionStorageModule()) return false;
    if (!state.session || !state.session.uuid) return false;
    try {
      const payload = buildPartialPayload();
      const ok = window.LJTSessionStorage.snapshotSession(state.session.uuid, payload);
      logEvent('session_snapshot', {
        session_id: state.session.uuid,
        ok: !!ok,
        n_responses: payload.responses.length
      });
      return !!ok;
    } catch (err) {
      logEvent('session_snapshot_error', {
        error_message: err && err.message ? err.message : String(err || '')
      });
      return false;
    }
  }

  function clearOwnSnapshot () {
    if (!hasSessionStorageModule()) return;
    if (!state.session || !state.session.uuid) return;
    try {
      if (typeof window.LJTSessionStorage.clearSnapshot === 'function') {
        window.LJTSessionStorage.clearSnapshot(state.session.uuid);
      }
    } catch (err) { /* swallow */ }
  }

  // ---- Orphan recovery banner ----
  // Resume (continue from where the participant left off) is DEFERRED: it
  // would require rebuilding the CAT engine state (used indices, posterior,
  // theta history) from the snapshot, which is intrusive given the engine's
  // private state. The current implementation supports save-then-fresh, which
  // covers the dominant failure case (browser crash mid-test) without risking
  // a corrupted resumed session.
  function renderOrphanRecoveryBanner (orphans) {
    let banner = document.getElementById('orphan-recovery-banner');
    if (banner) banner.remove();
    banner = document.createElement('div');
    banner.id = 'orphan-recovery-banner';
    banner.className = 'orphan-recovery-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    const n = orphans.length;
    banner.innerHTML =
      '<h3>' + escapeHtml(t('orphanRecoveryTitle')) + '</h3>' +
      '<p>' + escapeHtml(t('orphanRecoveryBody', { n: n })) + '</p>' +
      '<div class="orphan-recovery-actions">' +
        '<button type="button" id="btn-orphan-save-all">' +
          escapeHtml(t('orphanRecoverySaveAll')) + '</button> ' +
        '<button type="button" id="btn-orphan-discard">' +
          escapeHtml(t('orphanRecoveryDiscard')) + '</button> ' +
        '<button type="button" id="btn-orphan-skip">' +
          escapeHtml(t('orphanRecoverySkip')) + '</button>' +
      '</div>' +
      '<p id="orphan-recovery-status" class="orphan-recovery-status" aria-live="polite"></p>';
    const container = document.querySelector('.container');
    if (container && container.firstChild) {
      container.insertBefore(banner, container.firstChild);
    } else if (document.body) {
      document.body.insertBefore(banner, document.body.firstChild);
    }
    logEvent('orphan_recovery_shown', { n_orphans: n });

    const removeBanner = () => { if (banner.parentNode) banner.parentNode.removeChild(banner); };
    const setStatus = (msg) => {
      const el = document.getElementById('orphan-recovery-status');
      if (el) el.textContent = msg || '';
    };

    const btnSave = document.getElementById('btn-orphan-save-all');
    if (btnSave) {
      btnSave.onclick = () => {
        let savedCount = 0;
        orphans.forEach(o => {
          try {
            if (!o || !o.payload) return;
            const safeId = (o.payload.participant && o.payload.participant.id
              ? o.payload.participant.id : 'na').replace(/[^A-Za-z0-9_\-]/g, '_').slice(0, 32);
            const tsRaw = o.savedAt || new Date().toISOString();
            const ts = String(tsRaw).replace(/[:.]/g, '-').slice(0, 19);
            const fname = 'LJT_partial_' + safeId + '_' + ts + '.xlsx';
            const res = window.LJTExcel.export(fname, o.payload);
            const ok = !!(res && (res === true || res.ok));
            logEvent('orphan_recovery_save_attempt', {
              session_id: o.sessionId, ok: ok, filename: fname
            });
            if (ok) {
              savedCount++;
              try { window.LJTSessionStorage.clearSnapshot(o.sessionId); } catch (e) { /* ignore */ }
            }
          } catch (err) {
            logEvent('orphan_recovery_save_error', {
              session_id: o ? o.sessionId : null,
              error_message: err && err.message ? err.message : String(err || '')
            });
          }
        });
        setStatus(t('orphanRecoverySaved'));
        announceForScreenReader(t('orphanRecoverySaved'));
        window.setTimeout(removeBanner, 1500);
      };
    }

    const btnDiscard = document.getElementById('btn-orphan-discard');
    if (btnDiscard) {
      btnDiscard.onclick = () => {
        orphans.forEach(o => {
          try {
            if (o && o.sessionId) window.LJTSessionStorage.clearSnapshot(o.sessionId);
          } catch (e) { /* ignore */ }
        });
        logEvent('orphan_recovery_discard', { n_orphans: orphans.length });
        removeBanner();
      };
    }

    const btnSkip = document.getElementById('btn-orphan-skip');
    if (btnSkip) {
      btnSkip.onclick = () => {
        logEvent('orphan_recovery_skip', { n_orphans: orphans.length });
        removeBanner();
      };
    }
  }

  // ---- Auto-download retry chain ----
  // Schedule: immediate, +1.5s, +4s, +10s (final attempt).
  // The final attempt re-invokes LJTExcel.export; the upstream xlsx_export
  // module already falls back to JSON internally when XLSX is missing, so a
  // dedicated jsonOnly flag is not required here.
  const RESULT_SAVE_DELAYS_MS = [0, 1500, 4000, 10000];

  function attemptResultExport (filename, payload, attempt, finalCallback) {
    let result = null;
    let threw = false;
    try {
      result = window.LJTExcel.export(filename, payload);
    } catch (err) {
      threw = true;
      logEvent('result_save_exception', {
        attempt: attempt,
        error_message: err && err.message ? err.message : String(err || '')
      });
    }
    const ok = !threw && !!(result && (result === true || result.ok));
    logEvent('result_save_attempt', { attempt: attempt, ok: ok });
    if (ok) { finalCallback(true, result); return; }
    if (attempt >= RESULT_SAVE_DELAYS_MS.length) { finalCallback(false, result); return; }
    const delay = RESULT_SAVE_DELAYS_MS[attempt];
    window.setTimeout(() => {
      attemptResultExport(filename, payload, attempt + 1, finalCallback);
    }, delay);
  }

  function startResultSaveChain (filename, payload, onComplete) {
    attemptResultExport(filename, payload, 1, (ok, result) => {
      if (typeof onComplete === 'function') onComplete(ok, result);
    });
  }

  function researchHelp (text) {
    return '<abbr class="research-help" tabindex="0" title="' +
      escapeHtml(text) + '" aria-label="' + escapeHtml(text) + '">?</abbr>';
  }

  function researchLabel (label, help) {
    return '<span class="research-label">' + escapeHtml(label) +
      (help ? researchHelp(help) : '') + '</span>';
  }

  function fmtNum (value) {
    return Number.isFinite(value) ? Number(value).toFixed(3) : '';
  }

  function researchItemRows () {
    if (!state.calibration) return [];
    const adaptiveSource = adaptiveCandidateSource();
    const candidateSet = adaptiveSource.candidateSet;
    const form = adaptiveSource.form;
    const source = adaptiveSource.items;
    return source.slice()
      .sort((a, b) => {
        if (a.condition !== b.condition) return a.condition === 'Hit' ? -1 : 1;
        return (a.rank || 9999) - (b.rank || 9999);
      })
      .map((it, idx) => ({
        form_id: form ? form.form_id : '',
        candidate_set: candidateSet,
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
    const timingEl = $('research-timing-mode');
    const presetEl = $('research-window-preset');
    const customEl = $('research-window-custom');
    const keymapEl = $('research-keymap');
    const autoPlayEl = $('research-auto-play-audio');
    const audioRateEl = $('research-audio-rate');
    const fixationEl = $('research-fixation-ms');
    const postResponseEl = $('research-post-response-ms');
    const paceEl = $('research-pace-mode');
    const maxRunEl = $('research-max-condition-run');
    const maxFailsEl = $('research-max-play-fails');
    const thetaMinEl = $('research-theta-min');
    const thetaMaxEl = $('research-theta-max');
    const thetaStepEl = $('research-theta-step');
    const thetaPointsEl = $('research-theta-points');
    const theta2MinEl = $('research-theta2-min');
    const theta2MaxEl = $('research-theta2-max');
    const theta2StepEl = $('research-theta2-step');
    const theta2PointsEl = $('research-theta2-points');
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
      return {
        delivery: 'adaptive',
        timing: timingEl.value,
        response_window_ms: presetEl.value === 'custom' ? customEl.value : presetEl.value,
        keymap: keymapEl ? keymapEl.value : state.params.keymap,
        auto_play_audio: autoPlayEl ? autoPlayEl.value === '1' : autoPlayAudio(),
        audio_rate: audioRateEl ? audioRateEl.value : audioPlaybackRate(),
        fixation_ms: fixationEl ? fixationEl.value : fixationMs(),
        post_response_ms: postResponseEl ? postResponseEl.value : postResponseMs(),
        pace: paceEl ? paceEl.value : state.params.pace,
        max_condition_run: maxRunEl ? maxRunEl.value : maxConditionRun(),
        max_play_fails: maxFailsEl ? maxFailsEl.value : state.params.max_play_fails,
        theta_min: thetaMinEl ? thetaMinEl.value : state.params.theta_min,
        theta_max: thetaMaxEl ? thetaMaxEl.value : state.params.theta_max,
        theta_step: thetaStepEl ? thetaStepEl.value : state.params.theta_step,
        theta2_min: theta2MinEl ? theta2MinEl.value : state.params.theta2_min,
        theta2_max: theta2MaxEl ? theta2MaxEl.value : state.params.theta2_max,
        theta2_step: theta2StepEl ? theta2StepEl.value : state.params.theta2_step,
        algorithm: algorithmEl ? algorithmEl.value : 'blueprint',
        stop_rule: stopRuleEl ? stopRuleEl.value : 'blueprint_pser',
        min_items: minItemsEl ? minItemsEl.value : DEFAULTS.min_items,
        max_items: maxItemsEl ? maxItemsEl.value : DEFAULTS.max_items,
        target_se: targetSeEl ? targetSeEl.value : DEFAULTS.target_se,
        stop_pser: stopPserEl ? stopPserEl.value : DEFAULTS.stop_pser,
        quota_tol: quotaTolEl ? quotaTolEl.value : DEFAULTS.quota_tol
      };
    };

    const refreshControls = () => {
      const timed = normalizeTiming(timingEl.value) === 'timed';
      const custom = presetEl.value === 'custom';
      const overrides = readOverrides();
      presetEl.disabled = !timed;
      customEl.disabled = !timed || !custom;
      customEl.parentElement.classList.toggle('hidden', !timed || !custom);
      helpEl.textContent = timed ? t('researchTimedHelp') : t('researchUntimedHelp');
      if (thetaPointsEl) {
        const min = boundedNumberValue(overrides.theta_min, DEFAULTS.theta_min, -8, 0, false);
        const max = boundedNumberValue(overrides.theta_max, DEFAULTS.theta_max, 0, 8, false);
        const step = boundedNumberValue(overrides.theta_step, DEFAULTS.theta_step, 0.001, 0.1, false);
        thetaPointsEl.textContent = max > min ? String(thetaGridPoints(min, max, step)) : '1201';
      }
      if (theta2PointsEl) {
        const min = boundedNumberValue(overrides.theta2_min, DEFAULTS.theta2_min, -6, 0, false);
        const max = boundedNumberValue(overrides.theta2_max, DEFAULTS.theta2_max, 0, 6, false);
        const step = boundedNumberValue(overrides.theta2_step, DEFAULTS.theta2_step, 0.05, 0.2, false);
        const axis = max > min ? thetaGridPoints(min, max, step) : 81;
        theta2PointsEl.textContent = axis + ' x ' + axis + ' = ' + (axis * axis);
      }
      const stopPserWarn = $('research-stop-pser-warning');
      if (stopPserWarn && stopPserEl) {
        const raw = stopPserEl.value;
        const parsed = raw === '' ? NaN : Number(raw);
        const out = !Number.isFinite(parsed) || parsed < 0.001 || parsed > 0.05;
        if (out) {
          stopPserWarn.textContent = t('researchStopPserOutOfRange');
          stopPserWarn.hidden = false;
        } else {
          stopPserWarn.textContent = '';
          stopPserWarn.hidden = true;
        }
      }
      urlEl.value = buildProtocolURL(false, overrides);
    };

    timingEl.addEventListener('change', refreshControls);
    presetEl.addEventListener('change', refreshControls);
    customEl.addEventListener('input', refreshControls);
    [
      keymapEl, autoPlayEl, audioRateEl, fixationEl, postResponseEl, paceEl, maxRunEl, maxFailsEl,
      thetaMinEl, thetaMaxEl, thetaStepEl, theta2MinEl, theta2MaxEl, theta2StepEl,
      algorithmEl, stopRuleEl, minItemsEl, maxItemsEl, targetSeEl, stopPserEl, quotaTolEl
    ].forEach(el => {
      if (!el) return;
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', refreshControls);
    });

    if (applyEl) {
      applyEl.addEventListener('click', () => {
        const overrides = readOverrides();
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
        state.params.audio_rate = boundedNumberValue(
          overrides.audio_rate, DEFAULTS.audio_rate, 0.75, 1.25, false);
        state.params.fixation_ms = boundedNumberValue(
          overrides.fixation_ms, DEFAULTS.fixation_ms, 0, 3000, true);
        state.params.post_response_ms = boundedNumberValue(
          overrides.post_response_ms, DEFAULTS.post_response_ms, 0, 5000, true);
        state.params.pace = normalizePace(overrides.pace);
        state.params.max_condition_run = boundedNumberValue(
          overrides.max_condition_run, DEFAULTS.max_condition_run, 1, 10, true);
        state.params.max_play_fails = boundedNumberValue(
          overrides.max_play_fails, DEFAULTS.max_play_fails, 0, 10, true);
        state.params.theta_min = boundedNumberValue(
          overrides.theta_min, DEFAULTS.theta_min, -8, 0, false);
        state.params.theta_max = boundedNumberValue(
          overrides.theta_max, DEFAULTS.theta_max, 0, 8, false);
        state.params.theta_step = boundedNumberValue(
          overrides.theta_step, DEFAULTS.theta_step, 0.001, 0.1, false);
        state.params.theta2_min = boundedNumberValue(
          overrides.theta2_min, DEFAULTS.theta2_min, -6, 0, false);
        state.params.theta2_max = boundedNumberValue(
          overrides.theta2_max, DEFAULTS.theta2_max, 0, 6, false);
        state.params.theta2_step = boundedNumberValue(
          overrides.theta2_step, DEFAULTS.theta2_step, 0.05, 0.2, false);
        normalizeThetaGridParams();
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
            overrides.max_items, adaptiveBounds.cap, Math.max(1, adaptiveBounds.floor), adaptiveBounds.cap, true);
          if (state.params.max_items < state.params.min_items) {
            state.params.max_items = state.params.min_items;
          }
          state.params.target_se = boundedNumberValue(overrides.target_se, DEFAULTS.target_se, 0.05, 2.0, false);
          state.params.stop_pser = boundedNumberValue(overrides.stop_pser, DEFAULTS.stop_pser, 0.0001, 0.1, false);
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
          audio_rate: audioPlaybackRate(),
          fixation_ms: fixationMs(),
          post_response_ms: postResponseMs(),
          pace: state.params.pace,
          max_condition_run: maxConditionRun(),
          max_play_fails: state.params.max_play_fails,
          theta_min: state.params.theta_min,
          theta_max: state.params.theta_max,
          theta_step: state.params.theta_step,
          theta2_min: state.params.theta2_min,
          theta2_max: state.params.theta2_max,
          theta2_step: state.params.theta2_step,
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

    const adaptiveSource = adaptiveCandidateSource();
    const form = adaptiveSource.form;
    const rows = researchItemRows();
    const itemSummary = summarizeResearchItems(rows);
    const timing = isTimed()
      ? t('researchTimedValue', { ms: responseWindowMs() })
      : t('researchUntimedValue');
    const model = 'full 160-item per-condition 1D 2PL blueprint CAT (mod_hit / mod_cr)';
    const note = t('researchAdaptiveNote');
    const preset = responseWindowPreset();
    const currentWindow = responseWindowMs() || DEFAULTS.response_window_ms;
    const keymap = normalizeKeymap(state.params.keymap);
    const adaptiveBounds = adaptiveItemBounds();
    const adaptiveProtocolHtml = state.delivery === 'adaptive'
      ? '<details class="research-collapsible" open>' +
          '<summary>' + escapeHtml(t('researchAdaptiveSettingsTitle')) + '</summary>' +
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
                  '<option value="' + value + '"' +
                    (state.stopRule === value ? ' selected' : '') +
                    ' title="' + escapeHtml(t('researchStopRuleHelp_' + value)) + '">' +
                    value + '</option>'
                ).join('') +
              '</select>' +
              '<small class="research-help">' + escapeHtml(t('researchStopRuleAllHelp')) + '</small>' +
            '</label>' +
            '<label><span>' + escapeHtml(t('researchMinItemsLabel')) + '</span>' +
              '<input type="number" id="research-min-items" min="' + adaptiveBounds.floor +
                '" max="' + adaptiveBounds.cap + '" step="1" value="' +
                escapeHtml(state.params.min_items) + '" /></label>' +
            '<label><span>' + escapeHtml(t('researchMaxItemsLabel')) + '</span>' +
              '<input type="number" id="research-max-items" min="' + Math.max(1, adaptiveBounds.floor) +
                '" max="' + adaptiveBounds.cap + '" step="1" value="' +
                escapeHtml(state.params.max_items) + '" /></label>' +
            '<label><span>' + escapeHtml(t('researchTargetSeLabel')) + '</span>' +
              '<input type="number" id="research-target-se" min="0.05" max="2" step="0.01" value="' +
                escapeHtml(state.params.target_se) + '" /></label>' +
            '<label>' + researchLabel(t('researchStopPserLabel'), t('researchStopPserHelp')) +
              '<input type="number" id="research-stop-pser" min="0.0001" max="0.1" step="0.001" value="' +
                escapeHtml(state.params.stop_pser) + '" />' +
              '<small>' + escapeHtml(t('researchStopPserGuide')) + '</small>' +
              '<small id="research-stop-pser-warning" class="research-warning" hidden></small></label>' +
            '<label><span>' + escapeHtml(t('researchQuotaTolLabel')) + '</span>' +
              '<input type="number" id="research-quota-tol" min="0" max="0.49" step="0.01" value="' +
                escapeHtml(state.params.quota_tol) + '" /></label>' +
          '</div>' +
        '</details>'
      : '';
    const theta2AxisPoints = Math.round(Math.sqrt(thetaGrid2DPointCount()));
    const numericalSettingsHtml =
      '<details class="research-collapsible">' +
        '<summary>' + escapeHtml(t('researchNumericalSettingsTitle')) + '</summary>' +
        '<p class="research-model">' + escapeHtml(t('researchNumericalSettingsNote')) + '</p>' +
        '<div class="research-control-grid">' +
          '<label>' + researchLabel(t('researchTheta1DMinLabel'), t('researchTheta1DHelp')) +
            '<input type="number" id="research-theta-min" min="-8" max="0" step="0.5" value="' +
              escapeHtml(state.params.theta_min) + '" /></label>' +
          '<label>' + researchLabel(t('researchTheta1DMaxLabel'), t('researchTheta1DHelp')) +
            '<input type="number" id="research-theta-max" min="0" max="8" step="0.5" value="' +
              escapeHtml(state.params.theta_max) + '" /></label>' +
          '<label>' + researchLabel(t('researchTheta1DStepLabel'), t('researchTheta1DHelp')) +
            '<input type="number" id="research-theta-step" min="0.001" max="0.1" step="0.001" value="' +
              escapeHtml(state.params.theta_step) + '" /></label>' +
          '<label><span>' + escapeHtml(t('researchTheta1DPointsLabel')) + '</span>' +
            '<output id="research-theta-points" class="research-grid-points">' +
              escapeHtml(thetaGrid1DPointCount()) + '</output></label>' +
          '<label>' + researchLabel(t('researchTheta2DMinLabel'), t('researchTheta2DHelp')) +
            '<input type="number" id="research-theta2-min" min="-6" max="0" step="0.5" value="' +
              escapeHtml(state.params.theta2_min) + '" /></label>' +
          '<label>' + researchLabel(t('researchTheta2DMaxLabel'), t('researchTheta2DHelp')) +
            '<input type="number" id="research-theta2-max" min="0" max="6" step="0.5" value="' +
              escapeHtml(state.params.theta2_max) + '" /></label>' +
          '<label>' + researchLabel(t('researchTheta2DStepLabel'), t('researchTheta2DHelp')) +
            '<input type="number" id="research-theta2-step" min="0.05" max="0.2" step="0.05" value="' +
              escapeHtml(state.params.theta2_step) + '" /></label>' +
          '<label><span>' + escapeHtml(t('researchTheta2DPointsLabel')) + '</span>' +
            '<output id="research-theta2-points" class="research-grid-points">' +
              escapeHtml(theta2AxisPoints + ' x ' + theta2AxisPoints + ' = ' +
                thetaGrid2DPointCount()) + '</output></label>' +
        '</div>' +
        '<p class="research-grid-cost ' + (thetaGrid1DPointCount() > 5000 ? 'warn' : 'ok') + '">' +
          escapeHtml(thetaGrid1DPointCount() > 5000 ? t('researchGridCostWarning1D') : '') +
        '</p>' +
        '<p class="research-grid-cost ' + (theta2AxisPoints > 200 ? 'warn' : 'ok') + '">' +
          escapeHtml(theta2AxisPoints > 200 ? t('researchGridCostWarning2D') : '') +
        '</p>' +
      '</details>';
    const renderReference = (titleKey, citationKey, roleKey, doiKey) => {
      const doi = t(doiKey);
      const doiHtml = doi
        ? ' <a class="research-doi" href="' + escapeHtml(doi) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(doi) + '</a>'
        : '';
      return '<li>' +
        '<strong>' + escapeHtml(t(titleKey)) + '</strong> ' +
        escapeHtml(t(citationKey)) + doiHtml +
        '<br><small>' + escapeHtml(t(roleKey)) + '</small>' +
        '</li>';
    };
    const referencesHtml =
      '<details class="research-collapsible">' +
        '<summary>' + escapeHtml(t('researchReferencesTitle')) + '</summary>' +
        '<p class="research-model">' + escapeHtml(t('researchReferencesIntro')) + '</p>' +
        '<div class="research-reference-group">' +
          '<h6>' + escapeHtml(t('researchReferenceGroupEstimation')) + '</h6>' +
          '<ul class="research-references">' +
            renderReference('researchReferenceEAP', 'researchReferenceEAPCitation', 'researchReferenceEAPRole', 'researchReferenceEAPDOI') +
          '</ul>' +
        '</div>' +
        '<div class="research-reference-group">' +
          '<h6>' + escapeHtml(t('researchReferenceGroupStopping')) + '</h6>' +
          '<ul class="research-references">' +
            renderReference('researchReferencePSER', 'researchReferencePSERCitation', 'researchReferencePSERRole', 'researchReferencePSERDOI') +
            renderReference('researchReferenceMorris', 'researchReferenceMorrisCitation', 'researchReferenceMorrisRole', 'researchReferenceMorrisDOI') +
          '</ul>' +
        '</div>' +
        '<div class="research-reference-group">' +
          '<h6>' + escapeHtml(t('researchReferenceGroupTheory')) + '</h6>' +
          '<ul class="research-references">' +
            renderReference('researchReferenceBlueprint', 'researchReferenceBlueprintCitation', 'researchReferenceBlueprintRole', 'researchReferenceBlueprintDOI') +
          '</ul>' +
        '</div>' +
        '<p class="research-references-note"><small>' + escapeHtml(t('researchReferenceReadmeLink')) + '</small></p>' +
      '</details>';
    const protocolHtml =
      '<div class="research-protocol">' +
        '<h4>' + escapeHtml(t('researchProtocolTitle')) + '</h4>' +
        '<p class="research-model">' + escapeHtml(t('researchProtocolNote')) + '</p>' +
        '<div class="research-control-grid">' +
          '<label><span>' + escapeHtml(t('researchDeliveryModeLabel')) + '</span>' +
            '<output>' + escapeHtml(t('researchAdaptiveOption')) + '</output></label>' +
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
          '<label>' + researchLabel(t('researchAudioRateLabel'), t('researchAudioRateHelp')) +
            '<input type="number" id="research-audio-rate" min="0.75" max="1.25" step="0.05" list="research-audio-rate-presets" value="' +
              escapeHtml(audioPlaybackRate()) + '" />' +
            '<datalist id="research-audio-rate-presets">' +
              '<option value="0.9"></option><option value="1"></option><option value="1.1"></option>' +
            '</datalist>' +
            '<small>' + escapeHtml(t('researchAudioRateGuide')) + '</small></label>' +
          '<label><span>' + escapeHtml(t('researchFixationMsLabel')) + '</span>' +
            '<input type="number" id="research-fixation-ms" min="0" max="3000" step="50" value="' +
              escapeHtml(fixationMs()) + '" /></label>' +
          '<label><span>' + escapeHtml(t('researchPostResponseMsLabel')) + '</span>' +
            '<input type="number" id="research-post-response-ms" min="0" max="5000" step="50" value="' +
              escapeHtml(postResponseMs()) + '" /></label>' +
          '<label><span>' + escapeHtml(t('researchPaceModeLabel')) + '</span>' +
            '<select id="research-pace-mode">' +
              '<option value="auto"' + (!isSelfPaced() ? ' selected' : '') + '>' +
                escapeHtml(t('researchPaceAuto')) + '</option>' +
              '<option value="self"' + (isSelfPaced() ? ' selected' : '') + '>' +
                escapeHtml(t('researchPaceSelf')) + '</option>' +
            '</select></label>' +
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
        numericalSettingsHtml +
        referencesHtml +
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
        '<div class="research-build-info" aria-label="' + escapeHtml(t('researchBuildInfoTitle')) + '">' +
          '<dl>' +
            '<dt>' + escapeHtml(t('researchBuildAppVersion')) + '</dt>' +
            '<dd>' + escapeHtml(APP_VERSION) + '</dd>' +
            '<dt>' + escapeHtml(t('researchBuildCalibrationHash')) + '</dt>' +
            '<dd><code>' + escapeHtml(
              state.calibrationHash
                ? state.calibrationHash.slice(0, 12) + '...'
                : '-'
            ) + '</code></dd>' +
            '<dt>' + escapeHtml(t('researchBuildAssetCacheVersion')) + '</dt>' +
            '<dd>' + escapeHtml(ASSET_CACHE_VERSION) + '</dd>' +
          '</dl>' +
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
        '<div><span>' + escapeHtml(t('researchAudioRateLabel')) + '</span><strong>' +
          escapeHtml(audioPlaybackRate().toFixed(2) + 'x') + '</strong></div>' +
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
      let settled = false;
      let timeoutId = null;
      const cleanup = () => {
        el.removeEventListener('ended', onEnd);
        el.removeEventListener('error', onErr);
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
      };
      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn(value);
      };
      const onEnd = () => {
        state.currentAudioEnd = Date.now();
        state.currentAudioDurationMs = Math.round(performance.now() - state.audioStart);
        logEvent('audio_play_end', {
          audio_path: path,
          audio_playback_rate: audioPlaybackRate(),
          audio_duration_ms: state.currentAudioDurationMs
        });
        settle(resolve);
      };
      const onErr = () => {
        logEvent('audio_play_error', {
          audio_path: path,
          audio_playback_rate: audioPlaybackRate()
        });
        settle(reject, new Error('audio element error'));
      };
      el.addEventListener('ended', onEnd);
      el.addEventListener('error', onErr);
      el.src = path;
      el.defaultPlaybackRate = audioPlaybackRate();
      el.playbackRate = audioPlaybackRate();
      if ('preservesPitch' in el) el.preservesPitch = true;
      state.audioStart = performance.now();
      state.currentAudioStart = Date.now();
      state.currentAudioEnd = 0;
      state.currentAudioDurationMs = null;
      logEvent('audio_play_start', {
        audio_path: path,
        audio_playback_rate: audioPlaybackRate()
      });
      const p = el.play();
      if (p && typeof p.then === 'function') {
        p.catch(err => {
          logEvent('audio_play_error', {
            audio_path: path,
            audio_playback_rate: audioPlaybackRate(),
            error_message: err && err.message ? err.message : String(err || '')
          });
          settle(reject, err);
        });
      }
      timeoutId = window.setTimeout(() => {
        logEvent('audio_play_timeout', {
          audio_path: path,
          audio_playback_rate: audioPlaybackRate()
        });
        settle(reject, new Error('audio playback timeout'));
      }, 20000);
    });
  }

  function presentStimulus (audioPath, targetword, onReveal) {
    const area = $('target-word-area');
    const fixation = $('fixation-cross');
    const btnPlay = $('btn-play');
    const autoPlay = autoPlayAudio();
    const fixationDurationMs = fixationMs();

    clearAdvancePrompt();
    cleanupResponseInput();
    updateResponseLabels();
    if (area) area.classList.add('hidden');
    if (fixation) fixation.classList.add('hidden');
    $('feedback-area').classList.add('hidden');
    $('feedback-area').classList.remove('advance');
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
        $('target-word-display').textContent = t('decisionPrompt');
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
      // Capture the response-time zero point *before* any DOM mutation so
      // that synchronous style/layout work cannot push RT 0 past the audio
      // offset. This brings the gap between the HTML5 `ended` event and
      // RT 0 down to a handful of microseconds. (Earlier the four DOM
      // updates below ran first, leaving ε well under 1 ms but nonzero.)
      state.questionStart = performance.now();
      btnPlay.disabled = true;
      btnPlay.classList.add('hidden');
      $('target-word-display').textContent = t('decisionPrompt');
      if (area) area.classList.remove('hidden');
      setStatus(t('audioEnded', { prompt: responseKeyPrompt() }));
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
    state.practice.completed = false;
    state.practice.started_at = nowISO();
    state.practice.completed_at = '';
    state.practice.instruction_version = UX_INSTRUCTION_VERSION;
    state.practice.summary = null;
    state.currentTrialContext = null;
    logEvent('practice_start');
    showStage('stage-trial');
    $('trial-label').textContent = t('practiceLabel');
    showPracticeItem();
  }

  function summarizePracticeLog () {
    const log = state.practice.log || [];
    const nTotal = state.practice.items && state.practice.items.length
      ? state.practice.items.length
      : log.length;
    const nCorrect = log.filter(row => row && row.correct === 1).length;
    const nAnswered = log.filter(row => row && (row.correct === 0 || row.correct === 1)).length;
    const nTimedOut = log.filter(row => row && row.timed_out).length;
    const nAudioFailed = log.filter(row => row && row.audio_failed).length;
    return {
      instruction_version: UX_INSTRUCTION_VERSION,
      n_total: nTotal,
      n_logged: log.length,
      n_answered: nAnswered,
      n_correct: nCorrect,
      n_timed_out: nTimedOut,
      n_audio_failed: nAudioFailed,
      accuracy: nTotal ? nCorrect / nTotal : null
    };
  }

  function updatePracticeSummary () {
    const el = $('practice-summary');
    if (!el || !state.practice.completed) return;
    const summary = state.practice.summary || summarizePracticeLog();
    let text = t('practiceSummary', {
      correct: summary.n_correct,
      total: summary.n_total
    });
    if (summary.n_timed_out || summary.n_audio_failed) {
      text += ' (' + t('practiceSummaryDetails', {
        timeouts: summary.n_timed_out,
        audioFailed: summary.n_audio_failed
      }) + ')';
    }
    el.textContent = text;
  }

  function completePracticeAndTransition () {
    state.practice.completed = true;
    state.practice.completed_at = nowISO();
    state.practice.summary = summarizePracticeLog();
    logEvent('practice_complete', state.practice.summary);
    updatePracticeSummary();
    showStage('stage-transition');
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
    announceForScreenReader(state.lang === 'ja'
      ? '練習問題 ' + (idx + 1) + ' / 4'
      : 'Practice trial ' + (idx + 1) + ' of 4');

    presentStimulus(cacheBustedAssetPath('audio/practice/' + item.stimuli), item.targetword, (signal) => {
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
          audio_playback_rate: audioPlaybackRate(),
          audio_failed: true
        });
        state.practice.currentIndex++;
        if (state.practice.currentIndex < state.practice.items.length) {
          showPracticeItem();
        } else {
          completePracticeAndTransition();
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
      response_window_ms: d.response_window_ms || responseWindowMs(),
      audio_playback_rate: audioPlaybackRate()
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

    waitForTrialAdvance(() => {
      state.practice.currentIndex++;
      if (state.practice.currentIndex < state.practice.items.length) {
        showPracticeItem();
      } else {
        completePracticeAndTransition();
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
    announceForScreenReader(state.lang === 'ja' ? '本試行を開始します' : 'Main test starting');
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
    if (n >= state.params.max_items) return { stop: true, reason: 'max_items' };
    if (n === 0) return { stop: false };
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
    if (n === 0 || n < state.params.min_items || !sel || !Number.isFinite(sel.info)) {
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

    const it = state.delivery === 'adaptive'
      ? state.adaptiveItems[sel.index]
      : (state.mode === '1F'
          ? state.calibration.item_bank_1f[sel.index]
          : state.calibration.item_bank_2f[sel.index]);
    state.currentTrialContext = {
      phase: 'main',
      step: state.cat.usedCount() + 1,
      item_id: it.item_id || mkItemId(it),
      targetword: it.targetword,
      condition: it.condition || ''
    };

    // Progress indicator with median estimate. Median = 20 items: this matches
    // the PSER ~ 20-item average reported by Morris et al. (2020) for
    // stop_pser = 0.01 (the LJT-CAT default). Once the actual length exceeds
    // the median we drop the "/ ~ m" suffix to avoid misleading the
    // participant ("question 25 / approximately 20").
    const trialN = state.cat.usedCount() + 1;
    const MAIN_MEDIAN_LENGTH = 20;
    if (trialN <= MAIN_MEDIAN_LENGTH) {
      $('trial-counter').textContent = t('questionCounterEstimated', {
        n: trialN, median: MAIN_MEDIAN_LENGTH
      });
    } else {
      $('trial-counter').textContent = t('questionCounter', { n: trialN });
    }
    announceForScreenReader(t('questionCounterEstimated', {
      n: trialN, median: MAIN_MEDIAN_LENGTH
    }));
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

    presentStimulus(cacheBustedAssetPath('audio/main/' + it.stimuli), it.targetword, (skipSignal) => {
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
        response_window_ms: responseWindowMs(),
        audio_playback_rate: audioPlaybackRate()
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
      response_window_ms: d.response_window_ms || responseWindowMs(),
      audio_playback_rate: audioPlaybackRate()
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

    // Crash-recovery snapshot: every 5th committed main response. Sync write,
    // wrapped so a localStorage failure (quota, private mode) cannot break the
    // trial loop.
    const committedCount = state.cat.usedCount();
    if (committedCount > 0 && committedCount % 5 === 0) {
      try { snapshotPartialSession(); } catch (e) { /* swallow */ }
    }

    // Audio prefetch: warm the network cache for an item that is likely to be
    // selected next. We can't safely call selectNext() (it would mutate CAT
    // state); instead we look at the next-best candidate from the unused pool
    // by simulating a tiny peek. As a robust fallback, we just preload the
    // adaptive item with the highest information at the current theta among
    // unused items (best-effort; misses are harmless).
    try { schedulePrefetchForLikelyNext(); } catch (e) { /* swallow */ }

    waitForTrialAdvance(nextItem, postResponseMs());
  }

  // Best-effort prediction of the next likely item without mutating CAT state.
  // Strategy: ask the CAT engine for a candidate ranking if it exposes a
  // non-mutating peek API; otherwise fall back to "any unused adaptive item"
  // (the cache hit when we eventually load it is still a win).
  function schedulePrefetchForLikelyNext () {
    if (!state.cat || !state.adaptiveItems || !state.adaptiveItems.length) return;
    let candidateIndex = -1;
    if (typeof state.cat.peekNext === 'function') {
      const peek = state.cat.peekNext();
      if (peek && Number.isFinite(peek.index)) candidateIndex = peek.index;
    }
    if (candidateIndex < 0 && typeof state.cat.usedIndices === 'function') {
      const used = state.cat.usedIndices() || [];
      const usedSet = new Set(used);
      for (let i = 0; i < state.adaptiveItems.length; i++) {
        if (!usedSet.has(i)) { candidateIndex = i; break; }
      }
    }
    if (candidateIndex < 0) return;
    const it = state.adaptiveItems[candidateIndex];
    if (!it || !it.stimuli) return;
    prefetchAudio(cacheBustedAssetPath('audio/main/' + it.stimuli));
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
   *
   * If `ntThresholdMs` is provided (>0), trials with rt_ms < ntThresholdMs
   * are filtered out (Wise & DeMars 2006 effort-moderated scoring).
   * The filtered output is auxiliary; the live CAT engine still uses
   * unfiltered responses, and the calibration (`mod_hit.rds` / `mod_cr.rds`)
   * was fitted on RT in [200, 10000] ms (no rapid-guess removal). Therefore
   * NT-filtered scores are a "naive-calibration + filtered-scoring" hybrid;
   * see README §Auxiliary NT-filtered scoring for rationale.
   */
  function perConditionScore (catLog, ntThresholdMs) {
    const hitBank = state.calibration.item_bank_hit;
    const crBank  = state.calibration.item_bank_cr;
    const hitItemsWithIds = hitBank.map(it => ({
      item_id:    it.targetword,
      a: it.a, b: it.b, targetword: it.targetword
    }));
    const crItemsWithIds = crBank.map(it => ({
      item_id:    it.targetword,
      a: it.a, b: it.b, targetword: it.targetword
    }));

    const useNT = Number.isFinite(ntThresholdMs) && ntThresholdMs > 0;
    const hitResp = {}, crResp = {};
    let nFlaggedHit = 0, nFlaggedCR = 0;
    let nValidHit = 0,   nValidCR = 0;
    catLog.forEach(row => {
      if (row.correct !== 0 && row.correct !== 1) return;
      const flagged = useNT &&
                      Number.isFinite(row.rt_ms) &&
                      row.rt_ms < ntThresholdMs;
      if (row.condition === 'Hit') {
        if (flagged) nFlaggedHit++; else { hitResp[row.targetword] = row.correct; nValidHit++; }
      } else {
        if (flagged) nFlaggedCR++; else { crResp[row.targetword]  = row.correct; nValidCR++; }
      }
    });

    const hitScore = window.CAT1F.scoreSubset(hitItemsWithIds, hitResp, thetaGrid1DOptions());
    const crScore  = window.CAT1F.scoreSubset(crItemsWithIds,  crResp, thetaGrid1DOptions());
    return {
      hit: hitScore, cr: crScore,
      n_flagged_hit: nFlaggedHit, n_flagged_cr: nFlaggedCR,
      n_valid_hit: nValidHit,     n_valid_cr: nValidCR
    };
  }

  function scorePostHoc2F (catLog, ntThresholdMs) {
    const rho = state.calibration.regression.factor_cor_2F;
    const items2F = state.calibration.item_bank_2f.map(it => ({
      item_id: it.item_id,
      a1: it.a1,
      a2: it.a2,
      d: it.d
    }));
    const useNT = Number.isFinite(ntThresholdMs) && ntThresholdMs > 0;
    const responses = {};
    catLog.forEach(row => {
      if (row.correct !== 0 && row.correct !== 1) return;
      const flagged = useNT &&
                      Number.isFinite(row.rt_ms) &&
                      row.rt_ms < ntThresholdMs;
      if (!flagged) responses[row.item_id] = row.correct;
    });
    return window.CAT2F.scoreSubset(items2F, responses, rho, thetaGrid2DOptions());
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
    const thetaGapFlag = thetaGap !== null ? thetaGap > 1 : null;
    const allYesFlag = answered.length > 0 && nYes === answered.length;
    const allNoFlag = answered.length > 0 && nNo === answered.length;
    return {
      theta_gap: thetaGap,
      response_pattern_theta_gap_flag: thetaGapFlag,
      aberrance_theta_gap_flag: thetaGapFlag,
      uniform_yes_flag: allYesFlag,
      uniform_no_flag: allNoFlag,
      all_yes_flag: allYesFlag,
      all_no_flag: allNoFlag,
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
    const adaptiveSource = state.delivery === 'adaptive' ? adaptiveCandidateSource() : null;
    const adaptiveForm = adaptiveSource ? adaptiveSource.form : null;
    return {
      generated_at: nowISO(),
      app_version: APP_VERSION,
      asset_cache_version: ASSET_CACHE_VERSION,
      calibration_version: state.calibration ? (state.calibration.version || 'unknown') : '',
      calibration_hash: state.calibrationHash || '',
      build_timestamp: nowISO(),
      code_loaded_at: CODE_LOADED_AT,
      user_agent: navigator.userAgent || '',
      tz_offset_minutes: new Date().getTimezoneOffset(),
      nt_threshold_ms: state.params.nt_threshold_ms,
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
        audio_playback_rate: audioPlaybackRate(),
        fixation_ms: fixationMs(),
        post_response_ms: postResponseMs(),
        pace: state.params.pace,
        self_paced: isSelfPaced(),
        advance_key: isSelfPaced() ? 'Space' : '',
        max_condition_run: maxConditionRun(),
        keymap_policy: state.params.keymap || 'counterbalanced',
        response_keymap_id: state.responseMapping ? state.responseMapping.keymap_id : ''
      },
      scoring_grid: {
        one_d_eap: {
          theta_min: state.params.theta_min,
          theta_max: state.params.theta_max,
          theta_step: state.params.theta_step,
          theta_points: thetaGrid1DPointCount(),
          role: 'primary theta_hit/theta_cr scoring and adaptive item selection'
        },
        two_f_posthoc: {
          theta_min: state.params.theta2_min,
          theta_max: state.params.theta2_max,
          theta_step: state.params.theta2_step,
          theta_axis_points: thetaGridPoints(
            state.params.theta2_min, state.params.theta2_max, state.params.theta2_step),
          theta_grid_points: thetaGrid2DPointCount(),
          role: 'post-hoc 2F MIRT sensitivity scoring'
        }
      },
      ux: {
        instruction_version: UX_INSTRUCTION_VERSION,
        practice_trial_count: state.practice.items ? state.practice.items.length : 0,
        practice_feedback_visible: true,
        main_feedback_visible: false,
        targetword_spelling_visible_to_participant: false,
        participant_score_visible: false
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
      // Auxiliary NT-filtered scoring config (Wise & Ma 2012; Wise & Kong 2005;
      // Wise & DeMars 2006). Live theta is NOT modified — auxiliary fields
      // theta_*_<NT_TAG> are added to summary alongside the standard naive
      // theta_hit / theta_cr / theta_mirt_*. Calibration was fitted on RT in
      // [200, 10000] ms with NO rapid-guess removal, so these auxiliary scores
      // are explicitly a "naive-calibration + filtered-scoring" hybrid.
      auxiliary_nt_scoring: {
        nt_threshold_ms: state.params.nt_threshold_ms,
        default_threshold_ms: DEFAULTS.nt_threshold_ms,
        scoring_pipeline: 'Wise & DeMars (2006) effort-moderated: trials with rt_ms < nt_threshold_ms excluded from EAP re-scoring',
        rte_definition: 'Wise & Kong (2005): RTE = 1 − (#flagged / #answered) per condition',
        calibration_alignment: 'Hybrid: calibration mod_hit / mod_cr were fitted on RT in [200, 10000] ms WITHOUT rapid-guess removal. Auxiliary NT-filtered scores apply a stricter threshold at scoring time only.',
        affects_live_theta: false,
        affects_stopping_rule: false
      },
      selected_forms: {
        adaptive: adaptiveForm ? adaptiveForm.form_id : ''
      },
      candidate_sets: {
        adaptive: adaptiveSource ? adaptiveSource.candidateSet : ''
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
    const overlapAllowed = state.delivery === 'adaptive' && !adaptiveDisallowWordOverlap();
    add(
      'targetword_overlap',
      overlapAllowed || finalObj.targetword_overlap_count === 0 ? 'ok' : 'error',
      finalObj.targetword_overlap_count,
      overlapAllowed ? 'allowed' : '0',
      overlapAllowed
        ? 'Targetword overlap is allowed in the full-160 adaptive item bank.'
        : 'Hit and CR should not reuse the same targetword in the same session.'
    );
    add(
      'uniform_yes_response_pattern',
      finalObj.uniform_yes_flag ? 'warn' : 'ok',
      finalObj.uniform_yes_flag,
      'false',
      'All responses were Appropriate.'
    );
    add(
      'uniform_no_response_pattern',
      finalObj.uniform_no_flag ? 'warn' : 'ok',
      finalObj.uniform_no_flag,
      'false',
      'All responses were Inappropriate.'
    );
    add(
      'hit_cr_theta_gap',
      Number.isFinite(finalObj.theta_gap) && finalObj.theta_gap > 1 ? 'warn' : 'ok',
      finalObj.theta_gap,
      '<=1',
      'Large Hit/CR theta gap may indicate condition-specific response-pattern misfit.'
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

    // Per-condition scoring (naive: live theta path)
    const coverage = summarizeResponseCoverage(allResponses);
    const per = perConditionScore(allResponses);
    const mirt2f = scorePostHoc2F(allResponses);

    // Auxiliary NT-filtered scoring (Wise & Ma 2012 / Wise & DeMars 2006).
    // Provides theta_*_nt<NNN> alongside the standard naive estimates.
    // Live theta is unaffected. Calibration was fit on RT in [200, 10000] ms
    // without rapid-guess removal, so this is a "naive-calibration + filtered-
    // scoring" hybrid; see README §Auxiliary NT-filtered scoring.
    const NT_MS = state.params.nt_threshold_ms;
    const NT_TAG = 'nt' + Math.round(NT_MS);
    const perFilt   = perConditionScore(allResponses, NT_MS);
    const mirt2fFilt = scorePostHoc2F(allResponses, NT_MS);

    // Per-condition Response Time Effort (Wise & Kong 2005).
    // RTE = 1 - (#flagged / #answered); range [0, 1], 1 = no rapid trials.
    const _rteCount = (cond) => {
      let answered = 0, flagged = 0;
      allResponses.forEach(row => {
        if (row.condition !== cond) return;
        if (row.correct !== 0 && row.correct !== 1) return;
        answered++;
        if (Number.isFinite(row.rt_ms) && row.rt_ms < NT_MS) flagged++;
      });
      return answered > 0 ? 1 - (flagged / answered) : null;
    };
    const rteHit = _rteCount('Hit');
    const rteCR  = _rteCount('CR');

    // Reporting is valid only when both condition-specific posteriors have
    // observed responses. Adaptive no longer has a 40-item stopping floor, but
    // this guard prevents an unobserved condition from silently using the prior
    // theta = 0 / SE = 1 in computeTOEICEstimate().
    const MIN_PER_CONDITION = state.delivery === 'adaptive'
      ? adaptiveReportingMinPerCondition()
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

    // NT-filtered TOEIC estimates: valid only when both filtered conditions
    // retain at least MIN_PER_CONDITION items (otherwise prior leaks in).
    const enoughHitFilt = perFilt.n_valid_hit >= MIN_PER_CONDITION;
    const enoughCRFilt  = perFilt.n_valid_cr  >= MIN_PER_CONDITION;
    const validFiltReport = validForReporting && enoughHitFilt && enoughCRFilt;
    const toeicFilt   = validFiltReport ? computeTOEICEstimate(perFilt) : null;
    const toeic2fFilt = validFiltReport ? computeTOEICEstimate2F(mirt2fFilt) : null;

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
      response_pattern_theta_gap_flag: behavior.response_pattern_theta_gap_flag,
      aberrance_theta_gap_flag: behavior.aberrance_theta_gap_flag,
      uniform_yes_flag:   behavior.uniform_yes_flag,
      uniform_no_flag:    behavior.uniform_no_flag,
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

    // ===== Auxiliary NT-filtered scoring (Wise & Ma 2012) =====
    // Dynamic column tag, e.g. nt350 (default) or nt500 (low-proficiency
    // population, configurable via ?nt_threshold_ms=NNN). Live theta is NOT
    // adjusted; these auxiliary fields let researchers compare naive vs
    // effort-moderated estimates post-hoc. See README §Auxiliary NT-filtered
    // scoring for the calibration-mismatch caveat.
    finalObj.nt_threshold_ms = NT_MS;
    finalObj['theta_hit_' + NT_TAG] =
      (validFiltReport && Number.isFinite(perFilt.hit.theta)) ? round6(perFilt.hit.theta) : null;
    finalObj['se_hit_' + NT_TAG] =
      (validFiltReport && Number.isFinite(perFilt.hit.se))    ? round6(perFilt.hit.se)    : null;
    finalObj['theta_cr_' + NT_TAG] =
      (validFiltReport && Number.isFinite(perFilt.cr.theta))  ? round6(perFilt.cr.theta)  : null;
    finalObj['se_cr_' + NT_TAG] =
      (validFiltReport && Number.isFinite(perFilt.cr.se))     ? round6(perFilt.cr.se)     : null;
    finalObj['theta_mirt_f1_' + NT_TAG] =
      (validFiltReport && Number.isFinite(mirt2fFilt.theta1)) ? round6(mirt2fFilt.theta1) : null;
    finalObj['se_mirt_f1_' + NT_TAG] =
      (validFiltReport && Number.isFinite(mirt2fFilt.se1))    ? round6(mirt2fFilt.se1)    : null;
    finalObj['theta_mirt_f2_' + NT_TAG] =
      (validFiltReport && Number.isFinite(mirt2fFilt.theta2)) ? round6(mirt2fFilt.theta2) : null;
    finalObj['se_mirt_f2_' + NT_TAG] =
      (validFiltReport && Number.isFinite(mirt2fFilt.se2))    ? round6(mirt2fFilt.se2)    : null;
    finalObj['toeic_estimate_' + NT_TAG] =
      toeicFilt ? round2(toeicFilt.estimate) : null;
    finalObj['toeic_estimate_se_' + NT_TAG] =
      toeicFilt ? round2(toeicFilt.se) : null;
    finalObj['toeic_estimate_2f_' + NT_TAG] =
      toeic2fFilt ? round2(toeic2fFilt.estimate) : null;
    finalObj['toeic_estimate_2f_se_' + NT_TAG] =
      toeic2fFilt ? round2(toeic2fFilt.se) : null;
    // RTE (Wise & Kong 2005) and per-condition flag counts
    finalObj.rte_hit = rteHit !== null ? round6(rteHit) : null;
    finalObj.rte_cr  = rteCR  !== null ? round6(rteCR)  : null;
    finalObj.n_flagged_nt_hit = perFilt.n_flagged_hit;
    finalObj.n_flagged_nt_cr  = perFilt.n_flagged_cr;
    finalObj.n_valid_after_nt_hit = perFilt.n_valid_hit;
    finalObj.n_valid_after_nt_cr  = perFilt.n_valid_cr;
    // Status of the auxiliary scoring path
    finalObj.nt_filtered_scoring_status =
      validFiltReport ? 'ok'
        : (!validForReporting ? 'session_invalid'
           : (!enoughHitFilt && !enoughCRFilt ? 'insufficient_both_after_nt'
              : (!enoughHitFilt ? 'insufficient_hit_after_nt'
                                 : 'insufficient_cr_after_nt')));

    // Session meta
    state.session.user_agent = navigator.userAgent;
    state.session.calibration_version = state.calibration.version || 'unknown';
    state.session.calibration_hash = state.calibrationHash || '';
    state.session.app_version = APP_VERSION;
    state.session.asset_cache_version = ASSET_CACHE_VERSION;
    state.session.build_timestamp = nowISO();
    state.session.code_loaded_at = CODE_LOADED_AT;
    state.session.tz_offset_minutes = new Date().getTimezoneOffset();
    state.session.instruction_version = UX_INSTRUCTION_VERSION;
    state.session.language = state.lang;
    state.session.research_mode = state.researchMode;
    state.session.reg = state.calibration.regression.per_condition;
    state.session.reg_2f = state.calibration.regression['2F'];
    state.session.reference_n = refTOEIC.length;
    const adaptiveSource = state.delivery === 'adaptive' ? adaptiveCandidateSource() : null;
    state.session.selected_form_adaptive = adaptiveSource
      ? (adaptiveSource.form ? adaptiveSource.form.form_id : adaptiveSource.candidateSet)
      : '';
    state.session.adaptive_candidate_set = adaptiveSource ? adaptiveSource.candidateSet : '';
    state.session.item_selection_model = state.delivery === 'adaptive'
      ? 'full 160-item per-condition 1D 2PL ' + state.algorithm + ' CAT (mod_hit / mod_cr)'
      : 'legacy combined 1F / 2F research mode';
    state.session.presentation_order_policy = state.delivery === 'adaptive'
      ? state.algorithm + '_random_tie_condition_order_full160'
      : 'model_selected_condition_order';
    state.session.max_condition_run = maxConditionRun();
    state.session.auto_play_audio = autoPlayAudio();
    state.session.audio_playback_rate = audioPlaybackRate();
    state.session.fixation_ms = fixationMs();
    state.session.post_response_ms = postResponseMs();
    state.session.pace = state.params.pace;
    state.session.self_paced = isSelfPaced();
    state.session.advance_key = isSelfPaced() ? 'Space' : '';
    state.session.theta_min = state.params.theta_min;
    state.session.theta_max = state.params.theta_max;
    state.session.theta_step = state.params.theta_step;
    state.session.theta_points = thetaGrid1DPointCount();
    state.session.theta2_min = state.params.theta2_min;
    state.session.theta2_max = state.params.theta2_max;
    state.session.theta2_step = state.params.theta2_step;
    state.session.theta2_axis_points = thetaGridPoints(
      state.params.theta2_min, state.params.theta2_max, state.params.theta2_step);
    state.session.theta2_grid_points = thetaGrid2DPointCount();
    state.session.timing_mode = state.params.timing;
    state.session.response_window_ms = responseWindowMs();
    // NT-filtered auxiliary scoring config (Wise & Ma 2012). Live theta is
    // not affected; theta_*_<NT_TAG> columns are written alongside naive theta_*.
    state.session.nt_threshold_ms = state.params.nt_threshold_ms;
    state.session.nt_tag = NT_TAG;
    state.session.nt_filtered_scoring_status = finalObj.nt_filtered_scoring_status;
    state.session.response_keymap_id = state.responseMapping ? state.responseMapping.keymap_id : '';
    state.session.response_key_appropriate = state.responseMapping
      ? state.responseMapping.appropriate_key
      : '';
    state.session.response_key_inappropriate = state.responseMapping
      ? state.responseMapping.inappropriate_key
      : '';
    state.session.backbone_model = state.delivery === 'adaptive'
      ? 'full160_per_condition_1d_2pl_' + state.algorithm
      : (state.mode === '1F' ? 'combined_1f_2pl' : 'compensatory_2f_mirt');
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
    const safeId = (state.participant.id || 'na')
      .replace(/[^A-Za-z0-9_\-]/g, '_').slice(0, 32);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = 'LJT_result_' + safeId + '_' + ts + '.xlsx';
    state.session.result_filename = filename;
    const fnEl = $('filename-display');
    if (fnEl) fnEl.textContent = t('resultFilename', { filename: filename });
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
        audio_playback_rate: row.audio_playback_rate,
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
    state.practice.summary = summarizePracticeLog();

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
      practice:  Object.assign({}, state.practice),
      final:     finalObj,
      responses: flatResponses,
      item_bank: researchItemRows(),
      cat_trace: catTrace,
      quality_flags: qualityFlags,
      events: state.events.slice(),
      protocol_manifest: protocolManifest
    };

    // Trigger download with auto-retry chain (immediate, +1.5s, +4s, +10s).
    const ds = $('download-status');
    if (ds) ds.textContent = t('savingStatus');
    startResultSaveChain(filename, payload, (ok, exportResult) => {
      const actualFilename = exportResult && exportResult.filename
        ? exportResult.filename
        : filename;
      const usedFallback = !!(exportResult && exportResult.fallback);
      state.session.result_filename = actualFilename;
      payload.session.result_filename = actualFilename;
      if (fnEl) fnEl.textContent = t('resultFilename', { filename: actualFilename });
      if (ok) {
        if (ds) {
          ds.textContent = usedFallback ? t('savedJsonStatus') : t('savedStatus');
          ds.classList.add('done');
        }
        const dlBtn = $('btn-download-again');
        if (dlBtn) {
          dlBtn.classList.remove('hidden');
          dlBtn.onclick = () => {
            if (ds) {
              ds.textContent = t('savingStatus');
              ds.classList.remove('done');
            }
            startResultSaveChain(filename, payload, (ok2) => {
              if (ds) {
                ds.textContent = ok2 ? t('savedStatus') : t('saveFailedActionable');
                if (ok2) ds.classList.add('done');
              }
              announceForScreenReader(ok2
                ? t('savedStatus')
                : t('saveFailedActionable'));
            });
          };
        }
        announceForScreenReader(t('savedStatus'));
        // Snapshot is no longer needed: clear it now that the final file saved.
        clearOwnSnapshot();
      } else {
        if (ds) ds.textContent = t('saveFailedActionable');
        // Keep the snapshot so the participant can retry on next page load.
        announceForScreenReader(t('saveFailedActionable'));
        const dlBtn = $('btn-download-again');
        if (dlBtn) {
          dlBtn.classList.remove('hidden');
          dlBtn.onclick = () => {
            if (ds) {
              ds.textContent = t('savingStatus');
              ds.classList.remove('done');
            }
            startResultSaveChain(filename, payload, (ok2) => {
              if (ds) {
                ds.textContent = ok2 ? t('savedStatus') : t('saveFailedActionable');
                if (ok2) ds.classList.add('done');
              }
              if (ok2) clearOwnSnapshot();
              announceForScreenReader(ok2
                ? t('savedStatus')
                : t('saveFailedActionable'));
            });
          };
        }
      }
    });
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

    // Boot-time UX scaffolding: aria-live announcer and audio prefetch
    // element. Both must exist before showStage so the first stage_change
    // announcement reaches assistive tech.
    ensureSrAnnouncer();
    ensurePrefetchAudioElement();

    // Garbage-collect old session snapshots (older than 7 days) and surface
    // any orphan partial sessions found in localStorage. The recovery banner
    // is displayed BEFORE the welcome page so participants can save lost
    // data from a prior interrupted run.
    if (hasSessionStorageModule()) {
      try {
        if (typeof window.LJTSessionStorage.clearOldSnapshots === 'function') {
          window.LJTSessionStorage.clearOldSnapshots(7);
        }
        const orphans = typeof window.LJTSessionStorage.loadAllSnapshots === 'function'
          ? (window.LJTSessionStorage.loadAllSnapshots() || [])
          : [];
        if (orphans.length > 0) {
          renderOrphanRecoveryBanner(orphans);
        }
      } catch (err) {
        logEvent('orphan_recovery_error', {
          error_message: err && err.message ? err.message : String(err || '')
        });
      }
    }

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
