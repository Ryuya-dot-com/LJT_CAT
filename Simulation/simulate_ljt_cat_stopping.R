#!/usr/bin/env Rscript
# =========================================================
# LJT-CAT stopping-rule simulation
#
# This script simulates the current LJT_CAT_publish adaptive engine in R:
# - per-condition 1D 2PL EAP scoring for Hit and CR
# - blueprint item selection with Hit/CR balancing
# - fixed-length, SE, single-threshold blueprint PSER, and Morris-style
#   two-threshold PSER stopping rules
#
# mirtCAT can be useful for generic CAT experiments, but the production
# LJT-CAT uses a custom two-condition blueprint + joint-SE PSER rule.
# Re-implementing that rule directly here gives a closer validation target.
# =========================================================

required_packages <- c("jsonlite", "dplyr", "tidyr", "purrr", "ggplot2", "readr")
missing_packages <- required_packages[
  !vapply(required_packages, requireNamespace, logical(1), quietly = TRUE)
]
if (length(missing_packages) > 0) {
  install.packages(missing_packages, repos = "https://cloud.r-project.org")
}
invisible(lapply(required_packages, library, character.only = TRUE))

script_dir <- function() {
  cmd_args <- commandArgs(trailingOnly = FALSE)
  file_arg <- "--file="
  script_arg <- cmd_args[startsWith(cmd_args, file_arg)]
  if (length(script_arg) > 0) {
    script_path <- sub(file_arg, "", script_arg[1], fixed = TRUE)
    return(dirname(normalizePath(script_path, mustWork = TRUE)))
  }
  source_path <- tryCatch(sys.frame(1)$ofile, error = function(e) NULL)
  if (!is.null(source_path) && nzchar(source_path)) {
    return(dirname(normalizePath(source_path, mustWork = TRUE)))
  }
  normalizePath(".", mustWork = TRUE)
}

simulation_dir <- script_dir()
repo_dir <- normalizePath(file.path(simulation_dir, ".."), mustWork = TRUE)
calibration_path <- file.path(repo_dir, "data", "calibration.json")
out_dir <- Sys.getenv(
  "LJT_CAT_SIM_OUTPUT_DIR",
  unset = file.path(simulation_dir, "outputs")
)
if (!nzchar(out_dir)) out_dir <- file.path(simulation_dir, "outputs")
dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)

parse_int_env <- function(name, default) {
  x <- suppressWarnings(as.integer(Sys.getenv(name, unset = default)))
  if (length(x) == 0 || is.na(x) || x < 1L) return(as.integer(default))
  x[1]
}

parse_num_env <- function(name, default) {
  x <- suppressWarnings(as.numeric(Sys.getenv(name, unset = default)))
  if (length(x) == 0 || is.na(x) || !is.finite(x)) return(as.numeric(default))
  x[1]
}

SIM_N <- parse_int_env("LJT_CAT_SIM_N", 500L)
SIM_SEED <- parse_int_env("LJT_CAT_SIM_SEED", 20260511L)
THETA_STEP <- parse_num_env("LJT_CAT_THETA_STEP", 0.01)
CONDITION_PROFILE <- Sys.getenv("LJT_CAT_SIM_PROFILE", unset = "pilot")

set.seed(SIM_SEED)

`%||%` <- function(x, y) if (is.null(x) || length(x) == 0) y else x

cat("LJT-CAT simulation\n")
cat("Calibration: ", calibration_path, "\n", sep = "")
cat("Simulees: ", SIM_N, "\n", sep = "")
cat("Theta grid step: ", THETA_STEP, "\n", sep = "")
cat("Condition profile: ", CONDITION_PROFILE, "\n", sep = "")

if (!file.exists(calibration_path)) {
  stop("Missing calibration JSON: ", calibration_path, call. = FALSE)
}

cal <- jsonlite::fromJSON(calibration_path, simplifyDataFrame = TRUE)

make_bank <- function(d, condition) {
  out <- as.data.frame(d, stringsAsFactors = FALSE)
  if (!"item_id" %in% names(out)) {
    out$item_id <- paste0(out$targetword, "_", toupper(condition))
  }
  out$condition <- condition
  out$flat_index <- seq_len(nrow(out))
  out
}

hit_bank <- make_bank(cal$item_bank_hit, "Hit")
cr_bank <- make_bank(cal$item_bank_cr, "CR")
item_bank <- dplyr::bind_rows(hit_bank, cr_bank) |>
  dplyr::mutate(
    global_index = dplyr::row_number(),
    a = as.numeric(.data$a),
    b = as.numeric(.data$b)
  )

