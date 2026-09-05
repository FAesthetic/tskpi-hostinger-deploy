import PDFDocument from 'pdfkit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INK = '#282324', WINE = '#632b3b', CREAM = '#fbf7ef', MUTED = '#716a67', RULE = '#ded6ce';
const OWNER = Object.freeze({
  brand: 'Fotobox Rendsburg', name: 'Finn Ole Bierlich', street: 'Wallstraße 34',
  city: '24768 Rendsburg', phone: '+49 171 28 07 197', email: 'uhighcauseidope@gmail.com',
  origin: 'https://fotobox.bierlich.cloud',
});
const TITLES = { inquiry: 'Eure Anfrage ist da.', offer: 'Euer Fotobox-Angebot.', confirmation: 'Eure Buchung im Überblick.' };
const STATUS = {
  inquiry: 'Eingangsbestätigung · unverbindliche Anfrage',
  offer: 'Persönliches Angebot · noch keine Buchungsbestätigung',
  confirmation: 'Buchungsbestätigung',
};
const sanitize = value => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\r\n?/g, '\n').normalize('NFC');
const money = cents => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const isCents = value => Number.isSafeInteger(value) && value >= 0;
const isDistance = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const km = value => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value);
function date(value, time = false) {
  if (value === null || value === undefined || value === '') return 'Noch abzustimmen';
  const parsed = typeof value === 'number' ? new Date(value) : new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(parsed.getTime())) return sanitize(value);
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'long', ...(time ? { timeStyle: 'short' } : {}), timeZone: 'Europe/Berlin' }).format(parsed) + (time ? ' Uhr' : '');
}
function httpsUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}

/**
 * Render a private customer PDF in memory. Persist or send the returned Buffer in the caller.
 * Trusted caller options: owner, fontsDir, acceptanceText, offerUrl, termsUrl,
 * sample, paymentConfirmed, baseCents, includeMessage, offerLabel, subtitle,
 * introText, taxText, serviceText. No URL or image is fetched by this module.
 */
