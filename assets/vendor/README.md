# Microsoft authentication runtime

Vendored from the official npm package `@azure/msal-browser@5.25.0`:

- `msal-browser.min.js`
- `redirect-bridge/msal-redirect-bridge.min.js`
- `LICENSE` (MIT, Microsoft Corporation)

Source: https://registry.npmjs.org/@azure/msal-browser/-/msal-browser-5.25.0.tgz

These assets load only when a configured Outlook connection is opened. Serve the redirect bridge from the same origin as KidsSync. Do not replace it with a third-party-hosted bridge.
