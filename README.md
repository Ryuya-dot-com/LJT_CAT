# LJT-CAT Web — 語彙意味判断テスト

Chrome / PC 前提の静的 HTML + vanilla JavaScript で動作する
**Lexicosemantic Judgement Task (LJT)** のブラウザ完結型実装です。
結果は終了時に Excel (`.xlsx`) として自動保存されます。

デプロイ先: <https://github.com/Ryuya-dot-com/LJT_CAT>

---

## 標準運用

レポート上で plain Mixed CAT は失敗ベースラインとして扱い、固定40問版は
比較・バックアップ用に残しています。公開用の標準入口は `/adaptive/` です。

| URL | 用途 | 出題 |
|---|---|---|
| `/adaptive/` | 標準運用 | 全160項目の item bank から選ぶ blueprint CAT。40問の停止フロアは置かず、最大160問まで PSER / SE / max_items で停止 |
| `/fixed40/` | 比較・バックアップ用 | 固定40問。単語重複なしの Hit 20問 + CR 20問を制約付きランダム順で出題。必要な場合のみ直接URLで指定 |

ルート `/` はCAT版への入口です。固定40問版と旧来の plain max-info Mixed CAT は
標準入口からは起動しません。

---

## 主な機能

- **固定40問バランス短縮版**: per-condition 1D 2PL (`mod_hit`, `mod_cr`) に基づく
  D-study 最良構成を使用。Hit 20問・CR 20問、かつ targetword 重複なし
- **提示順制御**:
  - Hit/CR の条件順はセッションごとに制約付きランダム化
  - 同一条件の連続提示は最大2問まで
  - 完全な Hit/CR 交互順には固定しないため、Yes/No の機械的パターン学習を避ける
- **Blueprint / Alternating / Quota CAT**:
  - `algorithm=blueprint` デフォルト。Adaptive 版は `item_bank_hit` 80問 + `item_bank_cr` 80問の全160項目を候補にする
  - 40問の最低出題数は設けず、各ステップで PSER 停止を評価し、最大 160問 (Hit 80問・CR 80問)
  - `algorithm=alternating` / `algorithm=quota` は比較検証用
  - Adaptive 版では同一 targetword の Hit / CR 両項目も候補として許可し、重複数は Excel に記録
- **停止則**:
  - 固定40問版は常に40問
  - Adaptive 版は `stop_rule=blueprint_pser` デフォルト
  - `stop_rule=se` または `stop_rule=max_items` も指定可能
- 練習4問 + 本試行
  - 練習前に、音声は1回だけ再生されること、targetword のスペルは表示されないこと、
    「適切」「不適切」の判断基準、`F` / `J` キー割り当てを明示
  - 練習終了後に正答数、回答数、タイムアウト、音声再生失敗数の要約を表示してから本試行へ進む
- 提示手順:
  - 中央注視点 (`+`) 500 ms
  - 音声を自動で1回再生
  - 音声終了後に回答ボタンを表示 (targetword のスペルは受験者画面に表示しない)
  - `F` / `J` キーで「適切」「不適切」を判断
- Timed / Untimed:
  - デフォルトは Timed
  - Timed は sentence-embedded lexical-semantic decision 研究で使われた
    反応時間枠に合わせ、音声終了後の回答ボタン表示から 1,250 ms で未回答扱い
  - Untimed は `?timing=untimed` で指定
- UI 表示言語は日本語 / 英語を選択可能。URL では `?lang=ja` / `?lang=en`
- 研究用確認パネルは `?research=1` のときだけ表示
  - 提示語 / 候補語、Timed の制限時間、項目弁別力 `a`、困難度 `b` を確認可能
  - 実施モード、Timed / Untimed、反応時間枠、音声自動再生、注視点、回答後待機時間、同一条件の最大連続数、キー割当などを研究者が設定し、参加者用URLへ反映可能
- `F` / `J` の適切・不適切割り当ては参加者ごとにカウンターバランス
- 応答時間、応答キー、応答モダリティ、時間切れ、音声終了時刻、項目パラメータ、running θ / SE を記録
- Excel 自動ダウンロード
  (`summary` / `responses` / `practice` / `item_bank` / `cat_trace` / `quality_flags` / `events` / `protocol_manifest` / `metadata`)
- all-Yes / all-No、Hit/CR θ 差、targetword 重複数、中央値RT、条件別RT、タイムアウト率、マウス回答率、フォーカス離脱数などの反応異常フラグを出力
- ユーザー画面には推定値・内部モデル情報を表示せず、Excel にのみ保存

---

## 参加者UI/UXと出力方針

- 参加者画面では、リスニング課題としての妥当性を優先し、判断対象語のスペル、
  `theta_hit` / `theta_cr`、SE、TOEIC 推定値、項目パラメータを表示しない
