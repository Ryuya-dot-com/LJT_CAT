/* cat_2f.js — 2D (compensatory) CAT engine
 *
 * θ grid: [-4, 4] × [-4, 4] step 0.1 (81 × 81 = 6,561 points)
 * Prior: bivariate normal with factor correlation ρ (from calibration)
 * Item: P(y=1 | θ1, θ2) = logistic(a1 θ1 + a2 θ2 + d)
 * Item selection: D-optimality (determinant of Fisher info matrix)
 * Report: θ_F1, θ_F2; TOEIC = β0 + β1 F1 + β2 F2
 */

(function (global) {
  'use strict';

  const TH_MIN  = -4;
  const TH_MAX  =  4;
  const TH_STEP = 0.1;

  function buildAxis () {
    const n = Math.round((TH_MAX - TH_MIN) / TH_STEP) + 1;
    const g = new Float64Array(n);
    for (let i = 0; i < n; i++) g[i] = TH_MIN + i * TH_STEP;
    return g;
  }

  function logistic (x) { return 1 / (1 + Math.exp(-x)); }

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
    const n = axis.length;
    const N = logPost.length;
    let max = -Infinity;
    for (let k = 0; k < N; k++) if (logPost[k] > max) max = logPost[k];
    let sumExp = 0;
    for (let k = 0; k < N; k++) sumExp += Math.exp(logPost[k] - max);
    const logNorm = max + Math.log(sumExp);

    let m1 = 0;
    let m2 = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const w = Math.exp(logPost[i * n + j] - logNorm);
        m1 += axis[i] * w;
        m2 += axis[j] * w;
      }
    }

    let v11 = 0;
    let v22 = 0;
    let v12 = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const w = Math.exp(logPost[i * n + j] - logNorm);
        const d1 = axis[i] - m1;
        const d2 = axis[j] - m2;
        v11 += d1 * d1 * w;
        v22 += d2 * d2 * w;
        v12 += d1 * d2 * w;
      }
    }

    return {
      theta1: m1,
      theta2: m2,
      se1: Math.sqrt(v11),
      se2: Math.sqrt(v22),
      cov12: v12
    };
  }

  function updatePosterior (axis, logPost, item, correct) {
    const n = axis.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const p = logistic(item.a1 * axis[i] + item.a2 * axis[j] + item.d);
        logPost[i * n + j] += (correct === 1)
          ? Math.log(p + 1e-300)
          : Math.log(1 - p + 1e-300);
      }
    }
  }

  function create2FSession (items, factorCor) {
    const rho  = typeof factorCor === 'number' ? factorCor : 0.0;
    const axis = buildAxis();
    const n    = axis.length;         // 81
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

  function scoreSubset (items, responses, factorCor) {
    const rho = typeof factorCor === 'number' ? factorCor : 0.0;
    const axis = buildAxis();
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

  global.CAT2F = { create: create2FSession, scoreSubset: scoreSubset };
})(window);
