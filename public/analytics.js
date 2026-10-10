'use strict';
(() => {
  const pages = new Set(['/','/fotobox-hochzeit/','/termin/']);
  const publicPage = pages.has(location.pathname);
  const tag = value => typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,100}$/.test(value) ? value : '';
  const params = new URLSearchParams(location.search);
  const hasTags = ['utm_source','utm_medium','utm_campaign','utm_content'].some(k => tag(params.get(k)));
  const incoming = { source: tag(params.get('utm_source')) || 'direkt-oder-unbekannt', medium: tag(params.get('utm_medium')), campaign: tag(params.get('utm_campaign')), content: tag(params.get('utm_content')) };
  const seen = new Set();
  function context() {
    return publicPage ? { mode:'aggregate', ...incoming, test:params.get('analytics_test') === '1' } : null;
  }
  function track(event, detail = '', once = false) {
    const c = context(); if (!c) return;
    const key = event + ':' + detail; if (once && seen.has(key)) return; seen.add(key);
    const payload = { ...c, event, detail, page: location.pathname };
    void fetch('/api/analytics/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: true, credentials: 'omit' }).catch(() => {});
  }
  function start() {
    if (!publicPage) return;
    track('page_view');
    const calendar = document.querySelector('#event-calendar');
    if (calendar && typeof IntersectionObserver === 'function') {
      const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { track('calendar_view', '', true); observer.disconnect(); } });
      observer.observe(calendar);
    }
  }
  // Carry only campaign labels through internal booking links. No contact fields or offer tokens.
  function attributeLinks() {
    if (!publicPage) return;
    const tags = hasTags ? incoming : null; if (!tags) return;
    for (const a of document.querySelectorAll('a[href]')) {
      const url = new URL(a.getAttribute('href'), location.href);
      if (url.origin !== location.origin || !pages.has(url.pathname) || a.getAttribute('href').startsWith('#')) continue;
      for (const [key, value] of Object.entries({ utm_source: tags.source, utm_medium: tags.medium, utm_campaign: tags.campaign, utm_content: tags.content })) if (tag(value) && value !== 'direkt-oder-unbekannt') url.searchParams.set(key,value);
      if (params.get('analytics_test') === '1') url.searchParams.set('analytics_test','1');
      a.href = url.pathname + url.search + url.hash;
    }
  }
  globalThis.fotoboxAnalytics = Object.freeze({ track, context });
  if (!publicPage) return;
  attributeLinks(); start();
  document.addEventListener('click', event => {
    const a = event.target.closest('a[href]'); if (!a) return;
    const url = new URL(a.href, location.href);
    if (url.origin === location.origin && (url.pathname === '/termin/' || url.hash === '#anfrage')) track('booking_click');
    else if (url.hostname === 'wa.me') track('whatsapp_click');
    else if (url.protocol === 'tel:') track('phone_click');
    else if (url.protocol === 'mailto:') track('email_click');
  });
  const form = document.querySelector('#enquiry-form');
  if (form) {
    form.addEventListener('input', () => track('form_started','',true));
    form.addEventListener('invalid', event => track('validation_error', ['names','email','location','date','delivery','extensionDays'].includes(event.target.name) ? event.target.name : 'other'), true);
    document.querySelector('#delivery')?.addEventListener('change', event => track('package_changed', event.target.value));
  }
})();