- 練習インストラクションは `instruction_version = practice_instructions_20260428` として管理する
  (`app_version = 2.7.0`)
- 練習は採点対象外だが、本試行前の操作確認として、練習後に
  `n_answered`、`n_correct`、正答率、タイムアウト数、音声再生失敗数を画面表示する
- 本試行終了後の画面では、保存された結果ファイル名だけを表示し、スコアや推定値は表示しない
- Excel の `summary` / `metadata` / `protocol_manifest` には、実施時の
  instruction version、練習要約、UI上の表示・非表示方針を保存し、後から実施条件を確認できるようにする

---

## ディレクトリ構成

```text
LJT_CAT/
├── index.html                  # モード選択ページ
├── fixed40/
│   ├── index.html              # 固定40問バランス短縮版
│   └── config.js
├── adaptive/
│   ├── index.html              # Blueprint / Alternating / Quota CAT
│   └── config.js
├── assets/styles.css
├── js/
│   ├── cat_1f.js               # 1D CAT エンジン
│   ├── cat_2f.js               # post-hoc 2F 採点用
│   ├── cat_app.js              # 状態管理・UI・停止則
│   └── xlsx_export.js          # SheetJS Excel 出力
├── lib/xlsx.full.min.js        # SheetJS vendored copy
├── data/
│   ├── calibration.json        # 項目バンク + θ参照分布 + TOEIC回帰
│   ├── stimuli_list.json
│   └── practice_items.json
└── audio/
    ├── main/
    └── practice/
```

---

## 配布URL例

GitHub Pages でリポジトリルートを公開した場合:

```text
https://ryuya-dot-com.github.io/LJT_CAT/
```

参加者・実験者に配布するURL:

- 固定40問バランス短縮版:
  `https://ryuya-dot-com.github.io/LJT_CAT/fixed40/`
- 固定40問 + ラボコード:
  `https://ryuya-dot-com.github.io/LJT_CAT/fixed40/?lab=UCL_Komuro`
- Adaptive デフォルト (Blueprint + PSER):
  `https://ryuya-dot-com.github.io/LJT_CAT/adaptive/`
- Quota CAT:
  `https://ryuya-dot-com.github.io/LJT_CAT/adaptive/?algorithm=quota`
- Adaptive の最大出題数を制限:
  `https://ryuya-dot-com.github.io/LJT_CAT/adaptive/?max_items=80`
- 精度停止:
  `https://ryuya-dot-com.github.io/LJT_CAT/adaptive/?stop_rule=se&target_se=0.30`
- Untimed 実施:
  `https://ryuya-dot-com.github.io/LJT_CAT/fixed40/?timing=untimed`
- Timed 1500 ms 実施:
  `https://ryuya-dot-com.github.io/LJT_CAT/fixed40/?timing=timed&response_window_ms=1500`
- 英語UI:
  `https://ryuya-dot-com.github.io/LJT_CAT/fixed40/?lang=en`
- 研究用確認パネル:
  `https://ryuya-dot-com.github.io/LJT_CAT/adaptive/?research=1`

---

## URL パラメータ

共通:

| パラメータ | 意味 |
|---|---|
| `lab` | 結果ファイル名・metadata に保存するラボコード |
| `max_play_fails` | 音声再生失敗による自動スキップ許容回数 |
| `keymap` | `counterbalanced`, `f_appropriate`, `j_appropriate`。通常は `counterbalanced` |
| `timing` | `timed`, `untimed`。通常は `timed` |
| `response_window_ms` | Timed の反応時間枠。デフォルトは 1250 ms |
| `auto_play_audio` | `1` / `0`。音声を自動再生するか |
| `fixation_ms` | 注視点 `+` の提示時間。デフォルトは 500 ms |
| `post_response_ms` | 回答後、次項目へ進むまでの待機時間。デフォルトは 350 ms |
| `max_condition_run` | Hit または CR の最大連続提示数。デフォルトは 2 |
| `lang` | `ja`, `en`。UI 表示言語 |
| `research` | `1` のとき研究用確認パネルを表示 |

`?research=1` で開くと、研究者用パネルから `timing` と
`response_window_ms` に加え、実施モード、音声自動再生、注視点、
回答後待機時間、同一条件の最大連続数、キー割当などを変更し、
参加者配布用URLを生成できます。
参加者画面ではこの設定は変更できず、実施条件は Excel の
`protocol_manifest` と `metadata` に保存されます。

固定40問版では `min_items` / `max_items` は常に40に固定されます。

Adaptive 版:

