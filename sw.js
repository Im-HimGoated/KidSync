const CACHE_NAME = "kidssync-shell-v131";
const APP_SHELL = [
  "./",
  "./index.html",
  "./assets/ui-polish.css",
  "./assets/marketing-auth.css?v=3",
  "./assets/landing-ux.css?v=1",
  "./assets/welcome-refresh.css?v=1",
  "./assets/landing-ux.js?v=1",
  "./assets/calendar-ux.css?v=1",
  "./assets/calendar-ux.js?v=1",
  "./assets/dashboard-planning.css?v=1",
  "./assets/dashboard-planning.js?v=1",
  "./assets/live-sync.js?v=2",
  "./assets/micro-motion.css?v=1",
  "./assets/mobile.css?v=95",
  "./assets/calendar-ui-refresh.css?v=1",
  "./assets/calendar-extras.css",
  "./assets/calendar-insights.css",
  "./assets/command-palette.css",
  "./assets/event-drafts.css",
  "./assets/week-calendar.css",
  "./assets/planner-tools.css",
  "./assets/planner-tools.js",
  "./assets/experience.css",
  "./assets/experience.js",
  "./assets/quick-ux.css",
  "./assets/quick-ux.js",
  "./assets/auth-visual-rotation.js?v=1",
  "./assets/family-workspace.css",
  "./assets/family-coordination.js",
  "./assets/reschedule-review.js",
  "./assets/external-calendars.js",
  "./assets/mobile-agenda.js",
  "./assets/smart-planner.css?v=4",
  "./assets/smart-planner.js?v=5",
  "./assets/ui-features.css",
  "./assets/ui-features.js",
  "./assets/interface-upgrades.css?v=4",
  "./assets/interface-upgrades.js?v=4",
  "./assets/smart-scheduling.css?v=2",
  "./assets/smart-scheduling.js?v=4",
  "./assets/family-polls.css?v=1",
  "./assets/family-polls.js?v=2",
  "./manifest.json",
  "./assets/kidssync-app-icon.svg",
  "./assets/kidssync-app-icon-192.png",
  "./assets/kidssync-app-icon-512.png",
  "./assets/kidssync-family-hero.jpg",
  "./assets/kidssync-auth-family-signin.jpg",
  "./assets/jspdf.umd.min.js",
  "./assets/lucide.min.js"
];
const LAZY_ASSETS = [
  "./assets/kidssync-family-entryway-signin.jpg",
  "./assets/kidssync-family-park-signin.jpg",
  "./assets/kidssync-family-table-signin.jpg"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  // Never store OAuth responses or serve the calendar shell as an auth callback.
  if (requestUrl.pathname.endsWith("/oauth-redirect.html")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }

  const rootPath = new URL("./", self.registration.scope).pathname;
  const isAppPage = requestUrl.pathname === rootPath || requestUrl.pathname === `${rootPath}index.html`;
  const isShellAsset = APP_SHELL.some(path => new URL(path, self.registration.scope).pathname === requestUrl.pathname);
  const isLazyAsset = LAZY_ASSETS.some(path => new URL(path, self.registration.scope).pathname === requestUrl.pathname);
  if (!isAppPage && !isShellAsset && !isLazyAsset) return;

  // Check the network first so a deployed update is visible on the next load.
  // Only fall back to the cached app page for an actual app navigation.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(event.request);
      if (response.ok && !requestUrl.searchParams.has("code") && !requestUrl.searchParams.has("token")) {
        const cacheKey = isAppPage ? new URL("./index.html", self.registration.scope) : event.request;
        await cache.put(cacheKey, response.clone());
      }
      return response;
    } catch {
      const cached = isAppPage
        ? await cache.match("./index.html")
        : await cache.match(event.request);
      return cached || Response.error();
    }
  })());
});
