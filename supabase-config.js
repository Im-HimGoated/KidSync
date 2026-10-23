// Supabase settings live in shared/backend/config.js for web and React Native.
// Never put a Supabase service-role key in either client.

// Optional: paste the Loader Script URL from Sentry's JavaScript project
// settings. Leave blank to retain only scrubbed session diagnostics.
window.KIDSSYNC_MONITORING = {
  sentryLoaderUrl: ""
};

// Public OAuth client IDs, not secrets. See CALENDAR_CONNECTIONS.md.
window.KIDSSYNC_CALENDAR_CONNECTIONS = {
  googleClientId: "",
  microsoftClientId: ""
};
