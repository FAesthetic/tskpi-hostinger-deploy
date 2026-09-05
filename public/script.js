'use strict';
const form = document.querySelector('#enquiry-form');
const packageSelect = document.querySelector('#package');
document.querySelectorAll('[data-package]').forEach(link => {
  link.addEventListener('click', () => { packageSelect.value = link.dataset.package; });
});
const dateField = form.elements.date;
const now = new Date();
dateField.min = [now.getFullYear(), String(now.getMonth() + 1).padStart(2,'0'), String(now.getDate()).padStart(2,'0')].join('-');
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const date = String(data.get('date')).split('-').reverse().join('.');
  const subject = `Fotobox-Anfrage für den ${date} – ${data.get('location')}`;
  const body = `Hallo Fotobox Heide,\n\nwir möchten eine Fotobox anfragen.\n\nNamen: ${data.get('names')}\nE-Mail: ${data.get('email')}\nDatum: ${date}\nOrt / Location: ${data.get('location')}\nPaket: ${data.get('package')}\n\n${data.get('message') || ''}\n\nBitte gebt uns Bescheid, ob unser Termin verfügbar ist und welches Angebot ihr uns machen könnt.\n\nViele Grüße\n${data.get('names')}`;
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
