# BOOMER GO: three-platform operations candidate

2026-11-21: the owner explicitly requested developing WeChat Mini Program,
iOS and Android together. This supersedes earlier notes deferring native
packaging. Use official WeChat Donut and one maintained source; do not revive
the previous Flutter/Capacitor app or borrow the consumer project's identity.

## First shared slice

`operations-mini/` is the new independent client. The build tool copies the
existing ERP authentication adapter from the old source, not its config,
transport, sessions, routes or media. It creates an isolated project and a
SHA-256 source manifest. All three targets use that same project. No old
web/Mini Program production route is switched by this build.

ERP password/SMS login is followed by the Tencent operations service identity
and store-scope check. The client does not persist tokens or proofs. A
running session renews its ERP credentials once for concurrent reads and
revalidates identity/scope. The backend remains the authority on every read.
Ambiguous non-HQ store selections are blocked. The workbench reads today's
tasks and evidence counts, with explicit empty, error and read-only states.

The current Tencent candidate is read-only. Task creation, photo upload,
completion, group sharing, scheduling, learning, exams, competition and
messages are not delivered by this slice. Do not activate incomplete legacy
routes or use dummy production data to make them look ready.

## Reproduce

From `apps/boomer_go_miniprogram`:

```sh
node --test tests/operations-candidate.test.cjs tests/erp-auth.test.cjs
node tools/prepare-operations.cjs /private/tmp/go-new-candidate
/Applications/wechatwebdevtools.app/Contents/MacOS/cli open --project /private/tmp/go-new-candidate
```

Use a fresh path. Use the opened project for Mini preview and both native
builds. IDE build failures can return exit code zero; verify CLI output and
actual APK/IPA files. No Beta, resource-bundle upload or store release is
part of this development step.

## Observed results

| Target | Actual result |
| --- | --- |
| WeChat | Official preview succeeded (41,688 bytes), employee AppID in CLI output. DevTools rendered the login screen and switched to ERP password mode. No customer AppID and no production release. |
| Android | Official development APK attempt stopped at task creation, code 1. No APK. |
| iOS | Official IPA attempt stopped during archive: project.miniapp.json missing the bound mobile app miniModuleId. No IPA. |

The DevTools multi-platform selector displayed the official QR prompt to
create/bind the employee multi-platform application before it allows a mode
switch. Complete that binding for the employee AppID, then use the
platform-generated project configuration. Do not invent miniModuleId or
reuse the consumer configuration. The candidate snapshot intentionally
contains no native application binding, secrets, or signing materials.

After binding, resume official builds, verify each target's real package
identity, signing, request domains and runtime, then run real ERP password
and SMS, store-scope and task-read acceptance on each device. A simulator
screen or preview QR alone is not proof of those flows.
