import {validDate,plusDays,today} from './core.mjs';
const held="'quoted','checkout','processing','confirmed','payment_review','refund_pending'";
export function calendarRange(search,{owner=false}={}){
 const current=today(),minDate=owner?plusDays(current,-365):current,maxDate=plusDays(current,540),month=search.get('month');let start,end;
 if(month!==null){if(!/^\d{4}-\d{2}$/.test(month)||!validDate(month+'-01'))throw Error('Bitte einen gültigen Monat auswählen.');start=month+'-01';const d=new Date(start+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);end=d.toISOString().slice(0,10);if(end<=minDate||start>maxDate)throw Error('Dieser Monat liegt außerhalb des Buchungszeitraums.');}
 else{start=search.get('from')||current;if(!validDate(start)||start<minDate||start>maxDate)throw Error('Ungültiger Zeitraum.');end=plusDays(start,Math.min(31,Math.floor((Date.parse(maxDate)-Date.parse(start))/86400000)+1));}
 const dates=[];for(let date=start;date<end;date=plusDays(date,1))dates.push(date);
 return {month:start.slice(0,7),start,end,minDate,maxDate,dates};
}
export function calendarData(store,range,{owner=false}={}){
 const reviewed=!!store.get('calendar_reviewed');
 const days=range.dates.map(date=>{
  const outside=date<range.minDate||date>range.maxDate;
  const free=store.available(date,plusDays(date,2));
  const status=outside?(date<range.minDate?'past':'outside_range'):!reviewed&&!owner?'unknown':free.length?'available':'unavailable';
  return {date,status,available:outside?0:!reviewed&&!owner?null:free.length,...(owner?{units:free}:{})};
 });
 const result={month:range.month,reviewed,minDate:range.minDate,maxDate:range.maxDate,days};
 if(owner){result.events=store.db.prepare(`SELECT id,reference,name,event_date,end_date,unit,status FROM bookings WHERE status IN (${held}) AND event_date<? AND end_date>? ORDER BY event_date`).all(plusDays(range.end,1),range.start);result.blocks=store.db.prepare('SELECT * FROM blocks WHERE start_date<? AND end_date>? ORDER BY start_date').all(plusDays(range.end,1),range.start);}
 return result;
}
