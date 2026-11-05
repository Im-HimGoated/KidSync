const test = require('node:test');
const assert = require('node:assert/strict');

const flow = require('../mobile/src/family/async-flow');

test('failed shared-calendar opens show an error and a later retry can open', async () => {
  let attempts = 0, visibleError = '', opened = null;
  const options = {
    existingContext: null,
    loadContext: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('offline');
      return { calendar: { id: 'family-1' } };
    },
    isCurrent: () => true,
    onOpened: context => { opened = context; },
    onError: () => { visibleError = 'Open an invitation to try again.'; },
  };

  const failed = await flow.openSharedContext(options);
  assert.equal(failed.status, 'error');
  assert.match(visibleError, /try again/i);
  assert.equal(opened, null);

  visibleError = '';
  const retried = await flow.openSharedContext(options);
  assert.equal(retried.status, 'opened');
  assert.equal(opened.calendar.id, 'family-1');
  assert.equal(visibleError, '');
});

test('closing or replacing an owner comment sheet discards its late response', async () => {
  const guard = flow.createLatestRequestGuard();
  const ownerScope = 'account-1:owner-1:family-1';
  const ownerRequest = guard.begin(ownerScope);
  let finishOwnerLoad;
  const ownerLoad = new Promise(resolve => { finishOwnerLoad = resolve; });
  let visibleComments = [];
  const ownerResult = ownerLoad.then(comments => {
    if (guard.isCurrent(ownerRequest, ownerScope)) visibleComments = comments;
  });

  guard.invalidate();
  assert.equal(guard.isCurrent(ownerRequest, ownerScope), false);

  const sharedScope = 'account-1:owner-2:family-2';
  const sharedRequest = guard.begin(sharedScope);
  assert.equal(guard.isCurrent(ownerRequest, ownerScope), false);
  assert.equal(guard.isCurrent(sharedRequest, sharedScope), true);
  assert.equal(guard.isCurrent(sharedRequest, ownerScope), false);

  finishOwnerLoad([{ id: 'late-owner-comment' }]);
  await ownerResult;
  assert.deepEqual(visibleComments, []);
});
