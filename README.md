# LJT-CAT Web — 語彙意味判断テスト

Chrome / PC 前提の静的 HTML + vanilla JavaScript で動作する
**Lexicosemantic Judgement Task (LJT)** のブラウザ完結型実装です。
結果は終了時に Excel (`.xlsx`) として自動保存されます。

デプロイ先: <https://github.com/Ryuya-dot-com/LJT_CAT>

---

## 標準運用

レポート上で plain Mixed CAT は失敗ベースラインとして扱っているため、
公開用の標準入口は次の2つに分けています。

| URL | 用途 | 出題 |
|---|---|---|
| `/fixed40/` | 即時運用向け | 固定40問。単語重複なしの Hit 20問 + CR 20問を制約付きランダム順で出題 |
| `/adaptive/` | 研究・検証向け | 単語重複なしの blueprint CAT。デフォルトは Hit/CR 20+20 まで停止禁止、最大 35+35。URL指定で20問・30問下限も検証可能 |

ルート `/` は実施モード選択ページです。旧来の plain max-info Mixed CAT は
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
  - `algorithm=blueprint` デフォルト。標準設定では40問まで Hit 20問・CR 20問を必ず満たす
  - 40問以降は PSER 停止を評価し、最大 70問 (Hit 35問・CR 35問)
  - `algorithm=alternating` / `algorithm=quota` は比較検証用
  - いずれの Adaptive 方式でも、一度出た targetword は反対条件から除外
- **停止則**:
  - 固定40問版は常に40問
- Adaptive 版は `stop_rule=blueprint_pser` デフォルト
  - `stop_rule=se` または `stop_rule=max_items` も指定可能
- 練習4問 + 本試行
- 提示手順:
  - 中央注視点 (`+`) 500 ms
  - 音声を自動で1回再生
  - 音声終了後に targetword を表示
  - `F` / `J` キーで「適切」「不適切」を判断
- Timed / Untimed:
  - デフォルトは Timed
  - Timed は sentence-embedded lexical-semantic decision 研究で使われた
    反応時間枠に合わせ、targetword 表示後 1,250 ms で未回答扱い
  - Untimed は `?timing=untimed` で指定
- UI 表示言語は日本語 / 英語を選択可能。URL では `?lang=ja` / `?lang=en`
- 研究用確認パネルは `?research=1` のときだけ表示
  - 提示語 / 候補語、Timed の制限時間、項目弁別力 `a`、困難度 `b` を確認可能
  - Timed / Untimed と反応時間枠を研究者が設定し、参加者用URLへ反映可能
- `F` / `J` の適切・不適切割り当ては参加者ごとにカウンターバランス
- 応答時間、応答キー、応答モダリティ、時間切れ、音声終了時刻、項目パラメータ、running θ / SE を記録
- Excel 自動ダウンロード
  (`summary` / `responses` / `practice` / `item_bank` / `cat_trace` / `quality_flags` / `events` / `protocol_manifest` / `metadata`)
- all-Yes / all-No、Hit/CR θ 差、targetword 重複数、中央値RT、条件別RT、タイムアウト率、マウス回答率、フォーカス離脱数などの反応異常フラグを出力
- ユーザー画面には推定値・内部モデル情報を表示せず、Excel にのみ保存

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
  `https://ryuya-dot-com.github.io/LJT_CAT/adaptive/?max_items=70`
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
| `lang` | `ja`, `en`。UI 表示言語 |
| `research` | `1` のとき研究用確認パネルを表示 |

`?research=1` で開くと、研究者用パネルから `timing` と
`response_window_ms` を変更し、参加者配布用URLを生成できます。
参加者画面ではこの設定は変更できず、実施条件は Excel の
`protocol_manifest` と `metadata` に保存されます。

固定40問版では `min_items` / `max_items` は常に40に固定されます。

Adaptive 版:

