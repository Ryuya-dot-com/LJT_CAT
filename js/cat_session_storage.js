/* cat_session_storage.js — crash-recoverable session snapshots
 *
 * Saves partial CAT session payloads to browser localStorage so that
 * a tab crash, accidental close, or browser update mid-session does
 * not lose data. Snapshots are written periodically (every 5 trials)
 * by cat_app.js and cleared after a successful final save.
 *
 * Storage key: STORAGE_KEY_PREFIX + sessionId
 * Payload schema: same as the final Excel-export payload, with
 *   `partial: true` flag and `final: null` until the session ends.
 *
 * Quota handling: on QuotaExceededError, the oldest snapshots are
 * evicted before the new write is retried. If the retry still fails,
 * snapshotSession returns false and logs to console.warn (the caller
 * is expected to degrade gracefully — see cat_app.js).
 *
 * Privacy: all writes are origin-scoped browser localStorage. No
 * network transfer. The user's browser controls eviction.
 *
 * References:
 *   WHATWG Storage Living Standard — https://storage.spec.whatwg.org/
 *   HTML Living Standard, "Web storage" — https://html.spec.whatwg.org/multipage/webstorage.html
 *     (per the HTML spec, setItem must throw a "QuotaExceededError"
 *      DOMException when the user agent's storage quota is exhausted;
 *      most browsers cap localStorage at ~5 MB per origin, though
 *      this is implementation-defined.)
 */

