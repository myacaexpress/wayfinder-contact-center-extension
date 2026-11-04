# Wayfinder Call Protection

Independent Chrome extension package for coordinating AllCalls and Wayfinder
availability. No Integrity or PDF-capture functionality. Store publishing is not
implemented or authorized by building a candidate.

## Develop, test and build

Requires Node 22.22.2+ (22.x), 24.15.0+ (24.x), or 26+, and Python 3.12. From this directory:

```sh
npm ci --ignore-scripts
npm test
npm run build
```

No website installation, build or `apps/web/node_modules` is needed. Source lives
in `src/`; tests and packaging are owned here. `npm test` checks package scope,
permissions, dependencies, deterministic ZIPs and version consistency, then runs
the call-state, pairing, stale-state, manual-choice and popup tests on extracted
ZIP files. These automated tests do not replace installed-Chrome call acceptance.

Build outputs are `dist/wayfinder-call-protection-VERSION.zip`, its SHA-256 checksum
and `dist/unpacked/` for local synthetic acceptance testing. Load the latter, not
`src/`, because the manifest version is injected during build.

## Version and releases

`package.json` is the single version source. The initial independent version is
0.3.11, preserving the candidate from [original application PR #212](https://github.com/myacaexpress/wayfinder-contact-center/pull/212). Later version changes are independent
of `extensions/allcalls-mode/manifest.json` and website releases. Use
`npm version patch --no-git-tag-version` (or minor/major) to update both package
metadata and lockfile. Use three numeric components, each at most 65535.

The reusable **Call Protection release candidate** workflow tests and builds this
package as a separate job in this repository’s Extension CI. Therefore a failed package check prevents
Extension CI from passing and prevents release evidence from being reused.
After an authorized merge, manually run that workflow on `main` to build a
candidate independently of website CI/deployment. Its artifact contains the
versioned ZIP, checksum and exact source/run provenance. It has read-only repository
permissions, no Chrome Web Store credentials and no upload-to-store/publish step.

Store submission requires a separate approval and the
[submission checklist](../../docs/allcalls-store-release.md): installed Chrome
acceptance with synthetic calls, privacy policy, reviewer access and store assets.

## Relationship to the combined developer extension

The original `extensions/allcalls-mode/` package continues to provide call
protection plus Integrity and PDF research features. Its download, version and
tests remain unchanged. This package starts with the reviewed call-protection
logic from [original application PR #212](https://github.com/myacaexpress/wayfinder-contact-center/pull/212) and no longer reads, strips or imports the combined extension
during builds. Intentional fixes to shared call behavior must be reviewed and
ported to both source trees; protocol changes must retain compatibility with
installed older extension versions. Run both suites when changing that protocol.

Never run both extensions together: duplicate controllers can interfere with
availability. Agents needing Integrity should keep the combined developer version
until a separately reviewed distribution strategy supports both safely.