export async function renderBookingPdf(kind, booking, options = {}) {
  if (!Object.hasOwn(TITLES, kind)) throw new TypeError('Unknown booking PDF kind');
  if (!booking || typeof booking !== 'object') throw new TypeError('Booking data is required');
  const b = booking, owner = { ...OWNER, ...options.owner };
  const statusLabel = sanitize(options.subtitle || (kind === 'offer' && options.offerLabel) || STATUS[kind]);
  const ref = sanitize(b.reference || 'Ohne Referenz');
  const base = isCents(b.base_cents) ? b.base_cents : (isCents(options.baseCents) ? options.baseCents : 25000);
  if (kind !== 'inquiry' && (![b.base_cents, b.travel_cents, b.total_cents].every(isCents) || b.base_cents + b.travel_cents !== b.total_cents)) {
    throw new TypeError('Offer/confirmation requires consistent integer cent amounts');
  }
  const paid = kind === 'confirmation' && (options.paymentConfirmed ?? (b.status === 'confirmed')) === true;
  const fontsDir = options.fontsDir || path.join(HERE, 'fonts');
  const doc = new PDFDocument({
    size: 'A4', bufferPages: true, autoFirstPage: false,
    // Pagination is managed below; zero bottom margin lets footers render without creating pages.
    margins: { top: 0, bottom: 0, left: 48, right: 48 },
    info: { Title: `${owner.brand} - ${statusLabel} - ${ref}`, Author: owner.name, Subject: options.sample ? 'MUSTER - fiktive Beispieldaten' : statusLabel, Creator: owner.brand },
    lang: 'de-DE',
  });
  doc.registerFont('Body', path.join(fontsDir, 'NotoSans-Regular.ttf'));
  doc.registerFont('Strong', path.join(fontsDir, 'NotoSans-SemiBold.ttf'));
  doc.registerFont('Display', path.join(fontsDir, 'NotoSerif-Regular.ttf'));
  const chunks = [];
  const result = new Promise((resolve, reject) => { doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  const left = 48, width = 499.28, bottom = 738;
  let y = 0, pageNumber = 0;

  function measure(text, font = 'Body', size = 10) { doc.font(font).fontSize(size); return doc.widthOfString(text); }
  function linesFor(value, available = width, font = 'Body', size = 10) {
    const all = [];
    for (const paragraph of sanitize(value).split('\n')) {
      if (!paragraph.trim()) { all.push(''); continue; }
      let line = '';
      for (const word of paragraph.trim().split(/\s+/u)) {
        if (measure(line ? `${line} ${word}` : word, font, size) <= available) { line = line ? `${line} ${word}` : word; continue; }
        if (line) { all.push(line); line = ''; }
        if (measure(word, font, size) <= available) { line = word; continue; }
        for (const char of Array.from(word)) {
          if (line && measure(line + char, font, size) > available) { all.push(line); line = ''; }
          line += char;
        }
      }
      if (line) all.push(line);
    }
    return all;
  }
  function fixed(text, x, at, { font = 'Body', size = 10, color = INK, available = width, align = 'left', link = null } = {}) {
    doc.font(font).fontSize(size).fillColor(color).text(sanitize(text), x, at, { width: available, align, lineBreak: false, ...(link ? { link } : {}) });
  }
  function newPage() {
    doc.addPage(); pageNumber += 1;
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(CREAM);
    doc.rect(0, 0, doc.page.width, 6).fill(WINE);
    fixed(owner.brand, left, 34, { font: 'Display', size: 22, color: WINE, available: width });
    fixed('MOMENTE FESTHALTEN. ERINNERUNGEN MITNEHMEN.', left, 67, { size: 7, color: MUTED });
    doc.moveTo(left, 89).lineTo(left + width, 89).strokeColor(RULE).lineWidth(0.65).stroke();
    if (options.sample) fixed('MUSTER · FIKTIVE DATEN', 370, 71, { font: 'Strong', size: 7, color: WINE, available: 177, align: 'right' });
    y = 109;
    if (pageNumber > 1) {
      text(`${statusLabel} · Fortsetzung`, { font: 'Strong', size: 8, color: WINE, lineHeight: 12, after: 19 });
    }
  }
  function ensure(height) { if (y + height > bottom) newPage(); }
  function text(value, { font = 'Body', size = 10, color = INK, lineHeight = 15, after = 10, x = left, available = width, link = null } = {}) {
    const lines = linesFor(value, available, font, size);
    if (lines.length > 1) ensure(lineHeight * 2);
    for (const line of lines) { ensure(lineHeight); fixed(line, x, y, { font, size, color, available, link }); y += lineHeight; }
    y += after;
  }
  function heading(value) {
    ensure(42); y += 3;
    fixed(value.toLocaleUpperCase('de-DE'), left, y, { font: 'Strong', size: 8.2, color: WINE }); y += 20;
  }
  function field(label, value) {
    ensure(33);
    fixed(label.toLocaleUpperCase('de-DE'), left, y, { font: 'Strong', size: 7.3, color: MUTED }); y += 13;
    text(value || 'Noch abzustimmen', { size: 10.2, lineHeight: 15, after: 10 });
  }
  function smallFieldPair(labelA, valueA, labelB, valueB) {
    const gap = 28, col = (width - gap) / 2;
    const a = linesFor(valueA, col, 'Body', 10.2), c = linesFor(valueB, col, 'Body', 10.2);
    const height = 14 + Math.max(a.length, c.length) * 15 + 12;
    if (height > 520) { field(labelA, valueA); field(labelB, valueB); return; }
    ensure(height);
    fixed(labelA.toLocaleUpperCase('de-DE'), left, y, { font: 'Strong', size: 7.3, color: MUTED, available: col });
    fixed(labelB.toLocaleUpperCase('de-DE'), left + col + gap, y, { font: 'Strong', size: 7.3, color: MUTED, available: col });
    const at = y + 14;
    a.forEach((line, i) => fixed(line, left, at + i * 15, { size: 10.2, available: col }));
    c.forEach((line, i) => fixed(line, left + col + gap, at + i * 15, { size: 10.2, available: col }));
    y += height;
  }
  function priceRow(label, amount, strong = false) {
    ensure(strong ? 38 : 25);
    fixed(label, left + 15, y, { font: strong ? 'Strong' : 'Body', size: strong ? 11 : 9.6, available: 355 });
    fixed(amount, left + 366, y - (strong ? 4 : 0), { font: strong ? 'Display' : 'Strong', size: strong ? 19 : 10, color: strong ? WINE : INK, available: 119, align: 'right' });
    y += strong ? 37 : 25;
  }

  newPage();
  text(statusLabel, { font: 'Strong', size: 8.8, color: WINE, lineHeight: 14, after: 9 });
  text(TITLES[kind], { font: 'Display', size: 27, color: WINE, lineHeight: 37, after: 8 });
  const intro = kind === 'inquiry'
    ? 'Vielen Dank für euer Interesse! Wir prüfen euren Wunschtermin und die Angaben zu eurer Feier. Diese Eingangsbestätigung reserviert noch keine Fotobox; eine Zahlung ist damit nicht verbunden.'
    : kind === 'offer'
      ? 'Hier findet ihr unser persönliches Angebot für eure Feier. Alle Leistungen und vereinbarten Kosten sind unten für euch zusammengefasst.'
      : paid
        ? 'Eure Zahlung ist eingegangen und eure Fotobox ist verbindlich gebucht. Hier findet ihr die vereinbarten Leistungen für eure Feier.'
        : 'Hier findet ihr die Daten eurer bestätigten Buchung. Dieses Dokument bestätigt für sich allein keinen Zahlungseingang.';
  text(options.introText || intro, { size: 9.8, lineHeight: 15, after: 8 });
  heading('Eure Veranstaltung');
  const delivery = b.delivery === 'pickup' ? 'Selbstabholung in Rendsburg' : b.delivery === 'custom' ? 'Individuelle Übergabe - wird abgestimmt' : 'Lieferung, Aufbau & Abholung';
  smallFieldPair('Termin', date(b.event_date), 'Übergabe', delivery);
  field('Veranstaltungsort', b.location);
  field('Für euch', [b.name, b.email, b.phone].filter(Boolean).map(sanitize).join('\n'));

  heading(kind === 'inquiry' ? 'Preisrahmen' : 'Leistungen & Preis');
  if(kind==='inquiry'&&b.delivery==='custom'){text('Individuelle Anfrage: Umfang, Verfügbarkeit und Gesamtpreis stimmen wir persönlich mit euch ab. Das Standardpaket von 250 € gilt für eine digitale Fotobox bis zu 24 Stunden.');}else{
  const exact = kind !== 'inquiry' || (b.delivery !== 'custom' && (b.delivery === 'pickup' || isDistance(b.distance)) && [b.base_cents, b.travel_cents, b.total_cents].every(isCents) && b.base_cents + b.travel_cents === b.total_cents);
  ensure(exact ? 112 : 87);
  doc.roundedRect(left, y - 5, width, exact ? 98 : 72, 3).fill('#f0e9e1'); y += 9;
  priceRow('Eine digitale Fotobox · bis zu 24 Stunden', money(base));
  if (exact) { priceRow('Vereinbarte Fahrtkosten', money(b.travel_cents)); priceRow(kind === 'inquiry' ? 'Unverbindliche Kostenschätzung' : 'Gesamtbetrag', money(b.total_cents), true); }
  else { fixed('zzgl. abgestimmter Fahrtkosten', left + 15, y, { size: 9.5, color: MUTED, available: 440 }); y += 38; }
  y += 7;
  }
  text(options.taxText || 'Die Leistungen sind gemäß § 19 UStG umsatzsteuerfrei.', { size: 8.1, color: MUTED, lineHeight: 12, after: 7 });
  if (b.delivery !== 'pickup' && isDistance(b.distance)) {
    const billed = isDistance(b.billed_distance) ? `, auf ${km(b.billed_distance)} km aufgerundet` : '';
    text(`Fahrtbasis: ${km(b.distance)} km einfache Straßenentfernung${billed}. Vier Strecken für Lieferung und Abholung; je Strecke sind die ersten 10 km frei.`, { size: 8.2, color: MUTED, lineHeight: 12.5, after: 9 });
  }
  text(options.serviceText || 'Digitale Fotos · Kamera mit Livebild & Fernauslöser · keine Sofortausdrucke. Die Fotos werden nach der Veranstaltung manuell in euren eigenen Google-Drive-Ordner übertragen. Übergabezeiten stimmen wir persönlich ab.', { size: 8.3, color: MUTED, lineHeight: 12.5, after: 6 });
  if (kind === 'offer') {
    heading('Gültigkeit & Buchung');
    text(`Gültig bis ${date(b.quote_until, true)}.`, { font: 'Strong', size: 9.6, lineHeight: 14, after: 5 });
    text(options.acceptanceText || 'Ihr könnt das Angebot innerhalb der angegebenen Gültigkeit online annehmen und bezahlen. Die verbindliche Buchungsbestätigung erhaltet ihr nach erfolgreicher Zahlung.', { size: 9.2, lineHeight: 14, after: 8 });
    const offerUrl = httpsUrl(options.offerUrl);
    if (offerUrl) text('Angebot online ansehen & buchen', { font: 'Strong', size: 10, color: WINE, link: offerUrl, lineHeight: 15, after: 4 });
  }
  if (b.message && (options.includeMessage ?? (kind === 'inquiry'))) { heading('Eure Nachricht'); text(b.message, { size: 9.2, lineHeight: 14, after: 9 }); }
  if (kind !== 'inquiry' && b.terms_version) {
    const termsUrl = httpsUrl(options.termsUrl);
    text(`Buchungsbedingungen: Version ${sanitize(b.terms_version)}${termsUrl ? ' · online ansehen' : ''}`, { size: 8, color: MUTED, lineHeight: 12, after: 6, link: termsUrl });
  }

  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i += 1) {
    doc.switchToPage(pages.start + i);
    if (options.sample) {
      doc.save().opacity(0.07).rotate(-28, { origin: [298, 420] });
      fixed('MUSTER', 92, 385, { font: 'Strong', size: 76, color: WINE, available: 435, align: 'center' }); doc.restore();
    }
    doc.moveTo(left, 761).lineTo(left + width, 761).strokeColor(RULE).lineWidth(0.6).stroke();
    fixed(`${owner.name} · ${owner.street} · ${owner.city}`, left, 774, { size: 7.4, color: MUTED });
    fixed(`${owner.phone} · ${owner.email}`, left, 788, { size: 7.4, color: MUTED });
    const whatsapp = `https://wa.me/${String(owner.phone).replace(/\D/g, '')}`;
    fixed('Fragen? Schreibt uns auf WhatsApp.', left, 802, { size: 7.4, color: WINE, link: whatsapp });
    const refLines = linesFor(`Ref. ${ref}`, 195, 'Strong', 7.1);
    fixed(refLines[0] || '', left + width - 195, 775, { size: 7.1, font: 'Strong', color: WINE, available: 195, align: 'right' });
    if (refLines.length > 1) fixed(refLines[1], left + width - 195, 786, { size: 7.1, font: 'Strong', color: WINE, available: 195, align: 'right' });
    else if (b.created) fixed(`Anfrage vom ${date(b.created)}`, left + width - 195, 788, { size: 7.1, color: MUTED, available: 195, align: 'right' });
    fixed(`Seite ${i + 1} von ${pages.count}`, left + width - 195, 803, { size: 7.1, color: MUTED, available: 195, align: 'right' });
  }
  doc.end();
  return result;
}

export default renderBookingPdf;
