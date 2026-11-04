# Availability recovery and disposition capture

## Required agent behavior

Both Wayfinder and AllCalls may be Available while idle. This is not an exclusive mode selector. When either system is ringing, active or wrapping, pause the other system without disconnecting a call. After the call and wrap-up finish, restore only the availability that automation changed, with fresh observations and the normal eligibility gates. Preserve manual Offline/Break and manager restrictions.

The repeated reported failure is Wayfinder remaining blocked so the agent cannot become available again. The initial migration preserved source. The subsequent 0.3.12 reader fix and separate backend draft PR #482 address specific reproduced failures; see recovery-0.3.12.md. They do not establish live resolution. The account-level interlock and restoration are owned by the Wayfinder backend, so an extension-only UI change is insufficient proof of recovery.

## Mandatory simulated scenarios

| Scenario | Required result |
| --- | --- |
| Both idle and Available | No pause command; both remain Available |
| AllCalls ringing → talking → wrap-up | Block new Wayfinder offers; retain ownership of only the automation pause |
| AllCalls finishes, two fresh idle confirmations | Restore Wayfinder through its ordinary eligibility checks when no manual/manager override exists |
| Wayfinder ringing → active → wrap-up | Pause AllCalls; restore only an automation-owned pause after fresh completion |
| Agent chooses Offline/Break during automation pause | Cancel automatic restoration; preserve user choice |
| Network loss, stale samples, tab reload, sleep/wake | Show exact stale/unknown reason; never infer fresh idle or silently resume delivery |
| Agent turns protection Off while stale/disconnected | Authenticated Wayfinder control clears interlock and pending restoration; late old observations cannot re-enable it |
| Extension removed or another browser used | Independent Wayfinder Off remains usable; uninstall alone is not recovery |
| Off acknowledged, then agent selects Available | Call-protection veto is absent; any other provider/eligibility restriction is identified separately |
| Duplicate tabs, wrong account or ambiguous pairing | Do not command the wrong tab/account; explain recovery path |

Existing extension suites simulate many component cases. The durable Off/lease fencing/Twilio restoration invariants require companion backend tests in the original repository, using mocks/fixtures and no real provider calls. They must not be represented as proven solely by passing the extension suite. Track pause owner, reason, last fresh observation, disable acknowledgement and pending restore intent in synthetic diagnostics without customer data.

## Historical migration discovery status

November 4: browser inventory exposes Chrome profile `myacaexpress.com`, but no AllCalls tab was present. Sign-in readiness is unverified. No AllCalls UI, current disposition options, save semantics, call IDs or export/API capability has been established in this inspection. Await the user-opened signed-in call history/reporting page; do not enable Take Calls to discover a wrap-up form.

Inspect only navigation labels, table schema, disposition filters and an empty/read-only outcome editor when available. Avoid copying customer rows, recordings, identifiers or notes into this public repository. Do not click availability switches, submit outcomes, dial, replay recordings or export live records. If an editor appears only during a real call, stop and use a synthetic fixture or provider-supported isolated test flow instead.

## Proposed disposition sync contract (pending UI/API discovery)

1. Establish the vendor's stable call ID, agent identity, call completion timestamp, outcome/disposition key, and whether a save-confirmed timestamp or revision exists. Do not assume these fields are exposed.
2. Capture only a vendor-confirmed saved outcome, not a click or unsaved selection. Prefer a documented authorized API/webhook/export if available; otherwise a bounded DOM adapter needs explicit save confirmation and stable identity.
3. Map vendor outcomes to Wayfinder values explicitly. Preserve unknown outcomes for review; do not silently classify them as sales or other known results.
4. Use a server-enforced idempotency key from vendor + account + call ID + outcome revision/event ID. Scope it to the authorized agent/account. Retry with the same key. Repeated DOM observations, refreshes, multiple tabs and retries must produce one report.
5. Treat edits as revisions of the same call, with audit history. Keep a minimal acknowledged retry queue and clear errors. Do not persist caller names, medical details, recordings or free-text notes in extension storage by default.
6. Test entirely synthetic call IDs and outcomes: unsaved selection, successful save, failed save, retry, reload, duplicate tabs, account mismatch, revised disposition and missing stable ID. Reconcile fixture totals against Wayfinder's stored reports.

This is a design contract, not an implemented disposition collector. No real disposition was read, submitted or synchronized during migration.

## November 4 follow-up

The user subsequently opened the master account and authorized implementation.
See [manual report capture](allcalls-report-capture.md) for the verified report
schema and draft implementation. The older migration discovery status above is
historical. This draft imports explicit saved-report observations, not wrap-up
clicks, and does not claim an unattended provider event feed.
