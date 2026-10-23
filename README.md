# KidsSync

The website and React Native app use **one existing Supabase project**. Do not
create a separate database for mobile.

## File Layout

| Location | Responsibility |
| --- | --- |
| `index.html`, `assets/` | Existing web application; Vercel still deploys from the repository root |
| `mobile/` | React Native application using Expo; independent native UI, not a WebView |
| `shared/backend/config.js` | Single public Supabase project URL and publishable key for both clients |
| `shared/backend/schedules.js` | Platform-independent schedule reader, snapshot adapter, Realtime subscription |
| `supabase/` | Shared database schema, RLS policies and migrations |
| `tests/` | Existing web regression tests and shared-backend contract tests |
| `supabase-config.js` | Web-only monitoring and external-calendar OAuth settings |

The web files intentionally stay at the root to preserve deployment paths,
service-worker URLs, OAuth callbacks and existing links. Mobile UI belongs in
`mobile/src/`; portable database/domain code belongs in `shared/`. Do not copy
web HTML or create a second mobile schema.

## Start Mobile Development

Install a supported Node.js LTS release with npm, then:

```sh
cd mobile
npx pnpm@11.25.0 install --frozen-lockfile
npx pnpm@11.25.0 check
npx pnpm@11.25.0 start
```

Open the project with an SDK-compatible Expo Go app or a development build.
Use `npx pnpm@11.25.0 ios` with Xcode/iOS Simulator or `npx pnpm@11.25.0 android` with Android
Studio/an emulator. Dependency versions follow Expo SDK 55's official template;
upgrade them together with Expo's compatibility tooling rather than independently.
See [the mobile setup guide](mobile/README.md) for scope and verification.

## Test

From the repository root:

```sh
node --test tests/*.test.cjs
```

From `mobile/`, after installing dependencies:

```sh
npx pnpm@11.25.0 check
npx pnpm@11.25.0 export
```

Database setup: [CLOUD_SETUP.md](CLOUD_SETUP.md).
Realtime setup: [LIVE_SYNC.md](LIVE_SYNC.md).
