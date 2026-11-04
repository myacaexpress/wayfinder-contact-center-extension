# Test without receiving real AllCalls calls

## Available now: simulated automated checks

Run `npm test` after installing the locked development dependencies. These tests run in Node/Python, not an installed Chrome extension. They create fake AllCalls DOMs with labels such as Waiting, Ringing, Talking and Dispositioning, and a fake delivery switch. Background tests provide mock `chrome.tabs`, storage, messages and Wayfinder replies. URLs such as allcalls.io in a JSDOM fixture identify the simulated page; they do not navigate your browser or sign into AllCalls.

These tests do not need an AllCalls login, do not open Chrome, and do not change real availability. They cover detection, guard conditions, pairing, stale observations, simulated switch confirmation, manual-choice preservation, connection failures and popup behavior. Run under a network-restricted executor for an additional boundary. Installing npm dependencies needs registry access; the actual checks do not.

Current migration results: 141 combined synthetic tests passed, plus all 6 standalone package tests (including its extracted-ZIP behavior suite). Both ZIPs build, and combined package reproducibility/source equality checks pass. This proves simulated behavior, not vendor integration.

## Proposed next step: visual simulator, not yet implemented

Build a separate local test harness that displays fake AllCalls and Wayfinder panels and injects the production controller into a mocked adapter. Provide buttons for idle, ringing, talking, wrap-up, manual Offline/Break, stale sample and connection failure. Show expected versus observed switch commands in an event log.

Use synthetic data, an isolated browser profile with no real calling extensions or sessions, local fixture pages only, and a network policy blocking every non-local request. The harness must not request permissions for allcalls.io or wayfindercontactcenter.com, open real vendor URLs, reuse cookies, or forward adapter commands to a real account. Assert the network block and mock-only command destination before exposing controls. This needs its own implementation review; no visual harness or browser runtime test was run during migration.

## What is not a safe substitute

Automatic protection Off in a real installed extension does not prove that AllCalls itself is Offline. Likewise, viewing a live Take Calls page or inspecting its real switch is not the same as a simulated environment. Do not enable delivery or rely on the absence of a ringing call as a test safeguard. This migration does not change either system's actual availability.

## Remaining integration proof

Simulations cannot prove today's real AllCalls DOM labels, cross-provider timing, signed-in pairing, Twilio backend restoration or live Chrome sleep/reload behavior. If a provider-supported sandbox/test account with delivery disabled exists, verify its isolation before use; availability of such a sandbox has not been established. Real calling acceptance is deferred until explicitly authorized with a controlled plan. You can debug the extension offline before that step.
