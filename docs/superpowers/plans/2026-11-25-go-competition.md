# BOOMER GO Competition Implementation Plan

**Goal:** Restore the native Shanghai challenge screens on the existing Tencent ledger.

- [x] Test ERP role/store mapping and the private bridge, including explicit denials for non-participants, forged scope, and missing credentials.
- [x] Route the native board, history, rules, daily reporting, audited correction and cycle settings through the original Battle handlers. Verify against a temporary ledger, including incomplete days and stale versions.
- [x] Verify the public web service and the GO endpoint with a real ERP store-staff login and no test sales. Exercise both card types with the configured live generator in an isolated learning database, using fixture admin/staff actors.
- [ ] Validate WeChat on a phone with both ERP roles before handing off an official experience QR. A DevTools preview or upload alone does not meet this gate.

**Deployment:** Use the pinned Battle server from the active November 18 release.
`release-competition.sh` stages and switches the two Tencent services, while
leaving the original Battle database and cycle file in place. It restores the
previous symlinks and service configuration if the startup checks fail.
