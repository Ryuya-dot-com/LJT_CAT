/* cat_1f.js — 1D Computerized Adaptive Testing engine
 *
 * Default θ grid: [-6, 6] step 0.01 (1,201 points)
 * Prior: N(0, 1)
 * Estimator: EAP on grid (Bock & Mislevy, 1982)
 * Item selection:
 *   - legacy 1F: maximum Fisher information at current θ (Birnbaum, 1968)
 *   - production adaptive: per-condition posteriors with disjoint blueprint
 * Predicted SE reduction (`predictedSeReduction`) implements the PSER
 * stopping signal of Choi, Grady & Dodd (2011), with tuning guidance from
 * Morris, Bass, Howard & Neapolitan (2020).
 * Person-fit (lz, lz*): Drasgow, Levine & Williams (1985); Snijders (2001).
 * Item exposure control (randomesque, optional): Kingsbury & Zara (1989).
 * Boundary diagnostic: heuristic posterior-mass check at grid edges.
 *
 * References:
 *   Bock, R. D., & Mislevy, R. J. (1982). Adaptive EAP estimation of ability
 *     in a microcomputer environment. Applied Psychological Measurement,
 *     6(4), 431–444. https://doi.org/10.1177/014662168200600405
 *   Choi, S. W., Grady, M. W., & Dodd, B. G. (2011). A new stopping rule for
 *     computerized adaptive testing. Educational and Psychological
 *     Measurement, 71(1), 37–53. https://doi.org/10.1177/0013164410387338
 *   Drasgow, F., Levine, M. V., & Williams, E. A. (1985). Appropriateness
 *     measurement with polychotomous item response models and standardized
 *     indices. British Journal of Mathematical and Statistical Psychology,
 *     38(1), 67–86.
 *   Kingsbury, G. G., & Zara, A. R. (1989). Procedures for selecting items
 *     for computerized adaptive tests. Applied Measurement in Education,
 *     2(4), 359–375.
 *   Morris, S. B., Bass, M., Howard, E., & Neapolitan, R. E. (2020).
 *     Stopping rules for computer adaptive testing when item banks have
 *     nonuniform information. International Journal of Testing, 20(2),
 *     146–168.
 *   Snijders, T. A. B. (2001). Asymptotic null distribution of person fit
 *     statistics with estimated person parameter. Psychometrika, 66(3),
 *     331–342.
 */