if (nrow(hit_bank) == 0 || nrow(cr_bank) == 0) {
  stop("Calibration JSON must contain item_bank_hit and item_bank_cr.",
       call. = FALSE)
}

theta_grid <- seq(-6, 6, by = THETA_STEP)
prior_log_post <- stats::dnorm(theta_grid, log = TRUE)

log_sigmoid <- function(x) {
  -(pmax(-x, 0) + log1p(exp(-abs(x))))
}

item_info <- function(a, b, theta) {
  p <- stats::plogis(a * (theta - b))
  a * a * p * (1 - p)
}

posterior_stats <- function(log_post) {
  max_lp <- max(log_post)
  w <- exp(log_post - max_lp)
  sw <- sum(w)
  theta <- sum(theta_grid * w) / sw
  se <- sqrt(sum((theta_grid - theta)^2 * w) / sw)
  list(theta = theta, se = se)
}

update_log_post <- function(log_post, a, b, correct) {
  x <- a * (theta_grid - b)
  log_post + if (correct == 1L) log_sigmoid(x) else log_sigmoid(-x)
}

current_run <- function(trace) {
  if (nrow(trace) == 0) return(list(condition = NA_character_, length = 0L))
  last_condition <- trace$condition[nrow(trace)]
  r <- 0L
  for (i in seq(nrow(trace), 1L)) {
    if (!identical(trace$condition[i], last_condition)) break
    r <- r + 1L
  }
  list(condition = last_condition, length = r)
}

violates_run_limit <- function(condition, trace, max_condition_run) {
  run <- current_run(trace)
  !is.na(run$condition) &&
    identical(run$condition, condition) &&
    run$length >= max_condition_run
}

