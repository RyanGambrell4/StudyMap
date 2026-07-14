/**
 * ph-init.js — PostHog analytics initialiser for StudyEdge AI marketing pages
 *
 * Included on every static HTML marketing page. Handles:
 *   - PostHog snippet init (via /ph reverse proxy, same as the React app)
 *   - surface + UTM registration (once per distinct_id so they stick forever)
 *   - Automatic pageview (capture_pageview: true)
 *
 * Pages that need additional event tracking (index, pricing) add their own
 * inline <script> after this one.
 */
(function () {
  // PostHog snippet (minified loader)
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId captureTraceFeedback captureTraceMetric".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  posthog.init('phc_vALU9oNcFGu4PNaqjWvVrGgvLn68CyAJaeWbVGiUQSkd', {
    api_host: '/ph',
    ui_host: 'https://us.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: { dom_event_allowlist: ['click', 'submit'], element_allowlist: ['a', 'button', 'form'] },
    disable_session_recording: true,
  });

  // Tag every event from this surface so it's easy to split
  // marketing-site traffic from in-app traffic in PostHog.
  posthog.register({ surface: 'marketing' });

  // Capture UTM/referrer once per distinct_id so they stick to the profile forever.
  var sp = new URLSearchParams(window.location.search);
  posthog.register_once({
    utm_source:         sp.get('utm_source'),
    utm_medium:         sp.get('utm_medium'),
    utm_campaign:       sp.get('utm_campaign'),
    utm_content:        sp.get('utm_content'),
    utm_term:           sp.get('utm_term'),
    first_referrer:     document.referrer || null,
    first_landing_path: window.location.pathname,
  });

  // CTA click tracking: fires landing_cta_clicked for any <a> that points to
  // the app signup flow. Covers all SEO pages without needing per-page onclick attrs.
  document.addEventListener('DOMContentLoaded', function () {
    var page = window.location.pathname.replace(/^\/|\.html$/g, '') || 'homepage';
    document.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (href.indexOf('/app') !== -1 && href.indexOf('signup') !== -1) {
        a.addEventListener('click', function () {
          posthog && posthog.capture('landing_cta_clicked', {
            page: page,
            cta_text: (a.textContent || '').trim().slice(0, 80),
            destination: href,
          });
        });
      }
    });

    // Scroll depth tracking: fires at 25/50/75/100%
    var depths = [25, 50, 75, 100], fired = {};
    function onScroll() {
      var pct = Math.round((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight * 100);
      depths.forEach(function (d) {
        if (pct >= d && !fired[d]) {
          fired[d] = true;
          posthog && posthog.capture('landing_scroll_depth', { depth_pct: d, page: page });
        }
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
  });
})();
