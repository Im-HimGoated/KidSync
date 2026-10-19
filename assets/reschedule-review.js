/* Preview first. One-occurrence moves use exclusions; undo touches only unchanged move records. */
(() => {
  const key = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const date = value => {if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value)))return null;const [y,m,d]=value.split('-').map(Number),v=new Date(y,m-1,d);return y>=1900&&y<=9998&&key(v)===value?v:null;};
  const shift = (day,n) => {const v=date(day);if(!v)throw Error('date');v.setDate(v.getDate()+n);if(!date(key(v)))throw Error('date');return key(v);};
  const serial = v => Date.UTC(v.getFullYear(),v.getMonth(),v.getDate())/86400000;
  const minute = value => {if(!/^\d{2}:\d{2}$/.test(String(value)))return NaN;const [h,m]=value.split(':').map(Number);return h<24&&m<60?h*60+m:NaN;};
  const time = n => `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
  function planMove(event, occurrence, target, start, allDay, scope='series', newId='copy') {
    if(!date(occurrence)||!date(target)||!date(event.startDate))throw Error('date');
    const offset=serial(date(target))-serial(date(occurrence)), next=JSON.parse(JSON.stringify(event));
    const single=event.recurrence && event.recurrence!=='none' && scope==='one';
    if(single){
      next.id=newId;next.startDate=target;next.endDate=event.endDate?shift(event.endDate,serial(date(target))-serial(date(event.startDate))):'';
      next.recurrence='none';next.repeatInterval=1;next.repeatDays=[];next.repeatUntil='';next.excludedDates=[];
    }else{
      next.startDate=shift(event.startDate,offset);if(event.endDate)next.endDate=shift(event.endDate,offset);
      if(event.repeatUntil)next.repeatUntil=shift(event.repeatUntil,offset);
      if(event.recurrence==='weekly')next.repeatDays=[...new Set((event.repeatDays?.length?event.repeatDays:[date(event.startDate).getDay()]).map(d=>(Number(d)+offset%7+7)%7))].sort((a,b)=>a-b);
      if(event.excludedDates)next.excludedDates=event.excludedDates.map(d=>shift(d,offset));
    }
    next.allDay=allDay;
    if(!allDay&&start!==null){
      if(!Number.isFinite(start))throw Error('time');
      const duration=Math.min(1439,Math.max(15,minute(event.end)-minute(event.start)||30));
      const bounded=Math.min(Math.max(0,start),1439-duration);next.start=time(bounded);next.end=time(bounded+duration);
    }
    const original=single?{...event,excludedDates:[...new Set([...(event.excludedDates||[]),occurrence])]}:null;
    return {next,original,single};
  }
  function conflictDetails(candidate, others) {
    const range=e=>e.allDay||e.eventType==='trip'?[0,1440]:[minute(e.start)-Math.max(0,Number(e.travelMinutes)||0)-Math.max(0,Number(e.bufferBeforeMinutes)||0),minute(e.end)+Math.max(0,Number(e.bufferAfterMinutes)||0)];
    const shared=(a,b)=>a.child==='__family__'||b.child==='__family__'||a.child===b.child||Boolean(a.responsible&&b.responsible&&a.responsible.trim().toLowerCase()===b.responsible.trim().toLowerCase())||(a.attendees||[]).some(p=>p!=='all'&&(p===b.child||(b.attendees||[]).includes(p)));
    return others.filter(e=>e.id!==candidate.id&&e.status!=='cancelled'&&shared(candidate,e)).filter(e=>{const [as,ae]=range(candidate),[bs,be]=range(e);return as<be&&bs<ae;});
  }
  if(typeof module!=='undefined'&&module.exports){module.exports={date,shift,minute,planMove,conflictDetails};return;}
  const words={
    en:{title:'Review reschedule',close:'Close',date:'Move to date',start:'Start time',allDay:'All-day event',one:'This occurrence only',series:'Entire series',scope:'Apply to',before:'Before',after:'After',confirm:'Confirm move',cancel:'Cancel',conflicts:'Overlaps or travel gaps',clear:'No conflicts found on the destination dates.',check:'Only destination dates are checked, not every future repeat.',failed:'Could not save. Nothing was moved.',stale:'This event changed. Reopen it before moving.',invalid:'Choose a valid date and time.',undo:'Undo move',done:'Event moved',undone:'Move undone',undoChanged:'The moved event changed again. Use version history to review it.',move:'Reschedule',history:'Before reschedule',readonly:'External events are read-only.'},
    zh:{title:'检查日程调整',close:'关闭',date:'移至日期',start:'开始时间',allDay:'全天日程',one:'仅此次日程',series:'整个重复系列',scope:'应用范围',before:'之前',after:'之后',confirm:'确认移动',cancel:'取消',conflicts:'重叠或出行时间不足',clear:'目标日期未发现冲突。',check:'仅检查目标日期，不检查所有未来重复日程。',failed:'保存失败，未移动日程。',stale:'日程已更改，请重新打开后调整。',invalid:'请选择有效日期和时间。',undo:'撤销移动',done:'已移动日程',undone:'已撤销移动',undoChanged:'移动后的日程再次发生更改，请在版本历史中查看。',move:'调整日程',history:'调整日程前',readonly:'外部日程为只读。'}
  };
  const tx=k=>(words[currentLanguage]||words.en)[k],esc=v=>escapeHtml(String(v??''));
  const hub=document.createElement('dialog');hub.id='moveReviewDialog';hub.setAttribute('aria-labelledby','moveReviewTitle');document.body.append(hub);
  const undo=document.createElement('div');undo.className='move-undo';undo.hidden=true;undo.setAttribute('role','status');document.body.append(undo);
  let pending=null,lastMove=null;
  const scope=()=>scheduleStorageKey('move-review');
  function current(){return pending&&scope()===pending.scope&&JSON.stringify(state.activities.find(e=>e.id===pending.before.id))===JSON.stringify(pending.before);}
  function proposal(){const form=hub.querySelector('form'),data=new FormData(form);return planMove(pending.before,pending.occurrence,String(data.get('date')),data.get('allDay')?null:minute(data.get('start')),Boolean(data.get('allDay')),String(data.get('scope')||'series'),pending.copyId);}
  function update(){
    const panel=hub.querySelector('#movePreview');
    try{
      const {next,single}=proposal(),target=hub.querySelector('[name="date"]').value, conflicts=[];
      const span=next.endDate?Math.min(366,Math.max(0,serial(date(next.endDate))-serial(date(next.startDate)))):0;
      for(let i=0;i<=span;i++){
        const day=shift(target,i),d=date(day);
        const others=state.activities.filter(e=>e.id!==pending.before.id&&activityOccursOn(e,d));
        if(window.KidsSyncExternal)others.push(...window.KidsSyncExternal.eventsOn(d));
        conflictDetails({...next,id:pending.before.id},others).forEach(e=>conflicts.push(`${formatShortDate(d)} · ${activityTitle(e)}`));
      }
      panel.innerHTML=`<p><strong>${esc(tx('before'))}</strong><br>${esc(formatFullDate(date(pending.occurrence)))} · ${esc(eventTimeText(pending.before))}</p><p><strong>${esc(tx('after'))}</strong><br>${esc(formatFullDate(date(target)))} · ${esc(eventTimeText({...next,endDate:next.endDate?shift(target,span):''}))}</p>${conflicts.length?`<p class="coord-warning"><strong>${esc(tx('conflicts'))}</strong><br>${[...new Set(conflicts)].map(esc).join('<br>')}</p>`:`<p class="coord-muted">${esc(tx('clear'))}</p>`}${pending.before.recurrence!=='none'&&!single?`<p class="coord-muted">${esc(tx('check'))}</p>`:''}`;
      hub.querySelector('[type="submit"]').disabled=false;
    }catch{panel.textContent=tx('invalid');hub.querySelector('[type="submit"]').disabled=true;}
  }
  function review(event,occurrence,targetDate,start,allDay){
    if(event.externalSource)return;
    pending={before:JSON.parse(JSON.stringify(event)),occurrence:occurrence.occurrenceDate||event.startDate,target:dateKey(targetDate),start,allDay,scope:scope(),copyId:makeId('activity')};
    hub.innerHTML=`<header class="modal-header"><h2 id="moveReviewTitle">${esc(tx('title'))}</h2><button type="button" class="close-btn" data-move-close aria-label="${esc(tx('close'))}">×</button></header><form class="coord-body"><strong>${esc(activityTitle(event))}</strong><label>${esc(tx('date'))}<input name="date" type="date" required min="1900-01-01" max="9998-12-31" value="${esc(pending.target)}"></label><label>${esc(tx('start'))}<input name="start" type="time" required value="${esc(start===null?event.start:time(Math.min(1425,Math.max(0,start))))}" ${allDay?'disabled':''}></label><label class="move-all-day"><input type="checkbox" name="allDay" ${allDay?'checked':''}>${esc(tx('allDay'))}</label>${event.recurrence&&event.recurrence!=='none'?`<label>${esc(tx('scope'))}<select name="scope"><option value="one">${esc(tx('one'))}</option><option value="series">${esc(tx('series'))}</option></select></label>`:''}<div class="move-summary" id="movePreview" aria-live="polite"></div><p id="moveStatus" role="status"></p><footer class="move-actions"><button type="button" data-move-close>${esc(tx('cancel'))}</button><button type="submit" class="primary-btn">${esc(tx('confirm'))}</button></footer></form>`;
    update();hub.showModal();
  }
  hub.addEventListener('click',event=>{if(event.target.closest('[data-move-close]'))hub.close();});
  hub.addEventListener('change',()=>{hub.querySelector('[name="start"]').disabled=hub.querySelector('[name="allDay"]').checked;update();});
  hub.addEventListener('submit',event=>{
    event.preventDefault();if(!current()){hub.querySelector('#moveStatus').textContent=tx('stale');return;}
    let plan;try{plan=proposal();}catch{return;}
    const previous=state.activities, before=pending.before;
    rememberCurrentSchedule(tx('history'));
    state.activities=state.activities.map(e=>e.id===before.id?(plan.single?plan.original:plan.next):e);
    if(plan.single)state.activities.push(plan.next);
    if(saveActivities()===false){state.activities=previous;hub.querySelector('#moveStatus').textContent=tx('failed');return;}
    lastMove={scope:scope(),before,after:JSON.parse(JSON.stringify(plan.single?plan.original:plan.next)),copy:plan.single?JSON.parse(JSON.stringify(plan.next)):null};
    auditActivity('moved',before,plan.single?plan.original:plan.next);if(plan.single)auditActivity('created',null,plan.next);
    hub.close();renderAll();scheduleSmartCalendarFocus();
    undo.hidden=false;undo.innerHTML=`<span>${esc(tx('done'))}</span><button type="button" data-move-undo>${esc(tx('undo'))}</button><button type="button" data-move-dismiss aria-label="${esc(tx('close'))}">×</button>`;
  });
  undo.addEventListener('click',event=>{
    if(event.target.closest('[data-move-dismiss]')){undo.hidden=true;return;}
    if(!event.target.closest('[data-move-undo]')||!lastMove)return;
    const m=lastMove;
    if(scope()!==m.scope||JSON.stringify(state.activities.find(e=>e.id===m.after.id))!==JSON.stringify(m.after)||(m.copy&&JSON.stringify(state.activities.find(e=>e.id===m.copy.id))!==JSON.stringify(m.copy))){showFeedbackToast(tx('undoChanged'));undo.hidden=true;return;}
    const previous=state.activities;rememberCurrentSchedule(tx('history'));
    state.activities=state.activities.filter(e=>!m.copy||e.id!==m.copy.id).map(e=>e.id===m.before.id?m.before:e);
    if(saveActivities()===false){state.activities=previous;showFeedbackToast(tx('failed'));return;}
    auditActivity('updated',m.after,m.before);if(m.copy)auditActivity('deleted',m.copy,null);lastMove=null;undo.hidden=true;renderAll();showFeedbackToast(tx('undone'));
  });
  window.KidsSyncMoves={review,attach(event){
    if(event.isBuiltInHoliday||event.externalSource||document.getElementById('eventReviewMove'))return;
    const b=document.createElement('button');b.type='button';b.id='eventReviewMove';b.className='ghost-btn';b.textContent=tx('move');
    b.addEventListener('click',()=>{eventDetailsDialog.close();review(state.activities.find(e=>e.id===event.id)||event,event,date(event.occurrenceDate||event.startDate),event.allDay?null:minute(event.start),Boolean(event.allDay));});
    document.getElementById('eventDetailsBody').append(b);
  }};
})();
