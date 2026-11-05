function createLatestRequestGuard() {
  let generation = 0;

  return {
    begin(scope) {
      generation += 1;
      return { generation, scope };
    },
    invalidate() { generation += 1; },
    isCurrent(token, scope) {
      return !!token && token.generation === generation && token.scope === scope;
    },
  };
}

async function openSharedContext({ existingContext, loadContext, isCurrent, onOpened, onError }) {
  try {
    const context = existingContext || await loadContext();
    if (!isCurrent()) return { status: 'stale' };
    onOpened(context);
    return { status: 'opened', context };
  } catch (error) {
    if (!isCurrent()) return { status: 'stale' };
    onError(error);
    return { status: 'error', error };
  }
}

function sharedCalendarTarget(invitation) {
  if (!invitation || invitation.status !== 'active' || !['viewer', 'commenter', 'editor'].includes(invitation.role)
    || !['id', 'owner_id', 'calendar_id'].every(key => typeof invitation[key] === 'string' && invitation[key].trim())) throw new Error('Choose an accepted shared calendar.');
  return { invitation: { ...invitation }, calendar: { id: invitation.calendar_id, ownerId: invitation.owner_id,
    name: typeof invitation.calendar_name === 'string' ? invitation.calendar_name : '' } };
}

module.exports = { createLatestRequestGuard, openSharedContext, sharedCalendarTarget };