make_condition_table <- function(profile = "pilot") {
  fixed <- tibble::tibble(
    condition_id = paste0("fixed_", c(30, 40, 50, 60, 80)),
    stop_rule = "max_items",
    min_items = 0L,
    max_items = c(30L, 40L, 50L, 60L, 80L),
    target_se = NA_real_,
    stop_pser = NA_real_,
    pser_hypo = NA_real_,
    pser_hyper = NA_real_,
    randomesque = 1L,
    target_hit_prop = 0.50,
    disallow_word_overlap = FALSE
  )

  if (identical(profile, "morris")) {
    pser <- tibble::tibble(
      min_items = integer(),
      max_items = integer(),
      stop_pser = numeric(),
      randomesque = integer(),
      target_hit_prop = numeric()
    )
    se <- tidyr::expand_grid(
      min_items = c(20L),
      max_items = c(60L, 80L),
      target_se = c(0.60, 0.64, 0.70),
      target_hit_prop = 0.50
    )
    morris <- tidyr::expand_grid(
      min_items = c(20L, 30L),
      max_items = c(50L, 60L, 80L),
      target_se = c(0.60, 0.64, 0.70),
      pser_hypo = c(0.005, 0.0075),
      hyper_multiplier = c(1.67, Inf),
      randomesque = c(1L, 3L),
      target_hit_prop = 0.50
    )
  } else if (identical(profile, "ratio")) {
    pser <- tibble::tibble(
      min_items = integer(),
      max_items = integer(),
      stop_pser = numeric(),
      randomesque = integer(),
      target_hit_prop = numeric()
    )
    se <- tibble::tibble(
      min_items = integer(),
      max_items = integer(),
      target_se = numeric(),
      target_hit_prop = numeric()
    )
    morris <- tidyr::expand_grid(
      min_items = c(20L, 30L),
      max_items = c(50L, 60L),
      target_se = c(0.60, 0.64),
      pser_hypo = 0.005,
      hyper_multiplier = Inf,
      randomesque = c(1L, 3L),
      target_hit_prop = c(0.30, 0.40, 0.50, 0.60, 0.70)
    )
  } else if (identical(profile, "full")) {
    pser <- tidyr::expand_grid(
      min_items = c(10L, 20L, 30L),
      max_items = c(40L, 50L, 60L, 80L),
      stop_pser = c(0.003, 0.005, 0.0075, 0.010, 0.0125, 0.015, 0.020),
      randomesque = c(1L, 3L),
      target_hit_prop = 0.50
    )
    se <- tidyr::expand_grid(
      min_items = c(10L, 20L, 30L),
      max_items = c(60L, 80L, 160L),
      target_se = c(0.35, 0.40, 0.45, 0.50),
      target_hit_prop = 0.50
    )
    morris <- tidyr::expand_grid(
      min_items = c(20L, 30L),
      max_items = c(50L, 60L, 80L),
      target_se = c(0.57, 0.60, 0.64, 0.70),
      pser_hypo = c(0.003, 0.005, 0.0075, 0.010),
      hyper_multiplier = c(1.67, Inf),
      randomesque = c(1L, 3L),
      target_hit_prop = 0.50
    )
  } else {
    pser <- tidyr::expand_grid(
      min_items = c(10L, 20L, 30L),
      max_items = c(50L, 60L, 80L),
      stop_pser = c(0.005, 0.010, 0.015),
      randomesque = c(1L, 3L),
      target_hit_prop = 0.50
    )
    se <- tidyr::expand_grid(
      min_items = c(20L),
      max_items = c(60L, 80L),
      target_se = c(0.40, 0.45, 0.50),
      target_hit_prop = 0.50
    )
    morris <- tidyr::expand_grid(
      min_items = c(30L),
      max_items = c(50L, 60L),
      target_se = c(0.60, 0.64, 0.70),
      pser_hypo = c(0.005, 0.0075),
      hyper_multiplier = c(1.67, Inf),
      randomesque = c(1L),
      target_hit_prop = 0.50
    )
  }

  pser <- pser |>
    dplyr::filter(.data$max_items >= .data$min_items) |>
    dplyr::mutate(
      condition_id = sprintf(
        "pser_min%02d_max%03d_p%.4f_r%d",
        .data$min_items, .data$max_items, .data$stop_pser, .data$randomesque
      ),
      stop_rule = "blueprint_pser",
      target_se = NA_real_,
      pser_hypo = NA_real_,
      pser_hyper = NA_real_,
      disallow_word_overlap = FALSE
    ) |>
    dplyr::select(
      "condition_id", "stop_rule", "min_items", "max_items",
      "target_se", "stop_pser", "pser_hypo", "pser_hyper",
      "randomesque", "target_hit_prop", "disallow_word_overlap"
    )

  se <- se |>
    dplyr::filter(.data$max_items >= .data$min_items) |>
    dplyr::mutate(
      condition_id = sprintf(
        "se_min%02d_max%03d_t%.2f",
        .data$min_items, .data$max_items, .data$target_se
      ),
      stop_rule = "se",
      stop_pser = NA_real_,
      pser_hypo = NA_real_,
      pser_hyper = NA_real_,
      randomesque = 1L,
      disallow_word_overlap = FALSE
    ) |>
    dplyr::select(
      "condition_id", "stop_rule", "min_items", "max_items",
      "target_se", "stop_pser", "pser_hypo", "pser_hyper",
      "randomesque", "target_hit_prop", "disallow_word_overlap"
    )

  morris <- morris |>
    dplyr::filter(.data$max_items >= .data$min_items) |>
    dplyr::mutate(
      pser_hyper = dplyr::if_else(
        is.infinite(.data$hyper_multiplier),
        Inf,
        .data$pser_hypo * .data$hyper_multiplier
      ),
      hyper_label = dplyr::if_else(
        is.infinite(.data$hyper_multiplier),
        "inf",
        sprintf("%.2fx", .data$hyper_multiplier)
      ),
      hit_prop_label = dplyr::if_else(
        abs(.data$target_hit_prop - 0.50) < 1e-9,
        "",
        sprintf("_hp%.2f", .data$target_hit_prop)
      ),
      condition_id = sprintf(
        "morris_min%02d_max%03d_t%.2f_hypo%.4f_hyper%s_r%d%s",
        .data$min_items, .data$max_items, .data$target_se,
        .data$pser_hypo, .data$hyper_label, .data$randomesque,
        .data$hit_prop_label
      ),
      stop_rule = "morris_pser",
      stop_pser = NA_real_,
      disallow_word_overlap = FALSE
    ) |>
    dplyr::select(
      "condition_id", "stop_rule", "min_items", "max_items",
      "target_se", "stop_pser", "pser_hypo", "pser_hyper",
      "randomesque", "target_hit_prop", "disallow_word_overlap"
    )

  current_default <- tibble::tibble(
    condition_id = "current_js_default_min0_max160_p0.01",
    stop_rule = "blueprint_pser",
    min_items = 0L,
    max_items = 160L,
    target_se = NA_real_,
    stop_pser = 0.010,
    pser_hypo = NA_real_,
    pser_hyper = NA_real_,
    randomesque = 1L,
    target_hit_prop = 0.50,
    disallow_word_overlap = FALSE
  )

  dplyr::bind_rows(current_default, fixed, pser, se, morris) |>
    dplyr::distinct(.data$condition_id, .keep_all = TRUE)
}

