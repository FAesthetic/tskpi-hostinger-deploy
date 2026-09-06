'use strict';
globalThis.fotoboxPricing=Object.freeze({
 quote(distanceKm,delivery='delivery',extensionDays=0){
  if(typeof distanceKm!=='number'||!Number.isFinite(distanceKm)||distanceKm<0||distanceKm>1000)throw new RangeError('Die einfache Entfernung muss zwischen 0 und 1000 km liegen.');
  if(!['pickup','delivery'].includes(delivery)||![0,1].includes(extensionDays))throw new RangeError('Bitte ein gültiges Paket und eine Mietdauer auswählen.');
  const billedDistanceKm=delivery==='pickup'?0:Math.ceil(distanceKm/5)*5,baseCents=delivery==='pickup'?19900:24900,travelCents=delivery==='pickup'?0:Math.max(0,billedDistanceKm-10)*240,extensionCents=extensionDays*4900;
  return {baseCents,travelCents,extensionCents,totalCents:baseCents+travelCents+extensionCents,billedDistanceKm};
 }
});