| パラメータ | デフォルト | 意味 |
|---|---:|---|
| `algorithm` | `blueprint` | `blueprint`, `alternating`, `quota` |
| `stop_rule` | `blueprint_pser` | `blueprint_pser`, `pser`, `se`, `max_items` |
| `min_items` | 0 | 停止判定前の最小回答数。デフォルトでは40問フロアなし |
| `max_items` | 160 | 最大出題数 |
| `target_se` | 0.30 | `stop_rule=se` の目標SE |
| `stop_pser` | 0.01 | 予測SE低下量がこの値未満なら停止 |
| `quota_tol` | 0.20 | Quota CAT の Hit 比率許容幅 |

任意の下限を検証する場合:

```text
https://ryuya-dot-com.github.io/LJT_CAT/adaptive/?min_items=20&max_items=160
```

Adaptive 選択のまま固定40問として実施したい場合:

```text
https://ryuya-dot-com.github.io/LJT_CAT/adaptive/?min_items=40&max_items=40&stop_rule=max_items
```

---

## キャリブレーション JSON の再生成

`data/calibration.json` は親リポジトリの Quarto 分析成果物から生成します。
分析側の RDS モデルを更新した場合は、Web 配布前に必ず再生成してください。

```bash
Rscript scripts/export_cat_calibration.R
```

この公開リポジトリには、受験者向けWeb配布に必要な静的ファイルのみを含めています。
キャリブレーション再生成用スクリプトと分析用Quartoは、親分析環境側で管理します。

主な出力:

- `item_bank_1f`: 160項目の combined 1F 2PL パラメータ
- `item_bank_2f`: 160項目の 2F MIRT パラメータ
- `item_bank_hit`: Hit 80問の 1D 2PL パラメータ
- `item_bank_cr`: CR 80問の 1D 2PL パラメータ
- `selected_forms.fixed40_disjoint`: 固定40問で使う単語重複なし 20+20 項目セット
- `selected_forms.extended70_disjoint`: 旧 Adaptive 候補プールとして保持している単語重複なし 35+35 項目セット
- `reference_theta`: パーセンタイル計算用 θ 分布
- `regression.per_condition`: `θ_Hit` と `θ_CR` から TOEIC を予測する回帰

---

## 採点モデルの考え方

Web の出題制御と最終採点は分けています。

| 用途 | Web 側で使う情報 | 役割 |
|---|---|---|
| 固定40問の選定 | `selected_forms.fixed40_disjoint` | D-study 最良の単語重複なし 20+20 をそのまま使う |
| Adaptive の候補プール | `item_bank_hit` / `item_bank_cr` | Hit 80問 + CR 80問の全160項目を候補にする |
| Adaptive の項目選択 | `item_bank_hit` / `item_bank_cr` | 条件別 posterior と条件別 Fisher information で次項目を選ぶ |
| Hit の最終採点 | `item_bank_hit` | `theta_hit` / `se_hit` を推定 |
| CR の最終採点 | `item_bank_cr` | `theta_cr` / `se_cr` を推定 |
| post-hoc 2F 採点 | `item_bank_2f` | `theta_mirt_f1` / `theta_mirt_f2` を保存 |
| TOEIC 推定 | `regression.per_condition` | `θ_Hit`, `θ_CR` から推定 |

Adaptive 版は combined 1F を selector として使いません。出題制御も
最終採点も per-condition 1D 2PL (`mod_hit`, `mod_cr`) に揃えています。
最終報告の主指標は `theta_hit`, `theta_cr`, `toeic_estimate` です。

---

## Adaptive CAT の推定値と先行研究上の位置づけ

現在の Adaptive CAT は **MIRT-CAT ではありません**。実施時の候補プール、
項目選択、最終採点はいずれも、適切項目と不適切項目を別々に較正した
per-condition 1D 2PL に基づきます。

- `item_bank_hit`: 適切項目のみで推定した `mod_hit.rds` 由来の 1D 2PL
- `item_bank_cr`: 不適切項目のみで推定した `mod_cr.rds` 由来の 1D 2PL
- `item_bank_2f`: `mod_mirt_comp.rds` 由来の 2F MIRT。Excel に
  `theta_mirt_f1` / `theta_mirt_f2` を保存する post-hoc 感度分析用であり、
  ライブCATの項目選択や主スコアには使わない

CATエンジンは、標準正規事前分布を置いた EAP 推定で条件別 posterior を
逐次更新し、該当条件の 2PL Fisher information が最大の未使用項目を選びます。
停止は `max_items`、`target_se`、または PSER-style の予測SE低減量で判定します。
2PL IRT、EAP/MAP/ML 推定、Fisher information による項目選択、SE / 最大項目数
による停止は CAT の標準的枠組みです。PSER-style 停止については、
Choi, Grady, and Dodd (2011) の predicted standard error reduction 型停止規則を
実装上の近似根拠とします。

