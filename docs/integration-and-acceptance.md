# Integration boundaries and controlled acceptance

## Existing dependencies

- Wayfinder `apps/web/src/components/CallModeBridge.jsx` and its tests retain the authenticated page bridge. Content scripts exchange the existing fixed `wayfinder-call-mode-request` / `wayfinder-call-mode-result` messages, correlated by request ID.
- Wayfinder `server/api/call_mode.py`, `server/api/routes/call_mode.py`, `server/api/automatic_call_protection.py`, models and migrations own account protection, provider state and restoration. Current source includes Twilio and legacy Connect behavior.
- Combined Integrity content/background scripts require the matching Wayfinder eligibility/import endpoints and authorized vendor account. Optional permission alone does not prove a successful job or fresh result.
- Combined public-PDF capture requires the existing local research backend in Wayfinder's `tools/medicare_search`; it is not bundled or started here.

Protocol changes need compatibility review and synthetic regression tests in both repositories. Keep installed older extensions compatible. Do not move application credentials or backend deployment responsibilities into this repository.

## Automated checks

Run both existing synthetic suites and both builders. Verify permission scope, manifest resource closure, ZIP reproducibility and source-to-artifact equality. CI artifacts identify commit/run/variant. These checks cannot prove real provider timing or successful installed Chrome workflows.

## Controlled browser acceptance — authorization required

1. Inspect the actual loaded variant/version and ensure only one controller is enabled in the intended Chrome profile. Open one AllCalls Take Calls page and the same agent's signed-in Wayfinder workspace.
2. With protection Off, verify diagnostics, account pairing and independent Wayfinder Off confirmation. Off must not force Available or disconnect a call.
3. With explicitly authorized synthetic calls, check both directions: ringing, active call, wrap-up, then fresh idle samples and restoration of only automation-owned availability changes. Never complete wrap-up automatically.
4. Verify manual Offline/Break, manager restrictions, duplicate tabs, navigation, logout, reload, network loss, stale lease, sleep/wake and removal. Off must clear the account-level interlock and late observations must not re-enable it. Verify current Twilio behavior explicitly.
5. If Integrity is later in scope, separately authorize synthetic account/job/import checks. A successful call-protection test is not proof of Integrity correctness, and vice versa.

Browser observations cannot make atomic reservations across providers or retract a call already offered. Operational acceptance remains pending; no live/browser test is performed by CI.
