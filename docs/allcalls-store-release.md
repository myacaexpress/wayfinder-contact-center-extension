# Wayfinder Call Protection — unlisted store candidate

Status: 0.3.12 review candidate; NOT submitted or published. No install link exists yet. Backend recovery companion and installed acceptance remain pending.
Version: independently managed in `extensions/call-protection/package.json` (initially 0.3.11). Production application activation/settings are unchanged.

## Build and verification

Run from the standalone package directory:

```sh
cd extensions/call-protection
npm ci --ignore-scripts
npm test
npm run build
```

Upload `extensions/call-protection/dist/wayfinder-call-protection-VERSION.zip`,
not the historical developer download ZIP. The store manifest is at ZIP root.
This candidate contains **call protection only**: no Integrity Verify, Integrity
Sync, public-PDF capture, optional hosts, or web-accessible
Integrity resources. The combined developer extension remains unchanged.

Source, manifest template, tests, dependency lockfile and version are owned by
this package. Builds no longer transform the combined developer extension.
The manifest version comes only from its package.json; npm version updates the
package and lockfile together. Tests verify dependency closure, restricted scope,
reproducibility and behavior against the extracted ZIP. No website dependencies
are required. Installed Chrome call acceptance remains pending.

The **Call Protection release candidate** workflow runs as a separate Extension CI job
and can also be dispatched manually on main after merge. It uploads a versioned
ZIP, checksum and exact commit/run provenance to GitHub Actions artifacts only.
It does not submit or publish to Chrome Web Store, deploy the website or use
store credentials. See the [package README](../extensions/call-protection/README.md).

The store variant does not provide Integrity features. Do not install it alongside
the combined developer extension: that creates duplicate call-protection
controllers. Agents who need Integrity must keep the combined developer version
until a separately reviewed distribution strategy supports both features safely.

## Listing copy

Name: Wayfinder Call Protection

Short description: Automatically pause the other calling system while busy in
AllCalls or Wayfinder. No audio or recording access.

Description:
Keep AllCalls and Wayfinder availability coordinated from one Chrome profile.
When a call is ringing, connected or in wrap-up in one system, call protection
pauses availability in the other. After the call, it restores only availability
that protection changed. Your own Break and Offline choices remain yours.

Requires an authorized Wayfinder agent account and AllCalls account, one Take Calls
tab and one signed-in Wayfinder agent workspace. Keep the browser awake and both
calling pages open. The popup shows connection status and lets you turn protection
off. This does not record audio or capture caller information. Browser-based
synchronization cannot retract calls already offered by either provider.

Distribution: Unlisted; United States initial distribution. Unlisted is not private:
anyone with the link can install, but authorized application accounts are required.

Single purpose: Coordinate agent availability between AllCalls and Wayfinder to
reduce overlapping call offers.

Permission justifications:
- scripting (0.3.12): Re-inject only bundled AllCalls reader files in an existing, non-discarded Take Calls tab when protection is active or the user explicitly enables it. No remote code or generic execution interface.
- storage: Remember protection preference, opaque pairing identity and last switch;
  retain current observations in browser session storage.
- allcalls.io: Read fixed call-state labels and operate the uniquely identified
  availability switch on the Take Calls page.
- wayfindercontactcenter.com and www alias: Communicate with the signed-in agent
  workspace so its authenticated backend can coordinate availability.
- No remote executable code. No cookies, microphone, recording or broad browsing
  history permissions requested.

## Privacy disclosure draft — must publish before submission

Wayfinder Call Protection processes agent availability (such as available,
ringing, talking and wrap-up), opaque agent and browser pairing identifiers,
sequence numbers, timestamps and synchronization diagnostics. It sends these
operational signals to the signed-in Wayfinder service to coordinate call
availability. The AllCalls page receives availability switch actions.

The extension does not collect caller names, medication lists, Medicare numbers,
call audio, recordings, passwords or authentication cookies. It does not send
information to an AI provider. It does not sell data or use it for advertising.

Preferences, pairing identity and the last switch are stored locally in the Chrome
profile; current observations are held in session storage. Removing the extension
removes its local storage. Backend operational and audit records are separate and
subject to Wayfinder's retention policy; uninstalling does not erase them.

Before publishing this disclosure, confirm the legal operator, privacy/support
contact, actual backend retention period and deletion request process. Publish a
stable public policy URL covering this extension, then link it in the store.
Disclose operational user activity and opaque identifiers in the dashboard rather
than claiming no data collection. Reconcile final checkbox categories with this
policy and Google's current form. No credentials belong in this document or ZIP.

## Reviewer instructions

Supply dedicated synthetic test accounts through the dashboard's private test
instructions field, not this repository. Both services require authenticated access.
Provide an operator-assisted synthetic call window if the reviewer cannot generate
calls. Do not substitute real agent/beneficiary credentials.

1. Open one AllCalls Take Calls page and one Wayfinder agent workspace in the same
   Chrome profile, signed in to the approved synthetic accounts.
2. Open the extension popup and confirm pairing, fresh status and acknowledged
   protection setting. Verify Off persists after reopening the popup.
3. With controlled synthetic calls, test ringing, connection, wrap-up and idle in
   each direction. Confirm only protection-owned availability is restored.
4. Confirm manual Break/Offline is preserved, unknown/stale evidence never restores
   availability, duplicate tabs cause attention state, and logout/account changes
   do not silently re-pair to another agent.
5. Close a tab; suspend/wake Chrome; reopen pages. Confirm clear status and no
   unsafe restoration. Confirm an active call is never disconnected.

Record date, Chrome version, extension version/store ID, deployed application SHA,
synthetic account references, expected and actual outcomes. This acceptance remains
PENDING: automation was unable to inspect chrome://extensions due browser policy.

## Submission and rollout gates

- [x] Deterministic single-purpose package and automated safety tests.
- [ ] Complete installed Chrome acceptance above with synthetic calls.
- [ ] Confirm publisher account registration and verified contact details.
- [ ] Publish reviewed privacy policy with retention/contact details.
- [ ] Capture genuine popup screenshots with synthetic accounts; upload store assets.
- [ ] Upload ZIP, listing, permission/data disclosures and private reviewer access.
- [ ] Select Unlisted; submit with deferred publishing until acceptance is complete.
- [ ] After Google approval and publication, record the actual store URL and item ID.
- [ ] Pilot with a small team before distributing the link to everyone.

Each agent installs the store version once in the Chrome profile used for calls.
Disable/remove the old unpacked version to prevent duplicate controllers. Confirm
pairing/settings again; local data is not assumed to migrate across extension IDs.
For future updates increase the manifest version and upload to the SAME store item;
Chrome distributes approved updates automatically, not necessarily instantly.
Never create a new listing for routine updates. Do not promise that uninstalling
or disabling protection makes the agent available; check both systems explicitly.

Official references:
- https://developer.chrome.com/docs/webstore/publish
- https://developer.chrome.com/docs/webstore/cws-dashboard-distribution
- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
