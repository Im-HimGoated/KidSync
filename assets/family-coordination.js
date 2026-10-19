/* Shared handoffs are server-authorized. Guest history never impersonates acknowledgements. */
(() => {
  const keys = ['title','startDate','endDate','start','end','allDay','child','responsible','location','items','status','recurrence','repeatDays','repeatUntil','travelMinutes','bufferBeforeMinutes','bufferAfterMinutes'];
  function changes(before, after) {
    return keys.filter(key => JSON.stringify(before?.[key] ?? '') !== JSON.stringify(after?.[key] ?? ''))
      .map(key => ({ key, before: before?.[key] ?? '', after: after?.[key] ?? '' }));
  }
  function peopleFor(event, children) {
    const people = event.child === '__family__' ? [...(Array.isArray(event.attendees) && event.attendees.length && !event.attendees.includes('all') ? event.attendees : children)] : [event.child];
    if (event.responsible?.trim()) people.push(event.responsible.trim());
    return [...new Set(people.filter(Boolean))];
  }
  function adultConflicts(events) {
    const pairs = [];
    const minute = value => { const [h,m] = String(value || '00:00').split(':').map(Number); return h * 60 + m; };
    for (let i = 0; i < events.length; i++) for (let j = i + 1; j < events.length; j++) {
      const a = events[i], b = events[j];
      if (a.status === 'cancelled' || b.status === 'cancelled' || !a.responsible?.trim() || a.responsible.trim().toLowerCase() !== b.responsible?.trim().toLowerCase()) continue;
      const range = e => e.allDay ? [0,1440] : [minute(e.start) - Math.max(0, Number(e.travelMinutes) || 0) - Math.max(0, Number(e.bufferBeforeMinutes) || 0), minute(e.end) + Math.max(0, Number(e.bufferAfterMinutes) || 0)];
      const [as,ae] = range(a), [bs,be] = range(b);
      if (as < be && bs < ae) pairs.push([a.id,b.id]);
    }
    return pairs;
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { changes, peopleFor, adultConflicts }; return; }
  const words = {
    en: { title:'Family coordination', compare:'Compare people', pickups:'Pickups', inbox:'Changes', close:'Close', refresh:'Refresh', date:'Date', previous:'Previous day', next:'Next day', scope:'All children · Current calendar', empty:'Nothing scheduled on this day.', shared:'Shared', adultClash:'One adult has overlapping commitments, including travel buffers.', event:'Event', email:'Assigned adult’s account email', assign:'Request pickup confirmation', pending:'Awaiting confirmation', accepted:'Accepted', declined:'Declined', cancelled:'Event cancelled', accept:'Accept pickup', decline:'Decline pickup', unclaimed:'Unclaimed pickups', unclaimedNone:'Every event on this day has a pickup request.', noRequests:'No pickup requests for this day.', signIn:'Sign in to share pickup requests and acknowledgements across devices.', member:'Use the owner’s email or an accepted calendar member’s email.', loading:'Loading shared updates…', setup:'Shared coordination is unavailable. Apply supabase/family-coordination.sql, then refresh. No response was saved.', failed:'Could not load or save. Check your connection and try again.', assigned:'Pickup requested. Only the recipient can accept it.', responded:'Response saved.', saveFirst:'Wait for the calendar to finish syncing, then try again.', changed:'The calendar changed. Reopen this panel.', removed:'Deleted event', created:'Created', updated:'Changed', deleted:'Deleted', ack:'Acknowledge', acked:'Acknowledged by you', count:'{n} acknowledgement(s)', noChanges:'No changes recorded yet.', local:'Device history · Shared acknowledgements require sign-in', oldHistory:'Details unavailable for older changes.', from:'Before', to:'After', unassigned:'Not assigned', none:'None', true:'Yes', false:'No', allDay:'All day', assignOnly:'Only owners and editors can request pickups.', readOnly:'Read-only calendar', open:'Open event', time:'Time', restored:'Updated', actor:'Changed by', acknowledged:'Acknowledgement saved.' },
    zh: { title:'家庭协调', compare:'成员对比', pickups:'接送', inbox:'变更', close:'关闭', refresh:'刷新', date:'日期', previous:'前一天', next:'后一天', scope:'所有孩子 · 当前日历', empty:'当天没有日程。', shared:'共享', adultClash:'同一成人的安排（含出行缓冲）存在重叠。', event:'日程', email:'接送成人的账户邮箱', assign:'请求确认接送', pending:'等待确认', accepted:'已接受', declined:'已拒绝', cancelled:'日程已取消', accept:'接受接送', decline:'拒绝接送', unclaimed:'尚未安排接送', unclaimedNone:'当天所有日程均已发出接送请求。', noRequests:'当天没有接送请求。', signIn:'登录后即可跨设备共享接送请求与变更确认。', member:'请使用日历所有者或已接受邀请的成员邮箱。', loading:'正在加载共享更新…', setup:'共享协调暂不可用。请应用 supabase/family-coordination.sql 后刷新，回复尚未保存。', failed:'加载或保存失败，请检查网络后重试。', assigned:'已发出接送请求，仅收件人可接受。', responded:'回复已保存。', saveFirst:'请等待日历同步完成后重试。', changed:'日历已更改，请重新打开此面板。', removed:'已删除的日程', created:'已创建', updated:'已更改', deleted:'已删除', ack:'确认已读', acked:'您已确认', count:'{n} 人已确认', noChanges:'暂无变更记录。', local:'设备历史 · 共享确认需要登录', oldHistory:'旧记录无详细变更信息。', from:'之前', to:'之后', unassigned:'未分配', none:'无', true:'是', false:'否', allDay:'全天', assignOnly:'仅所有者和编辑者可请求接送。', readOnly:'只读日历', open:'打开日程', time:'时间', restored:'已更新', actor:'更改者', acknowledged:'已保存确认。' }
  };
  const tx = (key, args={}) => (words[currentLanguage] || words.en)[key].replace(/\{(\w+)\}/g,(_,k)=>String(args[k] ?? ''));
  const esc = value => escapeHtml(String(value ?? ''));
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const menuButton = document.createElement('button'); menuButton.type='button'; menuButton.id='openFamilyCoordination'; menuButton.className='ghost-btn';
  document.querySelector('#moreActions .more-actions-menu').prepend(menuButton);
  const hub=document.createElement('dialog'); hub.id='familyCoordinationDialog'; hub.setAttribute('aria-labelledby','coordinationTitle'); document.body.append(hub);
  let mode='compare', day='', shared=false, identity='', request=0, busy=false, available=false, pickups=[], records=[], acknowledgements=[];
  const signed = () => Boolean(cloudSession?.user?.id && cloudClient);
  const context = () => shared && sharedCalendarState?.invitation ? { owner:sharedCalendarState.invitation.owner_id, calendar:sharedCalendarState.invitation.calendar_id, data:sharedCalendarState.shared, edit:canEditSharedCalendar() } : { owner:cloudSession?.user?.id || '', calendar:currentCalendarId, data:{ activities:state.activities,kids:kidProfiles }, edit:true };
  const scope = () => `${cloudSession?.user?.id || 'guest'}:${context().owner}:${context().calendar}`;
  const events = () => (context().data.activities || []).filter(e=>e.status!=='cancelled' && activityOccursOn(e,parseDateKey(day))).map(e=>({...e,occurrenceDate:day})).sort((a,b)=>Number(Boolean(b.allDay))-Number(Boolean(a.allDay)) || String(a.start).localeCompare(String(b.start)));
  const label = value => value === '' || value === null || value === undefined ? tx('none') : typeof value === 'boolean' ? tx(String(value)) : Array.isArray(value) ? value.join(', ') : String(value);
  function message(key) { hub.querySelector('#coordinationStatus').textContent=tx(key); }
  function fieldLabel(key) {
    const en={title:'Event',startDate:'Date',endDate:'End date',start:'Start',end:'End',allDay:'All day',child:'For',responsible:'Responsible adult',location:'Location',items:'Bring',status:'Status',recurrence:'Repeat',repeatDays:'Repeat days',repeatUntil:'Repeat until',travelMinutes:'Travel minutes',bufferBeforeMinutes:'Buffer before',bufferAfterMinutes:'Buffer after'};
    const zh={title:'日程',startDate:'日期',endDate:'结束日期',start:'开始',end:'结束',allDay:'全天',child:'参与者',responsible:'负责成人',location:'地点',items:'携带物品',status:'状态',recurrence:'重复',repeatDays:'重复日期',repeatUntil:'重复至',travelMinutes:'出行分钟数',bufferBeforeMinutes:'之前缓冲',bufferAfterMinutes:'之后缓冲'};
    return (currentLanguage==='zh'?zh:en)[key]||key;
  }
  function render() {
    const c=context(), list=events(); menuButton.textContent=tx('title');
    hub.innerHTML=`<header class="modal-header"><h2 id="coordinationTitle">${esc(tx('title'))}</h2><button class="close-btn" data-coord-close aria-label="${esc(tx('close'))}" title="${esc(tx('close'))}">${icon('x')}</button></header><div class="coord-body"><div class="coord-tabs" role="tablist" aria-labelledby="coordinationTitle">${['compare','pickups','inbox'].map(k=>`<button type="button" role="tab" data-coord-mode="${k}" id="coordTab-${k}" aria-selected="${mode===k}" tabindex="${mode===k?0:-1}" aria-controls="coordPanel">${icon({compare:'columns-3',pickups:'car',inbox:'inbox'}[k])}<span>${esc(tx(k))}</span></button>`).join('')}</div><div class="coord-date"><button type="button" data-coord-day="-1" title="${esc(tx('previous'))}" aria-label="${esc(tx('previous'))}">${icon('chevron-left')}</button><label>${esc(tx('date'))}<input id="coordinationDate" type="date" min="1900-01-01" max="9998-12-31" value="${esc(day)}"></label><button type="button" data-coord-day="1" title="${esc(tx('next'))}" aria-label="${esc(tx('next'))}">${icon('chevron-right')}</button><button type="button" data-coord-refresh title="${esc(tx('refresh'))}" aria-label="${esc(tx('refresh'))}">${icon('refresh-cw')}</button></div><p class="coord-muted">${esc(tx(signed()?'scope':'local'))}</p><section id="coordPanel" role="tabpanel" aria-labelledby="coordTab-${mode}" tabindex="0"></section><p id="coordinationStatus" role="status" aria-live="polite"></p></div>`;
    const panel=hub.querySelector('#coordPanel');
    if(mode==='compare') {
      const children=(c.data.kids || []).map(k=>k.name);
      const mapped=list.map(e=>{ const assignment=pickups.find(p=>p.event_id===e.id && p.occurrence_date===day && p.status!=='declined' && p.status!=='cancelled'); return assignment ? {...e,responsible:assignment.assignee_email} : e; });
      const people=[...new Set([...children,...mapped.map(e=>e.responsible?.trim()).filter(Boolean)])];
      const clashes=adultConflicts(mapped), warned=new Set(clashes.flat());
      panel.innerHTML=`${clashes.length?`<p class="coord-warning">${esc(tx('adultClash'))}</p>`:''}${!list.length?`<p>${esc(tx('empty'))}</p>`:`<div class="coord-comparison-scroll" tabindex="0" role="region" aria-label="${esc(tx('compare'))}"><div class="coord-comparison" style="--coord-columns:${Math.max(1,people.length)}"><div class="coord-person">${esc(tx('time'))}</div>${(people.length?people:[t('calendar.family')]).map(p=>`<div class="coord-person">${esc(p)}</div>`).join('')}${mapped.map((e,index)=>{const affected=peopleFor(e,children);return `<div class="coord-time">${esc(eventTimeText(e))}</div>${(people.length?people:[t('calendar.family')]).map((person,col)=>`<div class="coord-person-slot">${affected.includes(person)||!people.length?`<button type="button" data-coord-event="${index}" class="coord-commitment${warned.has(e.id)?' has-warning':''}" style="--coord-accent:${['#3c8eb5','#53874b','#a56b95','#b58232'][col%4]}"><strong>${esc(activityTitle(e))}</strong>${affected.length>1?`<small>${esc(tx('shared'))}</small>`:''}<small>${esc(e.location || '')}</small></button>`:''}</div>`).join('')}`;}).join('')}</div></div>`}`;
    } else if(mode==='pickups') {
      const active=pickups.filter(p=>p.occurrence_date===day);
      const unclaimed=list.filter(e=>!active.some(p=>p.event_id===e.id && ['pending','accepted'].includes(p.status)));
      panel.innerHTML=`${!signed()?`<p>${esc(tx('signIn'))}</p>`:''}${signed()&&c.edit?`<form id="coordAssignForm"><label>${esc(tx('event'))}<select name="event" required>${list.map(e=>`<option value="${esc(e.id)}">${esc(activityTitle(e))} · ${esc(eventTimeText(e))}</option>`).join('')}</select></label><label>${esc(tx('email'))}<input name="email" type="email" maxlength="254" required autocomplete="email"></label><p class="coord-muted">${esc(tx('member'))}</p><button class="primary-btn" type="submit" ${busy||!available||!list.length?'disabled':''}>${esc(tx('assign'))}</button></form>`:''}<h3>${esc(tx('unclaimed'))}</h3><p class="coord-muted">${esc(unclaimed.length?unclaimed.map(activityTitle).join(' · '):tx('unclaimedNone'))}</p><div class="coord-request-list">${active.length?active.map(p=>{const e=list.find(e=>e.id===p.event_id);const mine=p.assignee_email===normalizeEmail(cloudSession?.user?.email||'');return `<article><strong>${esc(e?activityTitle(e):tx('removed'))}</strong><span>${esc(p.assignee_email)}</span><span class="coord-state" data-state="${esc(p.status)}">${esc(tx(p.status))}</span>${mine && p.status==='pending' && e?`<div class="coord-row-actions"><button type="button" data-coord-answer="accepted" data-pickup="${esc(p.id)}" ${busy?'disabled':''}>${esc(tx('accept'))}</button><button type="button" data-coord-answer="declined" data-pickup="${esc(p.id)}" ${busy?'disabled':''}>${esc(tx('decline'))}</button></div>`:''}</article>`;}).join(''):`<p class="coord-muted">${esc(tx('noRequests'))}</p>`}</div>`;
    } else {
      const changesList=signed()?records:activityAudit;
      panel.innerHTML=changesList.length?changesList.map(record=>{
        const before=record.before_event||record.before,after=record.after_event||record.after;
        const details=changes(before,after), mine=acknowledgements.some(a=>a.change_id===record.id&&a.user_id===cloudSession?.user?.id);
        return `<article class="coord-change"><div><strong>${esc(after?.title||before?.title||record.title||tx('event'))}</strong><span>${esc(tx(!before&&after?'created':before&&!after?'deleted':'updated'))} · ${esc(new Date(record.created_at||record.at).toLocaleString(currentLanguage==='zh'?'zh-CN':'en-US'))}</span><small>${esc(record.actor_email||record.actor||'')}</small></div>${details.length?`<dl>${details.map(d=>`<div><dt>${esc(fieldLabel(d.key))}</dt><dd><del>${esc(label(d.before))}</del><span aria-hidden="true"> → </span><ins>${esc(label(d.after))}</ins></dd></div>`).join('')}</dl>`:`<p class="coord-muted">${esc(tx('oldHistory'))}</p>`}${signed()?`<div class="coord-row-actions"><span class="coord-muted">${esc(tx('count',{n:acknowledgements.filter(a=>a.change_id===record.id).length}))}</span><button type="button" data-coord-ack="${esc(record.id)}" ${mine||busy?'disabled':''}>${esc(tx(mine?'acked':'ack'))}</button></div>`:''}</article>`;
      }).join(''):`<p class="coord-muted">${esc(tx('noChanges'))}</p>`;
    }
    window.lucide?.createIcons();
  }
  async function load() {
    if(!signed()) { available=false; render(); return; }
    const ticket=++request,c=context(), key=scope(); available=false; busy=true; render(); message('loading');
    try {
      const p=await cloudClient.from('calendar_pickups').select('*').eq('owner_id',c.owner).eq('calendar_id',c.calendar).eq('occurrence_date',day);
      if(p.error) throw p.error;
      const r=await cloudClient.from('calendar_changes').select('*').eq('owner_id',c.owner).eq('calendar_id',c.calendar).order('created_at',{ascending:false}).limit(100);
      if(r.error) throw r.error;
      const a=r.data?.length?await cloudClient.from('calendar_acknowledgements').select('change_id,user_id,user_email').in('change_id',r.data.map(v=>v.id)):{data:[]};
      if(a.error) throw a.error;
      if(ticket!==request||key!==scope()||!hub.open) return;
      pickups=p.data||[];records=r.data||[];acknowledgements=a.data||[];available=true;
    } catch(error) {
      if(ticket!==request||key!==scope()||!hub.open) return;
      pickups=[];records=[];acknowledgements=[]; available=false;
      busy=false;render();message(['42P01','PGRST205','PGRST202'].includes(error.code)?'setup':'failed'); return;
    } finally { if(ticket===request) busy=false; }
    if(ticket===request&&key===scope()&&hub.open) render();
  }
  function open(useShared=false,tab='compare') { shared=useShared; mode=tab;day=dateKey(selectedDate);identity=scope();pickups=[];records=[];acknowledgements=[];available=false;render();document.getElementById('moreActions').open=false;hub.showModal();load(); }
  menuButton.addEventListener('click',()=>open());
  hub.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!available||identity!==scope()||!signed()||!context().edit) return;
    const data=new FormData(event.target),c=context();busy=true;render();
    try {
      if(!shared&&!(await flushCloudSave())) { message('saveFirst');return; }
      if(identity!==scope()) return;
      const {error}=await cloudClient.rpc('assign_calendar_pickup',{p_owner:c.owner,p_calendar:c.calendar,p_event:data.get('event'),p_day:day,p_email:normalizeEmail(data.get('email'))});
      if(error) throw error;await load();message('assigned');
    }catch {if(identity===scope()) message('failed');}finally{busy=false;if(hub.open) hub.querySelectorAll('button[disabled]').forEach(b=>{if(b.type==='submit'&&available)b.disabled=false;});}
  });
  hub.addEventListener('click',async event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-coord-close')) {hub.close();return;}
    if(identity!==scope()){hub.close();return;}
    if(b.dataset.coordMode){mode=b.dataset.coordMode;render();hub.querySelector(`#coordTab-${mode}`).focus();return;}
    if(b.dataset.coordDay){day=dateKey(addDays(parseDateKey(day),Number(b.dataset.coordDay)));render();load();return;}
    if(b.hasAttribute('data-coord-refresh')){load();return;}
    if(b.hasAttribute('data-coord-event')&&!shared){const e=events()[Number(b.dataset.coordEvent)];if(e){hub.close();showEventDetails(e);}return;}
    if(busy||!available||!signed())return;
    const key=scope();busy=true;b.disabled=true;
    try{
      if(b.dataset.coordAnswer){const p=pickups.find(p=>p.id===b.dataset.pickup);if(!p)return;const {error}=await cloudClient.rpc('respond_calendar_pickup',{p_id:p.id,p_status:b.dataset.coordAnswer,p_version:p.updated_at});if(error)throw error;}
      else if(b.dataset.coordAck){const {error}=await cloudClient.from('calendar_acknowledgements').insert({change_id:b.dataset.coordAck,user_id:cloudSession.user.id});if(error&&error.code!=='23505')throw error;}
      else return;
      await load();if(key===scope())message(b.dataset.coordAck?'acknowledged':'responded');
    }catch{if(key===scope()&&hub.open){message('failed');b.disabled=false;}}finally{busy=false;}
  });
  hub.addEventListener('change',event=>{if(event.target.id==='coordinationDate'){const value=event.target.value;if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||dateKey(parseDateKey(value))!==value)return;day=value;render();load();}});
  hub.addEventListener('keydown',event=>{if(!event.target.matches('[role="tab"]')||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const modes=['compare','pickups','inbox'],i=event.key==='Home'?0:event.key==='End'?2:(modes.indexOf(mode)+(event.key==='ArrowRight'?1:2))%3;hub.querySelector(`[data-coord-mode="${modes[i]}"]`).click();});
  hub.addEventListener('close',()=>{request++;busy=false;if(!document.querySelector('dialog[open]'))(shared?document.getElementById('sharedCalendarTitle'):document.querySelector('#moreActions > summary')).focus({preventScroll:true});});
  window.KidsSyncFamily={open,refresh(){menuButton.textContent=tx('title');if(hub.open){if(identity!==scope())hub.close();else if(!hub.contains(document.activeElement)||!document.activeElement.matches('input,select'))render();}},shared(){
    if(document.getElementById('sharedCoordinationButton')){document.getElementById('sharedCoordinationButton').textContent=tx('title');return;}
    const b=document.createElement('button');b.id='sharedCoordinationButton';b.type='button';b.className='ghost-btn';b.textContent=tx('title');
    b.addEventListener('click',()=>open(true));document.getElementById('sharedCalendarEvents').before(b);
  }};
  menuButton.textContent=tx('title');
})();
