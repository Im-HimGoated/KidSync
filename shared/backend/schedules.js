// Inject the SDK client so this module has no DOM or native dependencies.
const SCHEDULE_TABLE = 'family_schedules';

async function readSchedule(client, userId) {
  if (!userId) throw new Error('Sign in before loading a schedule.');
  const { data, error } = await client.from(SCHEDULE_TABLE)
    .select('schedule, updated_at').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

function calendarEntries(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return [];
  if (Array.isArray(snapshot.calendars) && snapshot.calendarData) {
    return snapshot.calendars.filter(calendar => calendar?.id && calendar?.name)
      .map(calendar => ({ ...calendar, data: snapshot.calendarData[calendar.id] || {} }));
  }
  // Older web accounts stored the active calendar directly on the snapshot.
  return [{ id: 'family', name: 'Family', data: snapshot }];
}

function watchSchedule(client, userId, { onData, onError = () => {}, onStatus = () => {} }) {
  if (!userId) throw new Error('Sign in before watching a schedule.');
  let stopped = false;
  let request = 0;
  let channel;
  async function refresh() {
    if (stopped) return;
    const current = ++request;
    try {
      const data = await readSchedule(client, userId);
      if (!stopped && current === request) onData(data);
    } catch (error) {
      if (!stopped && current === request) onError(error);
    }
  }
  // Subscribe before the initial read, and read again when subscription is ready.
  channel = client.channel(`mobile-schedule:${userId}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: SCHEDULE_TABLE, filter: `user_id=eq.${userId}`
    }, refresh)
    .subscribe(status => {
      if (stopped) return;
      onStatus(status);
      if (status === 'SUBSCRIBED') refresh();
    });
  refresh();
  return {
    refresh,
    stop() {
      if (stopped) return;
      stopped = true;
      request += 1;
      client.removeChannel(channel);
    }
  };
}

module.exports = { SCHEDULE_TABLE, readSchedule, calendarEntries, watchSchedule };
