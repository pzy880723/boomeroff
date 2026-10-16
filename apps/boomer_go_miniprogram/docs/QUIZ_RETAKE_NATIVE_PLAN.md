# Native Quiz Retake

Scope: restore the existing Web explicit retake action using native controls. No new LMS, grading policy, question regeneration (`force`), or assessment database.

## Interaction

- Keep the existing result card, score, saved/preview label and review. Add a 44px `再练一次` button beside the history action. Confirm before requesting another attempt.
- An exact first-submit `410 / quiz_expired`, with no earlier uncertain submit, offers `重新开始`. Explain that the expired attempt was not confirmed as submitted.
- A previous timeout or otherwise unconfirmed submission keeps its original token and frozen answers, even after a later 410. The deployed SQL uses transaction-time expiry, so a late original transaction is not proven impossible. Do not silently start another attempt.
- Starting questions has a visible loading state. Keep the old confirmed result or expired answers until the new token and complete question DTO validate. Failure leaves the old state recoverable.
- No new routes, tabs or visual system. Use DESIGN.md colors, spacing and existing native buttons. No web navigation.

## State Rules

1. Confirmed server results require valid score/total/pass and `persisted:true` in production. Preview remains explicitly synthetic.
2. Start is single-flight and explicit; no local timer auto-restart. The next token must differ from the old token. Strip pre-submit answer keys.
3. Protect modal, start and submit callbacks against hide/unload, identity/store/revision changes and stale request serials.
4. Unknown writes never become a confirmed failure. Do not clear the original frozen answer on transport, auth, 500, malformed or unpersisted receipt.
5. Continuous practice retakes only the same helper/stamp/current item and completed state. Do not reset the queue, count the same item twice or automatically advance. New questions require a new confirmed result before next-item navigation.
6. Preserve server historical grades. Failed retakes must not clear prior mastery.

## Verification

- Test first: passed/failed retake, cancel, double tap, failed/malformed/same-token start, first expiry, unknown then expiry, lifecycle/identity races, and continuous-practice retake without double counting.
- Main preview fixture returns a distinct synthetic token per start and binds replies to the original attempt.
- Run all Node tests, route checks, official WXML/WXSS compilers and actual DevTools synthetic result/retake screenshots.
- No live grade writes, employee data, OTP, paid AI or device login changes. Dedicated AppID and real employee/device acceptance remain release gates.

Source audit: GO Lovable fixed ref `813c12840f12a904fd07e6bc3a8bb08359b01090`, existing quiz RPC migration 0018, replay-before-expiry behavior. No backend change is required for this conservative first slice.
