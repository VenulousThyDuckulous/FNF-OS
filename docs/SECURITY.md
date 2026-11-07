# Security and privacy

## Model

FNF OS is local-first and serverless. There is no account, no telemetry, no crash
upload and no cloud storage. Imported mods never leave the device. The only
network requests the app can make are: loading its own static assets, and fetching
a runtime the user explicitly asked to install.

## Threat: hostile archives

A ZIP is attacker-controlled input. Protections live in `src/lib/import/safety.ts`
and are enforced **during** decompression, not after:

| Risk | Mitigation |
| --- | --- |
| Path traversal (`../../`) | Any `..` segment rejects the entry; backslashes normalised first |
| Absolute paths / drive letters | Rejected |
| Control characters / misleading names | Rejected |
| Decompression bomb | Total uncompressed cap enforced while streaming; ratio check above 100 MB |
| Single huge file | 512 MB per-entry cap, checked before and after decompression |
| Too many entries | 20,000 entry cap |
| Deep/long paths | 512 character path cap |

Limits are `DEFAULT_LIMITS` in `safety.ts`. Unsafe entries are skipped and
reported; a bomb aborts the whole read with a clear message. Nothing is written to
IndexedDB until the user confirms the import.

## Threat: native code

Archives containing `EXE`, `DLL`, `so`, `dylib`, `jar`, `apk` or similar are
flagged as blockers. FNF OS never executes them and never offers to.

## Threat: imported scripts

Engine Lua/HScript is only dangerous inside a runtime, and no runtime exists yet.
When one does, it runs in an iframe with:

```
sandbox="allow-scripts allow-pointer-lock allow-gamepad"
```

No `allow-same-origin`, so runtime code is in an opaque origin: it cannot read
IndexedDB, cookies, localStorage or the shell's DOM, and cannot navigate the top
frame. Communication with the shell, if ever needed, goes through `postMessage`
with an explicit allowlist - never a shared global.

**Honest limitation:** browser sandboxing constrains what third-party code can do,
but it does not make arbitrary hostile code safe. A runtime is executed code from
someone else; install runtimes only from sources you trust, and only with a
verified checksum.

## Threat: tampered runtime downloads

Every runtime package must declare a lowercase hex SHA-256. `installRuntime`
refuses packages without a valid-looking checksum, verifies the downloaded bytes,
and discards the result on mismatch rather than caching it.

## Threat: data loss

Browsers evict storage. FNF OS asks for persistent storage when the user requests
it, warns above 70% quota use, and never deletes mods or runtimes automatically.
Export is one click on any mod page. Deletion is always explicit and confirmed.

## Privacy statement (what the app collects)

Nothing. There is no analytics script, no error reporter, no fingerprinting, no
third-party embed. The only persistent data is what you import and your
appearance preferences, all stored locally.
