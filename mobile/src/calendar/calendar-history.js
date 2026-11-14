function changeFromServer(row) {
  const before = row.before_event, after = row.after_event;
  const moved = before && after && ['startDate', 'endDate', 'start', 'end'].some(key => before[key] !== after[key]);
  return { id: row.id, cloud: true, eventId: row.event_id, at: row.created_at, actor: row.actor_email,
    title: after?.title || before?.title, action: !before ? 'created' : !after ? 'deleted' : moved ? 'moved' : 'updated' };
}

async function loadChanges(client, ownerId, calendarId, limit = 100) {
  const { data, error } = await client.from('calendar_changes').select('id,event_id,actor_email,before_event,after_event,created_at')
    .eq('owner_id', ownerId).eq('calendar_id', calendarId).order('created_at', { ascending: false }).limit(limit);
  if (error || !Array.isArray(data)) throw error || new Error('Invalid calendar changes');
  return data.filter(row => row && typeof row.id === 'string').map(changeFromServer);
}

function mergeChanges(remote, audit, limit = 100) {
  const time = entry => Date.parse(entry.at || '') || 0;
  const saved = (Array.isArray(audit) ? audit : []).filter(row => row && !remote.some(change =>
    String(change.eventId) === String(row.eventId) && change.actor === row.actor && change.action === row.action
    && Math.abs(time(change) - time(row)) < 10_000));
  return [...remote, ...saved].sort((a, b) => time(b) - time(a)).slice(0, limit);
}

module.exports = { changeFromServer, loadChanges, mergeChanges };
