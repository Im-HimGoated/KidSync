/* Read-only, session-memory overlays. OAuth credentials never enter schedule storage or cloud sync. */
(() => {
  const dayKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const time=d=>`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  function externalEvents(raw,provider) {
    if(raw.status==='cancelled'||raw.isCancelled)return [];
    const google=provider==='google', allDay=google?Boolean(raw.start?.date):Boolean(raw.isAllDay);
    const startValue=google?(raw.start?.date||raw.start?.dateTime):raw.start?.dateTime;
    const endValue=google?(raw.end?.date||raw.end?.dateTime):raw.end?.dateTime;
    const parse=v=>new Date(!google&&v&&!/(?:Z|[+-]\d\d:\d\d)$/i.test(v)?`${v}Z`:v);
    const start=allDay?new Date(`${String(startValue).slice(0,10)}T00:00:00`):parse(startValue);
    const end=allDay?new Date(`${String(endValue).slice(0,10)}T00:00:00`):parse(endValue);
    if(!raw.id||!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)return [];
    const base={externalSource:provider,externalId:raw.id,externalBusy:google?raw.transparency!=='transparent':raw.showAs!=='free',title:String((google?raw.summary:raw.subject)||'Busy').slice(0,200),location:String(google?raw.location||'':raw.location?.displayName||'').slice(0,300),notes:String(google?raw.description||'':raw.bodyPreview||'').slice(0,3000),child:'__family__',recurrence:'none',status:'confirmed',eventType:'activity',icon:provider==='google'?'G':'O',allDay,attendees:['all'],responsible:'',travelMinutes:0};
    if(allDay){end.setDate(end.getDate()-1);return [{...base,id:`external:${provider}:${raw.id}`,startDate:dayKey(start),endDate:dayKey(end)!==dayKey(start)?dayKey(end):'',start:'00:00',end:'23:59'}];}
    const items=[],cursor=new Date(start);cursor.setHours(0,0,0,0);
    for(let n=0;n<367&&cursor<end;n++){
      const day=dayKey(cursor),next=new Date(cursor);next.setDate(next.getDate()+1);
      items.push({...base,id:`external:${provider}:${raw.id}:${day}`,startDate:day,endDate:'',start:day===dayKey(start)?time(start):'00:00',end:end>=next?'23:59':time(end)});
      cursor.setDate(cursor.getDate()+1);
    }
    return items;
  }
  function safeGraphUrl(value){const url=new URL(value);if(url.protocol!=='https:'||url.hostname!=='graph.microsoft.com'||!url.pathname.startsWith('/v1.0/'))throw Error('invalid-pagination');return url.href;}
  if(typeof module!=='undefined'&&module.exports){module.exports={externalEvents,safeGraphUrl};return;}
  const words={
    en:{title:'Connected calendars',close:'Close',connect:'Connect read-only',refresh:'Refresh events',disconnect:'Disconnect this device',notConfigured:'Provider setup required: add its public client ID in supabase-config.js.',origin:'Connections require an HTTP/HTTPS site, not a file URL.',scope:'Google primary calendar / Outlook default calendar · Read-only · Session only',privacy:'External events stay in this browser session and are not shared with family members or uploaded to Supabase.',disconnected:'Not connected',loading:'Connecting…',refreshing:'Refreshing…',failed:'Could not connect or refresh. Retry, check provider setup, or allow the sign-in popup.',expired:'Authorization expired. Connect again.',last:'Last refreshed',range:'Loaded range',outside:'This date is outside the loaded range. Refresh connected calendars.',setup:'Connection setup',readOnly:'Read-only external event',manage:'Manage connections',empty:'No external events on this date.',noClient:'Add provider client IDs and register this site’s origins before connecting.',unavailable:'Offline. Saved KidsSync events remain available.',session:'Reconnect after reloading this page.',partial:'Too many events for this date range. No partial refresh was applied.'},
    zh:{title:'已连接日历',close:'关闭',connect:'只读连接',refresh:'刷新日程',disconnect:'断开此设备',notConfigured:'需要配置：请在 supabase-config.js 中添加服务商的公开客户端 ID。',origin:'连接需要 HTTP/HTTPS 网站，不能使用文件地址。',scope:'Google 主日历 / Outlook 默认日历 · 只读 · 仅当前会话',privacy:'外部日程仅保存在此浏览器会话中，不会与家人共享或上传至 Supabase。',disconnected:'未连接',loading:'正在连接…',refreshing:'正在刷新…',failed:'连接或刷新失败，请重试、检查配置或允许登录弹窗。',expired:'授权已过期，请重新连接。',last:'最近刷新',range:'已加载范围',outside:'此日期超出已加载范围，请刷新已连接日历。',setup:'连接配置',readOnly:'只读外部日程',manage:'管理连接',empty:'当天没有外部日程。',noClient:'连接前，请填写服务商客户端 ID 并注册网站来源。',unavailable:'当前离线，已保存的 KidsSync 日程仍可查看。',session:'刷新页面后需要重新连接。',partial:'此范围内日程过多，未应用不完整的刷新结果。'}
  };
  const tx=k=>(words[currentLanguage]||words.en)[k],esc=v=>escapeHtml(String(v??''));
  const cfg=window.KIDSSYNC_CALENDAR_CONNECTIONS||{};
  const sessions=new Map(),controllers=new Map();let identity='',generation=0,msalApp=null,googleReady=false,microsoftReady=false;
  const scope=()=>scheduleStorageKey('external-session');
  const hub=document.createElement('dialog');hub.id='externalCalendarsDialog';hub.setAttribute('aria-labelledby','externalCalendarsTitle');document.body.append(hub);
  const details=document.createElement('dialog');details.id='externalEventDialog';details.setAttribute('aria-labelledby','externalEventTitle');document.body.append(details);
  const button=document.createElement('button');button.type='button';button.id='openExternalCalendars';button.className='ghost-btn';document.querySelector('#moreActions .more-actions-menu').prepend(button);
  function script(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.head.append(s);});}
  async function prepare(){
    if(location.protocol==='file:')return;
    if(cfg.googleClientId&&!googleReady){try{if(!window.google?.accounts?.oauth2)await script('https://accounts.google.com/gsi/client');googleReady=Boolean(window.google?.accounts?.oauth2);}catch{}}
    if(cfg.microsoftClientId&&!microsoftReady){try{
      if(!window.msal)await script('./assets/vendor/msal-browser.min.js');
      msalApp=new window.msal.PublicClientApplication({auth:{clientId:cfg.microsoftClientId,authority:'https://login.microsoftonline.com/common',redirectUri:new URL('./oauth-redirect.html',location.href).href},cache:{cacheLocation:'memoryStorage'}});
      await msalApp.initialize();microsoftReady=true;
    }catch{}}
    if(hub.open)render();
  }
  function clear(){generation++;controllers.forEach(c=>c.abort());controllers.clear();sessions.clear();msalApp?.clearCache().catch(()=>{});}
  function render(){
    button.textContent=tx('title');hub.innerHTML=`<header class="modal-header"><h2 id="externalCalendarsTitle">${esc(tx('title'))}</h2><button type="button" class="close-btn" data-external-close aria-label="${esc(tx('close'))}">×</button></header><div class="coord-body"><p class="coord-muted">${esc(tx('scope'))}</p><p class="coord-muted">${esc(tx('privacy'))}</p>${['google','microsoft'].map(provider=>{
      const state=sessions.get(provider),ready=provider==='google'?googleReady:microsoftReady,configured=provider==='google'?cfg.googleClientId:cfg.microsoftClientId;
      return `<section class="external-row"><h3>${provider==='google'?'Google Calendar':'Outlook Calendar'}</h3><p class="external-status">${esc(location.protocol==='file:'?tx('origin'):!configured?tx('notConfigured'):state?.message?tx(state.message):!ready?tx('loading'):state?.at?`${tx('last')}: ${new Date(state.at).toLocaleString(currentLanguage==='zh'?'zh-CN':'en-US')}`:tx('disconnected'))}</p>${state?.from?`<p class="external-status">${esc(tx('range'))}: ${esc(state.from)} – ${esc(state.to)}</p>`:''}<div class="external-actions"><button type="button" class="primary-btn" data-external-connect="${provider}" ${!ready||!configured||state?.busy?'disabled':''}>${esc(tx('connect'))}</button>${state?`<button type="button" data-external-refresh="${provider}" ${state.busy?'disabled':''}>${esc(tx('refresh'))}</button><button type="button" data-external-disconnect="${provider}">${esc(tx('disconnect'))}</button>`:''}</div></section>`;
    }).join('')}<p class="coord-muted">${esc(tx('session'))}</p><a href="./CALENDAR_CONNECTIONS.md" target="_blank" rel="noopener noreferrer">${esc(tx('setup'))}</a></div>`;
  }
  async function getJson(url,token,controller,headers={}){
    const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`,...headers},signal:controller.signal,cache:'no-store'});
    if(!response.ok)throw Error(response.status===401?'expired':'failed');return response.json();
  }
  async function refresh(provider){
    const session=sessions.get(provider);if(!session||session.busy)return;
    if(!navigator.onLine){session.message='unavailable';render();return;}
    if(Date.now()>=session.expires){session.events=[];session.message='expired';render();renderAll();return;}
    const own=scope(),ticket=generation;session.busy=true;session.message='refreshing';render();
    const controller=new AbortController();controllers.set(provider,controller);const timeout=setTimeout(()=>controller.abort(),20000);
    const from=addDays(selectedDate,-14);from.setHours(0,0,0,0);const to=addDays(from,60),items=[];
    try{
      if(provider==='google'){
        let page='';for(let n=0;n<50;n++){
          const query=new URLSearchParams({timeMin:from.toISOString(),timeMax:to.toISOString(),singleEvents:'true',maxResults:'2500',orderBy:'startTime'});if(page)query.set('pageToken',page);
          const data=await getJson(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${query}`,session.token,controller);
          items.push(...(data.items||[]));page=data.nextPageToken||'';if(!page)break;if(n===49)throw Error('partial');
        }
      }else{
        let url=`https://graph.microsoft.com/v1.0/me/calendarView?${new URLSearchParams({startDateTime:from.toISOString(),endDateTime:to.toISOString(),'$top':'1000','$select':'id,subject,start,end,isAllDay,isCancelled,showAs,location,bodyPreview'})}`;
        for(let n=0;n<50;n++){
          const data=await getJson(safeGraphUrl(url),session.token,controller,{Prefer:'outlook.timezone="UTC"'});items.push(...(data.value||[]));url=data['@odata.nextLink'];if(!url)break;if(n===49)throw Error('partial');
        }
      }
      if(ticket!==generation||own!==scope()||sessions.get(provider)!==session)return;
      session.events=items.flatMap(e=>externalEvents(e,provider));session.at=Date.now();session.from=dayKey(from);session.to=dayKey(addDays(to,-1));session.message='';
    }catch(error){if(ticket===generation&&own===scope()){session.message=['expired','partial'].includes(error.message)?error.message:'failed';if(error.message==='expired')session.events=[];}}
    finally{clearTimeout(timeout);controllers.delete(provider);session.busy=false;if(ticket===generation&&own===scope()){render();renderAll();}}
  }
  function connect(provider){
    if(location.protocol==='file:')return;
    const own=scope(),ticket=generation;
    const accept=(token,expires)=>{if(own!==scope()||ticket!==generation)return;sessions.set(provider,{token,expires:Date.now()+Math.max(0,expires-60)*1000,events:[],busy:false,message:''});refresh(provider);};
    if(provider==='google'&&googleReady){
      const client=google.accounts.oauth2.initTokenClient({client_id:cfg.googleClientId,scope:'https://www.googleapis.com/auth/calendar.readonly',callback:response=>{if(response.error||!response.access_token){sessions.set(provider,{events:[],message:'failed'});render();return;}accept(response.access_token,Number(response.expires_in)||3600);},error_callback:()=>{if(own===scope()){sessions.set(provider,{events:[],message:'failed'});render();}}});
      client.requestAccessToken({prompt:'select_account'});
    }else if(provider==='microsoft'&&microsoftReady){
      msalApp.acquireTokenPopup({scopes:['Calendars.Read'],prompt:'select_account'}).then(response=>accept(response.accessToken,Math.max(0,(response.expiresOn?.getTime()-Date.now())/1000)||3600)).catch(()=>{if(own===scope()&&ticket===generation){sessions.set(provider,{events:[],message:'failed'});render();}});
    }
  }
  function renderOverlay(){
    if(identity!==scope()){clear();identity=scope();}
    button.textContent=tx('title');
    // Events render in the normal calendar; a small source/status strip stays separate from editable data.
    let strip=document.getElementById('externalCalendarStatus');if(!strip){strip=document.createElement('div');strip.id='externalCalendarStatus';strip.className='external-source-strip';document.getElementById('calendarInsights').after(strip);}
    strip.hidden=!sessions.size;
    strip.innerHTML=[...sessions].map(([provider,s])=>`<button type="button" data-source-open>${esc(provider==='google'?'Google':'Outlook')} · ${esc(s.message?tx(s.message):dayKey(selectedDate)<s.from||dayKey(selectedDate)>s.to?tx('outside'):`${tx('last')} ${new Date(s.at).toLocaleTimeString()}`)}</button>`).join('');
  }
  function open(){identity=scope();document.getElementById('moreActions').open=false;render();hub.showModal();prepare();}
  button.addEventListener('click',open);
  document.addEventListener('click',e=>{if(e.target.closest('[data-source-open]'))open();});
  hub.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-external-close'))hub.close();if(b.dataset.externalConnect)connect(b.dataset.externalConnect);if(b.dataset.externalRefresh)refresh(b.dataset.externalRefresh);if(b.dataset.externalDisconnect){const p=b.dataset.externalDisconnect,s=sessions.get(p);controllers.get(p)?.abort();if(p==='google'&&s?.token)google.accounts.oauth2.revoke(s.token,()=>{});sessions.delete(p);if(p==='microsoft')msalApp?.clearCache().catch(()=>{});render();renderAll();}});
  details.addEventListener('click',e=>{if(e.target.closest('button'))details.close();});
  window.KidsSyncExternal={renderOverlay,eventsOn(date){if(identity!==scope())return [];const day=dayKey(date);return [...sessions.values()].flatMap(s=>s.events||[]).filter(e=>day>=e.startDate&&day<=(e.endDate||e.startDate));},show(event){
    details.innerHTML=`<header class="modal-header"><h2 id="externalEventTitle">${esc(activityTitle(event))}</h2><button type="button" class="close-btn" aria-label="${esc(tx('close'))}">×</button></header><div class="coord-body"><strong>${esc(tx('readOnly'))} · ${esc(event.externalSource==='google'?'Google':'Outlook')}</strong><p>${esc(formatFullDate(parseDateKey(event.startDate)))} · ${esc(eventTimeText(event))}</p>${event.location?`<p>${esc(event.location)}</p>`:''}${event.notes?`<p>${esc(event.notes)}</p>`:''}</div>`;details.showModal();
  }};
  identity=scope();button.textContent=tx('title');
})();
