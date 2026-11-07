# Architecture

FNF OS is a static, local-first single-page app. There is no server, no account
system and no API. Everything it knows lives in the browser.

```
+-------------------------------------------------------------+
| UI            pages/ + components/ (React, no UI framework) |
+-------------------------------------------------------------+
| State         state/settings, state/library, state/toast    |
+-------------------------------------------------------------+
| Logic         lib/engines  lib/import  lib/compat  runtime  |
|               (pure TypeScript, unit-tested, no DOM)        |
+-------------------------------------------------------------+
| Persistence   IndexedDB (mods/files/covers/projects)        |
|               Cache Storage (runtimes)                      |
|               localStorage (preferences, launch state)      |
+-------------------------------------------------------------+
| External      engine runtimes in a sandboxed iframe         |
|               (none published yet - see docs/ENGINES.md)    |
+-------------------------------------------------------------+
```

## Why this shape

The engine layer is the part expected to change most and break most. Keeping it
outside the platform means a runtime can be replaced without touching the UI, and
a broken runtime cannot corrupt the library. `lib/` has no React imports, which
is why the detection, safety and compatibility rules are testable in plain Node.

## Import data flow

1. `ImportPage` receives a `File` (ZIP) or a folder selection.
2. `readZip` streams the archive through fflate's `Unzip`, enforcing entry-count,
   per-file size, total size and compression-ratio limits *while decompressing*.
3. `buildCandidates` strips a shared root folder, then splits the archive into
   candidates: every directory with a manifest (`pack.json`, `mod.json`,
   `_polymod_meta.json`), every immediate child of `mods/`, and the archive root
   when it looks like a complete game build.
4. Each candidate gets metadata parsing, heuristic engine detection
   (`detectEngine`), static feature analysis (`analyzeMod`) and a content
   fingerprint (`fingerprintFiles`).
5. The user reviews the selection, may override the detected engine, and confirms.
6. `toModRecord` produces the record; `LibraryProvider` writes the record, the
   file map and the cover into IndexedDB. Nothing is written before confirmation.

## Storage model

| Store | Key | Contents |
| --- | --- | --- |
| `mods` | `id` | `ModRecord`: metadata, detection, compatibility report, pinning |
| `modFiles` | `modId` | path -> `Uint8Array` map |
| `covers` | `modId` | `Blob` cover art, capped at 2 MB |
| `collections` | `id` | user collections |
| `projects` | `id` | Mod Studio working copies (`modFiles` keyed by project id) |
| `meta` | string | reserved |

Runtimes are **not** in IndexedDB. They live in Cache Storage under
`fnf-os-runtimes-v1`, keyed by their absolute download URL, checksum-verified
before insertion. Preferences and the launch-complete flag are in localStorage
because they are tiny and needed before any async work.

## Routing and GitHub Pages

Routing is hash-based (`#/library`, `#/mod/<id>`) and the Vite base is `./`.
GitHub Pages cannot rewrite unknown paths to `index.html`, so hash routing avoids
a `404.html` shim entirely and keeps deep links working under a project URL. The
service worker falls back to the cached `index.html` for navigations, so links
also resolve offline.

## Boundaries

The main app never evaluates imported code. Imported files are stored as bytes
and only ever leave the platform as a ZIP download. When a runtime exists it runs
in an iframe with `sandbox="allow-scripts allow-pointer-lock allow-gamepad"` — no
`allow-same-origin`, so runtime code cannot reach IndexedDB, cookies or the DOM of
the shell.
