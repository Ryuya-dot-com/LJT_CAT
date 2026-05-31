# LJT-CAT Simulation

This folder contains R simulation code for evaluating LJT-CAT stopping rules.

The main script is:

```bash
Rscript Simulation/simulate_ljt_cat_stopping.R
```

After generating the simulation outputs, render the interpretation report:

```bash
quarto render Simulation/LJT_CAT_simulation_report.qmd
```

It reads `data/calibration.json` and simulates the current browser CAT logic:

- Hit/CR per-condition 1D 2PL EAP scoring
- blueprint item selection with Hit/CR balancing
- `blueprint_pser`, Morris-style two-threshold PSER, `se`, and fixed-length
  (`max_items`) stopping
- optional randomesque top-K item selection for exposure checks

## Why not mirtCAT?

`mirtCAT` can be useful for generic CAT simulations, but the production LJT-CAT
uses a custom two-condition blueprint and a joint-SE PSER rule. The R script
therefore re-implements the production logic directly so the simulation matches
the deployed JavaScript engine more closely.

## Controls

Set environment variables before running:

```bash
LJT_CAT_SIM_N=2000 Rscript Simulation/simulate_ljt_cat_stopping.R
LJT_CAT_SIM_PROFILE=full LJT_CAT_SIM_N=5000 Rscript Simulation/simulate_ljt_cat_stopping.R
LJT_CAT_THETA_STEP=0.02 LJT_CAT_SIM_N=1000 Rscript Simulation/simulate_ljt_cat_stopping.R
```

Variables:

| Variable | Default | Meaning |
|---|---:|---|
| `LJT_CAT_SIM_N` | `500` | Number of simulated examinees |
| `LJT_CAT_SIM_SEED` | `20260511` | RNG seed |
| `LJT_CAT_THETA_STEP` | `0.01` | EAP theta grid step |
| `LJT_CAT_SIM_PROFILE` | `pilot` | `pilot`, `full`, `morris`, or `ratio` condition grid |
| `LJT_CAT_SIM_OUTPUT_DIR` | `Simulation/outputs/` | Output directory; use this to keep exploratory runs separate |

## Outputs

The script writes generated files to `Simulation/outputs/`:

- `simulation_conditions.csv`
- `simulated_person_results.csv`
- `cat_condition_summary.csv`
- `cat_summary_by_theta_bin.csv`
- `cat_stop_reason_summary.csv`
- `cat_item_exposure.csv`
- `cat_efficiency_frontier.png`
- `cat_length_distribution.png`

`cat_condition_summary.csv` is the main file for deciding whether CAT improves
on the fixed 40-, 50-, and 60-item forms.

The Quarto report `LJT_CAT_simulation_report.qmd` visualizes the same outputs
as an HTML report, including fixed-length benchmarks, 40 vs 50 item deltas,
efficiency frontiers, theta-bin stability, stopping reasons, and item exposure.
Rendered figures in the HTML can be clicked to enlarge them.

For a decision-oriented report, run at least:

```bash
LJT_CAT_SIM_N=2000 LJT_CAT_SIM_PROFILE=pilot Rscript Simulation/simulate_ljt_cat_stopping.R
quarto render Simulation/LJT_CAT_simulation_report.qmd
```

The `morris` profile focuses on `target_se + hypo + hyper` PSER conditions,
following the Morris et al. tuning logic. It is the recommended profile when
selecting a publication-grade stopping rule. The web app can reproduce these
conditions with URL parameters such as
`stop_rule=morris_pser&target_se=0.60&pser_hypo=0.005&pser_hyper=inf`:

```bash
LJT_CAT_SIM_PROFILE=morris LJT_CAT_SIM_N=2000 Rscript Simulation/simulate_ljt_cat_stopping.R
quarto render Simulation/LJT_CAT_simulation_report.qmd
```

The `ratio` profile is a focused follow-up for the Hit/CR blueprint ratio. It
holds the Morris grid near the best-performing settings and varies the target
Hit share from 30% to 70%. Keep this run in a separate output directory:

```bash
LJT_CAT_SIM_PROFILE=ratio \
LJT_CAT_SIM_N=1000 \
LJT_CAT_SIM_OUTPUT_DIR=Simulation/outputs_ratio \
Rscript Simulation/simulate_ljt_cat_stopping.R

LJT_CAT_REPORT_OUTPUT_DIR=Simulation/outputs_ratio \
quarto render Simulation/LJT_CAT_simulation_report.qmd

cp Simulation/LJT_CAT_simulation_report.html \
  Simulation/LJT_CAT_simulation_report_ratio.html
```

The report includes automated checks for Monte Carlo stability, randomesque
exposure trade-offs, theta-tail degradation, Hit/CR reporting floors, Morris
hyper/hypo behavior, and production-default explainability against fixed 40-
and 50-item forms. In `ratio` runs it also writes Hit/CR-specific diagnostics:
`cat_hit_cr_ratio_overview.csv`, `cat_hit_cr_ratio_uncertainty.csv`,
`cat_hit_cr_ratio_delta_vs_50.csv`,
`cat_hit_cr_ratio_block_delta_vs_50.csv`,
`cat_hit_cr_ratio_actual_hit_share.csv`, `cat_hit_cr_ratio_rmse.png`,
`cat_hit_cr_ratio_rmse_ci.png`, `cat_hit_cr_ratio_block_delta_vs_50.png`,
`cat_hit_cr_ratio_actual_hit_share.png`,
`cat_hit_cr_ratio_metric_panel.png`,
`cat_hit_cr_ratio_theta_diagnostics.png`, and
`cat_hit_cr_ratio_hit_cr_bias.png`.