(function (global) {
  'use strict';

  const DEFAULT_THETA_MIN  = -6;
  const DEFAULT_THETA_MAX  =  6;
  const DEFAULT_THETA_STEP = 0.01;

  function finiteNumber (value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizeGridOptions (options) {
    const opts = options || {};
    let min = finiteNumber(opts.thetaMin ?? opts.theta_min, DEFAULT_THETA_MIN);
    let max = finiteNumber(opts.thetaMax ?? opts.theta_max, DEFAULT_THETA_MAX);
    let step = finiteNumber(opts.thetaStep ?? opts.theta_step, DEFAULT_THETA_STEP);
    min = Math.max(-8, Math.min(0, min));
    max = Math.max(0, Math.min(8, max));
    if (max <= min) {
      min = DEFAULT_THETA_MIN;
      max = DEFAULT_THETA_MAX;
    }
    step = Math.max(0.001, Math.min(0.1, step));
    return {
      thetaMin: min,
      thetaMax: max,
      thetaStep: step,
      thetaPoints: Math.round((max - min) / step) + 1
    };
  }

  function buildGrid (options) {
    const spec = normalizeGridOptions(options);
    const n = spec.thetaPoints;
    const g = new Float64Array(n);
    for (let i = 0; i < n; i++) g[i] = spec.thetaMin + i * spec.thetaStep;
    return g;
  }

  function standardNormalLogPdf (theta) {
    return -0.5 * theta * theta - 0.5 * Math.log(2 * Math.PI);
  }

  function logistic (x) {
    return 1 / (1 + Math.exp(-x));
  }

  /** Numerically stable log P(y=1 | x) = log sigmoid(x).
   *  Uses the softplus identity log(1 + e^z) = max(z, 0) + log1p(e^{-|z|}),
   *  so logSigmoid(x) = -softplus(-x) is exact across the full range of x.
   *  The earlier `Math.log(p + 1e-300)` pattern silently floored log(1-p)
   *  near -690 even when the true value was much smaller, biasing the
   *  posterior at extreme item parameters. */
  function logSigmoid (x) {
    const az = Math.abs(x);
    return -(Math.max(-x, 0) + Math.log1p(Math.exp(-az)));
  }

  /** Build a new 1D CAT session.
   *  items: array of {item_id, a, b, ...}
   *  @returns state object with methods {theta, se, selectNext, update, usedCount, final}
   */
  function create1FSession (items, options) {
    const opts = Object.assign({
      algorithm: 'plain',   // plain | quota | alternating
      quotaTol: 0.20
    }, options || {});
    const grid = buildGrid(opts);
    const n    = grid.length;
    const logPost = new Float64Array(n);
    for (let i = 0; i < n; i++) logPost[i] = standardNormalLogPdf(grid[i]);

    const used = new Set();
    const log  = [];          // per-step log: {item_idx, response, correct, theta_after, se_after, info}

    function posteriorStats () {
      // Stability + speed: cache normalized weights once. The earlier version
      // used Math.max(...logPost) (spread on a 1,201-point Float64Array) and
      // recomputed Math.exp(logPost[i] - logNorm) three times. Both are
      // avoided here without changing the EAP semantics.
      let maxLP = -Infinity;
      for (let i = 0; i < n; i++) if (logPost[i] > maxLP) maxLP = logPost[i];
      const w = new Float64Array(n);
      let sumW = 0;
      for (let i = 0; i < n; i++) {
        const e = Math.exp(logPost[i] - maxLP);
        w[i] = e;
        sumW += e;
      }
      const invSum = 1 / sumW;
      // EAP
      let mean = 0;
      for (let i = 0; i < n; i++) mean += grid[i] * w[i];
      mean *= invSum;
      // Posterior SD (= EAP standard error; Bock & Mislevy, 1982)
      let v = 0;
      for (let i = 0; i < n; i++) {
        const d = grid[i] - mean;
        v += d * d * w[i];
      }
      v *= invSum;
      return { theta: mean, se: Math.sqrt(v) };
    }

    function currentTheta () { return posteriorStats().theta; }
    function currentSE    () { return posteriorStats().se;    }

    function itemInfoAt (a, b, theta) {
      const p = logistic(a * (theta - b));
      return a * a * p * (1 - p);
    }

    function candidatePool () {
      const unused = [];
      for (let i = 0; i < items.length; i++) {
        if (!used.has(i)) unused.push(i);
      }
      if (opts.algorithm === 'alternating') {
        const want = ((used.size + 1) % 2 === 1) ? 'Hit' : 'CR';
        const forced = unused.filter(i => items[i].condition === want);
        return forced.length ? forced : unused;
      }
      if (opts.algorithm === 'quota') {
        if (used.size === 0) {
          const hitFirst = unused.filter(i => items[i].condition === 'Hit');
          return hitFirst.length ? hitFirst : unused;
        }
        let nHit = 0;
        used.forEach(i => { if (items[i].condition === 'Hit') nHit++; });
        const hitShare = nHit / used.size;
        if (hitShare < 0.5 - opts.quotaTol) {
          const hitOnly = unused.filter(i => items[i].condition === 'Hit');
          return hitOnly.length ? hitOnly : unused;
        }
        if (hitShare > 0.5 + opts.quotaTol) {
          const crOnly = unused.filter(i => items[i].condition === 'CR');
          return crOnly.length ? crOnly : unused;
        }
      }
      return unused;
    }

    function selectNextItem () {
      const { theta } = posteriorStats();
      let bestIdx = -1, bestInfo = -Infinity;
      const pool = candidatePool();
      for (let p = 0; p < pool.length; p++) {
        const i = pool[p];
        const it = items[i];
        const info = itemInfoAt(it.a, it.b, theta);
        if (info > bestInfo) { bestInfo = info; bestIdx = i; }
      }
      return bestIdx >= 0 ? { index: bestIdx, info: bestInfo, theta, se: posteriorStats().se } : null;
    }

    /** Record a response and update posterior.
     *  @param idx   index into items
     *  @param correct 0 or 1
     *  @param extra  additional log fields (e.g., rt, timestamps)
     */
    function update (idx, correct, extra) {
      const it = items[idx];
      const a  = it.a, b = it.b;
      // Stable log-likelihood: log P(y=1) = logSigmoid(x), log P(y=0) = logSigmoid(-x).
      for (let i = 0; i < n; i++) {
        const x = a * (grid[i] - b);
        logPost[i] += (correct === 1) ? logSigmoid(x) : logSigmoid(-x);
      }
      used.add(idx);
      const { theta, se } = posteriorStats();
      const infoNow = itemInfoAt(a, b, theta);
      log.push(Object.assign({
        step: log.length + 1,
        item_index: idx,
        item_id: it.item_id,
        targetword: it.targetword,
        condition: it.condition,
        stimuli: it.stimuli,
        ANSWER: it.ANSWER,
        correct: correct,
        a: a, b: b,
        theta_after: theta,
        se_after: se,
        item_info: infoNow
      }, extra || {}));
    }

    function usedCount () { return used.size; }

    /** Posterior boundary leakage diagnostic (heuristic).
     *  Returns the share of normalized posterior mass concentrated in the
     *  lowest 5 and highest 5 grid points, plus the max of the two. A
     *  `max_grid_mass > 0.01` (i.e., > 1% mass at either edge) suggests the
     *  true θ may lie outside the grid range and the EAP estimate is being
     *  pulled toward the boundary. This is a pragmatic posterior-edge
     *  check, not a published statistical test. */
    function boundaryDiagnostic () {
      let maxLP = -Infinity;
      for (let i = 0; i < n; i++) if (logPost[i] > maxLP) maxLP = logPost[i];
      let sumW = 0;
      const w = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const e = Math.exp(logPost[i] - maxLP);
        w[i] = e;
        sumW += e;
      }
      const k = Math.min(5, n);
      let leakLow = 0, leakHigh = 0;
      for (let i = 0; i < k; i++) leakLow += w[i];
      for (let i = n - k; i < n; i++) leakHigh += w[i];
      leakLow /= sumW;
      leakHigh /= sumW;
      return {
        leak_low: leakLow,
        leak_high: leakHigh,
        max_grid_mass: Math.max(leakLow, leakHigh)
      };
    }

    function finalize () {
      const { theta, se } = posteriorStats();
      return {
        theta: theta,
        se: se,
        n_items: used.size,
        log: log.slice(),
        boundary_diagnostic: boundaryDiagnostic()
      };
    }

    /** Mark an item as "consumed" without updating the posterior.
     *  Used by the skip path when a stimulus cannot be played. */
    function markUsed (idx, extra) {
      used.add(idx);
      const { theta, se } = posteriorStats();
      const it = items[idx];
      log.push(Object.assign({
        step: log.length + 1,
        item_index: idx,
        item_id: it.item_id,
        targetword: it.targetword,
        condition: it.condition,
        stimuli: it.stimuli,
        ANSWER: it.ANSWER,
        correct: null,            // skipped: no response
        a: it.a, b: it.b,
        theta_after: theta,
        se_after: se,
        item_info: null,
        skipped: true
      }, extra || {}));
    }

    return {
      selectNext: selectNextItem,
      update: update,
      markUsed: markUsed,
      currentTheta: currentTheta,
      currentSE: currentSE,
      usedCount: usedCount,
      boundaryDiagnostic: boundaryDiagnostic,
      finalize: finalize,
      mode: '1F'
    };
  }

  /**
   * Production mixed-condition CAT.
   *
   * The two LJT conditions are scored on their own per-condition 1D 2PL
   * scales. Selection therefore keeps separate Hit and CR posteriors and uses
   * a Hit/CR blueprint over the available item bank. Within the currently
   * eligible condition, the next item is the unused item with maximum Fisher
   * information at that condition's current posterior mean.
   */
  function createTwoConditionSession (hitItems, crItems, options) {
    const opts = Object.assign({
      algorithm: 'blueprint',       // blueprint | alternating | quota
      quotaTol: 0.20,
      disallowWordOverlap: false,
      maxConditionRun: 2,
      randomizeConditionTies: true,
      minItems: 0,
      minHit: 0,
      minCR: 0,
      maxItems: 160,
      maxHit: 80,
      maxCR: 80,
      // Randomesque exposure control (Kingsbury & Zara, 1989). When > 1,
      // selectNextItem ranks the eligible items by Fisher information at
      // the current θ̂ and draws one uniformly at random from the top
      // `randomesque` items. Default 1 = pure max-info (no randomization),
      // preserving the deterministic legacy behavior.
      randomesque: 1
    }, options || {});

    const grid = buildGrid(opts);
    const n = grid.length;
    const logPost = {
      Hit: new Float64Array(n),
      CR: new Float64Array(n)
    };
    for (let i = 0; i < n; i++) {
      const lp = standardNormalLogPdf(grid[i]);
      logPost.Hit[i] = lp;
      logPost.CR[i] = lp;
    }

    function itemId (it, condition) {
      return it.item_id || (it.targetword + (condition === 'Hit' ? '_HIT' : '_CR'));
    }

    const items = [];
    hitItems.forEach((it, localIndex) => {
      items.push(Object.assign({}, it, {
        condition: 'Hit',
        item_id: itemId(it, 'Hit'),
        local_index: localIndex
      }));
    });
    crItems.forEach((it, localIndex) => {
      items.push(Object.assign({}, it, {
        condition: 'CR',
        item_id: itemId(it, 'CR'),
        local_index: localIndex
      }));
    });

    const used = new Set();
    const usedWords = new Set();
    const log = [];

    function posteriorStatsFor (condition) {
      // Same stability/speed treatment as the 1F posteriorStats: cache
      // normalized weights, no spread on the typed array.
      const lp = logPost[condition];
      let maxLP = -Infinity;
      for (let i = 0; i < n; i++) if (lp[i] > maxLP) maxLP = lp[i];
      const w = new Float64Array(n);
      let sumW = 0;
      for (let i = 0; i < n; i++) {
        const e = Math.exp(lp[i] - maxLP);
        w[i] = e;
        sumW += e;
      }
      const invSum = 1 / sumW;
      let mean = 0;
      for (let i = 0; i < n; i++) mean += grid[i] * w[i];
      mean *= invSum;
      let v = 0;
      for (let i = 0; i < n; i++) {
        const d = grid[i] - mean;
        v += d * d * w[i];
      }
      v *= invSum;
      return { theta: mean, se: Math.sqrt(v) };
    }

    function allStats () {
      const h = posteriorStatsFor('Hit');
      const c = posteriorStatsFor('CR');
      return {
        theta_hit: h.theta,
        se_hit: h.se,
        theta_cr: c.theta,
        se_cr: c.se,
        joint_se: Math.sqrt(h.se * h.se + c.se * c.se)
      };
    }

    function itemInfoAt (a, b, theta) {
      const p = logistic(a * (theta - b));
      return a * a * p * (1 - p);
    }

    function counts () {
      let nHit = 0;
      let nCR = 0;
      used.forEach(i => {
        if (items[i].condition === 'Hit') nHit++;
        else nCR++;
      });
      return {
        n_hit: nHit,
        n_cr: nCR,
        n_items: used.size,
        n_words: usedWords.size
      };
    }

    function currentRun () {
      if (!log.length) return { condition: null, length: 0 };
      const condition = log[log.length - 1].condition;
      let length = 0;
      for (let i = log.length - 1; i >= 0; i--) {
        if (log[i].condition !== condition) break;
        length++;
      }
      return { condition, length };
    }

    function violatesRunLimit (condition) {
      const maxRun = opts.maxConditionRun || Infinity;
      const run = currentRun();
      return run.condition === condition && run.length >= maxRun;
    }

    function basePool () {
      const out = [];
      for (let i = 0; i < items.length; i++) {
        if (used.has(i)) continue;
        if (opts.disallowWordOverlap && usedWords.has(items[i].targetword)) continue;
        out.push(i);
      }
      return out;
    }

    function poolForCondition (condition, pool) {
      return (pool || basePool()).filter(i => items[i].condition === condition);
    }

    function chooseByDeficit (pool, targetHit, targetCR) {
      const c = counts();
      const hitPool = poolForCondition('Hit', pool);
      const crPool = poolForCondition('CR', pool);
      const needHit = Math.max(0, targetHit - c.n_hit);
      const needCR = Math.max(0, targetCR - c.n_cr);
      const hitOk = hitPool.length && needHit > 0 && !violatesRunLimit('Hit');
      const crOk = crPool.length && needCR > 0 && !violatesRunLimit('CR');

      if (needHit > needCR && hitOk) return 'Hit';
      if (needCR > needHit && crOk) return 'CR';
      if (needHit > needCR && !hitOk && crOk) return 'CR';
      if (needCR > needHit && !crOk && hitOk) return 'Hit';

      if (needHit === needCR && needHit > 0) {
        const candidates = [];
        if (hitOk) candidates.push('Hit');
        if (crOk) candidates.push('CR');
        if (candidates.length) {
          return opts.randomizeConditionTies
            ? candidates[Math.floor(Math.random() * candidates.length)]
            : candidates[0];
        }
      }

      if (needHit > 0 && hitPool.length) return 'Hit';
      if (needCR > 0 && crPool.length) return 'CR';
      if (hitPool.length && !crPool.length) return 'Hit';
      if (crPool.length && !hitPool.length) return 'CR';
      return null;
    }

    function candidatePool () {
      const pool = basePool();
      if (!pool.length) return pool;

      if (opts.algorithm === 'alternating') {
        const want = ((used.size + 1) % 2 === 1) ? 'Hit' : 'CR';
        const forced = poolForCondition(want, pool);
        return forced.length ? forced : pool;
      }

      if (opts.algorithm === 'quota') {
        if (used.size === 0) {
          const hitFirst = poolForCondition('Hit', pool);
          return hitFirst.length ? hitFirst : pool;
        }
        const c = counts();
        const hitShare = c.n_hit / used.size;
        if (hitShare < 0.5 - opts.quotaTol) {
          const hitOnly = poolForCondition('Hit', pool);
          return hitOnly.length ? hitOnly : pool;
        }
        if (hitShare > 0.5 + opts.quotaTol) {
          const crOnly = poolForCondition('CR', pool);
          return crOnly.length ? crOnly : pool;
        }
        return pool;
      }

      if (opts.algorithm === 'blueprint') {
        const c = counts();
        const inMinimumPhase =
          c.n_items < opts.minItems || c.n_hit < opts.minHit || c.n_cr < opts.minCR;
        const targetHit = inMinimumPhase ? opts.minHit : opts.maxHit;
        const targetCR = inMinimumPhase ? opts.minCR : opts.maxCR;
        const wanted = chooseByDeficit(pool, targetHit, targetCR);
        return wanted ? poolForCondition(wanted, pool) : pool;
      }

      return pool;
    }

    /**
     * Pick the next item by maximum Fisher information at the current
     * per-condition posterior mean (Birnbaum, 1968).
     *
     * If `opts.randomesque > 1` the procedure becomes the randomesque
     * exposure-control rule of Kingsbury & Zara (1989): rank the eligible
     * items by Fisher information at θ̂, then draw one uniformly at random
     * from the top-K (K = opts.randomesque). With K = 1 (the default) the
     * function is bit-for-bit identical to the legacy deterministic
     * max-info selector.
     */
    function selectNextItem () {
      const pool = candidatePool();
      if (!pool.length) return null;
      const k = Math.max(1, Math.floor(opts.randomesque || 1));

      if (k === 1) {
        // Deterministic max-info path — preserved exactly for backward
        // compatibility with sessions that do not opt into randomesque.
        let bestIdx = -1;
        let bestInfo = -Infinity;
        let bestTheta = NaN;
        let bestSE = NaN;
        for (let p = 0; p < pool.length; p++) {
          const i = pool[p];
          const it = items[i];
          const st = posteriorStatsFor(it.condition);
          const info = itemInfoAt(it.a, it.b, st.theta);
          if (info > bestInfo) {
            bestInfo = info;
            bestIdx = i;
            bestTheta = st.theta;
            bestSE = st.se;
          }
        }
        return bestIdx >= 0
          ? {
              index: bestIdx,
              info: bestInfo,
              theta: bestTheta,
              se: bestSE,
              condition: items[bestIdx].condition
            }
          : null;
      }

      // Randomesque (Kingsbury & Zara, 1989): score every eligible item,
      // then sample uniformly from the top-K by Fisher information.
      const scored = new Array(pool.length);
      for (let p = 0; p < pool.length; p++) {
        const i = pool[p];
        const it = items[i];
        const st = posteriorStatsFor(it.condition);
        const info = itemInfoAt(it.a, it.b, st.theta);
        scored[p] = { index: i, info: info, theta: st.theta, se: st.se };
      }
      scored.sort(function (x, y) { return y.info - x.info; });
      const topK = scored.slice(0, Math.min(k, scored.length));
      const pick = topK[Math.floor(Math.random() * topK.length)];
      return {
        index: pick.index,
        info: pick.info,
        theta: pick.theta,
        se: pick.se,
        condition: items[pick.index].condition
      };
    }

    function updatePosteriorFor (condition, item, correct) {
      // Stable log-likelihood update; see logSigmoid above.
      const lp = logPost[condition];
      for (let i = 0; i < n; i++) {
        const x = item.a * (grid[i] - item.b);
        lp[i] += (correct === 1) ? logSigmoid(x) : logSigmoid(-x);
      }
    }

    function logRow (idx, correct, extra, skipped) {
      const it = items[idx];
      used.add(idx);
      if (opts.disallowWordOverlap) usedWords.add(it.targetword);
      const s = allStats();
      const condStats = it.condition === 'Hit'
        ? { theta: s.theta_hit, se: s.se_hit }
        : { theta: s.theta_cr, se: s.se_cr };
      const infoNow = (correct === 0 || correct === 1)
        ? itemInfoAt(it.a, it.b, condStats.theta)
        : null;
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
        theta_after: condStats.theta,
        se_after: condStats.se,
        theta_hit_after: s.theta_hit,
        se_hit_after: s.se_hit,
        theta_cr_after: s.theta_cr,
        se_cr_after: s.se_cr,
        joint_se_after: s.joint_se,
        item_info: infoNow,
        skipped: !!skipped
      }, extra || {}));
    }

    function update (idx, correct, extra) {
      const it = items[idx];
      updatePosteriorFor(it.condition, it, correct);
      logRow(idx, correct, extra, false);
    }

    function markUsed (idx, extra) {
      logRow(idx, null, extra, true);
    }

    /**
     * First-order PSER signal (Choi, Grady & Dodd, 2011).
     *
     * Strict PSER integrates over the predictive distribution of the next
     * response. Here we use the standard fast approximation: at the current
     * posterior mean θ̂, the expected reduction in the *condition's*
     * posterior precision is exactly its Fisher information at θ̂. The
     * condition not selected keeps its current SE. The joint SE is taken
     * as the L2 norm sqrt(SE_hit² + SE_cr²), so the "reduction" returned
     * is the predicted decrease in joint precision.
     *
     * This first-order form is what Choi et al. (2011) describe as the
     * computationally inexpensive PSER variant, and what Morris et al.
     * (2020) tune `stop_pser` against.
     */
    function predictedSeReduction (sel) {
      if (!sel || !Number.isFinite(sel.info)) return null;
      const s = allStats();
      const cur = s.joint_se;
      let newHit = s.se_hit;
      let newCR = s.se_cr;
      if (sel.condition === 'Hit') {
        newHit = 1 / Math.sqrt(1 / (s.se_hit * s.se_hit) + sel.info);
      } else {
        newCR = 1 / Math.sqrt(1 / (s.se_cr * s.se_cr) + sel.info);
      }
      const predicted = Math.sqrt(newHit * newHit + newCR * newCR);
      return { current: cur, predicted: predicted, reduction: cur - predicted };
    }

    /**
     * Per-condition lz and lz* person-fit statistics.
     *
     * lz (Drasgow, Levine & Williams, 1985, eqs. 4–7):
     *   l    = Σ_i [ u_i log P_i + (1 − u_i) log(1 − P_i) ]            (eq. 4)
     *   E[l] = Σ_i [ P_i log P_i + (1 − P_i) log(1 − P_i) ]            (eq. 5)
     *   V[l] = Σ_i P_i (1 − P_i) [ logit(P_i) ]^2                      (eq. 6)
     *        = Σ_i P_i (1 − P_i) [ a_i (θ̂ − b_i) ]^2                  (2PL form)
     *   lz   = (l − E[l]) / sqrt(V[l])                                 (eq. 7)
     * Asymptotically lz ~ N(0, 1) when θ is *known*.
     *
     * lz* (Snijders, 2001, eqs. 13–15) corrects the variance for the fact
     * that θ is estimated. Let r_i(θ) = a_i (θ − b_i) (the 2PL logit) and
     * let w_i(θ) be the weight of item i in the θ̂ estimating equation.
     * For ML / EAP under the 2PL, w_i(θ) = a_i, so:
     *   c_n(θ) = Σ_i  P_i(1 − P_i) · r_i(θ) · a_i
     *   r_n(θ) = Σ_i  a_i^2 · P_i(1 − P_i)            (test information)
     *   V*[l] = V[l] − c_n(θ)^2 / r_n(θ)
     *   lz*   = (l − E[l]) / sqrt(V*[l])
     * Asymptotically lz* ~ N(0, 1) when θ̂ is the ML/EAP estimate.
     *
     * Returns null for a condition with no items (n_c == 0) or non-positive
     * variance, rather than NaN, so the JSON payload stays clean. */
    function personFitFor (condition) {
      const stats = posteriorStatsFor(condition);
      const thetaHat = stats.theta;
      let l = 0;
      let El = 0;
      let Vl = 0;
      let cN = 0;       // Snijders cross term Σ P(1-P) · r · a
      let rN = 0;       // test info Σ a^2 · P(1-P)
      let n_c = 0;
      for (let s = 0; s < log.length; s++) {
        const row = log[s];
        if (row.condition !== condition) continue;
        if (row.skipped) continue;
        if (row.correct !== 0 && row.correct !== 1) continue;
        const a = row.a;
        const b = row.b;
        const u = row.correct;
        const x = a * (thetaHat - b);
        // Stable log P(y=1) and log P(y=0) — same trick as the posterior
        // update, to avoid the log(p + 1e-300) flooring noted earlier.
        const logP  = logSigmoid(x);
        const log1P = logSigmoid(-x);
        const p = logistic(x);
        const q = 1 - p;
        l  += (u === 1) ? logP : log1P;
        El += p * logP + q * log1P;
        // V[l] uses logit(p) = x exactly (avoids log(p/(1-p)) cancellation).
        Vl += p * q * x * x;
        cN += p * q * x * a;
        rN += a * a * p * q;
        n_c++;
      }
      if (n_c === 0) {
        return { lz: null, lzstar: null, n: 0 };
      }
      const num = l - El;
      const lz = (Vl > 0) ? (num / Math.sqrt(Vl)) : null;
      // Snijders correction: subtract c_n^2 / r_n from the variance.
      const VlStar = (rN > 0) ? (Vl - (cN * cN) / rN) : Vl;
      const lzstar = (VlStar > 0) ? (num / Math.sqrt(VlStar)) : null;
      return { lz: lz, lzstar: lzstar, n: n_c };
    }

    function personFit () {
      const h = personFitFor('Hit');
      const c = personFitFor('CR');
      return {
        lz_hit: h.lz,
        lz_cr: c.lz,
        lzstar_hit: h.lzstar,
        lzstar_cr: c.lzstar
      };
    }

    /** Posterior boundary leakage diagnostic (heuristic), per condition.
     *  See the 1F `boundaryDiagnostic` for definition. Returns the share of
     *  normalized posterior mass in the lowest 5 and highest 5 grid points
     *  for each condition; `max_grid_mass > 0.01` flags possible bias of
     *  the EAP toward the grid boundary. */
    function boundaryDiagnosticFor (condition) {
      const lp = logPost[condition];
      let maxLP = -Infinity;
      for (let i = 0; i < n; i++) if (lp[i] > maxLP) maxLP = lp[i];
      let sumW = 0;
      const w = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const e = Math.exp(lp[i] - maxLP);
        w[i] = e;
        sumW += e;
      }
      const k = Math.min(5, n);
      let leakLow = 0, leakHigh = 0;
      for (let i = 0; i < k; i++) leakLow += w[i];
      for (let i = n - k; i < n; i++) leakHigh += w[i];
      leakLow /= sumW;
      leakHigh /= sumW;
      return {
        leak_low: leakLow,
        leak_high: leakHigh,
        max_grid_mass: Math.max(leakLow, leakHigh)
      };
    }

    function boundaryDiagnostic () {
      return {
        Hit: boundaryDiagnosticFor('Hit'),
        CR: boundaryDiagnosticFor('CR')
      };
    }

    function finalize () {
      const s = allStats();
      const c = counts();
      const pf = personFit();
      return Object.assign({
        theta: NaN,
        se: s.joint_se,
        n_items: used.size,
        log: log.slice(),
        boundary_diagnostic: boundaryDiagnostic()
      }, s, c, pf);
    }

    return {
      selectNext: selectNextItem,
      update: update,
      markUsed: markUsed,
      currentTheta: function () { return NaN; },
      currentSE: function () { return allStats().joint_se; },
      jointSE: function () { return allStats().joint_se; },
      currentStats: allStats,
      predictedSeReduction: predictedSeReduction,
      personFit: personFit,
      boundaryDiagnostic: boundaryDiagnostic,
      usedCount: function () { return used.size; },
      usedConditionCounts: counts,
      finalize: finalize,
      mode: 'two_condition_1f'
    };
  }

  /**
   * Score a subset of items (post-CAT per-condition scoring).
   * items: array of {a, b, item_id} — the condition-specific bank
   * responses: object mapping item_id → 0/1
   * Returns {theta, se}.
   */
  function scoreSubset (items, responses, options) {
    const grid = buildGrid(options || {});
    const n    = grid.length;
    const logPost = new Float64Array(n);
    for (let i = 0; i < n; i++) logPost[i] = standardNormalLogPdf(grid[i]);

    let nResp = 0;
    for (let k = 0; k < items.length; k++) {
      const it = items[k];
      const y = responses[it.item_id];
      if (y !== 0 && y !== 1) continue;
      nResp++;
      // Stable log-likelihood; see logSigmoid above.
      for (let i = 0; i < n; i++) {
        const x = it.a * (grid[i] - it.b);
        logPost[i] += (y === 1) ? logSigmoid(x) : logSigmoid(-x);
      }
    }
    if (nResp === 0) return { theta: NaN, se: NaN, n: 0 };

    let maxLP = -Infinity;
    for (let i = 0; i < n; i++) if (logPost[i] > maxLP) maxLP = logPost[i];
    const w = new Float64Array(n);
    let sumW = 0;
    for (let i = 0; i < n; i++) {
      const e = Math.exp(logPost[i] - maxLP);
      w[i] = e;
      sumW += e;
    }
    const invSum = 1 / sumW;
    let mean = 0;
    for (let i = 0; i < n; i++) mean += grid[i] * w[i];
    mean *= invSum;
    let v = 0;
    for (let i = 0; i < n; i++) {
      const d = grid[i] - mean;
      v += d * d * w[i];
    }
    v *= invSum;
    return { theta: mean, se: Math.sqrt(v), n: nResp };
  }

  global.CAT1F = {
    create: create1FSession,
    createTwoCondition: createTwoConditionSession,
    scoreSubset: scoreSubset,
    gridSpec: normalizeGridOptions
  };
})(window);
