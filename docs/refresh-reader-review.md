# AllCalls refresh robustness candidate

Observed November 5, 2026: the vendor changed the Offline banner after refresh. The existing reader still read delivery Off but emitted observed Unknown. The backend then paused Wayfinder.

Both variants now read the inbound switch independently of Offline banner wording. A unique inbound-labelled control takes precedence over campaign switches; legacy fallback is disabled in Call Type Settings. Active call labels take precedence over switch state. MedCare and Medicare Raw Calls selection switches are never automation targets.

The companion backend branch `codex/allcalls-unknown-availability` introduces an observation-warning state. Unknown vendor status alone neither pauses Wayfinder nor vetoes routing, including expiration of this warning state. Wayfinder provider uncertainty and confirmed busy activity remain blocked. Existing manual Break/Offline and manager restrictions are preserved. An already-owned Wayfinder pause still requires fresh idle evidence before automatic restoration.

These are uninstalled, unreleased candidates. Main already contains manual report capture; do not silently substitute this build for the earlier availability-only 0.3.14 distribution. Prepare a distinct release version after review.

Safety boundary: DOM checks and clicks are not atomic with the vendor receiving calls. Tests prove no switch command is sent for recognized busy state, including a call arriving between the server sample and command handling. They cannot prove AllCalls switch semantics or rule out vendor-side races after the final local check. A vendor contract/API and controlled call validation are required for a no-disconnection guarantee. Claude Desktop review is requested before release.
