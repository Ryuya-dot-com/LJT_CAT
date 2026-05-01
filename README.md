# LJT-CAT Web

## 日本語概要

**LJT-CAT Web** は、リスニング形式の語彙意味判断テスト
(*Lexicosemantic Judgement Task Computerized Adaptive Test*) を
ブラウザ上で実施するための静的 Web アプリです。参加者は英語の短い文を聞き、
聞こえた語の使われ方が文脈上「適切」か「不適切」かを判断します。

- 標準入口は `/adaptive/` です。
- 日本語UIと英語UIに対応しています (`?lang=ja` / `?lang=en`)。
- PC 版 Google Chrome での実施を想定しています。
- 結果はセッション終了時に参加者のブラウザから Excel ファイルとして保存されます。
- サーバー側で回答データを収集・保存する仕組みはありません。
- 研究者用パネルは `?research=1` で開けます。
- 項目・正答・項目パラメータは静的ファイルに含まれるため、項目秘匿が必要な
  high-stakes 評価には適しません。

English documentation follows.

---

## English Documentation

Browser-based **Lexicosemantic Judgement Task Computerized Adaptive Test
(LJT-CAT)** for listening research.

The application runs entirely as static HTML, CSS, JavaScript, JSON, and audio
files. It requires no server-side processing. At the end of a session, the
participant’s browser downloads an Excel workbook containing the response log,
scoring output, protocol metadata, and quality-control flags.

Live site:
<https://ryuya-dot-com.github.io/LJT_CAT/>

