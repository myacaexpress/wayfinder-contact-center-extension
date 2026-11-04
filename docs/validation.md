# Migration validation

Local checks on November 4, 2026 used Node 26.4.0 and Python 3.14.6. CI targets supported Node 22 and Python 3.12; its result is reported separately.

- `npm test`: 141 combined synthetic tests passed; 6 standalone packaging tests passed, including the extracted-ZIP behavior suite.
- `npm run build`: both variants built successfully.
- `python3 scripts/verify-combined-package.py`: 23 source-identical combined assets, unpacked equality, deterministic ZIP/checksum and manifest resource closure passed.
- Extraction hash review: all 34 extension runtime assets (JS/MJS/HTML/CSS/PNG/manifests) remain byte-identical to source commit d7e7dc4f317b401027f4be3bce986d9b2b4ddf37.
- Root and standalone dependency installation with lifecycle scripts disabled reported zero known npm audit vulnerabilities at install time.

No browser was launched; no extension installed/enabled; no real availability changed; no calls, staging tests, production tests, deployment or merge performed. Original application repository files are unchanged by this migration.