conditions <- make_condition_table(CONDITION_PROFILE)
readr::write_csv(conditions, file.path(out_dir, "simulation_conditions.csv"))

reference_theta <- as.data.frame(cal$reference_theta)
if (all(c("Hit", "CR") %in% names(reference_theta))) {
  theta_source <- reference_theta |>
    dplyr::transmute(
      theta_hit_true = as.numeric(.data$Hit),
      theta_cr_true = as.numeric(.data$CR)
    ) |>
    tidyr::drop_na()
  sampled <- theta_source[sample(seq_len(nrow(theta_source)), SIM_N, replace = TRUE),
                          , drop = FALSE]
} else {
  rho <- suppressWarnings(as.numeric(cal$regression$factor_cor_2F %||% 0.2))
  z1 <- stats::rnorm(SIM_N)
  z2 <- rho * z1 + sqrt(max(0, 1 - rho^2)) * stats::rnorm(SIM_N)
  sampled <- data.frame(theta_hit_true = z1, theta_cr_true = z2)
}

reg <- cal$regression$per_condition
if (is.null(reg)) {
  reg <- list(intercept = 0, slope_hit = 1, slope_cr = 1)
}
sampled$sim_id <- seq_len(nrow(sampled))
sampled$theta_composite_true <- rowMeans(
  sampled[, c("theta_hit_true", "theta_cr_true")],
  na.rm = TRUE
)
sampled$toeic_proxy_true <-
  as.numeric(reg$intercept) +
  as.numeric(reg$slope_hit) * sampled$theta_hit_true +
  as.numeric(reg$slope_cr) * sampled$theta_cr_true
sampled$theta_bin <- cut(
  sampled$theta_composite_true,
  breaks = stats::quantile(
    sampled$theta_composite_true,
    probs = seq(0, 1, 0.2),
    na.rm = TRUE
  ),
  include.lowest = TRUE,
  labels = paste0("Q", 1:5)
)

choose_condition_by_deficit <- function(count_hit, count_cr, pool, trace, opts) {
  hit_pool <- pool[pool$condition == "Hit", , drop = FALSE]
  cr_pool <- pool[pool$condition == "CR", , drop = FALSE]
  in_min_phase <- (count_hit + count_cr) < opts$min_items ||
    count_hit < opts$min_hit || count_cr < opts$min_cr
  target_hit <- if (in_min_phase) opts$min_hit else opts$max_hit
  target_cr <- if (in_min_phase) opts$min_cr else opts$max_cr
  need_hit <- max(0L, target_hit - count_hit)
  need_cr <- max(0L, target_cr - count_cr)
  hit_ok <- nrow(hit_pool) > 0 && need_hit > 0 &&
    !violates_run_limit("Hit", trace, opts$max_condition_run)
  cr_ok <- nrow(cr_pool) > 0 && need_cr > 0 &&
    !violates_run_limit("CR", trace, opts$max_condition_run)

  if (need_hit > need_cr && hit_ok) return("Hit")
  if (need_cr > need_hit && cr_ok) return("CR")
  if (need_hit > need_cr && !hit_ok && cr_ok) return("CR")
  if (need_cr > need_hit && !cr_ok && hit_ok) return("Hit")
  if (need_hit == need_cr && need_hit > 0) {
    candidates <- c(if (hit_ok) "Hit", if (cr_ok) "CR")
    if (length(candidates) > 0) return(sample(candidates, 1))
  }
  if (need_hit > 0 && nrow(hit_pool) > 0) return("Hit")
  if (need_cr > 0 && nrow(cr_pool) > 0) return("CR")
  if (nrow(hit_pool) > 0 && nrow(cr_pool) == 0) return("Hit")
  if (nrow(cr_pool) > 0 && nrow(hit_pool) == 0) return("CR")
  NA_character_
}

