# AllCalls refresh robustness candidate

Observed November 5, 2026: the vendor changed the Offline banner after refresh. The existing reader still read delivery Off but emitted observed Unknown. The backend then paused Wayfinder.

Both variants identify only a unique explicitly labelled inbound control; there is no legacy switch fallback. Positive idle text is scoped to its Call Status section and accepts both observed Offline banners. Normalized busy labels, call controls and status-region timers override idle evidence. MedCare and Medicare Raw Calls selection switches are never automation targets.

The companion backend branch `codex/allcalls-unknown-availability` introduces an observation-warning state. Unknown vendor status alone neither pauses Wayfinder nor vetoes routing, including expiration of this warning state. A previously confirmed busy state remains latched across unreadable samples until two positive idle samples. Wayfinder provider uncertainty and confirmed busy activity remain blocked. Existing manual Break/Offline and manager restrictions are preserved. An already-owned Wayfinder pause requires fresh idle evidence before automatic restoration. A page-session change discards restoration ownership on both systems and, after confirmed busy activity, requires at least 30 seconds plus two positive idle samples before clearing the routing block. Provider Offline writes are skipped for active contacts and rechecked just before writing.

These are uninstalled, unreleased candidates. Main already contains manual report capture; do not silently substitute this build for the earlier availability-only 0.3.14 distribution. Prepare a distinct release version after review.

Safety boundary: DOM checks and clicks are not atomic with the vendor receiving calls. Tests prove no switch command is sent for recognized busy state, including a call arriving between the server sample and command handling. They cannot prove AllCalls switch semantics or rule out vendor-side races after the final local check. A vendor contract/API and controlled call validation are required for a no-disconnection guarantee. Claude Desktop review of the merged revision is required before release. The prior review rejected the initial candidate and motivated these guards.

## Follow-up to second Claude review

N1: busy text includes dialogs, while idle text still excludes dialogs. Explicit Answer/Accept/Decline/Reject call controls count as ringing. Bare action labels require an incoming-call-labelled dialog; unrelated consent and invitation buttons do not count. N3: status lookup is bounded to three ancestors and requires either an explicitly labelled status section or the observed two-child card with a direct Call Status header and switch row; tables/navigation/main containers are excluded.

N2 evidence: on November 5, read-only inspection of the signed-in Take Calls Offline page confirmed a DIV card, direct Call Status DIV header, sibling row, explicit inbound switch, and nested Offline label beside the switch. No call controls were visible. The sanitized fixture in both test directories retains tags, roles, aria labels/check state and fixed status wording only. It omits account, campaign and customer data. The fixture passes the actual reader.

Still NOT captured: Online idle, ringing, talking, wrap-up, or a controlled mid-call refresh. Those tests remain synthetic. The capture is the already-refreshed page involved in the reported incident; this inspection did not reload, toggle availability or place calls. Do not treat one idle snapshot as complete vendor compatibility proof.

Backend follow-up enforces an existing busy latch on the native provider without creating restoration ownership, and restarts the guard when a non-empty document appears after a session gap. Explicit protection Off resets the latch; re-enabling during an unrecognized call cannot recover evidence that was discarded. Closing Chrome while latched retains the routing block and may require reconnection or an explicit manual protection decision.

## Follow-up: require call context for ringing actions

Both readers now require an explicit action label such as `Answer call` or `Accept incoming call`. Generic `Answer`, `Accept`, `Decline`, and `Reject` count only in their nearest visible dialog with an accessible name of `Incoming call` or `Ringing`. Hidden referenced label nodes still contribute to that accessible name. Table and navigation controls are excluded. Existing visible busy text, including incoming-call dialog headings, still overrides underlying idle status. No DOM labels or customer data are sent outside the content script.

Regression tests first reproduced the false ringing from consent/invitation controls on the prior head. The fix preserves Waiting, Offline, and Unknown for unrelated buttons and verifies that a consent dialog does not block an otherwise valid idle switch command. Explicit call actions and call-labelled dialogs still block automatic switching in both extension variants.

Local validation: 208 combined Node tests, 6 call-only package checks (including the extracted-ZIP behavior suite), and 10 isolated simulator tests passed under Node 24.22.1/Python 3.12.14. Both packages build; combined source equality, dependency closure and reproducibility pass. The 62 reader tests run in each variant, including packaged call-only code. Installed Chrome, current vendor busy DOMs and live calls remain untested. The user authorized merging the checked source before the requested Claude review; release remains held pending review and the existing integration safety boundary above.
