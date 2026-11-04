# Test without receiving real AllCalls calls

## Available now: simulated automated checks

Run `npm test` after installing the locked development dependencies. These tests run in Node/Python, not an installed Chrome extension. They create fake AllCalls DOMs with labels such as Waiting, Ringing, Talking and Dispositioning, and a fake delivery switch. Background tests provide mock `chrome.tabs`, storage, messages and Wayfinder replies. URLs such as allcalls.io in a JSDOM fixture identify the simulated page; they do not navigate your browser or sign into AllCalls.

These tests do not need an AllCalls login, do not open Chrome, and do not change real availability. They cover detection, guard conditions, pairing, stale observations, simulated switch confirmation, manual-choice preservation, connection failures and popup behavior. Run under a network-restricted executor for an additional boundary. Installing npm dependencies needs registry access; the actual checks do not.

Current 0.3.12 candidate results: 150 combined synthetic tests passed, plus all 6 standalone package tests (including its extracted-ZIP behavior suite). Both ZIPs build, and combined package reproducibility/source equality checks pass. This proves simulated behavior, not vendor integration.

## Available now: local visual simulator

Run `npm run simulator` from the repository and open http://127.0.0.1:4313. See [the exact click walkthroughs and isolation limits](../tools/simulator/README.md).

The tool executes the unmodified extension controller and reader against in-memory Chrome adapters and a fake DOM. The Wayfinder/provider side is a labeled model. The UI is loopback-only, authenticated vendor sessions are never used, and no network-capable production adapter is loaded. The simulator is developer tooling outside both ZIP allowlists; it does not alter the submitted store package.

## What is not a safe substitute

Automatic protection Off in a real installed extension does not prove that AllCalls itself is Offline. Likewise, viewing a live Take Calls page or inspecting its real switch is not the same as a simulated environment. Do not enable delivery or rely on the absence of a ringing call as a test safeguard. This migration does not change either system's actual availability.

## Remaining integration proof

Simulations cannot prove today's real AllCalls DOM labels, cross-provider timing, signed-in pairing, Twilio backend restoration or live Chrome sleep/reload behavior. If a provider-supported sandbox/test account with delivery disabled exists, verify its isolation before use; availability of such a sandbox has not been established. Real calling acceptance is deferred until explicitly authorized with a controlled plan. You can debug the extension offline before that step.
