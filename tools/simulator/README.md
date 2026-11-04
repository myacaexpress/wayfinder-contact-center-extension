# Local call-protection simulator

This developer-only tool is not included in either extension ZIP. No extension installation, AllCalls login, Wayfinder login, cookies or real agent identity is used. Shawn reported submitting 0.3.13 to the store; that review status has not been independently verified and this tool does not change the submitted package.

## Start

From the extension repository, using Node 22.22.2+, 24.15+ or 26+:

```sh
npm ci --ignore-scripts
npm run simulator
```

Open **http://127.0.0.1:4313**. Do not use the real extension popup for these tests. Everything on the simulator page is fake, including the Available/Online labels. Leave your real calling accounts untouched. Ctrl+C in the terminal stops the simulator. `SIMULATOR_PORT=4314 npm run simulator` selects another loopback port if needed.

## Click walkthroughs

Each independent scenario starts with **Reset simulation → Enable simulated protection → Next sample**. Both fake platforms start available. Each state button takes one sample; **Next sample** advances the simulated clock by three seconds. Two idle samples are required for restoration.

| Scenario | Clicks after setup | Expected result |
| --- | --- | --- |
| Wayfinder call | Fake Wayfinder **Call active → Call ended / Idle → Next sample** | Fake AllCalls goes Off during the call, then On. Log includes the real reader's fake switch click. |
| AllCalls call and failure | Fake AllCalls **Talking → Fail next restore → Idle / Waiting → Next sample → Next sample** | Fake Wayfinder pauses; first restoration fails and retains ownership; next sample restores. |
| Pending confirmation | **Talking → Hold restores Pending → Idle / Waiting → Next sample → Next sample → Provider confirms Available** | Pending persists at one attempt without duplicate dispatch, then confirmation clears ownership. Repeat another Talking/Idle cycle to check reuse. |
| Timeout/retry | Start Pending as above, then **Expire pending (+61s)** | Another attempt starts; repeated expirations reach the 12-attempt bound. No real time delay/provider request. |
| Manual Wayfinder override | **Talking → Manual Break** (Wayfinder panel) **→ Idle / Waiting → Next sample** | Wayfinder remains Break. Manual Offline works similarly and cancels pending restoration. |
| Manual AllCalls override | Wayfinder **Call active**, AllCalls **Manual Offline**, then Wayfinder **Call ended / Idle → Next sample** | AllCalls stays Off instead of automatically resuming. |
| Switch failure | **Block fake switch → Call active → Unblock fake switch** | Actual reader refuses a disabled DOM switch, reports unconfirmed, then clicks and confirms readback on retry. |
| Connection failure | **Disconnect fake Wayfinder → Call active → Reconnect** | Transport error is visible; failed response sends no AllCalls switch. Reconnect resumes modeled coordination. |
| Missing reader | **Missing reader** | Actual background recovery requests reinjection into the fake tab. |
| Denied reader | **Deny reader injection** | Unknown observation, denial in the log. **Reload fake AllCalls** repairs the fixture. |
| Reload | **Restart controller** or **Reload fake AllCalls** | Actual worker is recreated with fake local settings preserved, or new reader gets a fresh page-session ID. New page session drops modeled AllCalls restoration ownership. |
| Stale / Off | **Stale sample**, or **Disable simulated protection → Talking** | Actual controller forwards unknown evidence for stale input; Off stops sync and switch commands. |

The state cards, owned restoration flags, attempt count, Pending indicator and event log show outcomes. `REAL` log entries come from unmodified extension code calling a fake adapter; `FAKE` backend/provider results are a model, not proof of Python service behavior. **Call ended / Idle** explicitly sets simulated Wayfinder Available when no automated restore is owned; use Next sample (not that button) when testing whether a manual Break persists.

## Code and isolation

- Executes the unmodified production `extensions/call-protection/src/background.js` in Node VM, with in-memory Chrome storage/tabs/messages. It has no `fetch`, sockets, `require`, `process`, browser sessions or authenticated API client. VM is dependency isolation for trusted repository scripts, not a hostile-code sandbox.
- Executes unmodified `detector.js` and `allcalls.js` in JSDOM against a synthetic DOM. The production-shaped URL is only a JSDOM origin: it is never opened or fetched. Subresource loading stays disabled; fetch, XHR, WebSocket, EventSource and sendBeacon explicitly throw. Timers are controlled/accelerated and samples are stepped, not live browser timers.
- UI only calls the loopback server. Strict Host/Origin checks and custom mutation header block cross-origin actions. CSP limits script/style/connect to self and forbids frames/forms. Server serves an exact static route allowlist, not arbitrary files or proxy requests.
- Wayfinder/backend behavior is a documented, simplified model. The Python backend, actual provider APIs, Chrome extension APIs, production popup, Wayfinder content bridge, authentication, live DOM, sleep/throttling and actual call races are NOT exercised here. Existing backend regression tests use the real AvailabilityService separately; this visual model does not replace them.

## Verification

```sh
npm run test:simulator
```

Ten tests cover actual controller/reader commands, manual overrides, modeled failures/pending/retry bound, missing reader/permission denial/restart, Off/stale/transport behavior, unavailable network APIs and HTTP origin/route restrictions. Tests listen only on loopback with an ephemeral port. Existing deterministic ZIP allowlists exclude all simulator files. No new extension permissions or runtime files are introduced.