select_next_item <- function(used, used_words, trace, stats, opts) {
  pool <- item_bank[!item_bank$global_index %in% used, , drop = FALSE]
  if (opts$disallow_word_overlap) {
    pool <- pool[!pool$targetword %in% used_words, , drop = FALSE]
  }
  if (nrow(pool) == 0) return(NULL)

  count_hit <- sum(item_bank$global_index %in% used & item_bank$condition == "Hit")
  count_cr <- sum(item_bank$global_index %in% used & item_bank$condition == "CR")
  wanted <- choose_condition_by_deficit(count_hit, count_cr, pool, trace, opts)
  if (is.na(wanted)) return(NULL)
  pool <- pool[pool$condition == wanted, , drop = FALSE]
  if (nrow(pool) == 0) return(NULL)

  theta <- if (wanted == "Hit") stats$theta_hit else stats$theta_cr
  se <- if (wanted == "Hit") stats$se_hit else stats$se_cr
  pool$info <- item_info(pool$a, pool$b, theta)
  pool <- pool[order(-pool$info), , drop = FALSE]
  k <- max(1L, min(opts$randomesque, nrow(pool)))
  pick <- pool[sample(seq_len(k), 1), , drop = FALSE]
  list(
    index = pick$global_index[1],
    condition = pick$condition[1],
    info = pick$info[1],
    theta = theta,
    se = se
  )
}

target_condition_count <- function(total_items, target_hit_prop) {
  total_items <- as.integer(total_items)
  if (total_items <= 0L) return(0L)
  hit_count <- as.integer(round(total_items * target_hit_prop))
  max(0L, min(total_items, hit_count))
}

