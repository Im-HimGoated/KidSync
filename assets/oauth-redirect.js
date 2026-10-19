msalRedirectBridge.broadcastResponseToMainFrame().catch(() => {
  document.getElementById('oauthStatus').textContent = 'Sign-in could not finish. Close this window and try again from KidsSync.';
});
