import type { CompatibilityReport } from './compat/analyze';
import type { Confidence, EngineId } from './engines/types';
import { STORES, deleteRecord, getAll, getRecord, putRecord } from './idb';
import type { EntryMap } from './import/zip';

/** Persistent records. Everything here lives on the user's device only. */

export interface ModRecord {
  id: string;
  /** FNF OS display name. Renaming never touches files inside the mod. */
  name: string;
  /** Name as it appeared in the archive/folder. */
  originalName: string;
  engine: EngineId | null;
  engineVersion: string | null;
  detectionConfidence: Confidence;
  detectionScore: number;
  detectionEvidence: string[];
  /** True when the user set the engine manually rather than accepting detection. */
  engineOverridden: boolean;
  fileCount: number;
  bytes: number;
  fingerprint: string;
  coverPath: string | null;
  importedAt: string;
  lastPlayedAt: string | null;
  favourite: boolean;
  collectionIds: string[];
  tags: string[];
  /** Pinned runtime version; null = use the engine's default. */
  runtimeVersion: string | null;
  compat: CompatibilityReport;
  source: {
    kind: 'zip' | 'folder' | 'game';
    fileName?: string;
  };
  kind: 'mod' | 'game';
}

export interface ModFilesRecord {
  modId: string;
  files: EntryMap;
}

export interface Collection {
  id: string;
  name: string;
  createdAt: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  modId: string;
  engine: EngineId | null;
  engineVersion: string | null;
  createdAt: string;
  updatedAt: string;
  /** Working copies are separate from the imported template, never in place. */
  notes: string;
}

export async function listMods(): Promise<ModRecord[]> {
  const mods = await getAll<ModRecord>(STORES.mods);
  return mods.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

export async function getMod(id: string): Promise<ModRecord | undefined> {
  return getRecord<ModRecord>(STORES.mods, id);
}

export async function saveMod(mod: ModRecord): Promise<void> {
  await putRecord(STORES.mods, mod);
}

export async function saveModFiles(modId: string, files: EntryMap): Promise<void> {
  await putRecord<ModFilesRecord>(STORES.modFiles, { modId, files });
}

export async function getModFiles(modId: string): Promise<EntryMap | null> {
  const record = await getRecord<ModFilesRecord>(STORES.modFiles, modId);
  return record?.files ?? null;
}

export interface CoverRecord {
  modId: string;
  blob: Blob;
}

export async function saveCover(modId: string, blob: Blob): Promise<void> {
  await putRecord<CoverRecord>(STORES.covers, { modId, blob });
}

export async function getCover(modId: string): Promise<Blob | null> {
  const record = await getRecord<CoverRecord>(STORES.covers, modId);
  return record?.blob ?? null;
}

export async function deleteMod(id: string): Promise<void> {
  await deleteRecord(STORES.mods, id);
  await deleteRecord(STORES.modFiles, id).catch(() => undefined);
  await deleteRecord(STORES.covers, id).catch(() => undefined);
  const projects = await getAll<ProjectRecord>(STORES.projects);
  for (const project of projects) {
    if (project.modId === id) await deleteRecord(STORES.projects, project.id);
  }
}

export async function listCollections(): Promise<Collection[]> {
  return getAll<Collection>(STORES.collections);
}

export async function saveCollection(collection: Collection): Promise<void> {
  await putRecord(STORES.collections, collection);
}

export async function deleteCollection(id: string): Promise<void> {
  await deleteRecord(STORES.collections, id);
  const mods = await listMods();
  for (const mod of mods) {
    if (mod.collectionIds.includes(id)) {
      await saveMod({ ...mod, collectionIds: mod.collectionIds.filter((c) => c !== id) });
    }
  }
}

export async function listProjects(): Promise<ProjectRecord[]> {
  return getAll<ProjectRecord>(STORES.projects);
}

export async function saveProject(project: ProjectRecord): Promise<void> {
  await putRecord(STORES.projects, project);
}

export async function deleteProject(id: string): Promise<void> {
  await deleteRecord(STORES.projects, id);
}

export async function findByFingerprint(fingerprint: string): Promise<ModRecord | undefined> {
  const mods = await getAll<ModRecord>(STORES.mods);
  return mods.find((m) => m.fingerprint === fingerprint);
}