simulate_one <- function(true_row, condition_row) {
  log_post_hit <- prior_log_post
  log_post_cr <- prior_log_post
  used <- integer()
  used_words <- character()
  trace <- data.frame()

  target_hit_prop <- as.numeric(condition_row$target_hit_prop %||% 0.50)
  if (!is.finite(target_hit_prop)) target_hit_prop <- 0.50
  target_hit_prop <- max(0.05, min(0.95, target_hit_prop))
  min_hit <- target_condition_count(condition_row$min_items, target_hit_prop)
  max_hit <- target_condition_count(condition_row$max_items, target_hit_prop)

  opts <- list(
    min_items = as.integer(condition_row$min_items),
    max_items = as.integer(condition_row$max_items),
    min_hit = min_hit,
    min_cr = as.integer(condition_row$min_items) - min_hit,
    max_hit = max_hit,
    max_cr = as.integer(condition_row$max_items) - max_hit,
    max_condition_run = 2L,
    randomesque = as.integer(condition_row$randomesque),
    disallow_word_overlap = isTRUE(condition_row$disallow_word_overlap)
  )

  stop_reason <- NA_character_
  morris_hyper_continue_count <- 0L
  morris_hypo_stop <- FALSE
  morris_precision_stop <- FALSE
  repeat {
    st_hit <- posterior_stats(log_post_hit)
    st_cr <- posterior_stats(log_post_cr)
    stats <- list(
      theta_hit = st_hit$theta,
      se_hit = st_hit$se,
      theta_cr = st_cr$theta,
      se_cr = st_cr$se,
      joint_se = sqrt(st_hit$se^2 + st_cr$se^2)
    )
    n_used <- length(used)
    if (n_used >= opts$max_items) {
      stop_reason <- "max_items"
      break
    }
    if (n_used > 0 && n_used >= opts$min_items &&
        identical(condition_row$stop_rule, "se") &&
        stats$joint_se < condition_row$target_se) {
      stop_reason <- "precision"
      break
    }

    sel <- select_next_item(used, used_words, trace, stats, opts)
    if (is.null(sel)) {
      stop_reason <- "bank_exhausted"
      break
    }

    if (n_used > 0 && n_used >= opts$min_items &&
        condition_row$stop_rule %in% c("pser", "blueprint_pser")) {
      new_hit_se <- stats$se_hit
      new_cr_se <- stats$se_cr
      if (identical(sel$condition, "Hit")) {
        new_hit_se <- 1 / sqrt(1 / stats$se_hit^2 + sel$info)
      } else {
        new_cr_se <- 1 / sqrt(1 / stats$se_cr^2 + sel$info)
      }
      predicted_joint_se <- sqrt(new_hit_se^2 + new_cr_se^2)
      predicted_reduction <- stats$joint_se - predicted_joint_se
      if (is.finite(predicted_reduction) &&
          predicted_reduction < condition_row$stop_pser) {
        stop_reason <- condition_row$stop_rule
        break
      }
    }

    if (n_used > 0 && n_used >= opts$min_items &&
        identical(condition_row$stop_rule, "morris_pser")) {
      new_hit_se <- stats$se_hit
      new_cr_se <- stats$se_cr
      if (identical(sel$condition, "Hit")) {
        new_hit_se <- 1 / sqrt(1 / stats$se_hit^2 + sel$info)
      } else {
        new_cr_se <- 1 / sqrt(1 / stats$se_cr^2 + sel$info)
      }
      predicted_joint_se <- sqrt(new_hit_se^2 + new_cr_se^2)
      predicted_reduction <- stats$joint_se - predicted_joint_se

      if (is.finite(predicted_reduction) &&
          predicted_reduction >= condition_row$pser_hyper) {
        if (stats$joint_se < condition_row$target_se) {
          morris_hyper_continue_count <- morris_hyper_continue_count + 1L
        }
      } else if (stats$joint_se < condition_row$target_se) {
        stop_reason <- "morris_precision"
        morris_precision_stop <- TRUE
        break
      } else if (is.finite(predicted_reduction) &&
                 predicted_reduction < condition_row$pser_hypo) {
        stop_reason <- "morris_hypo"
        morris_hypo_stop <- TRUE
        break
      }
    }

    item <- item_bank[item_bank$global_index == sel$index, , drop = FALSE]
    true_theta <- if (item$condition == "Hit") {
      true_row$theta_hit_true
    } else {
      true_row$theta_cr_true
    }
    p_correct <- stats::plogis(item$a * (true_theta - item$b))
    correct <- stats::rbinom(1, size = 1, prob = p_correct)
    if (item$condition == "Hit") {
      log_post_hit <- update_log_post(log_post_hit, item$a, item$b, correct)
    } else {
      log_post_cr <- update_log_post(log_post_cr, item$a, item$b, correct)
    }
    used <- c(used, sel$index)
    if (opts$disallow_word_overlap) {
      used_words <- unique(c(used_words, item$targetword))
    }
    trace <- dplyr::bind_rows(
      trace,
      data.frame(
        step = nrow(trace) + 1L,
        global_index = sel$index,
        item_id = item$item_id,
        targetword = item$targetword,
        condition = item$condition,
        info_at_selection = sel$info,
        p_correct = p_correct,
        correct = correct,
        stringsAsFactors = FALSE
      )
    )
  }

  final_hit <- posterior_stats(log_post_hit)
  final_cr <- posterior_stats(log_post_cr)
  n_hit <- sum(trace$condition == "Hit")
  n_cr <- sum(trace$condition == "CR")
  theta_composite_hat <- mean(c(final_hit$theta, final_cr$theta))
  toeic_proxy_hat <-
    as.numeric(reg$intercept) +
    as.numeric(reg$slope_hit) * final_hit$theta +
    as.numeric(reg$slope_cr) * final_cr$theta

  list(
    final = data.frame(
      sim_id = true_row$sim_id,
      condition_id = condition_row$condition_id,
      stop_rule = condition_row$stop_rule,
      min_items = condition_row$min_items,
      max_items = condition_row$max_items,
      target_se = condition_row$target_se,
      stop_pser = condition_row$stop_pser,
      pser_hypo = condition_row$pser_hypo,
      pser_hyper = condition_row$pser_hyper,
      randomesque = condition_row$randomesque,
      target_hit_prop = target_hit_prop,
      stop_reason = stop_reason,
      morris_hyper_continue_count = morris_hyper_continue_count,
      morris_hypo_stop = morris_hypo_stop,
      morris_precision_stop = morris_precision_stop,
      n_items = nrow(trace),
      n_hit = n_hit,
      n_cr = n_cr,
      hit_share = if (nrow(trace) > 0) n_hit / nrow(trace) else NA_real_,
      theta_hit_true = true_row$theta_hit_true,
      theta_cr_true = true_row$theta_cr_true,
      theta_composite_true = true_row$theta_composite_true,
      toeic_proxy_true = true_row$toeic_proxy_true,
      theta_bin = true_row$theta_bin,
      theta_hit_hat = final_hit$theta,
      theta_cr_hat = final_cr$theta,
      theta_composite_hat = theta_composite_hat,
      toeic_proxy_hat = toeic_proxy_hat,
      se_hit = final_hit$se,
      se_cr = final_cr$se,
      joint_se = sqrt(final_hit$se^2 + final_cr$se^2),
      stringsAsFactors = FALSE
    ),
    exposure = if (nrow(trace) > 0) {
      data.frame(
        sim_id = true_row$sim_id,
        condition_id = condition_row$condition_id,
        global_index = trace$global_index,
        item_id = trace$item_id,
        condition = trace$condition,
        stringsAsFactors = FALSE
      )
    } else {
      data.frame()
    }
  )
}

