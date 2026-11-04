# Extension repository working instructions

This repository owns two alternative Chrome extension packages. Keep their runtime behavior separate from the Wayfinder web app and authenticated backend, which remain in myacaexpress/wayfinder-contact-center.

- Never install or enable an extension, change real availability, submit dispositions, place calls, run browser/live/staging acceptance, merge, publish to Chrome Web Store, or deploy without explicit authorization for that action.
- Safe default validation is the documented synthetic Node/Python suites and local packaging. Do not point fixtures at real service sessions or copy customer records into tests or docs.
- Never run both extension variants together. Preserve the combined Integrity/PDF capabilities unless a scope change is authorized; call-only must remain free of those scripts and permissions.
- Call-only version comes from extensions/call-protection/package.json and its lockfile. Combined version comes from extensions/allcalls-mode/manifest.json. The root package is tooling, not a third extension.
- Before changing shared call behavior, review both variants and their backend protocol compatibility. Run both suites for shared changes; package-only changes need the affected packaging checks.
- Use npm ci --ignore-scripts at root and in extensions/call-protection; npm test; npm run build; python3 scripts/verify-combined-package.py. CI targets Node 22 and Python 3.12.
- Keep builds/node_modules out of Git. Record artifact provenance; do not claim synthetic success proves installed-Chrome or real-provider correctness.
- Do not delete source in the original application repository as part of a migration follow-up without a separately reviewed ownership-transfer change.
