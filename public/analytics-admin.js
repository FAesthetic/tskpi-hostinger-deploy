'use strict';
(() => {
  const section = document.querySelector('#analytics'); if (!section) return;
  const results = document.querySelector('#analytics-results'), days = document.querySelector('#analytics-days');
  const text = (tag, value) => { const n = document.createElement(tag); n.textContent = value; return n; };
  const labels = {page_view:'Seitenaufrufe',booking_click:'Termin angeklickt',calendar_view:'Kalender gesehen',date_selected:'Datum gewählt',details_view:'Formular geöffnet',form_started:'Eingabe begonnen',review_view:'Angaben geprüft',request_saved:'Anfrage gespeichert',receipt_shown:'Bestätigung gesehen',whatsapp_click:'WhatsApp angeklickt',phone_click:'Telefon angeklickt',email_click:'E-Mail angeklickt',validation_error:'Pflichtfeld oder Format',calendar_error:'Kalender nicht geladen',request_error:'Senden / Bestätigung fehlgeschlagen',server_error:'Serverfehler'};
  const field = {names:'Namen',email:'E-Mail-Format',location:'Location',date:'Datum',other:'Sonstiges'};
  function table(headers, rows) {
    const wrap = document.createElement('div'); wrap.className = 'analytics-table-wrap';
    const table = document.createElement('table'); table.className = 'analytics-table'; const head = document.createElement('thead'), tr = document.createElement('tr');
    headers.forEach(h => tr.append(text('th',h))); head.append(tr); table.append(head);
    const body = document.createElement('tbody'); rows.forEach(row => { const r = document.createElement('tr'); row.forEach(v => r.append(text('td',String(v)))); body.append(r); }); table.append(body); wrap.append(table); return wrap;
  }
  async function load() {
    if (document.querySelector('#admin')?.hidden) return;
    results.replaceChildren(text('p','Auswertung wird geladen …'));
    try {
      const response = await fetch('/api/admin/analytics?days='+days.value); if (!response.ok) throw Error('Die Auswertung ist gerade nicht verfügbar.'); const d = await response.json();
      results.replaceChildren();
      const totals = Object.fromEntries(d.events.map(e => [e.event,e.events]));
      const metrics = document.createElement('div'); metrics.className = 'analytics-metrics';
      for (const event of ['page_view','booking_click','form_started','request_saved']) { const card = document.createElement('article'); card.append(text('strong',event==='request_saved'?d.requests.reduce((sum,r)=>sum+r.requests,0):totals[event]||0),text('span',labels[event])); metrics.append(card); } results.append(metrics);
      if (!d.since) { results.append(text('p','Noch keine Ereignisse erfasst. Testbesuche werden nicht mitgezählt.')); return; }
      results.append(text('p','Messung seit '+new Date(d.since).toLocaleString('de-DE')+'. Zeitraum: '+new Date(d.start).toLocaleDateString('de-DE')+' bis '+new Date(d.end).toLocaleDateString('de-DE')+'.'));
      results.append(text('h3','Weg zur Anfrage'),table(['Schritt','Ereignisse'],['page_view','booking_click','calendar_view','date_selected','details_view','form_started','review_view','submit_attempt','request_saved','receipt_shown'].map(k => [labels[k]||'Senden begonnen',totals[k]||0])));
      const groups = new Map();
      function group(row) { const key = JSON.stringify([row.source,row.medium,row.campaign,row.content]); if (!groups.has(key)) groups.set(key,{...row,steps:{},requests:0,confirmed:0,offers:0,receiptMailsSent:0,receiptMailsPending:0}); return groups.get(key); }
      d.campaigns.forEach(row => { group(row).steps[row.event] = row.events; }); d.requests.forEach(row => { const g = group(row); for (const k of ['requests','confirmed','offers','receiptMailsSent','receiptMailsPending']) g[k] = row[k]; });
      results.append(text('h3','Anzeigenherkunft und Ergebnisse'),table(['Quelle / Medium','Kampagne / Anzeige','Seitenaufrufe','Eingabe begonnen','Anfragen','Angebote erstellt','Gebucht','Bestätigungsmail gesendet / ausstehend'],[...groups.values()].sort((a,b)=>(b.steps.page_view||0)-(a.steps.page_view||0)).map(g => [g.source+(g.medium?' / '+g.medium:''),(g.campaign||'ohne Kennung')+(g.content?' / '+g.content:''),g.steps.page_view||0,g.steps.form_started||0,g.requests,g.offers,g.confirmed,g.receiptMailsSent+' / '+g.receiptMailsPending])));
      if (d.errors.length) results.append(text('h3','Hürden und Fehler'),table(['Ereignis','Feld / Status','Ereignisse'],d.errors.map(e => [labels[e.event]||e.event,field[e.detail]||e.detail||'–',e.events])));
    } catch(error) { results.replaceChildren(text('p',error.message)); }
  }
  days.addEventListener('change',load); document.querySelector('#analytics-refresh').addEventListener('click',load);
  globalThis.loadFotoboxAnalytics = load;
})();