simulate_condition <- function(condition_row) {
  cat("Simulating: ", condition_row$condition_id, "\n", sep = "")
  results <- vector("list", nrow(sampled))
  for (i in seq_len(nrow(sampled))) {
    results[[i]] <- simulate_one(sampled[i, , drop = FALSE],
                                 condition_row)
  }
  list(
    final = dplyr::bind_rows(lapply(results, `[[`, "final")),
    exposure = dplyr::bind_rows(lapply(results, `[[`, "exposure"))
  )
}

condition_results <- vector("list", nrow(conditions))
for (i in seq_len(nrow(conditions))) {
  condition_results[[i]] <- simulate_condition(conditions[i, , drop = FALSE])
}

final_results <- dplyr::bind_rows(lapply(condition_results, `[[`, "final"))
exposure_results <- dplyr::bind_rows(lapply(condition_results, `[[`, "exposure"))

rmse <- function(x) sqrt(mean(x^2, na.rm = TRUE))
cor_safe <- function(x, y) {
  ok <- stats::complete.cases(x, y)
  if (sum(ok) < 5 || stats::sd(x[ok]) == 0 || stats::sd(y[ok]) == 0) {
    return(NA_real_)
  }
  unname(stats::cor(x[ok], y[ok]))
}

exposure_summary <- exposure_results |>
  dplyr::count(.data$condition_id, .data$item_id, .data$condition,
               name = "n_exposed") |>
  dplyr::group_by(.data$condition_id) |>
  dplyr::summarise(
    max_item_exposure_rate = max(.data$n_exposed / SIM_N, na.rm = TRUE),
    p95_item_exposure_rate = as.numeric(stats::quantile(
      .data$n_exposed / SIM_N,
      0.95,
      na.rm = TRUE
    )),
    n_items_exposed = dplyr::n(),
    .groups = "drop"
  )

summary_by_condition <- final_results |>
  dplyr::group_by(.data$condition_id, .data$stop_rule, .data$min_items,
                  .data$max_items, .data$target_se, .data$stop_pser,
                  .data$pser_hypo, .data$pser_hyper,
                  .data$randomesque, .data$target_hit_prop) |>
  dplyr::summarise(
    n_sim = dplyr::n(),
    mean_items = mean(.data$n_items, na.rm = TRUE),
    median_items = stats::median(.data$n_items, na.rm = TRUE),
    p90_items = as.numeric(stats::quantile(.data$n_items, 0.90, na.rm = TRUE)),
    p95_items = as.numeric(stats::quantile(.data$n_items, 0.95, na.rm = TRUE)),
    min_items_observed = min(.data$n_items, na.rm = TRUE),
    max_items_observed = max(.data$n_items, na.rm = TRUE),
    mean_n_hit = mean(.data$n_hit, na.rm = TRUE),
    mean_n_cr = mean(.data$n_cr, na.rm = TRUE),
    mean_hit_share = mean(.data$hit_share, na.rm = TRUE),
    prop_reporting_floor_met = mean(.data$n_hit >= 5 & .data$n_cr >= 5,
                                    na.rm = TRUE),
    mean_joint_se = mean(.data$joint_se, na.rm = TRUE),
    mean_se_hit = mean(.data$se_hit, na.rm = TRUE),
    mean_se_cr = mean(.data$se_cr, na.rm = TRUE),
    cor_hit = cor_safe(.data$theta_hit_hat, .data$theta_hit_true),
    cor_cr = cor_safe(.data$theta_cr_hat, .data$theta_cr_true),
    cor_composite = cor_safe(.data$theta_composite_hat,
                             .data$theta_composite_true),
    cor_toeic_proxy = cor_safe(.data$toeic_proxy_hat,
                               .data$toeic_proxy_true),
    bias_hit = mean(.data$theta_hit_hat - .data$theta_hit_true, na.rm = TRUE),
    bias_cr = mean(.data$theta_cr_hat - .data$theta_cr_true, na.rm = TRUE),
    rmse_hit = rmse(.data$theta_hit_hat - .data$theta_hit_true),
    rmse_cr = rmse(.data$theta_cr_hat - .data$theta_cr_true),
    rmse_composite = rmse(.data$theta_composite_hat -
                            .data$theta_composite_true),
    rmse_toeic_proxy = rmse(.data$toeic_proxy_hat -
                              .data$toeic_proxy_true),
    mean_morris_hyper_continues = mean(
      .data$morris_hyper_continue_count,
      na.rm = TRUE
    ),
    prop_morris_hypo_stop = mean(.data$morris_hypo_stop, na.rm = TRUE),
    prop_morris_precision_stop = mean(
      .data$morris_precision_stop,
      na.rm = TRUE
    ),
    .groups = "drop"
  ) |>
  dplyr::left_join(exposure_summary, by = "condition_id") |>
  dplyr::arrange(.data$rmse_toeic_proxy, .data$mean_items)

