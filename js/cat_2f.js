/* cat_2f.js — 2D (compensatory) CAT engine
 *
 * Default θ grid: [-4, 4] × [-4, 4] step 0.1 (81 × 81 = 6,561 points)
 * Prior: bivariate normal with factor correlation ρ (from calibration)
 * Item: P(y=1 | θ1, θ2) = logistic(a1 θ1 + a2 θ2 + d)
 * Estimator: EAP on grid (Bock & Mislevy, 1982; multidimensional extension)
 * Item selection: A-optimality (trace of Fisher info matrix). The full
 *   D-optimality criterion (determinant) collapses to zero for confirmatory
 *   2PL items loading on a single factor (a1 or a2 = 0), so the trace is
 *   used as a stable scalar in the same family.
 * Numerical stability: posterior log-likelihood updates use a softplus-based
 *   logSigmoid to avoid the catastrophic cancellation that arose from the
 *   earlier `log(p + 1e-300)` pattern at extreme x = a1·θ1 + a2·θ2 + d.
 * Report: θ_F1, θ_F2; TOEIC = β0 + β1 F1 + β2 F2
 *
 * Used as a post-hoc 2F MIRT sensitivity check; not the primary scoring
 * pathway. See README "Methodological References" for the full reference
 * list.
 */

(function (global) {
  'use strict';

  const DEFAULT_TH_MIN  = -4;
  const DEFAULT_TH_MAX  =  4;
  const DEFAULT_TH_STEP = 0.1;

  function finiteNumber (value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizeAxisOptions (options) {
    const opts = options || {};
    let min = finiteNumber(opts.thetaMin ?? opts.theta_min, DEFAULT_TH_MIN);
    let max = finiteNumber(opts.thetaMax ?? opts.theta_max, DEFAULT_TH_MAX);
    let step = finiteNumber(opts.thetaStep ?? opts.theta_step, DEFAULT_TH_STEP);
    min = Math.max(-6, Math.min(0, min));
    max = Math.max(0, Math.min(6, max));
    if (max <= min) {
      min = DEFAULT_TH_MIN;
      max = DEFAULT_TH_MAX;
    }
    step = Math.max(0.05, Math.min(0.2, step));
    return {
      thetaMin: min,
      thetaMax: max,
      thetaStep: step,
      thetaPoints: Math.round((max - min) / step) + 1
    };
  }

  function buildAxis (options) {
    const spec = normalizeAxisOptions(options);
    const n = spec.thetaPoints;
    const g = new Float64Array(n);
    for (let i = 0; i < n; i++) g[i] = spec.thetaMin + i * spec.thetaStep;
    return g;
  }

  function logistic (x) { return 1 / (1 + Math.exp(-x)); }

  /** Numerically stable log P(y=1 | x) = log sigmoid(x).
   *  Uses the softplus identity log(1 + e^z) = max(z, 0) + log1p(e^{-|z|})
   *  so that logSigmoid(x) = -softplus(-x) is exact across the full range
   *  of x (no underflow / cancellation). The earlier
   *  `Math.log(p + 1e-300)` pattern silently floored log(1-p) at about
   *  -690 even when the true value was -10^3 or smaller, distorting the
   *  posterior at extreme item parameters. */
  function logSigmoid (x) {
    const az = Math.abs(x);
    return -(Math.max(-x, 0) + Math.log1p(Math.exp(-az)));
  }

  /** Bivariate normal log-density with zero mean and correlation rho. */
  function bvnLogPdf (t1, t2, rho) {
    const det  = 1 - rho * rho;
    const q    = (t1 * t1 - 2 * rho * t1 * t2 + t2 * t2) / det;
    return -Math.log(2 * Math.PI * Math.sqrt(det)) - 0.5 * q;
  }

  function createPriorLogPost (axis, rho) {
    const n = axis.length;
    const N = n * n;
    const logPost = new Float64Array(N);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        logPost[i * n + j] = bvnLogPdf(axis[i], axis[j], rho);
      }
    }
    return logPost;
  }

  function summarizePosterior (axis, logPost) {
    // Stability + speed: cache normalized weights once. The earlier version
    // recomputed Math.exp(logPost[k] - logNorm) three times (sum, mean, var)
    // and used Math.max(...logPost) which spreads a 6,561-element typed
    // array — both of which are avoided here.
    const n = axis.length;
    const N = logPost.length;
    let max = -Infinity;
    for (let k = 0; k < N; k++) if (logPost[k] > max) max = logPost[k];
    const w = new Float64Array(N);
    let sumW = 0;
    for (let k = 0; k < N; k++) {
      const e = Math.exp(logPost[k] - max);
      w[k] = e;
      sumW += e;
    }
    const invSum = 1 / sumW;

    let m1 = 0;
    let m2 = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const wij = w[i * n + j];
        m1 += axis[i] * wij;
        m2 += axis[j] * wij;
      }
    }
    m1 *= invSum;
    m2 *= invSum;

    let v11 = 0;
    let v22 = 0;
    let v12 = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const wij = w[i * n + j];
        const d1 = axis[i] - m1;
        const d2 = axis[j] - m2;
        v11 += d1 * d1 * wij;
        v22 += d2 * d2 * wij;
        v12 += d1 * d2 * wij;
      }
    }
    v11 *= invSum;
    v22 *= invSum;
    v12 *= invSum;

    return {
      theta1: m1,
      theta2: m2,
      se1: Math.sqrt(v11),
      se2: Math.sqrt(v22),
      cov12: v12
    };
  }

  function updatePosterior (axis, logPost, item, correct) {
    // Stable log-likelihood: log P(y=1) = logSigmoid(x), log P(y=0) = logSigmoid(-x).
    const n = axis.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = item.a1 * axis[i] + item.a2 * axis[j] + item.d;
        logPost[i * n + j] += (correct === 1) ? logSigmoid(x) : logSigmoid(-x);
      }
    }
  }

  function create2FSession (items, factorCor, options) {
    const rho  = typeof factorCor === 'number' ? factorCor : 0.0;
    const axis = buildAxis(options || {});
    const n    = axis.length;
    const logPost = createPriorLogPost(axis, rho);

    const used = new Set();
    const log  = [];

    function posteriorStats () {
      return summarizePosterior(axis, logPost);
    }

    /** Expected Fisher info matrix for item at point (theta1, theta2). */
    function itemInfoMat (a1, a2, d, theta1, theta2) {
      const p = logistic(a1 * theta1 + a2 * theta2 + d);
      const q = p * (1 - p);
      return [[a1 * a1 * q, a1 * a2 * q],
              [a1 * a2 * q, a2 * a2 * q]];
    }

    function det2 (m) { return m[0][0] * m[1][1] - m[0][1] * m[1][0]; }

    function selectNextItem () {
      const stats = posteriorStats();
      let bestIdx = -1, bestD = -Infinity;
      for (let i = 0; i < items.length; i++) {
        if (used.has(i)) continue;
        const it = items[i];
        const m = itemInfoMat(it.a1, it.a2, it.d, stats.theta1, stats.theta2);
        // D-optimality: trace is a safer scalar since determinant for
        // confirmatory 2PL items loading on a single factor is always 0.
        const score = m[0][0] + m[1][1];
        if (score > bestD) { bestD = score; bestIdx = i; }
      }
      return bestIdx >= 0
        ? { index: bestIdx, info: bestD, theta1: stats.theta1, theta2: stats.theta2 }
        : null;
    }

    function update (idx, correct, extra) {
      const it = items[idx];
      const a1 = it.a1, a2 = it.a2, d = it.d;
      updatePosterior(axis, logPost, it, correct);
      used.add(idx);
      const s = posteriorStats();
      log.push(Object.assign({
        step: log.length + 1,
        item_index: idx,
        item_id: it.item_id,
        targetword: it.targetword,
        condition: it.condition,
        stimuli: it.stimuli,
        ANSWER: it.ANSWER,
        correct: correct,
        a1: a1, a2: a2, d: d,
        theta1_after: s.theta1, theta2_after: s.theta2,
        se1_after: s.se1, se2_after: s.se2
      }, extra || {}));
    }

    function currentStats () { return posteriorStats(); }
    function usedCount () { return used.size; }

    /** Joint precision for stopping: sqrt(se1^2 + se2^2). */
    function jointSE () {
      const s = posteriorStats();
      return Math.sqrt(s.se1 * s.se1 + s.se2 * s.se2);
    }

    function finalize () {
      const s = posteriorStats();
      return {
        theta1: s.theta1, theta2: s.theta2,
        se1: s.se1, se2: s.se2,
        cov12: s.cov12,
        n_items: used.size,
        log: log.slice()
      };
    }

    /** Mark item consumed (skip path, no posterior update). */
    function markUsed (idx, extra) {
      used.add(idx);
      const s = posteriorStats();
      const it = items[idx];
      log.push(Object.assign({
        step: log.length + 1,
        item_index: idx,
        item_id: it.item_id,
        targetword: it.targetword,
        condition: it.condition,
        stimuli: it.stimuli,
        ANSWER: it.ANSWER,
        correct: null,
        a1: it.a1, a2: it.a2, d: it.d,
        theta1_after: s.theta1, theta2_after: s.theta2,
        se1_after: s.se1, se2_after: s.se2,
        skipped: true
      }, extra || {}));
    }

    return {
      selectNext: selectNextItem,
      update: update,
      markUsed: markUsed,
      currentStats: currentStats,
      currentTheta: function () { return posteriorStats().theta2; },  // primary = F2
      currentSE:    function () { return posteriorStats().se2;    },
      jointSE: jointSE,
      usedCount: usedCount,
      finalize: finalize,
      mode: '2F'
    };
  }

  function scoreSubset (items, responses, factorCor, options) {
    const rho = typeof factorCor === 'number' ? factorCor : 0.0;
    const axis = buildAxis(options || {});
    const logPost = createPriorLogPost(axis, rho);

    let nResp = 0;
    for (let k = 0; k < items.length; k++) {
      const it = items[k];
      const y = responses[it.item_id];
      if (y !== 0 && y !== 1) continue;
      nResp++;
      updatePosterior(axis, logPost, it, y);
    }
    if (nResp === 0) {
      return {
        theta1: NaN,
        theta2: NaN,
        se1: NaN,
        se2: NaN,
        cov12: NaN,
        n: 0
      };
    }

    const s = summarizePosterior(axis, logPost);
    return {
      theta1: s.theta1,
      theta2: s.theta2,
      se1: s.se1,
      se2: s.se2,
      cov12: s.cov12,
      n: nResp
    };
  }

  global.CAT2F = {
    create: create2FSession,
    scoreSubset: scoreSubset,
    gridSpec: normalizeAxisOptions
  };
})(window);
