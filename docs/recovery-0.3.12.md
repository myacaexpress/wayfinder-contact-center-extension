# 0.3.12 recovery candidate — not operationally accepted

## Reconciled work

- Claude Desktop **Chrome extension robustness review**, https://claude.ai/chat/4d302a6b-ba7b-48eb-95b7-24e6cb150e85: inspected read-only. It reviewed old PR #190/d6a802e, not today's implementation. The matching local Claude session `80d9cdad-e7ea-487f-9e5c-8252ccbb70ea` contains the source-only review. No message was sent to Claude.
- [Application PR #354](https://github.com/myacaexpress/wayfinder-contact-center/pull/354), Claude Fable 5.1: **closed without merge**. Reader fix `5871dc9900e8fcf7524d04efd74e9f86f102ee34`; legacy restore retry `492aa200057f96b013f48c8b2f0d750976b664fd`. Available locally on `origin/codex/call-protection-reader-recovery`. This code was absent from the initial 0.3.11 extraction.
- [Application PR #191](https://github.com/myacaexpress/wayfinder-contact-center/pull/191): pause ownership and active-call guards are already in the baseline; do not replay its older branch over newer code.
- [Application PR #356](https://github.com/myacaexpress/wayfinder-contact-center/pull/356): independent account Off control already merged. It is a web/backend feature, not a ZIP feature.
- [Application PR #472](https://github.com/myacaexpress/wayfinder-contact-center/pull/472), merge `4082ce990d1d359ba3866e737c328c952ae19623`: already merged and present in extraction baseline d7e7dc4f. Its Twilio sampling/pause/restore, explicit manual cancellation and softphone presence refresh stay in the application repository. Deployment and real-provider acceptance were not checked here.

## Included in both extension variants

Ported reader recovery from #354, with additional guards: current-path checks after login/client-side routing; idempotent injection; one retry on a missing reader; exact-tab URL and discarded-tab checks; no recovery when protection is Off; no page reload; explicit unknown on denial; rejection of switch commands after navigation away. All existing busy/manual/account/session protections remain. Recovery itself issues no availability switch; normal server-authorized coordination still applies when protection is enabled.

Call-only adds `scripting` to the existing storage permission to inject the two bundled reader files. No new host origins. Combined already had scripting. Both now declare AllCalls-wide content-script matching while only observing/controlling the Take Calls path. Review permissions before distribution.

## Backend companion — required for transient restore failures

[Application draft PR #482](https://github.com/myacaexpress/wayfinder-contact-center/pull/482) fixes the remaining failure in BOTH current Twilio and legacy paths. A transient restoration failure previously erased the owned pause and reported clear. The legacy route clears the flag before provider I/O, so the old #354 implementation needed additional handling. The new helper re-arms only its own failed transient request under the existing lock, stops after 12 attempts, preserves eligibility checks, stops on policy denial/unexpected error, consumes intent on success and shows restore_unconfirmed while attention is needed. Manual choices and lease expiry prevent retries.

This backend code is intentionally NOT copied into the extension ZIP. The draft remains unmerged/undeployed. Therefore 0.3.12 alone is not a verified complete fix for every stuck-unavailable report.

## Packaging and proof

Call-only candidate: `extensions/call-protection/dist/wayfinder-call-protection-0.3.12.zip`; ready-to-load folder: `extensions/call-protection/dist/unpacked`.
Combined candidate: `dist/combined/wayfinder-call-modes.zip`; ready-to-load folder: `dist/combined/unpacked/wayfinder-call-modes`.

Builds are generated, not committed. Chrome Load unpacked needs an extracted folder containing manifest.json, not a ZIP. Choose one variant; never run both. Do not use the historical Downloads ZIP merely because its name says store.

Synthetic checks cover missing-reader recovery, client-side navigation, duplicate injection, discarded tabs, permission denial, Off behavior, wrong URL and stale switch commands. Backend regression tests fail on the original code and pass with the companion fix. They mock all sessions/providers; none change real availability. GitHub CI status must be checked for the final commit before distribution. Installed Chrome, actual AllCalls DOM/behavior, Twilio end-to-end restoration, sleep/wake and independent account Off remain unverified live. No installation, enabling, calls, staging/live tests, merge or deployment occurred.