| パラメータ | デフォルト | 意味 |
|---|---:|---|
| `algorithm` | `blueprint` | `blueprint`, `alternating`, `quota` |
| `stop_rule` | `blueprint_pser` | `blueprint_pser`, `pser`, `se`, `max_items` |
| `min_items` | 40 | 停止判定前の最小回答数。研究用に20以上で指定可能 |
| `max_items` | 70 | 最大出題数 |
| `target_se` | 0.30 | `stop_rule=se` の目標SE |
| `stop_pser` | 0.01 | 予測SE低下量がこの値未満なら停止 |
| `quota_tol` | 0.20 | Quota CAT の Hit 比率許容幅 |

20問下限を検証する場合:

```text
https://ryuya-dot-com.github.io/LJT_CAT/adaptive/?min_items=20&max_items=70
```

固定20問として実施したい場合:

```text
https://ryuya-dot-com.github.io/LJT_CAT/adaptive/?min_items=20&max_items=20&stop_rule=max_items
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
- `selected_forms.extended70_disjoint`: Adaptive の候補プールとして使う単語重複なし 35+35 項目セット
- `reference_theta`: パーセンタイル計算用 θ 分布
- `regression.per_condition`: `θ_Hit` と `θ_CR` から TOEIC を予測する回帰

---

## 採点モデルの考え方

Web の出題制御と最終採点は分けています。

| 用途 | Web 側で使う情報 | 役割 |
|---|---|---|
| 固定40問の選定 | `selected_forms.fixed40_disjoint` | D-study 最良の単語重複なし 20+20 をそのまま使う |
| Adaptive の候補プール | `selected_forms.extended70_disjoint` | D-study 最良の単語重複なし 35+35 を候補にする |
| Adaptive の項目選択 | `item_bank_hit` / `item_bank_cr` | 条件別 posterior と条件別 Fisher information で次項目を選ぶ |
| Hit の最終採点 | `item_bank_hit` | `theta_hit` / `se_hit` を推定 |
| CR の最終採点 | `item_bank_cr` | `theta_cr` / `se_cr` を推定 |
| post-hoc 2F 採点 | `item_bank_2f` | `theta_mirt_f1` / `theta_mirt_f2` を保存 |
| TOEIC 推定 | `regression.per_condition` | `θ_Hit`, `θ_CR` から推定 |

Adaptive 版は combined 1F を selector として使いません。出題制御も
最終採点も per-condition 1D 2PL (`mod_hit`, `mod_cr`) に揃えています。
最終報告の主指標は `theta_hit`, `theta_cr`, `toeic_estimate` です。

---

## 出力される Excel ファイル

ファイル名:

```text
LJT_CAT_{delivery_or_algorithm}_{name}_{id}_{YYYY-MM-DD_HH-MM-SS}.xlsx
```

シート:

| シート | 内容 |
|---|---|
| `summary` | 参加者情報、実施方式、回答数、`theta_hit`, `theta_cr`, SE, TOEIC 推定、反応異常フラグ |
| `responses` | 本試行の項目別ログ。回答、正誤、RT、応答キー、時間切れ、音声時刻、項目パラメータ、running θ / SE |
| `practice` | 練習4問の回答と正誤 |
| `item_bank` | 当該モードで使う固定フォーム / adaptive 候補プールの targetword、条件、音声、弁別力 `a`、困難度 `b` |
| `cat_trace` | CAT / 固定フォームの項目提示順、running θ / SE、項目情報量 |
| `quality_flags` | 報告可否、条件別回答数、タイムアウト率、マウス回答率、フォーカス離脱などの品質フラグ |
| `events` | ステージ遷移、音声再生、target onset、応答などのイベントログ |
| `protocol_manifest` | 参加者用URL、Timed/Untimed、反応時間枠、提示手順、選択フォームなどの実施プロトコル |
| `metadata` | URL設定、停止則、アルゴリズム、提示手順、Timed/Untimed、キー割り当て、回帰式、scoring backbone |

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
