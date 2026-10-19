const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../assets/external-calendars.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
  const nodes=new Map(),calls=[],handlers={},oauth={},state={activities:[]};let sequence=0,fetcher=async()=>({ok:true,json:async()=>({items:[]})});
  function node(name){
    if(nodes.has(name))return nodes.get(name);
    const n={handlers:{},innerHTML:'',textContent:'',open:false,hidden:false,src:'',append(){},prepend(){},after(){},addEventListener(type,fn){this.handlers[type]=fn;},setAttribute(){},showModal(){this.open=true;},close(){this.open=false;}};
    Object.defineProperty(n,'id',{set(value){nodes.set(value,n);},get(){return name;}});nodes.set(name,n);return n;
  }
  const context=vm.createContext({Date,Map,Set,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,console,
    document:{createElement:tag=>node(`${tag}-${sequence++}`),body:node('body'),head:node('head'),querySelector:()=>node('menu'),getElementById:id=>nodes.get(id)||null,addEventListener:(k,fn)=>{handlers[k]=fn;}},
    currentLanguage:'en',selectedDate:new Date(2026,10,1),state,currentAccount:'owner',scheduleStorageKey:()=>context.currentAccount,
    escapeHtml:s=>String(s).replaceAll('<','&lt;'),location:{protocol:'https:',href:'https://kidsync.example/index.html'},navigator:{onLine:true},
    addDays:(d,n)=>{const v=new Date(d);v.setDate(v.getDate()+n);return v;},renderAll:()=>{calls.push('render');context.window.KidsSyncExternal?.renderOverlay();},
    fetch:async(url,options)=>{calls.push({url,options});return fetcher(url,options);},
    google:{accounts:{oauth2:{initTokenClient:options=>{oauth.google=options;return{requestAccessToken(){options.callback({access_token:'test-google-token',expires_in:3600});}};},revoke:()=>calls.push('revoke')}}},
    window:{KIDSSYNC_CALENDAR_CONNECTIONS:{googleClientId:'public-google-id',microsoftClientId:'public-microsoft-id'}}
  });
  context.window.google=context.google;
  context.window.msal={PublicClientApplication:class{async initialize(){}async clearCache(){calls.push('clear-msal');}async acquireTokenPopup(options){oauth.microsoft=options;return{accessToken:'test-microsoft-token',expiresOn:new Date(Date.now()+3600000)};}}};
  node('calendarInsights');node('moreActions');vm.runInContext(source,context);
  const click=dataset=>node('externalCalendarsDialog').handlers.click({target:{closest:()=>({dataset,hasAttribute:()=>false})}});
  return{context,node,calls,oauth,state,click,setFetch:fn=>{fetcher=fn;},open:()=>node('openExternalCalendars').handlers.click()};
}
const raw={id:'a',summary:'Private appointment',start:{dateTime:'2026-11-01T16:00:00Z'},end:{dateTime:'2026-11-01T17:00:00Z'}};
test('Google requests read-only authorization and paginates without copying events into the schedule',async()=>{
  const f=fixture();let page=0;f.setFetch(async()=>({ok:true,json:async()=>++page===1?{items:[raw],nextPageToken:'page-two'}:{items:[{...raw,id:'b'}]}}));
  f.open();await tick();f.click({externalConnect:'google'});await tick();await tick();
  assert.equal(f.oauth.google.scope,'https://www.googleapis.com/auth/calendar.readonly');assert.equal(page,2);
  assert(f.calls.filter(c=>c.url).every(c=>c.options.cache==='no-store'&&c.options.headers.Authorization==='Bearer test-google-token'));
  assert.match(f.calls.filter(c=>c.url)[1].url,/pageToken=page-two/);assert.equal(f.state.activities.length,0);
  assert.equal(f.context.window.KidsSyncExternal.eventsOn(new Date(raw.start.dateTime)).length,2);
  assert(!f.node('externalCalendarsDialog').innerHTML.includes('test-google-token'));
});
test('changing KidsSync account clears external data and credentials before rendering another account',async()=>{
  const f=fixture();f.setFetch(async()=>({ok:true,json:async()=>({items:[raw]})}));f.open();await tick();f.click({externalConnect:'google'});await tick();
  assert.equal(f.context.window.KidsSyncExternal.eventsOn(new Date(raw.start.dateTime)).length,1);
  f.context.currentAccount='different';f.context.window.KidsSyncExternal.renderOverlay();
  assert.equal(f.context.window.KidsSyncExternal.eventsOn(new Date(raw.start.dateTime)).length,0);assert.equal(f.node('externalCalendarStatus').hidden,true);
});
test('authorization errors remove expired overlays instead of silently presenting them as current',async()=>{
  const f=fixture();f.setFetch(async()=>({ok:true,json:async()=>({items:[raw]})}));f.open();await tick();f.click({externalConnect:'google'});await tick();
  f.setFetch(async()=>({ok:false,status:401}));f.click({externalRefresh:'google'});await tick();
  assert.equal(f.context.window.KidsSyncExternal.eventsOn(new Date(raw.start.dateTime)).length,0);assert.match(f.node('externalCalendarsDialog').innerHTML,/Authorization expired/);
});
test('Microsoft uses Calendars.Read, UTC responses, and rejects hostile next links before sending tokens',async()=>{
  const f=fixture();f.setFetch(async()=>({ok:true,json:async()=>({value:[], '@odata.nextLink':'https://attacker.example/steal'})}));
  f.open();await tick();f.click({externalConnect:'microsoft'});await tick();await tick();
  assert.deepEqual(Array.from(f.oauth.microsoft.scopes),['Calendars.Read']);
  const requests=f.calls.filter(c=>c.url);assert.equal(requests.length,1);assert.equal(requests[0].options.headers.Prefer,'outlook.timezone="UTC"');
  assert.match(requests[0].url,/^https:\/\/graph.microsoft.com\/v1.0\/me\/calendarView/);
  assert.match(f.node('externalCalendarsDialog').innerHTML,/Could not connect or refresh/);
});
test('disconnect removes only this overlay and prevents late requests from restoring it',async()=>{
  const f=fixture();let release;f.setFetch(()=>new Promise(resolve=>{release=resolve;}));f.open();await tick();f.click({externalConnect:'google'});await tick();
  f.click({externalDisconnect:'google'});release({ok:true,json:async()=>({items:[raw]})});await tick();
  assert.equal(f.context.window.KidsSyncExternal.eventsOn(new Date(raw.start.dateTime)).length,0);assert(f.calls.includes('revoke'));assert.equal(f.state.activities.length,0);
});
