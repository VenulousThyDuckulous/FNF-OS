# Runtime foundation

This document describes the runtime layer as it exists in code today. What it
does **not** describe is a working engine: no runtime package has been built,
published or tested, so the runtime catalogue is empty and every mod still shows
the blocked launch screen.

What exists is the machinery a runtime needs to be installed and confined.

## Package shape

A runtime is one ZIP file:

```
runtime.json          # manifest, required, at the root
index.html            # declared entry point
assets/...            # whatever the bundle needs
```

The package's SHA-256 is **not** in the manifest. A file cannot contain its own
hash, so the checksum lives in the catalogue entry (`RuntimePackage.sha256`) and
is compared against the downloaded bytes before the archive is opened.

`runtime.json` is validated by `parseRuntimeManifest`:

| Field | Rule |
| --- | --- |
| `schemaVersion` | must be `1` |
| `id` | lowercase, `a-z0-9.-_`, 3-64 chars, e.g. `psych-0.7.3-web` |
| `engine` | one of `psych`, `vslice`, `kade`, `codename` |
| `version` | semantic version |
| `entry` | relative `.html` path, no parent segments, no absolute path, no drive letter |
| `publishedAt` | ISO date |
| `license` | non-empty; the licence reviewed for this build |
| `features` | known feature ids mapped to `supported` / `partial` / `unsupported` / `unknown` |
| `notes` | optional text |

Anything else - an unknown feature, a bad support value, a schema from the
future - is rejected rather than coerced.

## Install path

`installRuntime(pkg)` in `src/lib/runtime/manager.ts`:

1. refuses a catalogue entry without a 64-character hex SHA-256;
2. streams the download, reporting progress;
3. verifies the checksum against the downloaded bytes (`openRuntimePackage`);
4. opens the ZIP with the same path rules as mod imports (`checkEntryPath`),
   a 5,000-entry cap, a 128 MB per-entry cap and a 512 MB total cap;
5. parses and validates `runtime.json`, and requires the declared entry to exist;
6. refuses a package whose manifest disagrees with the catalogue about id, engine
   or version;
7. only then caches the verified bytes in Cache Storage (`fnf-os-runtimes-v1`) and
   records the manifest locally.

`readInstalledPackage` repeats steps 3-5 on every launch, so a corrupted or
tampered cache fails loudly instead of booting something unexpected.

## Confinement

The runtime runs in an iframe with:

```
sandbox="allow-scripts allow-pointer-lock allow-gamepad"
```

No `allow-same-origin` and no `allow-popups`/`allow-top-navigation`. The document
is therefore in an opaque origin: it cannot read IndexedDB, cookies,
localStorage, or this app's DOM.

An opaque origin means `MessageEvent.origin` is the string `"null"`, so origin
strings cannot authenticate the sender. `RuntimeHost` instead:

- compares `event.source` with its own iframe's `contentWindow`;
- validates every message with `isRuntimeMessage`, a strict shape allowlist;
- ignores unknown message types silently rather than acting on them;
- does not forward runtime logs to the console.

## Protocol (v1)

Shell to runtime:

| Message | Purpose |
| --- | --- |
| `runtime:init` | protocol version, runtime identity, mod id/name, file list, feature map |
| `runtime:file-result` | `ok` with a binary chunk (8 MB max), `offset`, `total`, `done` - or `ok: false` |
| `runtime:ping` | liveness probe with a nonce |
| `runtime:shutdown` | sent on unmount |

Runtime to shell:

| Message | Purpose |
| --- | --- |
| `runtime:ready` | handshake; the shell answers with `runtime:init` |
| `runtime:file-request` | `{ requestId, path, offset? }` |
| `runtime:pong` | resets the missed-ping counter |
| `runtime:error` | `fatal: true` stops the session and reports to the page |
| `runtime:exit` | the runtime chose to end; the shell returns to the mod page |
| `runtime:log` | accepted but not forwarded |

Lifecycle: 15-second handshake timeout, heartbeat every 5 seconds, session marked
unresponsive after 3 missed heartbeats (`src/lib/runtime/protocol.ts`).

## Virtual filesystem

`createModVfs(files)` exposes only the files of the mod being launched:

- paths are normalised (backslash to slash) and validated; escaping paths,
  absolute paths and control characters cannot be requested;
- `read` returns the stored bytes or `null` - nothing is synthesised;
- `handleFileRequest` answers with a chunk, an offset and a `done` flag so a large
  `Inst.ogg` streams in 8 MB slices instead of one oversized message.

## What is still missing

The runtime layer is infrastructure, not compatibility. Before any mod can claim
a level:

- a real engine build per engine and version, with its own licence review;
- asset resolution through this VFS inside the engine's own asset system;
- Lua/HScript hosts, shaders and modcharts verified by the Compatibility Lab;
- a Compatibility Lab harness that turns test results into levels.

Until then `RUNTIME_CATALOG` stays empty, `playback` stays `unavailable`, and no
mod gets a compatibility level.
