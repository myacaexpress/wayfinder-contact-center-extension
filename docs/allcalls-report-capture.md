# Manual AllCalls report capture — draft integration

This adds an explicitly invoked report tool to both extension packages. The
availability reader, background interlock, pairing protocol, manifest permissions
and release version are unchanged. Development ZIPs are not store releases; a
separate release must choose a new version and review data disclosures.

In the popup, **Capture AllCalls report** opens `report.html`. Load a reviewed
source configuration downloaded from Wayfinder Manager → Dispositions → AllCalls
source dispositions. Open exactly one AllCalls `/agency/calls` tab in Agency View
and enable its ID column. Downloading reads only the displayed table and creates
a local JSON file; it makes no network request or automatic Wayfinder import.
No polling, page clicks, outcome submission or delivery toggle is used.

The observed source contract is title `Calls - <agency label>`, region
`Call details`, and columns ID, Direction, Agent Name, Call Date, Call Length,
Disposition, AI Disposition, Cost and Call Type. The source export also exposes
`id`. Report dates use America/Chicago, as verified in the inspected account.
Do not capture if its timezone has changed. The exact supported call types are
Medicare Raw Calls and MedCare Inbound Calls. Marketing Dollars confirms MedCare
Partners sponsorship for the latter; funding is not inferred per row.

The file contains source account UUID, agency label, capture time, fixed timezone
and billing basis, source call IDs, selected agent names, source labels, exact
local call times, duration, cents, human/AI outcomes and an enrollment badge count
when visible. The numeric source agent IDs and Wayfinder UUID associations live
in the administrator-reviewed configuration; report names must match uniquely.
Caller numbers, caller names, notes, state, email links, recordings, cookies and
tokens are excluded. The tool does not store the configuration or captures in
extension storage. The local downloaded file remains under the operator's control.

Missing/duplicate IDs, ambiguous selected names, unsupported columns/timestamps,
wrong account/view and unrecognized dispositions block capture rather than
creating a guessed row. Other agents and other call types are excluded. Unknown
outcome vocabulary requires a reviewed allowlist update. This is a caller-free
report observation, not a signed vendor save event or native Wayfinder disposition.

The companion Wayfinder change provides admin configuration/import, immutable
source snapshots, correction/replay handling and separate manager reporting.
It requires source UUID and exact agency label, validates mapped agents, and
rejects stale/conflicting snapshots. CPA remains unverified and is not calculated.
The report tool does not use the call-protection authenticated bridge.

## Backfill and acceptance limits

Capture each date window/page explicitly, keep original capture timestamps,
import via the admin review control, and overlap recent windows for corrections.
Only visible rows are covered; no completeness claim or delete-on-absence.
Master-account source ID, Michael's external numeric identity and Wayfinder
identity associations require operator verification before live ingestion.

Synthetic JSDOM tests cover both variants, ID/schema checks, campaign/agent
selection, human/AI separation, enrollment badges, live rows, malformed data and
privacy exclusions. Run `npm test`, `npm run build`, and
`python3 scripts/verify-combined-package.py`. No extension installation, real
capture download/import, account mutation, live call or source disposition change
is part of this draft's acceptance evidence.
