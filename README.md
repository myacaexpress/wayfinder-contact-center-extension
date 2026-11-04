# Wayfinder Contact Center Extension

Chrome extensions for coordinating AllCalls and Wayfinder availability. Both existing variants are preserved, from the application repository, plus the 0.3.12 reader-recovery fix. This migration does not publish, install or enable either extension.

## Choose one variant

| Variant | Source | Includes | Loadable build folder |
| --- | --- | --- | --- |
| Call protection | `extensions/call-protection/src` | Availability coordination only | `extensions/call-protection/dist/unpacked` |
| Combined developer | `extensions/allcalls-mode` | Call protection, Integrity Verify/health imports, local public-PDF capture | `dist/combined/unpacked/wayfinder-call-modes` |

**Never enable both variants in the same Chrome profile.** They contain duplicate availability controllers. Both currently identify as version 0.3.12; check the variant and artifact path, not only the version or display name. Integrity remains deferred for the focused availability project; it is retained here for existing users.

**Release status:** 0.3.12 is a review candidate. It repairs missing AllCalls readers; full stuck-availability recovery also needs [application PR #482](https://github.com/myacaexpress/wayfinder-contact-center/pull/482), currently unmerged and undeployed. [Release notes and exact evidence](docs/recovery-0.3.12.md).

## Local non-live checks

Use Node 22.22.2+ (22.x), 24.15.0+ (24.x), or 26+, and Python 3.12:

```sh
npm ci --ignore-scripts
npm --prefix extensions/call-protection ci --ignore-scripts
npm test
npm run build
```

Tests use synthetic DOMs and mocked Chrome APIs. They do not open Chrome, call vendor services, enable delivery, or place calls. Build outputs are ignored by Git. Call-only packaging tests exercise the extracted ZIP, not just source files. The two dependency locks are intentional: call protection remains independently testable and versioned.

Combined ZIP: `dist/combined/wayfinder-call-modes.zip` (historical nested folder layout preserved).
Call-only ZIP: `extensions/call-protection/dist/wayfinder-call-protection-0.3.12.zip`.
Both builders emit SHA-256 files. CI records source/run provenance and builds separate artifacts. It has no store upload, installation, application deployment or live-test step.

See [testing without real calls](docs/safe-testing.md) for the safe simulated workflow and its limits.

## Reinstall after approval

Open `chrome://extensions` in the intended profile. For a new unpacked installation, enable Developer mode, choose Load unpacked and select exactly one loadable build folder from the table. For an existing unpacked installation, use its original folder and Reload to preserve its identity. Refresh idle calling pages after reloading. Pin W and initially keep Automatic protection Off. Optional Integrity access is separate.

Do not load call-only `src`: its manifest version is injected by the build. Do not run a new variant alongside the previous combined install. Removing the extension alone does not clear the server's account-level routing protection; use Wayfinder's independent Turn off call protection control and verify confirmation.

## Service dependencies and acceptance

The calling tabs must belong to the same agent in one Chrome profile. The extension uses the authenticated Wayfinder page bridge; the web app, server, data models, migrations, and Integrity/capture backends remain owned by [Wayfinder Contact Center](https://github.com/myacaexpress/wayfinder-contact-center). This is not a standalone replacement for those services.

See [availability recovery and disposition capture](docs/availability-and-dispositions.md), [integration boundaries and controlled acceptance](docs/integration-and-acceptance.md), [migration provenance](docs/migration.md), [call-only package instructions](extensions/call-protection/README.md), and [store release checklist](docs/allcalls-store-release.md). The draft [manual report capture](docs/allcalls-report-capture.md) adds caller-free source snapshots with a separate Wayfinder import/reporting dependency. It is independent of the busy label Dispositioning; unattended sync and source completeness remain unimplemented.

## Assets and licensing

Bundled W icon provenance and Sora's existing font license are retained in `assets/fonts/`. `scripts/generate-call-mode-icons.py` is an optional authoring utility requiring Pillow and fonttools[woff]; ordinary builds use committed PNGs. No new source-code license is granted by this migration.

## Test without receiving calls

Run `npm run simulator`, then open http://127.0.0.1:4313. This developer-only visual simulator uses fake accounts and the real controller/reader scripts. See [walkthrough and limitations](tools/simulator/README.md). It is not included in the Chrome package.
