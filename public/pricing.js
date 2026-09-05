'use strict';
globalThis.fotoboxPricing = Object.freeze({
  quote(distanceKm) {
    if (typeof distanceKm !== 'number' || !Number.isFinite(distanceKm) || distanceKm < 0 || distanceKm > 1000) {
      throw new RangeError('Die einfache Entfernung muss zwischen 0 und 1000 km liegen.');
    }
    const billedDistanceKm = Math.ceil(distanceKm / 5) * 5;
    const travelCents = Math.max(0, billedDistanceKm - 10) * 4 * 60;
    return { baseCents: 25000, travelCents, totalCents: 25000 + travelCents, billedDistanceKm };
  }
});
