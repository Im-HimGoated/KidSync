const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {changes,peopleFor,adultConflicts}=require('../assets/family-coordination.js');
const {planMove,conflictDetails,date,shift}=require('../assets/reschedule-review.js');
const {externalEvents,safeGraphUrl}=require('../assets/external-calendars.js');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
const event={id:'piano',title:'Piano',child:'Sam',startDate:'2026-11-02',start:'15:00',end:'16:00',recurrence:'weekly',repeatDays:[1,3],repeatInterval:1,repeatUntil:'2026-12-30',status:'confirmed',allDay:false};
test('comparison includes all affected people without mutating attendees or child profiles',()=>{
  const children=['Sam','Alex'], attendees=['Sam'];
  assert.deepEqual(peopleFor({child:'__family__',responsible:'Pat'},children),['Sam','Alex','Pat']);
  assert.deepEqual(children,['Sam','Alex']);
  assert.deepEqual(peopleFor({child:'__family__',attendees,responsible:'Pat'},children),['Sam','Pat']);assert.deepEqual(attendees,['Sam']);
});
test('adult conflicts include travel buffers, normalize names, and ignore cancelled events',()=>{
  const a={...event,responsible:'Pat'},b={...event,id:'soccer',child:'Alex',responsible:' pat ',start:'16:15',end:'17:00',travelMinutes:30};
  assert.deepEqual(adultConflicts([a,b]),[['piano','soccer']]);
  assert.deepEqual(adultConflicts([a,{...b,status:'cancelled'}]),[]);
  assert.deepEqual(adultConflicts([a,{...b,start:'16:30'}]),[]);
});
test('change summaries report exact logistics/time differences without unrelated fields',()=>{
  assert.deepEqual(changes(event,{...event,start:'15:30',location:'Park'}),[{key:'start',before:'15:00',after:'15:30'},{key:'location',before:'',after:'Park'}]);
  assert(changes(null,event).some(item=>item.key==='title'));assert(changes(event,null).some(item=>item.key==='title'));
});
test('single-occurrence move preserves the series and makes a standalone event',()=>{
  const source=JSON.stringify(event),p=planMove(event,'2026-11-09','2026-11-10',990,false,'one','new-event');
  assert.equal(JSON.stringify(event),source);assert.equal(p.single,true);assert.deepEqual(p.original.excludedDates,['2026-11-09']);
  assert.equal(p.original.startDate,'2026-11-02');assert.equal(p.next.id,'new-event');assert.equal(p.next.recurrence,'none');
  assert.equal(p.next.startDate,'2026-11-10');assert.equal(p.next.start,'16:30');assert.equal(p.next.end,'17:30');assert.equal(p.next.repeatUntil,'');
});
test('entire-series move shifts every weekday, repeat boundary and excluded occurrence consistently',()=>{
  const p=planMove({...event,excludedDates:['2026-11-16']},'2026-11-09','2026-11-10',960,false,'series');
  assert.equal(p.single,false);assert.equal(p.next.startDate,'2026-11-03');assert.deepEqual(p.next.repeatDays,[2,4]);
  assert.equal(p.next.repeatUntil,'2026-12-31');assert.deepEqual(p.next.excludedDates,['2026-11-17']);
});
test('moves preserve trip length and clamp time without invalid 24:00 or loss of duration',()=>{
  const p=planMove({...event,recurrence:'none',eventType:'trip',startDate:'2026-11-02',endDate:'2026-11-05',allDay:true},'2026-11-03','2026-11-10',null,true);
  assert.equal(p.next.startDate,'2026-11-09');assert.equal(p.next.endDate,'2026-11-12');
  const late=planMove(event,'2026-11-02','2026-11-03',1430,false);assert.equal(late.next.start,'22:59');assert.equal(late.next.end,'23:59');
  assert.throws(()=>planMove(event,'2026-11-02','2026-02-31',900,false));assert.equal(date('2026-02-31'),null);
  assert.equal(shift('2026-12-31',1),'2027-01-01');
});
test('excluded occurrences are honored by the production recurrence engine',()=>{
  const context=vm.createContext({});
  for(const name of ['dateKey','parseDateKey','dateSerial','activityStartsOn']){
    const start=html.indexOf(`    function ${name}(`);vm.runInContext(html.slice(start,html.indexOf('\n    }\n',start)+7),context);
  }
  const {original}=planMove(event,'2026-11-09','2026-11-10',900,false,'one','new');
  assert.equal(context.activityStartsOn(original,context.parseDateKey('2026-11-09')),false);
  assert.equal(context.activityStartsOn(original,context.parseDateKey('2026-11-16')),true);
});
test('reschedule checks family and adult conflicts even across different children',()=>{
  const a={...event,responsible:'Pat'},b={...event,id:'soccer',child:'Alex',responsible:'Pat',start:'16:15',end:'17:00',travelMinutes:30};
  assert.equal(conflictDetails(a,[b]).length,1);
  assert.equal(conflictDetails(a,[{...b,responsible:'Other'}]).length,0);
  assert.equal(conflictDetails(a,[{...b,child:'__family__',responsible:'Other'}]).length,1);
});
test('Google all-day dates preserve exclusive end and never become a day early',()=>{
  const [e]=externalEvents({id:'trip',summary:'Trip',start:{date:'2026-11-01'},end:{date:'2026-11-04'}},'google');
  assert.equal(e.startDate,'2026-11-01');assert.equal(e.endDate,'2026-11-03');assert.equal(e.allDay,true);assert.equal(e.externalSource,'google');
  assert.equal(externalEvents({id:'bad',start:{date:'2026-11-01'},end:{date:'2026-10-31'}},'google').length,0);
});
test('Google and Outlook UTC events normalize identically and cancelled/free events keep their meaning',()=>{
  const g=externalEvents({id:'g',summary:'Meeting',start:{dateTime:'2026-11-01T16:00:00Z'},end:{dateTime:'2026-11-01T17:00:00Z'},transparency:'transparent'},'google')[0];
  const m=externalEvents({id:'m',subject:'Meeting',start:{dateTime:'2026-11-01T16:00:00',timeZone:'UTC'},end:{dateTime:'2026-11-01T17:00:00',timeZone:'UTC'},showAs:'free'},'microsoft')[0];
  assert.equal(g.startDate,m.startDate);assert.equal(g.start,m.start);assert.equal(g.externalBusy,false);assert.equal(m.externalBusy,false);
  assert.deepEqual(externalEvents({id:'cancelled',status:'cancelled'},'google'),[]);
});
test('overnight external events are split into dated segments, not reversed time ranges',()=>{
  const rows=externalEvents({id:'overnight',start:{dateTime:'2026-11-01T00:00:00Z'},end:{dateTime:'2026-11-04T00:00:00Z'}},'google');
  assert(rows.length>=3);for(const row of rows)assert(row.start<row.end);assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
});
test('Graph pagination refuses token exfiltration to non-Microsoft URLs',()=>{
  assert.equal(safeGraphUrl('https://graph.microsoft.com/v1.0/me/calendarView?$skip=10'),'https://graph.microsoft.com/v1.0/me/calendarView?$skip=10');
  for(const url of ['https://example.com/v1.0/events','http://graph.microsoft.com/v1.0/events','https://graph.microsoft.com.attacker.test/v1.0/events','https://graph.microsoft.com/beta/events'])assert.throws(()=>safeGraphUrl(url));
});
test('all new modules parse and dictionaries cover English and Chinese equally',()=>{
  for(const name of ['family-coordination','reschedule-review','external-calendars']){
    const source=fs.readFileSync(require.resolve(`../assets/${name}.js`),'utf8');new vm.Script(source);
    const start=source.indexOf('  const words='),spaced=source.indexOf('  const words =');
    const begin=start<0?spaced:start,end=source.indexOf('  const tx',begin);
    const words=vm.runInNewContext(source.slice(begin,end)+'\nwords');assert.deepEqual(Object.keys(words.en).sort(),Object.keys(words.zh).sort());
  }
});
test('OAuth callbacks bypass service-worker cache and use local MSAL bridge assets',()=>{
  const worker=fs.readFileSync(require.resolve('../sw.js'),'utf8'),callback=fs.readFileSync(require.resolve('../oauth-redirect.html'),'utf8');
  assert(worker.indexOf('/oauth-redirect.html')<worker.indexOf('cache.match(event.request)'));
  assert.match(worker,/fetch\(event.request, \{ cache: "no-store" \}\)/);
  assert.match(callback,/\.\/assets\/vendor\/redirect-bridge\/msal-redirect-bridge.min.js/);
  assert(!callback.includes('https://'));
  const headers=JSON.parse(fs.readFileSync(require.resolve('../vercel.json'),'utf8')).headers;
  assert(headers.some(h=>h.source==='/oauth-redirect.html'&&h.headers.some(v=>v.key==='Cache-Control'&&v.value==='no-store')));
});
