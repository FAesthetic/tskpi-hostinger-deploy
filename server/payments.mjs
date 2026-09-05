// Durable payment attempts are stored before provider calls. Uncertain attempts retain inventory.
export function createPayments({store,stripe,origin,confirmationText}) {
 const {db,get,set,enqueue}=store;
 const locks=new Map();
 async function locked(id,fn){if(locks.has(id))return locks.get(id);const job=Promise.resolve().then(fn);locks.set(id,job);try{return await job;}finally{locks.delete(id);}}
 const intentId=s=>typeof s.payment_intent==='string'?s.payment_intent:s.payment_intent?.id;
 function applyRefund(b,r){
  if(!b)return;return store.transaction(()=>{
  db.prepare("UPDATE bookings SET status='cancelled',refund_id=?,refund_status=? WHERE id=?").run(r.id,r.status||'pending',b.id);
  if(r.status==='succeeded')enqueue(b.email,'Erstattung zu '+b.reference,`Die vollständige Erstattung zu ${b.reference} wurde von unserem Zahlungsanbieter ausgeführt. Die Buchung ist storniert. Die Gutschrift erfolgt über die ursprünglich verwendete Zahlungsart.\nHerzblende`,null,'refund-'+b.id);
  if(r.status==='failed'||r.status==='canceled')enqueue(get('owner_email','uhighcauseidope@gmail.com'),'Herzblende: Erstattung fehlgeschlagen',`Die Buchung ${b.reference} ist storniert, aber die Erstattung ist fehlgeschlagen. Bitte den Vorgang in Stripe prüfen und die Rückzahlung mit dem Kunden klären.`,null,'refund-failed-'+r.id);
 });}
 async function applySession(s){
  let b=store.booking(s.metadata?.booking_id);if(!b)return;
  if(!b.session_id&&b.status==='checkout'&&String(b.checkout_expires)===s.metadata?.attempt){
   if(s.currency!=='eur'||s.amount_total!==b.total_cents)throw Error('Zahlungsbetrag stimmt nicht überein.');
   db.prepare('UPDATE bookings SET session_id=? WHERE id=? AND session_id IS NULL').run(s.id,b.id);b=store.booking(b.id);
  }
  if(b.session_id!==s.id)return;
  if(s.currency!=='eur'||s.amount_total!==b.total_cents)throw Error('Zahlungsbetrag stimmt nicht überein.');
  if(s.payment_status==='paid'){
   const pi=await stripe().paymentIntents.retrieve(intentId(s),{expand:['latest_charge']});
   const charge=typeof pi.latest_charge==='object'?pi.latest_charge:pi.latest_charge?await stripe().charges.retrieve(pi.latest_charge):null;
   if(!charge)throw Error('Zahlungseingang muss beim Anbieter bestätigt werden.');
   db.prepare('UPDATE bookings SET payment_intent=? WHERE id=?').run(pi.id,b.id);
   if(charge.refunded||charge.amount_refunded>=b.total_cents){db.prepare("UPDATE bookings SET status='cancelled',refund_status='succeeded' WHERE id=?").run(b.id);return;}
   if(charge.amount_refunded>0){db.prepare("UPDATE bookings SET status='payment_review' WHERE id=? AND status NOT IN ('cancelled','refunded')").run(b.id);return;}
  }
  store.applySession(s,{confirmationText});
 }
 async function createCheckout(b){return locked('checkout:'+b.id,async()=>{
  b=store.booking(b.id);
  if(b.session_id){let s=await stripe().checkout.sessions.retrieve(b.session_id);if(s.status==='open'&&b.checkout_expires*1000<=Date.now())s=await stripe().checkout.sessions.expire(s.id);await applySession(s);return s;}
  if(b.status!=='checkout')throw Error('Das Angebot ist aktuell nicht zur Zahlung verfügbar.');
  // Stripe idempotency records have a limited lifetime. Never replay an ambiguous old attempt.
  if(Date.now()-b.checkout_expires*1000>22*3600000){store.transaction(()=>{db.prepare('UPDATE bookings SET review_reason=? WHERE id=?').run('Zahlungsversuch ohne bestätigte Anbieterantwort. Bitte erneut abgleichen; bis zur Klärung bleibt die Box reserviert.',b.id);enqueue(get('owner_email','uhighcauseidope@gmail.com'),'Herzblende: Zahlungsversuch prüfen',`Bei ${b.reference} ist ein Zahlungsversuch ungeklärt. Bitte in der Verwaltung erneut abgleichen.`,null,'orphan-'+b.id+'-'+b.checkout_expires);});throw Error('Diese Zahlung muss persönlich geprüft werden. Bitte ruft uns an.');}
  const key='checkout-params-'+b.id+'-'+b.checkout_expires;
  let params=get(key);
  if(!params){const access=get('booking_access_'+b.id);params={mode:'payment',payment_method_types:['card',...(get('klarna_approved')&&b.customer_type==='private'?['klarna']:[])],client_reference_id:b.reference,customer_email:b.email,billing_address_collection:'required',locale:'de',metadata:{booking_id:b.id,attempt:String(b.checkout_expires)},payment_intent_data:{metadata:{booking_id:b.id,attempt:String(b.checkout_expires)},description:`Herzblende ${b.reference} – ${b.event_date}`,receipt_email:b.email},line_items:[{quantity:1,price_data:{currency:'eur',unit_amount:b.base_cents,product_data:{name:'Herzblende – eine digitale Fotobox',description:`Veranstaltung ${b.event_date}; bis zu 24 Stunden. Leistungen gemäß § 19 UStG umsatzsteuerfrei.`}}},...(b.travel_cents?[{quantity:1,price_data:{currency:'eur',unit_amount:b.travel_cents,product_data:{name:'Vereinbarte Lieferung und Abholung',description:`Vier Strecken; ${b.distance} km einfache Straßenentfernung, 10 km frei.`}}}]:[])],success_url:`${origin}/buchen/?angebot=${access}&zahlung=zurueck`,cancel_url:`${origin}/buchen/?angebot=${access}&zahlung=abgebrochen`,custom_text:{submit:{message:'Mit der Zahlung bucht ihr die bezeichnete Fotobox verbindlich. Es gelten die vorab angezeigten Buchungsbedingungen und die Widerrufsbelehrung.'}}};set(key,params);}
  let s=await stripe().checkout.sessions.create(params,{idempotencyKey:'checkout-'+b.id+'-'+b.checkout_expires});
  db.prepare('UPDATE bookings SET session_id=? WHERE id=? AND session_id IS NULL').run(s.id,b.id);
  if(s.status==='open'&&b.checkout_expires*1000<=Date.now())s=await stripe().checkout.sessions.expire(s.id);
  await applySession(s);return s;
 });}
 async function refund(b){return locked('refund:'+b.id,async()=>{
  if(!b)throw Error('Buchung nicht gefunden.');b=store.booking(b.id);if(!b?.payment_intent)throw Error('Keine erstattbare Zahlung gefunden.');
  if(!b.refund_status){if(!['confirmed','payment_review'].includes(b.status))throw Error('Buchung kann nicht automatisch erstattet werden.');store.transaction(()=>{db.prepare("UPDATE bookings SET status='cancelled',refund_status='pending' WHERE id=?").run(b.id);set('refund-start-'+b.id,Date.now());});}
  b=store.booking(b.id);
  let r;if(b.refund_id)r=await stripe().refunds.retrieve(b.refund_id);else {
   if(Date.now()-get('refund-start-'+b.id,0)>23*3600000)throw Error('Bitte Erstattung in Stripe prüfen. Es wird keine zweite Erstattung ausgelöst.');
   r=await stripe().refunds.create({payment_intent:b.payment_intent,metadata:{booking_id:b.id}},{idempotencyKey:'full-refund-'+b.id});
  }
  applyRefund(b,r);return r;
 });}
 async function reconcile(){
  db.prepare("UPDATE bookings SET status='expired' WHERE status='quoted' AND session_id IS NULL AND quote_until<?").run(Date.now());
  if(!get('stripe_key'))return;
  const rows=db.prepare("SELECT * FROM bookings WHERE status IN ('checkout','processing') OR refund_status IN ('pending','requires_action') OR (refund_id IS NOT NULL AND confirmed>?) ORDER BY created LIMIT 100").all(Date.now()-35*86400000);
  for(const b of rows)try{if(b.refund_id||b.refund_status==='pending')await refund(b);else if(b.session_id){let s=await stripe().checkout.sessions.retrieve(b.session_id);if(s.status==='open'&&b.checkout_expires*1000<=Date.now())s=await stripe().checkout.sessions.expire(s.id);await applySession(s);if(s.status==='complete'&&s.payment_status!=='paid'&&intentId(s)){const pi=await stripe().paymentIntents.retrieve(intentId(s));if(['canceled','requires_payment_method'].includes(pi.status))db.prepare("UPDATE bookings SET status='expired' WHERE id=? AND status='processing'").run(b.id);}}else await createCheckout(b);}catch{/* Unknown provider state keeps the reservation; owner sees the unresolved attempt. */}
 }
 const ownsIntent=(b,pi)=>b&&(b.payment_intent?b.payment_intent===pi.id:String(b.checkout_expires)===pi.metadata?.attempt);
 async function recover(id){return locked('checkout:'+id,async()=>{const b=store.booking(id);if(!b||!b.review_reason)throw Error('Kein ungeklärter Versuch gefunden.');const matches=[];let cursor;let complete=false;for(let page=0;page<20;page++){const result=await stripe().checkout.sessions.list({limit:100,created:{gte:b.checkout_expires-31*60-60,lte:b.checkout_expires+23*3600},...(cursor?{starting_after:cursor}:{})});matches.push(...result.data.filter(s=>s.metadata?.booking_id===b.id&&s.metadata?.attempt===String(b.checkout_expires)));if(!result.has_more){complete=true;break;}cursor=result.data.at(-1).id;}if(!complete||matches.length>1)throw Error('Der Versuch muss direkt in Stripe geprüft werden. Die Reservierung bleibt erhalten.');if(matches.length){db.prepare('UPDATE bookings SET session_id=?,review_reason=NULL WHERE id=?').run(matches[0].id,b.id);let s=await stripe().checkout.sessions.retrieve(matches[0].id);if(s.status==='open')s=await stripe().checkout.sessions.expire(s.id);await applySession(s);}else{db.prepare("UPDATE bookings SET status='expired',review_reason=NULL WHERE id=?").run(b.id);}return {ok:true};});}
 async function handleEvent(event){
  if(event.type.startsWith('checkout.session.')){await applySession(await stripe().checkout.sessions.retrieve(event.data.object.id));return;}
  if(event.type.startsWith('refund.')){const r=await stripe().refunds.retrieve(event.data.object.id);const pi=await stripe().paymentIntents.retrieve(typeof r.payment_intent==='string'?r.payment_intent:r.payment_intent.id);const b=store.booking(r.metadata?.booking_id||pi.metadata?.booking_id)||db.prepare('SELECT * FROM bookings WHERE payment_intent=?').get(pi.id);if(ownsIntent(b,pi)&&(r.id===b.refund_id||r.amount===b.total_cents)){db.prepare('UPDATE bookings SET payment_intent=? WHERE id=?').run(pi.id,b.id);applyRefund(b,r);}return;}
  if(event.type==='charge.refunded'){const c=await stripe().charges.retrieve(event.data.object.id);const pi=await stripe().paymentIntents.retrieve(typeof c.payment_intent==='string'?c.payment_intent:c.payment_intent.id);const b=store.booking(pi.metadata?.booking_id)||db.prepare('SELECT * FROM bookings WHERE payment_intent=?').get(pi.id);if(!ownsIntent(b,pi))return;if(c.refunded||c.amount_refunded>=b.total_cents)db.prepare("UPDATE bookings SET status='cancelled',payment_intent=?,refund_status='succeeded' WHERE id=?").run(pi.id,b.id);else if(c.amount_refunded>0)db.prepare("UPDATE bookings SET status='payment_review',payment_intent=? WHERE id=? AND status NOT IN ('cancelled','refunded')").run(pi.id,b.id);}
 }
 return {createCheckout,applySession,refund,reconcile,handleEvent,recover};
}
