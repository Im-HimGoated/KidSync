const REVOKED_CODES = new Set(['FORBIDDEN', 'NO_CALENDAR']);

function attachActor(value, actorId) {
  if (!value || typeof actorId !== 'string' || !actorId) return null;
  return { ...value, actorId };
}

function forActor(value, actorId) {
  return value?.actorId === actorId ? value : null;
}

function isRevoked(error) {
  return REVOKED_CODES.has(error?.code);
}

module.exports = { attachActor, forActor, isRevoked };
