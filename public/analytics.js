'use strict';
(() => {
  const pages = new Set(['/','/fotobox-hochzeit/','/termin/']);
  const publicPage = pages.has(location.pathname);
  const consentKey = 'fotobox-analytics-consent-v1', sessionKey = 'fotobox-analytics-session-v1';
  const ttl = 30 * 60 * 1000;
  const read = (store, key) => { try { return JSON.parse(store.getItem(key)); } catch { return null; } };
  const remove = (store, key) => { try { store.removeItem(key); } catch {} };
  const tag = value => typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,100}$/.test(value) ? value : '';
  const params = new URLSearchParams(location.search);
  const hasTags = ['utm_source','utm_medium','utm_campaign','utm_content'].some(k => tag(params.get(k)));
  const incoming = { source: tag(params.get('utm_source')) || 'direkt-oder-unbekannt', medium: tag(params.get('utm_medium')), campaign: tag(params.get('utm_campaign')), content: tag(params.get('utm_content')) };
  let consent = read(localStorage, consentKey), session = null, trackedPage = false, banner;
  const seen = new Set();
  function allowed() { return publicPage && consent?.allowed === true && Date.now() - consent.at < 180 * 86400000 && navigator.globalPrivacyControl !== true; }
  function context() {
    if (!allowed()) return null;
    const now = Date.now();
    if (!session || now - session.at > ttl) {
      const saved = read(sessionStorage, sessionKey);
      session = saved?.flow && now - saved.at < ttl ? saved : { flow: crypto.randomUUID(), ...incoming, device: innerWidth < 768 ? 'mobil' : innerWidth < 1100 ? 'tablet' : 'desktop', test: params.get('analytics_test') === '1' };
    }
    session.at = now;
    try { sessionStorage.setItem(sessionKey, JSON.stringify(session)); } catch {}
    return { consent: true, flow: session.flow, source: session.source, medium: session.medium, campaign: session.campaign, content: session.content, device: session.device, test: session.test === true };
  }
  function track(event, detail = '', once = false) {
    const c = context(); if (!c) return;
    const key = event + ':' + detail; if (once && seen.has(key)) return; seen.add(key);
    const payload = { ...c, id: crypto.randomUUID(), event, detail, page: location.pathname };
    void fetch('/api/analytics/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: true, credentials: 'omit' }).catch(() => {});
  }
  function start() {
    if (!allowed() || trackedPage) return;
    trackedPage = true; track('page_view');
    const calendar = document.querySelector('#event-calendar');
    if (calendar && typeof IntersectionObserver === 'function') {
      const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { track('calendar_view', '', true); observer.disconnect(); } });
      observer.observe(calendar);
    }
  }
  function choose(value) {
    consent = { allowed: value, at: Date.now() };
    try { localStorage.setItem(consentKey, JSON.stringify(consent)); } catch {}
    if (!value) { remove(sessionStorage, sessionKey); session = null; trackedPage = false; seen.clear(); }
    banner?.remove(); start();
  }
  function showChoice() {
    banner?.remove();
    banner = document.createElement('section'); banner.className = 'analytics-choice'; banner.setAttribute('aria-label','Besuchsauswertung');
    const title = document.createElement('strong'); title.textContent = 'Dürfen wir die Website verbessern?';
    const text = document.createElement('p'); text.textContent = 'Mit eurer Zustimmung zählen wir Seitenaufrufe, Klicks und Anfrageschritte auf unserem eigenen Server. Keine Formularinhalte, keine Weitergabe an Meta oder Google. Die Website funktioniert auch ohne Auswertung.';
    const actions = document.createElement('div'); actions.className = 'analytics-choice-actions';
    for (const [label, value] of [['Nur notwendig',false],['Auswertung erlauben',true]]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.addEventListener('click', () => choose(value)); actions.append(button);
    }
    const privacy = document.createElement('a'); privacy.href = '/datenschutz/'; privacy.textContent = 'Datenschutz'; actions.append(privacy);
    banner.append(title,text,actions); document.body.append(banner);
  }
  // Carry only campaign labels through internal booking links. No contact fields or offer tokens.
  function attributeLinks() {
    if (!publicPage) return;
    const tags = hasTags ? incoming : allowed() ? context() : null; if (!tags) return;
    for (const a of document.querySelectorAll('a[href]')) {
      const url = new URL(a.getAttribute('href'), location.href);
      if (url.origin !== location.origin || !pages.has(url.pathname) || a.getAttribute('href').startsWith('#')) continue;
      for (const [key, value] of Object.entries({ utm_source: tags.source, utm_medium: tags.medium, utm_campaign: tags.campaign, utm_content: tags.content })) if (tag(value) && value !== 'direkt-oder-unbekannt') url.searchParams.set(key,value);
      a.href = url.pathname + url.search + url.hash;
    }
  }
  globalThis.fotoboxAnalytics = Object.freeze({ track, context });
  const nav = document.querySelector('footer nav');
  if (nav) { const button = document.createElement('button'); button.type = 'button'; button.className = 'analytics-settings'; button.textContent = 'Besuchsauswertung ändern'; button.addEventListener('click', showChoice); nav.append(button); }
  if (!publicPage) return;
  if (!consent || Date.now() - consent.at >= 180 * 86400000) showChoice();
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
