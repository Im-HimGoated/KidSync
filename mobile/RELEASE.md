# KidsSync iPhone release

This is the release configuration for App Store Connect app **6838889267** and
iOS bundle identifier **com.kidssync.app**. Run commands from `mobile/`.

`eas.json` defines a signed device/store production build, remotely managed build
numbers and the exact submission target. It contains no private key, credential
path or Apple account login. It does not start builds, upload anything, submit an
App Review request or invite testers when changes are pushed to Git.

## Verified setup (November 24, 2026)

- The supplied individual API key successfully read only Apple app `6838889267`,
  returning KidsSync, bundle ID `com.kidssync.app` and SKU `kidssync-ios-001`.
  This verifies app read access; publishing permissions are not yet proven by a
  live submission.
- Expo authenticated as `itzandrew`, and project creation/linking was confirmed
  by Expo. The production profile passed EAS CLI 27.11.0 schema validation.
- Generated native configuration reports version `1.0.0`, the expected owner,
  project and bundle IDs, no APNs entitlement and no background remote-notification
  mode. The store icon is 1024×1024 RGB without an alpha channel.
- All 906 repository tests and a fresh iOS bundle export passed. Local logs are
  `/private/tmp/kidssync-release-infra-tests-20261124.log` and
  `/private/tmp/kidssync-release-infra-ios-20261124.log`.
- After the publisher explicitly approved encrypted Expo storage, the existing
  individual key was assigned to this project's EAS Submit credentials through
  the official CLI. A fresh `eas submit:status` request used the saved Expo
  credential to read Apple's status for app `6838889267`; the TestFlight build
  list was empty. No build, upload, tester invitation or App Review submission
  was started.
- The manual build-and-upload workflow passed the official EAS CLI workflow
  validator. Its submission guard also passed isolated valid-scope and eleven
  invalid-scope checks. These checks do not execute the hosted workflow.
- The original private key remains outside Git. Initial distribution signing,
  a signed production build, TestFlight acceptance and public App Review
  submission are still pending. A JavaScript bundle export is not a signed App
  Store archive.

## One-time Expo setup

The configured project is `@itzandrew/kidssync`, owned by the personal account
selected by the publisher. Its EAS project ID is
`ffbe07cb-b90c-423c-9a27-39a1a3a5b585`. To check the active account/project:

```sh
npx eas-cli@latest login
npx eas-cli@latest whoami
npx eas-cli@latest project:info
```

The app's marketing version is `1.0.0` to match its App Store version. Its
1024×1024 RGB store icon is rendered from the existing vector logo with an opaque
background; the original branding is preserved. EAS will initialize its remote
iOS build number when the project is first configured; later production builds
increment it automatically.

## Apple credentials

Use the individual API key of an App Manager user restricted to KidsSync for
publishing. Individual keys inherit that user's app access and role; a team key
covers all apps on the Apple team. Keep the downloaded `.p8` outside this Git
repository, and never paste its contents into chat, command arguments or logs.

Configure the approved key through interactive iOS credentials setup:

```sh
npx eas-cli@latest credentials --platform ios
```

Select the production profile and follow the App Store Connect API-key prompts.
Choose the **individual** key type and provide its Key ID and local `.p8` path;
individual keys have no Issuer ID. EAS CLI 24.13.0 or newer supports this key type.
Do not replace the restricted key with a team-wide Admin key to work around a
signing error.

To check the individual key locally without sending it to Expo, run:

```sh
ASC_KEY_ID="YOUR_KEY_ID" ASC_PRIVATE_KEY_PATH="/absolute/path/to/key.p8" node scripts/check-app-store.cjs
```

This checks only KidsSync's pinned Apple app record using a short-lived token
restricted to that GET request. It does not upload, change metadata or prove
that the user has every permission needed to publish. The command prints only
verification status and the selected app's identity, never the key or token.

Initial distribution signing is separate: individual keys cannot use Apple's
provisioning endpoints. An authorized Apple team member must configure the
distribution certificate and matching App Store provisioning profile through EAS
or supply approved existing signing credentials. Enter Apple passwords and
verification codes only in the intended authentication flow, never in chat.

To configure production signing without starting a build, run from `mobile/`:

```sh
npx --yes eas-cli@27.11.0 credentials:configure-build --platform ios --profile production
```

Use the Apple team that owns `com.kidssync.app` (Coding Minds, Inc., team
`63R7WU94A2`). This interactive step may require the authorized team member's
Apple login and two-factor verification.

When configured for Expo Submit, the API key is stored on Expo's servers encrypted
at rest for reuse. Keep the key's destination and permissions explicit before
uploading it. See [Expo credential storage](https://docs.expo.dev/app-signing/security/)
and [Apple API-key setup](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/).

## Manual automated upload

The workflow in `.eas/workflows/ios-testflight.yml` has no automatic event
triggers. After initial signing credentials are configured, run from `mobile/`:

```sh
npx --yes eas-cli@27.11.0 workflow:validate ios-testflight.yml --non-interactive
npx --yes eas-cli@27.11.0 workflow:run ios-testflight.yml
```

It builds iOS with the production profile, then uploads that exact build to
KidsSync using the approved key stored in Expo. Before uploading, it checks the
owner, project, bundle ID, Apple app ID and build outputs. It explicitly disables
Expo's automatic TestFlight group setup. It does not request Beta App Review,
public App Review, groups or tester invitations. Existing Apple automatic
distribution settings remain independent; check them before the first run.

The hosted workflow has not run yet. Initial signing requires an authorized
Apple team member to configure a distribution certificate and provisioning
profile through the interactive credentials flow above. Individual submission
keys cannot perform that provisioning step. The workflow can use the resulting
stored signing credentials for later noninteractive builds.

## Separate build and upload commands

After project linking, version/icon preparation and signing configuration:

```sh
npx eas-cli@latest build --platform ios --profile production
```

Record the resulting build ID and confirm its bundle identifier and version.
Upload that exact build by replacing `BUILD_ID` below:

```sh
npx eas-cli@latest submit --platform ios --profile production --id BUILD_ID --no-auto-testflight-setup
```

The submission profile targets only app 6838889267. An upload goes to App Store
Connect for processing and TestFlight; public App Review submission/release is a
separate step. The command disables Expo's automatic TestFlight group setup.
Existing Apple automatic-distribution settings are independent; inspect those
before uploading if tester notifications are not intended.

Before recording a release as ready, test the signed build on a physical iPhone
and finish the required App Store listing, privacy disclosures, account deletion,
support information and reviewer access. Existing simulator and component checks
are recorded in [QA.md](QA.md); this scaffold is not proof of a successful signed
build, upload, physical-device test or App Review submission.

References: [Expo first build](https://docs.expo.dev/build/setup/),
[Expo iOS submission](https://docs.expo.dev/submit/ios/),
[workflow syntax and manual runs](https://docs.expo.dev/eas/workflows/syntax/),
[individual-key support](https://github.com/expo/eas-cli/releases/tag/v24.13.0).
