/**
 * utm-propagate.js — Preserve UTM/ref attribution across internal navigation.
 *
 * When a visitor lands on any marketing page with ?utm_source=... (e.g. from
 * a TikTok link), this script rewrites every same-origin <a href> to carry
 * those UTMs forward. Without it, clicking from getstudyedge.com (TikTok
 * lander) into /app strips the attribution and PostHog records the signup
 * as utm_source=(none).
 *
 * Rules:
 *   - Only same-domain links (getstudyedge.com or relative) are rewritten
 *   - Existing query params on the link are preserved
 *   - If the link already specifies a utm_* of its own, the link wins
 *   - Hash-only links (#section) are skipped
 *   - mailto:/tel: are skipped
 *   - Runs again on dynamically inserted links via MutationObserver
 */
(function () {
  'use strict';

  var TRACKED = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref'];

  function readLandingParams() {
    var sp = new URLSearchParams(window.location.search);
    var out = {};
    TRACKED.forEach(function (k) {
      var v = sp.get(k);
      if (v) out[k] = v;
    });
    // Also persist to sessionStorage so a same-tab navigation that drops the
    // query string still carries forward.
    try {
      if (Object.keys(out).length) {
        sessionStorage.setItem('se_utm', JSON.stringify(out));
      } else {
        var cached = sessionStorage.getItem('se_utm');
        if (cached) out = JSON.parse(cached);
      }
    } catch (e) { /* private mode, ignore */ }
    return out;
  }

  function isInternal(url) {
    try {
      var u = new URL(url, window.location.href);
      return u.hostname === window.location.hostname ||
             u.hostname === 'getstudyedge.com' ||
             u.hostname === 'www.getstudyedge.com' ||
             u.hostname === 'blog.getstudyedge.com';
    } catch (e) { return false; }
  }

  function rewrite(href, params) {
    try {
      var u = new URL(href, window.location.href);
      Object.keys(params).forEach(function (k) {
        if (!u.searchParams.has(k)) u.searchParams.set(k, params[k]);
      });
      return u.toString();
    } catch (e) { return href; }
  }

  function tagAll(root, params) {
    if (!Object.keys(params).length) return;
    var anchors = (root || document).querySelectorAll('a[href]');
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var href = a.getAttribute('href');
      if (!href) continue;
      if (href.charAt(0) === '#') continue;
      if (/^(mailto:|tel:|sms:|javascript:)/i.test(href)) continue;
      if (!isInternal(href)) continue;
      a.setAttribute('href', rewrite(href, params));
    }
  }

  var params = readLandingParams();
  if (!Object.keys(params).length) return;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { tagAll(document, params); });
  } else {
    tagAll(document, params);
  }

  // Catch dynamically inserted anchors (lazy-loaded sections, react re-renders).
  try {
    var obs = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          if (added[j].nodeType === 1) tagAll(added[j], params);
        }
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) { /* old browser, ignore */ }
})();
