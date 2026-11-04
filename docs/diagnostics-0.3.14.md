# 0.3.14 candidate: retain reader failure diagnostics

The local simulator exposed a real production-controller defect: after a missing reader and denied recovery, a popup status read reruns tab discovery, which overwrote `allcalls_reader_unavailable` with an empty issue merely because the tabs existed. The popup could lose the specific refresh/reader warning without a new successful sample.

Both variants now retain this warning for the same paired AllCalls tab. A successful observation clears it; a different tab does not inherit it; popup reads remain read-only and send no control commands. This is a diagnostics correction, not evidence of a newly fixed availability lockup.

Regression: the warning-retention test fails on 0.3.13 and passes with this patch. Additional coverage verifies recovery clears the warning and no warning is copied onto another tab. Existing controller, reader, popup and packaging suites also run for this candidate.

Simulated failure controls deliberately produce unconfirmed switches, provider failures or pending restoration. Those outputs are expected until the corresponding recovery action. They are not by themselves evidence of production failure. The simulator's backend is a behavioral model; real service regression tests live in the application repository.

0.3.13 store submission is user-reported pending review, not independently verified. This candidate has not been uploaded, submitted, installed, or deployed. Disposition code and the running simulator are untouched.
