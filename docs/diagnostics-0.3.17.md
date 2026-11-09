# 0.3.17 candidate: Online-waiting reader fix plus a support trace

Scope: both variants, shared runtime files kept byte-identical. No new permissions,
hosts, network calls or backend protocol fields. The Wayfinder page bridge only
forwards an allow-listed set of fields, so nothing added here reaches the server.

## What changed

1. **Reader fix (from PR #9, commit 15cd7aca).** The bounded status card's
   `Online – Waiting for inbound calls` wording is recognized as idle when the
   unique master inbound switch is On. Busy evidence still overrides it. This is
   the fix for the 2026-11-06 live test in which 0.3.15 refused the OFF command
   with `allcalls_unknown`.
2. **Observation cause.** Every reader sample carries `cause`, an enumerated token
   that says why the sample settled where it did:
   - idle: `idle_label`
   - busy: `busy_text`, `ringing_controls`, `call_controls`, `call_timer`
   - unknown (structural): `off_page`, `no_heading`, `no_switch`,
     `multiple_switches`, `switch_state_unreadable`, `no_status_region`,
     `empty_status_region`
   - unknown (wording/contradiction): `no_idle_label`, `label_switch_mismatch`
   The November 6 incident would have reported `no_idle_label`: switch found,
   card found, wording unrecognized. A vendor layout change reports a structural
   token instead. No label text, timer contents or caller data leave the page.
3. **Switch command reasons.** Every `set-delivery` reply names a reason:
   `already_off`, `already_on`, `clicked_confirmed`, `clicked_readback_mismatch`,
   `clicked_switch_lost`, `off_page`, `session_mismatch`, `observed_<busy state>`,
   `observed_unknown:<cause>`, `manual_override_pending`, `switch_disabled`,
   `rate_limited`, or the structural cause when the switch is missing. The
   background records it as `lastSwitch.detail`, shows it in the popup error text
   ("switch was not confirmed (observed_unknown:no_idle_label)") and in the trace.
   A content-script transport failure is recorded as `transport:<message>` and
   still fails the sync exactly as before.
4. **Bounded trace.** The service worker keeps the last 80 events in
   `chrome.storage.session` (cleared when Chrome closes): `worker_start`,
   `observation` (transitions only, not every heartbeat), `sync`, `sync_result`
   (latency, server mode/target/reason, or the error text), `switch`, `inject`,
   `inject_skipped`, `reader_unavailable`, `configure`, `tab_removed`. Entries hold
   state tokens, reasons, tab ids and millisecond latencies only.
5. **Popup.** Shows the installed version (so "which build is this agent running"
   is answerable without `chrome://extensions`), the current evidence cause, the
   last switch detail, and a **Copy diagnostics** button. The button requests a
   read-only bundle (version, extension id, settings flags, state tokens, trace),
   copies it to the clipboard and also shows it in a read-only box in case the
   clipboard is blocked. The bundle never includes the Wayfinder result payload,
   pairing identity, agent id or any page text. It never sends a command.

## Reading a bundle when a pause did not happen

- `switch` with `accepted:false` and `detail:observed_unknown:no_idle_label` →
  wording problem; the reader saw the card but not a known idle label. Capture a
  sanitized copy of that card and extend the regex with a fixture test.
- `detail:no_status_region` / `no_switch` / `multiple_switches` → vendor layout
  changed; the reader's structural anchors need review, not the wording.
- `detail:observed_talking` on an OFF request → the reader believed a call was
  active in AllCalls; check `observation` entries for what evidence set it.
- `detail:transport` or `reader_unavailable` → the content script was not alive in
  the Take Calls tab (discarded tab, extension updated, route change); check
  `inject` entries for whether re-injection ran and why it was skipped.
- `sync_result` with `ok:false` → the Wayfinder page bridge or server refused;
  the error text is the server's fixed message.
- No `switch` entry at all after a `sync_result` → the server did not ask for a
  switch (`target:none`); the reason field says why (for example `wayfinder_busy`
  not set, or `observation_stale`).

## Validation performed for this candidate

Synthetic only. Background controller suites (32 tests per variant) ran locally
against the source and the extracted call-only package layout. Combined packaging
verification and the call-only packaging unit tests ran locally. The jsdom-based
reader, popup and recovery suites could not run in the authoring sandbox (package
installs blocked) and are relied on from CI for this branch. Nothing was
installed in Chrome, no availability was changed, no call was placed, nothing was
uploaded to the Chrome Web Store.

## Remaining gates before distribution

1. CI green on this branch, then review and merge (Shawn's decision).
2. Build the call-only ZIP from the merged `main` SHA via the release-candidate
   workflow; record its SHA-256 next to the source SHA.
3. Install that exact ZIP as an unpacked extension in one test profile; confirm
   the popup shows 0.3.17; run the simulator cases and the pause/restore/refresh/
   manual-override cases with synthetic transitions; collect a diagnostics bundle.
4. One controlled real-provider test (synthetic or operator call) proving a real
   pause and a real restore, with the bundle attached as evidence.
5. Only then upload 0.3.17 to the existing store item, keep Trusted Testers until
   the pilot group confirms, and record store URL, version and ZIP hash.
