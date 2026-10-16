# Workbench Shift Binding

Goal: keep today's work facts independent of the selected content/browsing shop. This is a current bug fix, not permission to introduce an unverified home-shop fallback.

Evidence: fixed GO `813c128`, `app_bootstrap_v1` returns only the caller's today/tomorrow schedules, and active global/current-working-shop definitions. Its legacy definitions omit shop_id. Current native api.js picks the first matching code and labels the shift with the selected shop name.

Design: retain the existing workbench card and typography. Show the actual authorized row's shop below the shift. Explicit rest is only server shop_context.status=rest for the current Shanghai day; no records means unscheduled, never inferred rest. Conflicting or incomplete data displays a precise notice in the same card without blocking tasks or sales.

Implementation and tests:

1. Add API regression tests before production changes: selected A versus actual B; same-code scoped definitions; ambiguous legacy definitions; other-user/out-of-scope/multiple-day rows; stale date; explicit rest versus no schedule.
2. API dashboard projection chooses a single valid caller row for today, resolves shop from verified authorized membership, and chooses exactly one matching definition. Prefer exact shop definition over explicit global; legacy unscoped definitions are usable only when unambiguous. Missing/ambiguous configuration must not invent times. Preserve bootstrap fields.
3. Add native page tests and the smallest workbench bindings for actual shop, explicit rest, missing schedule and conflict/config notice. No new route, tab, authority or network request.
4. Run full Node tests, route checks, official compilers, independent review and actual labeled synthetic DevTools screenshot. No real employee or schedule writes.

The content-context backend proposal remains separate and unapproved: mutable staff_profiles.shop_id is not proven authoritative home, and ERP sales scope must not be expanded by a UI fallback.
