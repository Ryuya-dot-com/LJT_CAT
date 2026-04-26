/* cat_1f.js — 1D Computerized Adaptive Testing engine
 *
 * θ grid: [-6, 6] step 0.01 (1,201 points)
 * Prior: N(0, 1)
 * Estimator: EAP on grid
 * Item selection:
 *   - legacy 1F: maximum Fisher information at current θ
 *   - production adaptive: per-condition posteriors with disjoint blueprint
 */

(function (global) {
  'use strict';

  const THETA_MIN  = -6;
  const THETA_MAX  =  6;
  const THETA_STEP = 0.01;

  function buildGrid () {
    const n = Math.round((THETA_MAX - THETA_MIN) / THETA_STEP) + 1;
    const g = new Float64Array(n);
    for (let i = 0; i < n; i++) g[i] = THETA_MIN + i * THETA_STEP;
    return g;
  }

  function standardNormalLogPdf (theta) {
    return -0.5 * theta * theta - 0.5 * Math.log(2 * Math.PI);
  }

  function logistic (x) {
    return 1 / (1 + Math.exp(-x));
  }

  function logSumExp (arr) {
    let max = -Infinity;
    for (let i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i];
    let sum = 0;
    for (let i = 0; i < arr.length; i++) sum += Math.exp(arr[i] - max);
    return max + Math.log(sum);
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
    const grid = buildGrid();
    const n    = grid.length;
    const logPost = new Float64Array(n);
    for (let i = 0; i < n; i++) logPost[i] = standardNormalLogPdf(grid[i]);

    const used = new Set();
    const log  = [];          // per-step log: {item_idx, response, correct, theta_after, se_after, info}

    function posteriorStats () {
      const maxLP = Math.max(...logPost);
      let sumExp = 0;
      for (let i = 0; i < n; i++) sumExp += Math.exp(logPost[i] - maxLP);
      const logNorm = maxLP + Math.log(sumExp);
      // EAP
      let mean = 0;
      for (let i = 0; i < n; i++) mean += grid[i] * Math.exp(logPost[i] - logNorm);
      // SE
      let v = 0;
      for (let i = 0; i < n; i++) {
        const d = grid[i] - mean;
        v += d * d * Math.exp(logPost[i] - logNorm);
      }
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
      for (let i = 0; i < n; i++) {
        const p = logistic(a * (grid[i] - b));
        logPost[i] += (correct === 1)
          ? Math.log(p   + 1e-300)
          : Math.log(1 - p + 1e-300);
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

    function finalize () {
      const { theta, se } = posteriorStats();
      return { theta: theta, se: se, n_items: used.size, log: log.slice() };
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
      finalize: finalize,
      mode: '1F'
    };
  }

  /**
   * Production mixed-condition CAT.
   *
   * The two LJT conditions are scored on their own per-condition 1D 2PL
   * scales. Selection therefore keeps separate Hit and CR posteriors, forces
   * a validated Hit/CR blueprint, and prevents target-word reuse across
   * conditions. Within the currently eligible condition, the next item is the
   * unused item with maximum Fisher information at that condition's current
   * posterior mean.
   */
  function createTwoConditionSession (hitItems, crItems, options) {
    const opts = Object.assign({
      algorithm: 'blueprint',       // blueprint | alternating | quota
      quotaTol: 0.20,
      disallowWordOverlap: true,
      maxConditionRun: 2,
      randomizeConditionTies: true,
      minItems: 40,
      minHit: 20,
      minCR: 20,
      maxItems: 70,
      maxHit: 35,
      maxCR: 35
    }, options || {});

    const grid = buildGrid();
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
      const lp = logPost[condition];
      const maxLP = Math.max(...lp);
      let sumExp = 0;
      for (let i = 0; i < n; i++) sumExp += Math.exp(lp[i] - maxLP);
      const logNorm = maxLP + Math.log(sumExp);
      let mean = 0;
      for (let i = 0; i < n; i++) mean += grid[i] * Math.exp(lp[i] - logNorm);
      let v = 0;
      for (let i = 0; i < n; i++) {
        const d = grid[i] - mean;
        v += d * d * Math.exp(lp[i] - logNorm);
      }
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

    function selectNextItem () {
      let bestIdx = -1;
      let bestInfo = -Infinity;
      let bestTheta = NaN;
      let bestSE = NaN;
      const pool = candidatePool();
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

    function updatePosteriorFor (condition, item, correct) {
      const lp = logPost[condition];
      for (let i = 0; i < n; i++) {
        const p = logistic(item.a * (grid[i] - item.b));
        lp[i] += (correct === 1)
          ? Math.log(p + 1e-300)
          : Math.log(1 - p + 1e-300);
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

    function finalize () {
      const s = allStats();
      const c = counts();
      return Object.assign({
        theta: NaN,
        se: s.joint_se,
        n_items: used.size,
        log: log.slice()
      }, s, c);
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
  function scoreSubset (items, responses) {
    const grid = buildGrid();
    const n    = grid.length;
    const logPost = new Float64Array(n);
    for (let i = 0; i < n; i++) logPost[i] = standardNormalLogPdf(grid[i]);

    let nResp = 0;
    for (let k = 0; k < items.length; k++) {
      const it = items[k];
      const y = responses[it.item_id];
      if (y !== 0 && y !== 1) continue;
      nResp++;
      for (let i = 0; i < n; i++) {
        const p = logistic(it.a * (grid[i] - it.b));
        logPost[i] += (y === 1)
          ? Math.log(p   + 1e-300)
          : Math.log(1 - p + 1e-300);
      }
    }
    if (nResp === 0) return { theta: NaN, se: NaN, n: 0 };

    const maxLP = Math.max(...logPost);
    let sumExp = 0;
    for (let i = 0; i < n; i++) sumExp += Math.exp(logPost[i] - maxLP);
    const logNorm = maxLP + Math.log(sumExp);
    let mean = 0;
    for (let i = 0; i < n; i++) mean += grid[i] * Math.exp(logPost[i] - logNorm);
    let v = 0;
    for (let i = 0; i < n; i++) {
      const d = grid[i] - mean;
      v += d * d * Math.exp(logPost[i] - logNorm);
    }
    return { theta: mean, se: Math.sqrt(v), n: nResp };
  }

  global.CAT1F = {
    create: create1FSession,
    createTwoCondition: createTwoConditionSession,
    scoreSubset: scoreSubset
  };
})(window);
