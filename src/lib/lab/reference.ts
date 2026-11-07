import { strToU8, zipSync } from 'fflate';
import { sha256Hex } from '../hash';
import {
  RUNTIME_MANIFEST_FILE,
  parseRuntimeManifestJson,
  type RuntimeManifest,
} from '../runtime/manifest';

/**
 * Builds the host self-test package in the browser.
 *
 * The reference runtime is shipped as plain source under `public/lab/reference`,
 * so nothing has to be committed as a binary and the zip is assembled at run
 * time. That means the bytes the host installs are checksummed here, in front of
 * the user, rather than trusted from a download.
 */

export interface BuiltReferencePackage {
  manifest: RuntimeManifest;
  bytes: Uint8Array;
  sha256: string;
  entryHtml: string;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load ${url} (HTTP ${response.status}).`);
  return response.text();
}

export async function buildReferencePackage(): Promise<BuiltReferencePackage> {
  const base = new URL('lab/reference/', document.baseURI);

  const manifestText = await fetchText(new URL(RUNTIME_MANIFEST_FILE, base).href);
  const manifest = parseRuntimeManifestJson(manifestText);
  if (manifest.kind !== 'reference') {
    throw new Error('The bundled lab runtime is not marked as a reference runtime.');
  }

  const entryHtml = await fetchText(new URL(manifest.entry, base).href);

  const bytes = zipSync(
    {
      [RUNTIME_MANIFEST_FILE]: strToU8(manifestText),
      [manifest.entry]: strToU8(entryHtml),
    },
    { level: 6 },
  );

  return { manifest, bytes, sha256: await sha256Hex(bytes), entryHtml };
}
