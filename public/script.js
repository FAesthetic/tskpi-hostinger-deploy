'use strict';
const form = document.querySelector('#enquiry-form');
const delivery = document.querySelector('#delivery');
const distanceInput = document.querySelector('#distance');
const useDistance = document.querySelector('#use-distance');
const price = globalThis.fotoboxPricing;
const money = cents => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const number = value => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(value);
let selectedDistance = null;
function currentDistance() {
  return distanceInput.value !== '' && distanceInput.validity.valid ? distanceInput.valueAsNumber : null;
}
function updateCalculator() {
  const distance = currentDistance();
  const valid = distance !== null && Number.isFinite(distance);
  distanceInput.setAttribute('aria-invalid', String(!valid));
  useDistance.setAttribute('aria-disabled', String(!valid));
  document.querySelector('#distance-error').textContent = valid ? '' : 'Bitte gebt eine Entfernung von 0 bis 1.000 km mit höchstens einer Nachkommastelle ein.';
  if (!valid) {
    document.querySelector('#travel-cost').textContent = '—';
    document.querySelector('#total-cost').textContent = '—';
    document.querySelector('#travel-explainer').textContent = 'Mit einer gültigen Entfernung berechnen wir die vier Fahrstrecken für Lieferung und Abholung.';
    return;
  }
  const quote = price.quote(distance);
  document.querySelector('#travel-cost').textContent = money(quote.travelCents);
  document.querySelector('#total-cost').textContent = money(quote.totalCents);
  document.querySelector('#travel-explainer').textContent = distance <= 10
    ? 'Bis einschließlich 10 km einfacher Straßenentfernung sind alle vier Fahrstrecken inklusive.'
    : `Bei ${number(distance)} km Entfernung: (${number(distance)} − 10) × 4 × 0,60 € = ${money(quote.travelCents)} Fahrtkosten. Vier Strecken entstehen durch Lieferung und Abholung, jeweils hin und zurück.`;
}
function enquiryPriceText() {
  if (delivery.value === 'Individuelle Anfrage') return 'Individuelle Anfrage: Umfang, Verfügbarkeit und Gesamtpreis bitte persönlich abstimmen.';
  if (delivery.value === 'Selbstabholung') return 'Eine digitale Fotobox: 250,00 € bei Selbstabholung, ohne Fahrtkosten.';
  if (selectedDistance === null) return 'Eine digitale Fotobox: 250,00 €. Fahrtkosten nach vereinbarter Entfernung.';
  const quote = price.quote(selectedDistance);
  return `Eine digitale Fotobox: ${money(quote.baseCents)} + ${money(quote.travelCents)} Fahrtkosten = ${money(quote.totalCents)} bei ${number(selectedDistance)} km einfacher Straßenentfernung. Vorabrechnung; die Route stimmen wir vor der Buchung ab.`;
}
function updateEnquiry() { document.querySelector('#inquiry-estimate').textContent = enquiryPriceText(); }
distanceInput.addEventListener('input', updateCalculator);
delivery.addEventListener('change', updateEnquiry);
useDistance.addEventListener('click', event => {
  const distance = currentDistance();
  if (distance === null || !Number.isFinite(distance)) {
    event.preventDefault(); distanceInput.reportValidity(); distanceInput.focus(); return;
  }
  selectedDistance = distance;
  delivery.value = 'Lieferung & Abholung';
  updateEnquiry();
});
updateCalculator(); updateEnquiry();
const dateField = form.elements.date;
const now = new Date();
dateField.min = [now.getFullYear(), String(now.getMonth() + 1).padStart(2,'0'), String(now.getDate()).padStart(2,'0')].join('-');
let requestEnabled=false;
fetch('/api/config').then(r=>r.ok?r.json():null).then(c=>{requestEnabled=!!c?.requestEnabled;if(requestEnabled){document.querySelector('#request-button').textContent='Termin unverbindlich anfragen ↗';document.querySelector('#form-info').textContent='Wir prüfen euren Termin und die genaue Anfahrt. Eure Anfrage ist kostenlos und reserviert noch keine Fotobox. Bei Verfügbarkeit erhaltet ihr ein Angebot zum Onlineabschluss. Angaben zur Datenverarbeitung findet ihr im Datenschutz.';}}).catch(()=>{});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  if(requestEnabled && data.get('delivery')!=='Individuelle Anfrage'){const button=document.querySelector('#request-button');button.disabled=true;try{const res=await fetch('/api/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:data.get('names'),email:data.get('email'),phone:data.get('phone'),date:data.get('date'),location:data.get('location'),customerType:data.get('customerType'),delivery:data.get('delivery')==='Selbstabholung'?'pickup':'delivery',message:data.get('message'),website:data.get('website')})});const result=await res.json();if(!res.ok)throw Error(result.error);document.querySelector('#form-status').textContent='Eure Anfrage ist eingegangen. Referenz: '+result.reference+'. Ihr bekommt eine Eingangsbestätigung per E-Mail. Wir prüfen jetzt Termin und Anfahrt.';form.reset();return;}catch(e){document.querySelector('#form-status').textContent=e.message+' Ihr könnt uns auch direkt anrufen oder eine E-Mail schreiben.';return;}finally{button.disabled=false;}}
  const date = String(data.get('date')).split('-').reverse().join('.');
  const subject = `Fotobox-Anfrage für den ${date} – ${data.get('location')}`;
  const body = `Hallo Herzblende,\n\nwir möchten eine digitale Fotobox anfragen.\n\nNamen: ${data.get('names')}\nE-Mail: ${data.get('email')}\nDatum: ${date}\nOrt / Location: ${data.get('location')}\nÜbergabe: ${data.get('delivery')}\n${enquiryPriceText()}\n\n${data.get('message') || ''}\n\nBitte gebt uns Bescheid, ob unser Termin verfügbar ist, und bestätigt uns das vollständige Angebot.\n\nViele Grüße\n${data.get('names')}`;
  document.querySelector('#email-copy').value = body;
  document.querySelector('#email-fallback').hidden = false;
  document.querySelector('#form-status').textContent = 'Eure Anfrage ist vorbereitet, aber noch nicht gesendet. Sendet sie in eurem E-Mail-Programm. Falls es sich nicht öffnet: Kopiert den Text unten und schickt ihn an uhighcauseidope@gmail.com oder über Instagram.';
  window.location.href = `mailto:uhighcauseidope@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});
document.querySelector('#copy-request').addEventListener('click', async () => {
  const text = document.querySelector('#email-copy');
  try {
    await navigator.clipboard.writeText(text.value);
    document.querySelector('#form-status').textContent = 'Anfragetext kopiert. Ihr könnt ihn jetzt in eine E-Mail oder Instagram-Nachricht einfügen und selbst senden.';
  } catch {
    text.focus(); text.select();
    document.querySelector('#form-status').textContent = 'Der Anfragetext ist markiert. Bitte kopiert ihn und sendet ihn per E-Mail oder Instagram.';
  }
});
