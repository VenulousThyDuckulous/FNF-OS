/** Content hashing used for duplicate detection and runtime integrity checks. */

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Fingerprint a mod by its content, not its name.
 *
 * Each file is hashed individually, then the sorted `path:hash` lines are
 * hashed together. That keeps memory bounded on large mods while still
 * changing if any file's bytes change - two mods with identical layouts but
 * different art will not collide.
 */
export async function fingerprintFiles(files: Map<string, Uint8Array>): Promise<string> {
  const paths = [...files.keys()].sort((a, b) => a.localeCompare(b));
  const lines: string[] = [];
  for (const path of paths) {
    const bytes = files.get(path);
    if (!bytes) continue;
    lines.push(`${path}:${await sha256Hex(bytes)}`);
  }
  return sha256Hex(new TextEncoder().encode(lines.join('\n')));
}

/** Short, human-facing id. */
export function shortId(prefix = 'm'): string {
  const random = crypto.getRandomValues(new Uint8Array(8));
  const body = [...random].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${body}`;
}
