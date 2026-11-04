# Migration record

Source: https://github.com/myacaexpress/wayfinder-contact-center/tree/d7e7dc4f317b401027f4be3bce986d9b2b4ddf37

The remote main SHA was verified before extraction. Only the two extension source trees, their tests/build files, store documentation, icon generator and associated font assets were copied. The original checkout is dirty and on prototype-mvp; none of its working files were used or modified.

`source-provenance.json` records SHA-256 hashes at extraction, before migration-only edits. `source-history.txt` preserves original author/date/commit references for the selected paths. This is a source snapshot with traceable original history, not a claim that Git ancestry was transplanted. Full monorepo history was not imported into this public repository. Original source remains intact.

Migration changes are confined to dependency resolution, packaging destination/checksum/unpacked output, font location, documentation and standalone CI. Runtime JS, HTML, CSS, icons and manifest contents are unchanged. Both extension versions remain 0.3.11. Changes to README affect the combined ZIP bytes without changing runtime behavior.

Application bridges and backend endpoints remain in the original repository. Existing production downloads and installed extensions are unchanged. The old package/CI must not be removed until ownership transfer is separately reviewed. During this overlap, shared runtime fixes must be deliberately synchronized; do not silently maintain divergent controllers. Only one variant may be enabled per profile.

This repository was supplied as public by Shawn. No credentials, environment files, customer records or application database history are part of this extraction. Store submission, enabling an extension, live acceptance, merging the migration and deployment require separate authorization.

## Recovery work after the snapshot

The initial byte-identical 0.3.11 migration is retained in Git history. Subsequent 0.3.12 changes intentionally modify the AllCalls reader/controller/manifests and standalone permission validation, porting Claude Fable’s closed, unmerged PR #354. Baseline hashes remain historical provenance, not a claim that the current recovery code is unchanged. See recovery-0.3.12.md.