summary_by_bin <- final_results |>
  dplyr::group_by(.data$condition_id, .data$theta_bin) |>
  dplyr::summarise(
    n = dplyr::n(),
    mean_items = mean(.data$n_items, na.rm = TRUE),
    rmse_hit = rmse(.data$theta_hit_hat - .data$theta_hit_true),
    rmse_cr = rmse(.data$theta_cr_hat - .data$theta_cr_true),
    rmse_toeic_proxy = rmse(.data$toeic_proxy_hat -
                              .data$toeic_proxy_true),
    mean_joint_se = mean(.data$joint_se, na.rm = TRUE),
    .groups = "drop"
  )

stop_reason_summary <- final_results |>
  dplyr::count(.data$condition_id, .data$stop_reason, name = "n") |>
  dplyr::group_by(.data$condition_id) |>
  dplyr::mutate(prop = .data$n / sum(.data$n)) |>
  dplyr::ungroup()

exposure_detail <- exposure_results |>
  dplyr::count(.data$condition_id, .data$item_id, .data$condition,
               name = "n_exposed") |>
  dplyr::mutate(exposure_rate = .data$n_exposed / SIM_N) |>
  dplyr::arrange(.data$condition_id, dplyr::desc(.data$exposure_rate))

readr::write_csv(final_results, file.path(out_dir, "simulated_person_results.csv"))
readr::write_csv(summary_by_condition,
                 file.path(out_dir, "cat_condition_summary.csv"))
readr::write_csv(summary_by_bin, file.path(out_dir, "cat_summary_by_theta_bin.csv"))
readr::write_csv(stop_reason_summary,
                 file.path(out_dir, "cat_stop_reason_summary.csv"))
readr::write_csv(exposure_detail,
                 file.path(out_dir, "cat_item_exposure.csv"))

plot_efficiency <- summary_by_condition |>
  dplyr::filter(.data$stop_rule %in% c(
    "blueprint_pser", "morris_pser", "max_items", "se"
  )) |>
  ggplot2::ggplot(
    ggplot2::aes(x = mean_items, y = rmse_toeic_proxy,
                 color = stop_rule, shape = factor(randomesque))
  ) +
  ggplot2::geom_point(size = 2.7, alpha = 0.85) +
  ggplot2::geom_text(
    ggplot2::aes(label = condition_id),
    check_overlap = TRUE,
    hjust = -0.05,
    vjust = 0.5,
    size = 2.3,
    show.legend = FALSE
  ) +
  ggplot2::labs(
    title = "LJT-CAT stopping-rule simulation",
    subtitle = paste0(
      "Lower-left is better; N = ", SIM_N,
      "; theta source = empirical Hit/CR reference distribution"
    ),
    x = "Mean administered items",
    y = "RMSE of TOEIC-proxy score",
    color = "Stop rule",
    shape = "Randomesque K"
  ) +
  ggplot2::theme_bw() +
  ggplot2::theme(legend.position = "bottom")

ggplot2::ggsave(
  file.path(out_dir, "cat_efficiency_frontier.png"),
  plot_efficiency,
  width = 11,
  height = 7,
  dpi = 220
)

plot_length <- final_results |>
  ggplot2::ggplot(
    ggplot2::aes(x = reorder(condition_id, n_items, median),
                 y = n_items,
                 fill = stop_rule)
  ) +
  ggplot2::geom_boxplot(outlier.alpha = 0.25) +
  ggplot2::coord_flip() +
  ggplot2::labs(
    title = "Administered items by stopping condition",
    x = NULL,
    y = "Administered items",
    fill = "Stop rule"
  ) +
  ggplot2::theme_bw() +
  ggplot2::theme(legend.position = "bottom")

ggplot2::ggsave(
  file.path(out_dir, "cat_length_distribution.png"),
  plot_length,
  width = 11,
  height = max(6, 0.18 * nrow(conditions)),
  dpi = 220
)

cat("\nSimulation complete.\n")
cat("Outputs written to: ", out_dir, "\n", sep = "")
cat("\nTop 12 conditions by TOEIC-proxy RMSE:\n")
print(utils::head(summary_by_condition, 12), row.names = FALSE)
