const assert = require('node:assert/strict');
const { test } = require('node:test');
const { range, collect, search, openGaps, occupied, notesFor, saveNote, weekText } = require('../assets/calendar-planning.js');
const event = (id, start, end, extra = {}) => ({ id, title: id, start, end, ...extra });

test('date ranges use local calendar days through DST and leap years, with a strict bounded horizon', () => {
  assert.deepEqual(range('2026-11-01', '2026-11-03'), ['2026-11-01', '2026-11-02', '2026-11-03']);
  assert.deepEqual(range('2028-02-28', '2028-03-01'), ['2028-02-28', '2028-02-29', '2028-03-01']);
  for (const [a, b] of [['2026-02-29','2026-03-01'], ['2026-03-02','2026-03-01'], ['2026-01-01','2027-01-02'], ['bad','2026-01-01']]) assert.equal(range(a, b), null);
  assert.equal(range('2026-01-01', '2027-01-01').length, 366);
});
test('finder keeps recurrence occurrences on separate dates, excludes cancellations, and does not mutate source events', () => {
  const source = Object.freeze([Object.freeze(event('repeat','09:00','10:00')), Object.freeze(event('cancelled','09:00','10:00',{status:'cancelled'}))]);
  const result = collect('2026-10-21', '2026-10-22', () => [...source, source[0]]);
  assert.deepEqual(result.map(e => [e.id, e.occurrenceDate]), [['repeat','2026-10-21'],['repeat','2026-10-22']]);
  assert.equal(source[0].occurrenceDate, undefined);
  assert.equal(collect('bad', 'bad', () => { throw Error('must not query invalid dates'); }), null);
  assert.deepEqual(search([event('Café training','09:00','10:00',{location:'Pool',searchLabel:'Family'})], 'cafe family pool').map(e=>e.id), ['Café training']);
});
test('open-time gaps merge overlaps and include travel, buffers, cancellations and transparent external events correctly', () => {
  const plans = [event('a','09:00','10:00',{travelMinutes:30,bufferBeforeMinutes:15,bufferAfterMinutes:15}), event('b','09:45','11:00'), event('c','13:00','14:00'), event('cancel','11:00','13:00',{status:'cancelled'}), event('free','11:00','13:00',{externalBusy:false})];
  assert.deepEqual(openGaps(plans,480,1080,30), [{start:660,end:780},{start:840,end:1080}]);
  assert.deepEqual(openGaps([],480,1080,60),[{start:480,end:1080}]);
  assert.deepEqual(openGaps(plans,1080,480,30),[]);
});
test('all-day plans and trips block open time; holidays do not; malformed busy plans fail conservatively', () => {
  for (const extra of [{allDay:true},{eventType:'trip'},{start:'bad'}]) assert.deepEqual(openGaps([event('busy','09:00','10:00',extra)],480,1080,30),[]);
  assert.deepEqual(openGaps([event('holiday','00:00','23:59',{allDay:true,eventType:'holiday'})],480,1080,30),[{start:480,end:1080}]);
  assert.deepEqual(openGaps([],480,1080,0),[]);
});
test('comparison counts timed occupied minutes once and keeps untimed or invalid plans out of totals', () => {
  assert.equal(occupied([event('a','09:00','10:00'),event('b','09:30','10:30'),event('all','00:00','23:59',{allDay:true}),event('bad','11:00','10:00')]),90);
});
test('private note saves merge fresh storage and isolate accounts and calendars with stale-scope protection', () => {
  const values = new Map(), storage = { getItem:k=>values.get(k)||null, setItem:(k,v)=>values.set(k,v) };
  assert.equal(saveNote(storage,'accountA:calendarA','accountA:calendarA','2026-10-21','First note'),true);
  assert.equal(saveNote(storage,'accountA:calendarA','accountA:calendarA','2026-10-22','Second note'),true);
  assert.equal(saveNote(storage,'accountB:calendarB','accountA:calendarA','2026-10-21','Wrong scope'),false);
  assert.equal(values.has('accountB:calendarB'),false);
  assert.equal(JSON.parse(values.get('accountA:calendarA'))['2026-10-21'],'First note');
  assert.equal(saveNote(storage,'accountA:calendarA','accountA:calendarA','2026-10-21',''),true);
  assert.deepEqual(JSON.parse(values.get('accountA:calendarA')),{'2026-10-22':'Second note'});
});
test('note validation and failed persistence preserve saved data', () => {
  assert.deepEqual(notesFor({'2026-02-30':'bad','2026-10-21':'valid','2026-10-22':12,'2026-10-23':'x'.repeat(2001)}),{'2026-10-21':'valid'});
  const storage = { getItem:()=>'{"2026-10-21":"Original"}', setItem:()=>{throw Error('quota');} };
  assert.equal(saveNote(storage,'a','a','2026-10-21','Changed'),false);
  assert.equal(saveNote(storage,'a','a','2026-10-21','x'.repeat(2001)),false);
  assert.equal(storage.getItem(),' {"2026-10-21":"Original"}'.trim());
});
test('weekly agenda includes empty dates and only includes event notes after opting in', () => {
  const plans = [{...event('Swim','09:00','10:00',{notes:'Private event detail',items:'Goggles'}),occurrenceDate:'2026-10-21'}];
  const labels = { title:'Week',date:d=>d,time:()=> '9–10',person:()=> 'Andrew',empty:'Nothing scheduled',details:false };
  const text = weekText(plans,['2026-10-21','2026-10-22'],labels);
  assert.match(text,/Swim\n9–10 · Andrew/); assert.match(text,/2026-10-22\n\nNothing scheduled/); assert.doesNotMatch(text,/Private event detail|Goggles/);
  assert.match(weekText(plans,['2026-10-21'],{...labels,details:true}),/Goggles\nPrivate event detail/);
});
test('open-time windows account for travel and buffers spilling over from adjacent dates', () => {
  const plans = [event('late','23:00','23:50',{dayOffset:-1,bufferAfterMinutes:60}),event('early','00:15','01:00',{dayOffset:1,travelMinutes:60})];
  assert.deepEqual(openGaps(plans,0,1440,30),[{start:50,end:1395}]);
});
