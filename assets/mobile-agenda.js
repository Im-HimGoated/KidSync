(() => {
  const button=document.createElement('button');button.type='button';button.id='mobileNextCommitment';button.hidden=true;
  document.getElementById('calendarInsights').after(button);
  let next=null;
  function refresh(){
    if(!matchMedia('(max-width: 740px)').matches||document.getElementById('calendarNextSpotlight')){button.hidden=true;next=null;return;}
    const now=new Date(), options=[];
    for(let offset=0;offset<14;offset++){
      const date=addDays(now,offset),day=dateKey(date);
      state.activities.filter(e=>e.status!=='cancelled'&&activityOccursOn(e,date)).forEach(e=>{
        const end=parseDateKey(day);if(e.allDay)end.setHours(23,59,59,999);else{const [h,m]=(e.end||e.start||'00:00').split(':').map(Number);end.setHours(h,m,0,0);}
        if(end>now)options.push({...e,occurrenceDate:day});
      });
      if(options.length)break;
    }
    options.sort((a,b)=>Number(Boolean(a.allDay))-Number(Boolean(b.allDay))||String(a.start).localeCompare(String(b.start)));
    next=options[0]||null;button.hidden=!next;
    if(next)button.innerHTML=`<span aria-hidden="true">${escapeHtml(next.icon||'→')}</span><span><small>${currentLanguage==='zh'?'下一个安排':'Next commitment'} · ${escapeHtml(formatShortDate(parseDateKey(next.occurrenceDate)))}</small><strong>${escapeHtml(activityTitle(next))}</strong><small>${escapeHtml(eventTimeText(next))}${next.location?` · ${escapeHtml(next.location)}`:''}</small></span>`;
  }
  button.addEventListener('click',()=>{if(next)showEventDetails(next);});
  matchMedia('(max-width: 740px)').addEventListener('change',refresh);
  window.KidsSyncMobile={refresh};refresh();
})();
