const trial = require('./native-trial');

// Decide before writing: opening another event must never silently replace a draft.
function editorRequest(draft, event, date, preferences) {
  const values = event || trial.defaultEvent(date, preferences);
  if (!draft) return { mode: 'open', values };
  if (event?.id && draft.id === event.id) return { mode: 'resume', values: draft };
  return { mode: 'confirm', values };
}

module.exports = { editorRequest };