(function (global) {
  'use strict';

  var STORAGE_KEY_PREFIX = 'LJT_CAT_session_v1__';
  var PROBE_KEY = STORAGE_KEY_PREFIX + '__probe__';

  var _availabilityCache = null;

  /* ---------- internal helpers ---------- */

  function _getLocalStorage () {
    try {
      // Accessing localStorage can itself throw in sandboxed iframes.
      return global && global.localStorage ? global.localStorage : null;
    } catch (e) {
      return null;
    }
  }

  function _isQuotaError (err) {
    if (!err) return false;
    // Per WHATWG / HTML spec, the error name is 'QuotaExceededError'.
    // Legacy Firefox used 'NS_ERROR_DOM_QUOTA_REACHED'; legacy WebKit
    // used code 22. We accept any of these.
    if (err.name === 'QuotaExceededError') return true;
    if (err.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
    if (typeof err.code === 'number' && (err.code === 22 || err.code === 1014)) return true;
    return false;
  }

  function _stripNonSerializable (value) {
    // Convert TypedArrays to plain arrays. Convert Maps/Sets to objects.
    // Recursive but bounded by JSON's natural cycle prevention (cycles will
    // throw inside JSON.stringify and we surface that as a return false).
    if (value === null || typeof value !== 'object') return value;
    if (ArrayBuffer.isView(value)) return Array.from(value);
    if (value instanceof Map) {
      var o = {};
      value.forEach(function (v, k) { o[String(k)] = _stripNonSerializable(v); });
      return o;
    }
    if (value instanceof Set) return Array.from(value).map(_stripNonSerializable);
    if (Array.isArray(value)) return value.map(_stripNonSerializable);
    var out = {};
    for (var k in value) {
      if (Object.prototype.hasOwnProperty.call(value, k)) {
        out[k] = _stripNonSerializable(value[k]);
      }
    }
    return out;
  }

  function _listSnapshotKeys (ls) {
    var keys = [];
    if (!ls) return keys;
    var n;
    try {
      n = ls.length;
    } catch (e) {
      return keys;
    }
    for (var i = 0; i < n; i++) {
      var k;
      try {
        k = ls.key(i);
      } catch (e2) {
        continue;
      }
      if (typeof k === 'string' && k.indexOf(STORAGE_KEY_PREFIX) === 0 && k !== PROBE_KEY) {
        keys.push(k);
      }
    }
    return keys;
  }

  function _safeParse (raw) {
    if (raw === null || raw === undefined) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  /* ---------- public API ---------- */

  function isAvailable () {
    if (_availabilityCache !== null) return _availabilityCache;
    var ls = _getLocalStorage();
    if (!ls) { _availabilityCache = false; return false; }
    try {
      ls.setItem(PROBE_KEY, '1');
      var v = ls.getItem(PROBE_KEY);
      ls.removeItem(PROBE_KEY);
      // Safari in Private Browsing historically threw QuotaExceededError
      // on any setItem call; the try/catch above covers that. Firefox
      // can return null/undefined for `localStorage` in some sandboxed
      // contexts; that is handled by the _getLocalStorage check.
      _availabilityCache = (v === '1');
    } catch (e) {
      _availabilityCache = false;
    }
    return _availabilityCache;
  }

  function snapshotSession (sessionId, payload) {
    if (!isAvailable()) return false;
    if (typeof sessionId !== 'string' || sessionId.length === 0) return false;
    var ls = _getLocalStorage();
    if (!ls) return false;

    var safePayload;
    try {
      safePayload = _stripNonSerializable(payload);
    } catch (e) {
      try { console.warn('LJTSessionStorage: failed to sanitize payload', e); } catch (e2) {}
      return false;
    }

    var wrapper = {
      sessionId: sessionId,
      savedAt: new Date().toISOString(),
      payload: safePayload
    };

    var json;
    try {
      json = JSON.stringify(wrapper);
    } catch (e) {
      // Likely a circular reference.
      try { console.warn('LJTSessionStorage: JSON.stringify failed', e); } catch (e2) {}
      return false;
    }

    var key = STORAGE_KEY_PREFIX + sessionId;

    try {
      ls.setItem(key, json);
      return true;
    } catch (err) {
      if (_isQuotaError(err)) {
        // Most aggressive eviction: drop ALL old snapshots.
        try { clearOldSnapshots(0); } catch (e3) {}
        // After eviction we may have removed the slot we just wrote
        // partially — try once more.
        try {
          ls.setItem(key, json);
          return true;
        } catch (err2) {
          try { console.warn('LJTSessionStorage: quota still exceeded after eviction', err2); } catch (e4) {}
          return false;
        }
      }
      try { console.warn('LJTSessionStorage: setItem failed', err); } catch (e5) {}
      return false;
    }
  }

  function loadSnapshot (sessionId) {
    if (!isAvailable()) return null;
    if (typeof sessionId !== 'string' || sessionId.length === 0) return null;
    var ls = _getLocalStorage();
    if (!ls) return null;
    var raw;
    try {
      raw = ls.getItem(STORAGE_KEY_PREFIX + sessionId);
    } catch (e) {
      return null;
    }
    var parsed = _safeParse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  }

  function loadAllSnapshots () {
    if (!isAvailable()) return [];
    var ls = _getLocalStorage();
    if (!ls) return [];
    var keys = _listSnapshotKeys(ls);
    var out = [];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var raw;
      try {
        raw = ls.getItem(key);
      } catch (e) {
        continue;
      }
      var parsed = _safeParse(raw);
      if (!parsed || typeof parsed !== 'object' || typeof parsed.savedAt !== 'string') {
        // Silently remove corrupt entries so they don't accumulate.
        try { ls.removeItem(key); } catch (e2) {}
        continue;
      }
      out.push(parsed);
    }
    out.sort(function (a, b) {
      // Newest first. ISO 8601 strings sort lexicographically.
      if (a.savedAt < b.savedAt) return 1;
      if (a.savedAt > b.savedAt) return -1;
      return 0;
    });
    return out;
  }

  function clearSnapshot (sessionId) {
    if (!isAvailable()) return false;
    if (typeof sessionId !== 'string' || sessionId.length === 0) return false;
    var ls = _getLocalStorage();
    if (!ls) return false;
    var key = STORAGE_KEY_PREFIX + sessionId;
    var existed;
    try {
      existed = (ls.getItem(key) !== null);
    } catch (e) {
      return false;
    }
    try {
      ls.removeItem(key);
    } catch (e2) {
      return false;
    }
    return existed;
  }

  function clearAllSnapshots () {
    if (!isAvailable()) return 0;
    var ls = _getLocalStorage();
    if (!ls) return 0;
    var keys = _listSnapshotKeys(ls);
    var n = 0;
    for (var i = 0; i < keys.length; i++) {
      try {
        ls.removeItem(keys[i]);
        n++;
      } catch (e) {
        // ignore individual failures
      }
    }
    return n;
  }

  function clearOldSnapshots (maxAgeDays) {
    if (!isAvailable()) return 0;
    var ls = _getLocalStorage();
    if (!ls) return 0;
    if (typeof maxAgeDays !== 'number' || isNaN(maxAgeDays) || maxAgeDays < 0) {
      return 0;
    }
    if (maxAgeDays === 0) {
      return clearAllSnapshots();
    }
    var cutoff = Date.now() - maxAgeDays * 86400000;
    var keys = _listSnapshotKeys(ls);
    var n = 0;
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var raw;
      try {
        raw = ls.getItem(key);
      } catch (e) {
        continue;
      }
      var parsed = _safeParse(raw);
      if (!parsed || typeof parsed.savedAt !== 'string') {
        // Treat unparseable entries as old.
        try { ls.removeItem(key); n++; } catch (e2) {}
        continue;
      }
      var ts = Date.parse(parsed.savedAt);
      if (isNaN(ts) || ts < cutoff) {
        try { ls.removeItem(key); n++; } catch (e3) {}
      }
    }
    return n;
  }

  global.LJTSessionStorage = {
    STORAGE_KEY_PREFIX: STORAGE_KEY_PREFIX,
    isAvailable: isAvailable,
    snapshotSession: snapshotSession,
    loadSnapshot: loadSnapshot,
    loadAllSnapshots: loadAllSnapshots,
    clearSnapshot: clearSnapshot,
    clearAllSnapshots: clearAllSnapshots,
    clearOldSnapshots: clearOldSnapshots
  };

})(typeof window !== 'undefined' ? window : this);