実装上の表現は次のように扱います。

> CAT版では、適切項目と不適切項目をそれぞれ独立した1次元2PLモデルで較正し、
> 各条件の2PLパラメータに基づいて適応的に項目を選択する。多次元IRTモデルは
> ライブCATの項目選択には用いず、補助的な post-hoc 分析として扱う。

### 現在の較正値の一貫性確認

2026-04-28 時点で、`data/calibration.json` と親分析環境の最新成果物を照合済みです。

- `LJT_CAT_web/data/calibration.json` と `LJT_CAT_publish/data/calibration.json` は同一内容
- `item_bank_hit` は `artifacts/mod_hit.rds` の `coef(..., IRTpars = TRUE)` と一致
- `item_bank_cr` は `artifacts/mod_cr.rds` の `coef(..., IRTpars = TRUE)` と一致
- `item_bank_1f` / `item_bank_2f` も、それぞれ `mod_combined_1f.rds` /
  `mod_mirt_comp.rds` と一致
- 最大差は JSON の `digits = 6` 丸めに由来する `5e-7` 未満
- TOEIC 回帰は匿名化後IDで 244 名を結合し、
  `TOEIC = 55.739001 + 5.498944 * theta_hit + 7.995844 * theta_cr`
  (`R = 0.661722`) と再現される

`scripts/export_cat_calibration.R` は、分析側で用いた参加者ID匿名化マップを再構成して
TOEIC側にも適用するため、現在の raw workbook から再生成しても同じID基準で
`regression.per_condition` を作れます。

### 主要参考文献

- Wainer, H. et al. (2000). *Computerized Adaptive Testing: A Primer*.
  <https://www.ets.org/research/policy_research_reports/publications/book/2000/hedm.html>
- van der Linden, W. J., & Glas, C. A. W. (2010). *Elements of Adaptive Testing*.
  <https://link.springer.com/book/10.1007/978-0-387-85461-8>
- Weiss, D. J. (1982). Improving measurement quality and efficiency with adaptive testing.
  <https://journals.sagepub.com/doi/10.1177/014662168200600408>
- Choi, S. W., Grady, M. W., & Dodd, B. G. (2011). A new stopping rule for computerized adaptive testing.
  <https://journals.sagepub.com/doi/10.1177/0013164410387338>

---

## 出力される Excel ファイル

ファイル名:

```text
LJT_CAT_{delivery_or_algorithm}_{name}_{id}_{YYYY-MM-DD_HH-MM-SS}.xlsx
```

シート:

| シート | 内容 |
|---|---|
| `summary` | 参加者情報、実施方式、回答数、`theta_hit`, `theta_cr`, SE, TOEIC 推定、練習要約、結果ファイル名、反応異常フラグ |
| `responses` | 本試行の項目別ログ。回答、正誤、RT、応答キー、時間切れ、音声時刻、項目パラメータ、running θ / SE |
| `practice` | 練習4問の回答と正誤 |
| `item_bank` | 当該モードで使う固定フォーム / Adaptive 全160候補プールの targetword、条件、音声、弁別力 `a`、困難度 `b` |
| `cat_trace` | CAT / 固定フォームの項目提示順、running θ / SE、項目情報量 |
| `quality_flags` | 報告可否、条件別回答数、タイムアウト率、マウス回答率、フォーカス離脱などの品質フラグ |
| `events` | ステージ遷移、音声再生、target onset、応答などのイベントログ |
| `protocol_manifest` | 参加者用URL、Timed/Untimed、反応時間枠、音声自動再生、注視点、回答後待機時間、最大連続数、選択フォーム、UI表示方針などの実施プロトコル |
| `metadata` | URL設定、停止則、アルゴリズム、提示手順、Timed/Untimed、キー割り当て、回帰式、scoring backbone、練習要約 |

`summary` には `instruction_version`、`practice_n_total`、`practice_n_answered`、
`practice_accuracy`、`practice_n_timed_out`、`practice_n_audio_failed`、
`result_filename` を含めます。反応異常フラグは、旧名
(`uniform_yes_flag`, `uniform_no_flag`, `response_pattern_theta_gap_flag`) と
新名 (`all_yes_flag`, `all_no_flag`, `aberrance_theta_gap_flag`) の両方を出力します。

ブラウザの Excel 保存に失敗した場合は、同じ payload を JSON として保存します。

---

## ブラウザ要件

- Google Chrome の PC 版
- 画面幅 1,024 px 以上推奨
- ヘッドホンまたはイヤホン推奨

Edge / Safari / Firefox / モバイルブラウザでは起動時に警告を表示します。

---

## ライセンス

研究目的での使用は自由です。再配布・派生物公開の際は本リポジトリを引用してください。