Methodologically grounded in Bock & Mislevy (1982), Choi et al. (2011),
Morris et al. (2020) - see
[Methodological References](#方法論的参考文献--methodological-references).

---

## Intended Use

This web app is designed for research administration of an adaptive LJT
listening task. It is suitable for controlled data collection where researchers
can instruct participants how to save and return the downloaded result file.

It is not intended for high-stakes assessment requiring item secrecy. The item
bank, correct answers, target words, and item parameters are distributed in
public static files and can be inspected by anyone with access to the site.

---

## Standard Entry Point

Use `/adaptive/` for data collection. The root page `/` checks browser support
and forwards participants to `/adaptive/` while preserving URL parameters.

| URL | Use | Description |
|---|---|---|
| `/` | Participant landing page | Checks desktop Chrome support and forwards to `/adaptive/` |
| `/adaptive/` | Standard test | Blueprint CAT over the full 160-item bank |

Example:

```text
https://ryuya-dot-com.github.io/LJT_CAT/adaptive/
```

---

## Participant Flow

1. Participant opens the assigned URL in desktop Google Chrome.
2. Participant enters the researcher-assigned ID and identifier.
3. Participant reads the task instructions.
4. Participant completes 4 practice trials.
5. Practice summary is shown before the main test.
6. Participant completes the adaptive main test.
7. Browser downloads an Excel result file.
8. Participant shares the downloaded file according to the study protocol.

Participant-facing design choices:

- Target-word spelling is not displayed during the task.
- Audio is played once per trial.
- Responses are made with `F` / `J` according to the displayed mapping.
- Practice trials show feedback; main-test trials do not.
- Main-test scores, theta estimates, item parameters, and TOEIC estimates are
  not shown to the participant.
- The final screen displays the saved filename only.

---

## Trial Procedure

Each trial follows the same presentation sequence:

1. Central fixation cross.
2. Audio playback.
3. Response buttons and key mapping are shown after audio playback.
4. Participant responds “appropriate” or “inappropriate”.
5. The next item starts automatically, unless self-paced mode is enabled.

Default timing:

| Component | Default |
|---|---:|
| Fixation | 500 ms |
| Audio playback | Once, at 1.0x speed |
| Timed response window | 1250 ms after audio offset |
| Post-response delay | 350 ms |
| Practice trials | 4 |

In untimed mode, participants can respond without a response-window timeout.
In self-paced mode, participants advance with Space or the on-screen button.

---

## Response Time Measurement

`rt_ms` is the time from **audio offset** (the moment the HTML5 `<audio>`
element fires its `ended` event) to the participant's response.

Implementation details (for methods sections):

- The clock is `performance.now()`, a high-resolution monotonic timer that
  is unaffected by system clock adjustments.
- The zero point is captured as the **first statement** of the
  `revealTarget()` callback (`js/cat_app.js`), which runs synchronously
  inside the `ended` event handler. No DOM mutation happens before the
  zero point is recorded.
- Residual gap between `ended` and RT 0 is on the order of microseconds
  (a single function call and assignment).
- `rt_ms` is rounded to the nearest millisecond on save.
- `audio_ended_at` is also recorded as a wall-clock (`Date.now()`) field
  for cross-reference, but RT itself is computed entirely in the
  high-resolution monotonic domain.

In timed mode, the response window starts at the same zero point and
expires after `response_window_ms` (default 1250 ms). When the window
expires, the trial is closed with `timed_out: true`, `response: null`,
and `rt_ms` ≈ `response_window_ms` (within the browser's `setTimeout`
scheduling jitter, typically a few milliseconds).

Audio onset and audio duration are also logged (`audio_play_start`,
`audio_play_end`, `audio_duration_ms`) so that any analysis requiring
RT-from-audio-onset can be derived post hoc.

---

## Browser Requirements

Recommended environment:

- Desktop or laptop Google Chrome.
- Screen width of at least 1024 px.
- Headphones or earphones.

Unsupported environments show a browser warning at startup:

- Mobile browsers.
- Safari.
- Firefox.
- Edge.
- Opera.
- iOS Chrome.

The browser check is intentionally conservative because the task depends on
reliable audio playback, keyboard input, local file download, and timing logs.

---

## Adaptive CAT Design

The standard test uses a per-condition 1D 2PL adaptive design.

| Component | Value |
|---|---:|
| Candidate items | 160 |
| Hit items | 80 |
| CR items | 80 |
| Default algorithm | `blueprint` |
| Default stop rule | `blueprint_pser` |
| Default minimum item floor | 0 |
| Default maximum items | 160 |
| Reporting minimum | 5 answered Hit + 5 answered CR |

Definitions:

- **Hit**: an appropriate-context item.
- **CR**: an inappropriate-context item.
- **Blueprint CAT**: maintains condition-aware item selection using separate
  Hit and CR posteriors and the per-condition item banks.
- **PSER**: predicted standard error reduction. The session may stop when the
  predicted improvement from another item falls below `stop_pser`.

The same target word may appear in both Hit and CR contexts. This is allowed in
the adaptive item bank and the overlap count is written to the output workbook.

---

## Scoring Model

Live item selection and primary scoring use the per-condition 1D 2PL
calibrations.

| Purpose | Source in `calibration.json` | Role |
|---|---|---|
| Hit item selection | `item_bank_hit` | Fisher information at the current Hit theta |
| CR item selection | `item_bank_cr` | Fisher information at the current CR theta |
| Final Hit score | `item_bank_hit` | `theta_hit`, `se_hit` |
| Final CR score | `item_bank_cr` | `theta_cr`, `se_cr` |
| Post-hoc 2F scoring | `item_bank_2f` | `theta_mirt_f1`, `theta_mirt_f2` |
| TOEIC estimate | `regression.per_condition` | Estimate from `theta_hit` and `theta_cr` |

Primary reported scores:

- `theta_hit`
- `theta_cr`
- `toeic_estimate`

The 2F MIRT output is exported for sensitivity analysis only. It is not used for
live item selection or stopping.

The primary 1D EAP grid defaults to `[-6, 6]` with step `0.01`. The post-hoc 2F
MIRT grid defaults to `[-4, 4] x [-4, 4]` with step `0.1`.

---

## Stopping Rules

Supported stop rules:

| Stop rule | Meaning |
|---|---|
| `blueprint_pser` | Default. Stop when blueprint-aware predicted SE reduction is below `stop_pser` |
| `pser` | Stop when predicted SE reduction is below `stop_pser` |
| `se` | Stop when precision reaches `target_se` |
| `max_items` | Stop only at `max_items` or bank exhaustion |

The default setup has no mandatory minimum item count. For research designs that
need a lower bound, set `min_items` explicitly in the URL.

Examples:

```text
https://ryuya-dot-com.github.io/LJT_CAT/adaptive/?min_items=20&max_items=160
https://ryuya-dot-com.github.io/LJT_CAT/adaptive/?stop_rule=se&target_se=0.30
https://ryuya-dot-com.github.io/LJT_CAT/adaptive/?stop_rule=max_items&max_items=80
```

---

## URL Parameters

### Administration

| Parameter | Default | Meaning |
|---|---:|---|
| `lang` | `ja` | UI language: `ja` or `en` |
| `lab` | empty | Lab code written to filename and metadata |
| `timing` | `timed` | `timed` or `untimed` |
| `response_window_ms` | `1250` | Response window after audio offset in timed mode |
| `keymap` | `counterbalanced` | `counterbalanced`, `f_appropriate`, or `j_appropriate` |
| `auto_play_audio` | `1` | Whether audio starts automatically |
| `audio_rate` | `1.0` | Audio playback rate |
| `fixation_ms` | `500` | Fixation duration before audio playback |
| `post_response_ms` | `350` | Delay before the next item in auto-paced mode |
| `pace` | `auto` | `auto` or `self` |
| `self_paced` | unset | Backward-compatible alias for `pace=self` when set to `1` |
| `max_condition_run` | `2` | Maximum consecutive items from the same condition |
| `max_play_fails` | `3` | Audio failure skip threshold |
| `nt_threshold_ms` | `350` | Normative-threshold flag for auxiliary rapid-guessing analysis |

### Adaptive CAT

| Parameter | Default | Meaning |
|---|---:|---|
| `algorithm` | `blueprint` | `blueprint`, `alternating`, or `quota` |
| `stop_rule` | `blueprint_pser` | `blueprint_pser`, `pser`, `se`, or `max_items` |
| `min_items` | `0` | Minimum administered items before adaptive stopping can apply |
| `max_items` | `160` | Maximum administered items |
| `target_se` | `0.30` | Target SE when `stop_rule=se` |
| `stop_pser` | `0.01` | Predicted SE reduction threshold |
| `quota_tol` | `0.20` | Hit-ratio tolerance for quota CAT |

### EAP Grid

| Parameter | Default | Meaning |
|---|---:|---|
| `theta_min` | `-6` | Minimum 1D theta grid value |
| `theta_max` | `6` | Maximum 1D theta grid value |
| `theta_step` | `0.01` | 1D theta grid step |
| `theta2_min` | `-4` | Minimum 2F theta axis value |
| `theta2_max` | `4` | Maximum 2F theta axis value |
| `theta2_step` | `0.1` | 2F theta axis step |

### Example URLs

```text
https://ryuya-dot-com.github.io/LJT_CAT/adaptive/
https://ryuya-dot-com.github.io/LJT_CAT/adaptive/?lang=en
https://ryuya-dot-com.github.io/LJT_CAT/adaptive/?lab=YOUR_LAB_CODE
https://ryuya-dot-com.github.io/LJT_CAT/adaptive/?timing=untimed&pace=self
https://ryuya-dot-com.github.io/LJT_CAT/adaptive/?max_items=80
https://ryuya-dot-com.github.io/LJT_CAT/adaptive/?stop_rule=se&target_se=0.30
https://ryuya-dot-com.github.io/LJT_CAT/adaptive/?nt_threshold_ms=500
```

---

## Researcher Panel

Append `?research=1` to open the researcher panel:

```text
https://ryuya-dot-com.github.io/LJT_CAT/adaptive/?research=1
```

The panel is intended for protocol preparation and audit. It is not shown in
normal participant sessions.

The panel displays:

- Candidate item bank.
- Target words.
- Conditions.
- Correct answers.
- Audio filenames.
- Item discrimination `a`.
- Item difficulty `b`.
- Current protocol settings.
- Generated participant URL.

Researchers can configure:

- Timed or untimed administration.
- Response window.
- Audio autoplay.
- Audio playback rate.
- Fixation duration.
- Post-response delay.
- Auto-paced or self-paced progression.
- Maximum same-condition run length.
- Audio failure threshold.
- `F` / `J` key mapping.
- Adaptive algorithm.
- Stop rule.
- Minimum and maximum item counts.
- EAP grid settings.

The generated participant URL preserves these settings. The same settings are
also written to the Excel workbook in `protocol_manifest` and `metadata`.

The panel groups long content into collapsible subsections (HTML
`<details>`/`<summary>`) so that the candidate item bank, protocol
settings, and methodological references can be expanded or hidden
individually. Each reference in the panel is rendered with a clickable
DOI link and is grouped by design component (estimation, stopping
rules, general CAT theory) to mirror the README's
[Methodological References](#方法論的参考文献--methodological-references)
section.

---

## Recommended Study Setup

1. Open `/adaptive/?research=1`.
2. Set the intended protocol parameters.
3. Confirm the candidate bank and timing settings.
4. Copy the generated participant URL.
5. Distribute that URL to participants.
6. Instruct participants to use desktop Chrome and headphones.
7. Instruct participants how to return the downloaded `.xlsx` file.
8. Check `quality_flags`, `summary`, and `protocol_manifest` before analysis.

For multi-site studies, use `lab=<lab_code>` so filenames and metadata can be
grouped by site or study arm.

---

## Output Workbook

At the end of the session, the app downloads:

```text
LJT_result_{participant_id}_{YYYY-MM-DDTHH-MM-SS}.xlsx
```

If Excel export fails in the browser, the same payload is downloaded as JSON.

Workbook sheets:

| Sheet | Contents |
|---|---|
| `summary` | One-row participant/session summary, scoring status, theta estimates, TOEIC estimate, quality flags |
| `responses` | Trial-level responses, correctness, RT, timeout status, key/modality, item parameters |
| `practice` | Practice-trial responses and feedback outcomes |
| `item_bank` | Candidate item bank used by the adaptive session |
| `cat_trace` | Item-selection trace and running theta/SE values |
| `quality_flags` | Reporting validity, condition coverage, overlap, response-pattern and timing checks |
| `events` | Stage changes, audio events, target onset, response events |
| `protocol_manifest` | Full administration protocol and URL-derived settings |
| `metadata` | Compact key-value metadata for downstream auditing |

Important summary fields include:

- `valid_for_reporting`
- `scoring_status`
- `n_answered_items`
- `n_hit_answered`
- `n_cr_answered`
- `theta_hit`
- `theta_cr`
- `se_hit`
- `se_cr`
- `toeic_estimate`
- `targetword_overlap_count`
- `timeout_rate`
- `mouse_response_rate`
- `focus_loss_count`
- `nt_filtered_scoring_status`

---

## クラッシュ回復と自動ダウンロード / Crash Recovery & Auto-Download

LJT-CAT is designed so that incidental browser failures do not lose
participant data.

### Periodic snapshots
During the main test, the partial response payload is written to browser
`localStorage` every 5 trials. The snapshot is cleared once the final
Excel file has saved successfully.

### Crash detection on next launch
When the participant returns to the app after an interrupted session,
LJT-CAT detects the orphan snapshot and offers three actions:

| Action | Behavior |
|---|---|
| Save incomplete data | Triggers an Excel/JSON download of the partial payload. |
| Discard | Removes the snapshot. |
| Skip for now | Keeps the snapshot for later. |

Snapshots older than 7 days are garbage-collected automatically.

### Auto-download retry chain
At session end, the result file is downloaded automatically. If the first
attempt fails, the app retries after 1.5 s, 4 s, and finally 10 s with a
JSON-only fallback. Each attempt logs a `result_save_attempt` event.

---

## Quality-Control Flags

`quality_flags` is designed for quick screening before statistical analysis.
Typical checks include:

- Whether the session is valid for reporting.
- Whether both Hit and CR conditions have enough answered items.
- Whether target-word overlap occurred.
- Whether all responses were “appropriate” or all were “inappropriate”.
- Whether the Hit/CR theta gap is unusually large.
- Whether the timeout rate is high.
- Whether many responses were made with the mouse instead of the keyboard.
- Whether the browser window lost focus during the test.
- Whether audio failures occurred.

Adaptive sessions can stop early. A short session is not automatically invalid,
but the exported reporting flag requires sufficient condition coverage.

---

## 統計的品質コントロール / Statistical Quality Controls

`quality_flags` に加えて、LJT-CAT は IRT ベースの統計的品質指標を
セッション終了時に計算し、Excel ワークブックの `summary` シートおよび
`cat_trace` シートに書き出します。これらは事後的なスクリーニング、
報告基準の設定、再現性の担保を目的としたものです。

In addition to the heuristic checks listed under `quality_flags`, LJT-CAT
computes IRT-based statistical quality indicators at session finalize
and writes them to the `summary` and `cat_trace` sheets of the Excel
workbook. They are intended for post-hoc screening, reporting-threshold
decisions, and reproducibility.

- **Person-fit statistics (lz, lz\*) per condition.** Standardised
  log-likelihood person-fit indices are computed separately for the
  Hit and CR conditions following Drasgow, Levine, and Williams (1985)
  for `lz` and Snijders (2001) for `lz*` (the asymptotically corrected
  variant for short and adaptively administered tests). Extreme
  values flag response patterns that are inconsistent with the
  estimated theta under the per-condition 2PL model.
- **Posterior boundary diagnostic.** A flag is raised when more than
  1% of the EAP posterior mass lies at the edges of the theta grid,
  indicating that the default `[-6, 6]` grid may be too narrow for
  the participant. The diagnostic uses the same Bock and Mislevy (1982)
  EAP-on-grid quadrature as live scoring.
- **Calibration hash.** A content hash of `data/calibration.json`
  computed at load time is written to `metadata` so that any session
  can be matched to the exact item-parameter set used to score it.

These indicators are reported alongside the existing
`valid_for_reporting`, `scoring_status`, and timing flags. They do
not change live item selection, scoring, or stopping decisions.

---

## Auxiliary NT-Filtered Scoring

The live CAT score is the naive score:

- All answered trials update the live posterior.
- Live theta and stopping decisions are not changed by the NT filter.

For post-hoc sensitivity analysis, trials with
`rt_ms < nt_threshold_ms` are flagged and excluded from auxiliary rescoring.
The output includes columns such as:

- `theta_hit_nt350`
- `theta_cr_nt350`
- `theta_mirt_f1_nt350`
- `theta_mirt_f2_nt350`
- `toeic_estimate_nt350`
- `rte_hit`
- `rte_cr`
- `n_flagged_nt_hit`
- `n_flagged_nt_cr`

If a different threshold is set, the column tag changes accordingly. For example,
`?nt_threshold_ms=500` creates `*_nt500` columns.

This auxiliary path is intended to support rapid-guessing sensitivity checks in
the spirit of response-time effort and effort-moderated scoring. It should be
reported as a post-hoc sensitivity analysis, not as the live CAT score.

---

## Data Handling and Ethics

The application is a static client-side test. It does not upload participant
responses to a server. The result file is saved locally by the participant and
must be shared according to the researcher’s study protocol.

Result files can contain:

- Participant ID.
- Participant identifier entered on the start screen.
- Trial-level responses.
- Response times.
- Correctness.
- Timeout status.
- Audio playback metadata.
- Focus-loss events.
- Item parameters.
- Protocol URL and URL-derived settings.

Use study IDs rather than names whenever possible. Consent and ethics materials
should describe what is saved, where it is stored, who receives it, and how it
will be protected.

Because the public deployment contains the item bank and correct answers, do not
use this site for assessments where item exposure would compromise validity.

---

## Calibration Data

`data/calibration.json` is generated from the analysis pipeline rather than
estimated in the browser. If calibration models are updated, regenerate the JSON
before publishing a new version of the web app.

The browser app expects:

- `item_bank_hit`: 80 Hit items.
- `item_bank_cr`: 80 CR items.
- `item_bank_1f`: 160 combined 1F items.
- `item_bank_2f`: 160 2F MIRT items.
- `reference_theta`: reference theta distributions.
- `reference_predicted_toeic`: reference predicted TOEIC distribution.
- `regression.per_condition`: TOEIC regression from `theta_hit` and `theta_cr`.

The app also reads:

- `data/stimuli_list.json`
- `data/practice_items.json`
- `audio/main/*.wav`
- `audio/practice/*.wav`

The current public asset set contains 160 main audio files and 4 practice audio
files.

---

## Deployment

The app can be served directly by GitHub Pages or any static file server.

Repository layout:

```text
LJT_CAT/
├── .nojekyll
├── index.html
├── adaptive/
│   ├── index.html
│   └── config.js
├── assets/
│   └── styles.css
├── js/
│   ├── cat_1f.js
│   ├── cat_2f.js
│   ├── cat_app.js
│   └── xlsx_export.js
├── lib/
│   └── xlsx.full.min.js
├── data/
│   ├── calibration.json
│   ├── stimuli_list.json
│   └── practice_items.json
└── audio/
    ├── main/
    └── practice/
```

The `.nojekyll` file is included so that GitHub Pages serves all static assets
without Jekyll processing.

---

## 方法論的参考文献 / Methodological References

LJT-CAT の実装は、CAT(Computerized Adaptive Testing)および IRT(Item Response Theory)
の確立された方法論に基づいています。以下に、推定・項目選択・停止規則・努力モデレーション
スコアリングなど、本ツールの設計の根拠となった主要文献をテーマ別に示します。

The LJT-CAT implementation is grounded in established CAT and IRT methodology.
The references below are grouped by the design component they inform: EAP
estimation, the PSER stopping rule, general CAT theory, vocabulary CAT
applications in EFL contexts, and rapid-guessing / effort-moderated scoring.

### EAP estimation and quadrature

- Bock, R. D., & Mislevy, R. J. (1982). Adaptive EAP estimation of ability in a microcomputer environment. *Applied Psychological Measurement*, *6*(4), 431–444. https://doi.org/10.1177/014662168200600405
  - Foundation of the EAP-on-grid estimator and the quadrature formulas used in `cat_1f.js` and `cat_2f.js` (theta in [-6, 6], step 0.01, N(0, 1) prior).

### PSER stopping rule

- Choi, S. W., Grady, M. W., & Dodd, B. G. (2011). A new stopping rule for computerized adaptive testing. *Educational and Psychological Measurement*, *71*(1), 37–53. https://doi.org/10.1177/0013164410387338
  - Original specification of the PSER (predicted standard error reduction) stopping rule that LJT-CAT uses by default via `blueprint_pser`.

- Morris, S. B., Bass, M., Howard, E., & Neapolitan, R. E. (2020). Stopping rules for computer adaptive testing when item banks have nonuniform information. *International Journal of Testing*, *20*(2), 146–168. https://doi.org/10.1080/15305058.2019.1635604
  - PSER tuning guidance for item banks with nonuniform information; basis for the LJT-CAT default `stop_pser = 0.01` (~20 items on average) and the alternative threshold guidance in the researcher panel.

### CAT theory and general references

- Babcock, B., & Weiss, D. J. (2009). Termination criteria in computerized adaptive testing: Variations on a theme of variance. *Proceedings of the 2009 GMAC Conference on Computerized Adaptive Testing*.
  - Comparative analysis of CAT termination criteria informing LJT-CAT's choice between fixed-length, SE-based, and PSER-based stop rules.

- van der Linden, W. J., & Glas, C. A. W. (Eds.). (2010). *Elements of adaptive testing*. Springer. https://doi.org/10.1007/978-0-387-85461-8
  - Reference handbook for adaptive testing components (item selection, exposure control, content balancing) underlying the blueprint-constrained selection logic.

- Wainer, H., Dorans, N. J., Eignor, D., Flaugher, R., Green, B. F., Mislevy, R. J., Steinberg, L., & Thissen, D. (2000). *Computerized adaptive testing: A primer* (2nd ed.). Lawrence Erlbaum.
  - Canonical primer providing the overall CAT design rationale (item bank calibration, adaptive item selection, scoring) followed by LJT-CAT.

- Weiss, D. J. (1982). Improving measurement quality and efficiency with adaptive testing. *Applied Psychological Measurement*, *6*(4), 473–492. https://doi.org/10.1177/014662168200600401
  - Theoretical justification for using maximum Fisher information item selection to improve measurement precision and efficiency.

### Vocabulary CAT applications (EFL context)

- Aviad-Levitzky, T., Laufer, B., & Goldstein, Z. (2019). The new computer adaptive test of size and strength (CATSS): Development and validation. *Language Assessment Quarterly*, *16*(3), 345–368. https://doi.org/10.1080/15434303.2019.1649409
  - Demonstrates CAT-based vocabulary assessment combining size and strength dimensions, informing LJT-CAT's lexicosemantic judgement framing.

- Mizumoto, A., Sasao, Y., & Webb, S. (2019). Developing and evaluating a computerized adaptive testing version of the Word Part Levels Test. *Language Testing*, *36*(1), 101–123. https://doi.org/10.1177/0265532217725776
  - Practical reference for CAT-based vocabulary testing with Japanese EFL learners; methodological precedent for LJT-CAT's target population and design.

- Tseng, W.-T. (2016). Measuring English vocabulary size via computerized adaptive testing. *Computers & Education*, *97*, 69–85. https://doi.org/10.1016/j.compedu.2016.02.018
  - Empirical demonstration of CAT efficiency for L2 vocabulary size estimation, supporting LJT-CAT's expectation of substantial item-count reduction relative to fixed-form testing.

### Rapid-guessing and effort-moderated scoring

- Wise, S. L., & DeMars, C. E. (2006). An application of item response time: The effort-moderated IRT model. *Journal of Educational Measurement*, *43*(1), 19–38. https://doi.org/10.1207/s15324818ame1901_2
  - Effort-moderated IRT scoring framework underlying LJT-CAT's optional post-hoc rescoring that flags rapid-guessing responses.

- Wise, S. L., & Kong, X. (2005). Response time effort: A new measure of examinee motivation in computer-based tests. *Applied Measurement in Education*, *18*(2), 163–183. https://doi.org/10.1207/s15324818ame1802_2
  - Defines response time effort (RTE), the conceptual basis for LJT-CAT's rapid-guessing detection.

- Wise, S. L., & Ma, L. (2012, April). Setting response time thresholds for a CAT item pool: The normative threshold method. Paper presented at the *Annual Meeting of the National Council on Measurement in Education*, Vancouver, Canada.
  - Source of the normative threshold (NT) method; basis for LJT-CAT's default rapid-guessing threshold of NT = 350 ms.

---

## 再現性 / Reproducibility

LJT-CAT のセッション出力は、実装バージョンと項目パラメータの
セットを一意に特定できるように設計されています。論文・報告書で
本ツールを用いる場合は、以下の値をメソッドセクションまたは
補足資料に記載することを推奨します。

LJT-CAT session output is designed so that the running implementation
and the exact item-parameter set can be identified unambiguously. When
publishing or reporting analyses based on this tool, we recommend
including the following fields from the Excel `metadata` sheet:

- `app_version` - the LJT-CAT Web release version (semantic version,
  e.g. `2.8.2`).
- `asset_cache_version` - the static-asset cache key used by the
  deployment, which pins the JavaScript, CSS, and audio bundle.
- `calibration_hash` - a content hash of `data/calibration.json` at
  the time the session ran. Two sessions with the same
  `calibration_hash` were scored against bit-identical item parameters.

For multi-site or longitudinal studies, archiving these three values
alongside the raw `.xlsx` files is sufficient to reproduce scoring
exactly, even after the public deployment is updated.

A human-readable history of changes per release is maintained in
[CHANGELOG.md](CHANGELOG.md), which follows the
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format and
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## アクセシビリティ / Accessibility

LJT-CAT includes WCAG 2.2-aware features:

- `:focus-visible` outline on all interactive controls (SC 2.4.7).
- Skip-to-main link revealed on keyboard focus.
- `aria-live="polite"` announcer (`#sr-announcer`) for phase changes.
- `@media (prefers-reduced-motion: reduce)` disables transitions and
  animations per OS preference.
- Color contrast: text/background pairs audited against the SC 1.4.3
  4.5:1 minimum.

These features do not change live measurement; they only affect
presentation.

---

## ライセンス / License

LJT-CAT Web は **コードと素材で別ライセンス** を採用しています。
LJT-CAT Web is distributed under **two licenses**: one for code and one for
research materials.

| Component | License | Coverage |
|---|---|---|
| **コード / Code** | [MIT License](LICENSE) | All JavaScript, CSS, HTML, Node.js test files, and documentation in this repository |
| **素材 / Materials** | [CC BY-NC 4.0](LICENSE-MATERIALS.md) | All audio files under `audio/` and all JSON data files under `data/` (item calibration, stimulus metadata) |

The MIT-licensed code may be reused freely, including in commercial projects.
The CC BY-NC 4.0 materials require attribution and **may not be used for
commercial purposes** without an explicit licensing arrangement with the
maintainers — see `LICENSE-MATERIALS.md` for the rationale (calibrated IRT
parameters are population-specific) and recommended attribution.

The bundled `lib/xlsx.full.min.js` (SheetJS Community Edition) is distributed
under the Apache License 2.0 by its original authors.

## Citation

When publishing research that uses LJT-CAT, please cite:

> Komuro, R. (2026). *LJT-CAT Web: A computerized adaptive listening
> vocabulary test.* GitHub repository.
> https://github.com/Ryuya-dot-com/LJT_CAT
