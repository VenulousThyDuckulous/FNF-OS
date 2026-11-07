import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  deleteCollection as dbDeleteCollection,
  deleteMod as dbDeleteMod,
  deleteProject as dbDeleteProject,
  getModFiles,
  listCollections,
  listMods,
  listProjects,
  saveCollection,
  saveCover,
  saveMod,
  saveModFiles,
  saveProject,
  type Collection,
  type ModRecord,
  type ProjectRecord,
} from '../lib/db';
import type { EngineId } from '../lib/engines/types';
import { shortId } from '../lib/hash';
import { coverFromCandidate, toModRecord, type ModCandidate } from '../lib/import/importer';
import type { EntryMap } from '../lib/import/zip';
import { readStorage, type StorageSnapshot } from '../lib/storage';

interface LibraryContextValue {
  mods: ModRecord[];
  collections: Collection[];
  projects: ProjectRecord[];
  storage: StorageSnapshot | null;
  loading: boolean;
  refresh: () => Promise<void>;
  importCandidates: (
    candidates: ModCandidate[],
    overrides?: Record<string, EngineId | null>,
  ) => Promise<ModRecord[]>;
  removeMod: (id: string) => Promise<void>;
  patchMod: (id: string, patch: Partial<ModRecord>) => Promise<void>;
  readFiles: (id: string) => Promise<EntryMap | null>;
  createCollection: (name: string) => Promise<Collection>;
  removeCollection: (id: string) => Promise<void>;
  toggleCollection: (modId: string, collectionId: string) => Promise<void>;
  createProjectFromMod: (mod: ModRecord) => Promise<ProjectRecord>;
  removeProject: (id: string) => Promise<void>;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [mods, setMods] = useState<ModRecord[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [storage, setStorage] = useState<StorageSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [nextMods, nextCollections, nextProjects, snapshot] = await Promise.all([
      listMods(),
      listCollections(),
      listProjects(),
      readStorage().catch(() => null),
    ]);
    setMods(nextMods);
    setCollections(nextCollections);
    setProjects(nextProjects);
    setStorage(snapshot);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const importCandidates = useCallback(
    async (candidates: ModCandidate[], overrides: Record<string, EngineId | null> = {}) => {
      const created: ModRecord[] = [];
      for (const candidate of candidates) {
        const hasOverride = Object.prototype.hasOwnProperty.call(overrides, candidate.key);
        const record = toModRecord(candidate, hasOverride ? { engine: overrides[candidate.key] } : {});
        await saveMod(record);
        await saveModFiles(record.id, candidate.files);
        const cover = coverFromCandidate(candidate);
        if (cover) await saveCover(record.id, cover);
        created.push(record);
      }
      await refresh();
      return created;
    },
    [refresh],
  );

  const removeMod = useCallback(
    async (id: string) => {
      await dbDeleteMod(id);
      await refresh();
    },
    [refresh],
  );

  const patchMod = useCallback(
    async (id: string, patch: Partial<ModRecord>) => {
      const existing = mods.find((mod) => mod.id === id);
      if (!existing) return;
      await saveMod({ ...existing, ...patch });
      await refresh();
    },
    [mods, refresh],
  );

  const readFiles = useCallback(async (id: string) => getModFiles(id), []);

  const createCollection = useCallback(
    async (name: string) => {
      const collection: Collection = { id: shortId('col'), name, createdAt: new Date().toISOString() };
      await saveCollection(collection);
      await refresh();
      return collection;
    },
    [refresh],
  );

  const removeCollection = useCallback(
    async (id: string) => {
      await dbDeleteCollection(id);
      await refresh();
    },
    [refresh],
  );

  const toggleCollection = useCallback(
    async (modId: string, collectionId: string) => {
      const mod = mods.find((entry) => entry.id === modId);
      if (!mod) return;
      const has = mod.collectionIds.includes(collectionId);
      await saveMod({
        ...mod,
        collectionIds: has
          ? mod.collectionIds.filter((entry) => entry !== collectionId)
          : [...mod.collectionIds, collectionId],
      });
      await refresh();
    },
    [mods, refresh],
  );

  const createProjectFromMod = useCallback(
    async (mod: ModRecord) => {
      const now = new Date().toISOString();
      const project: ProjectRecord = {
        id: shortId('prj'),
        name: `${mod.name} (working copy)`,
        modId: mod.id,
        engine: mod.engine,
        engineVersion: mod.engineVersion,
        createdAt: now,
        updatedAt: now,
        notes: '',
      };
      await saveProject(project);
      // The imported mod stays untouched; the project is a separate reference.
      const files = await getModFiles(mod.id);
      if (files) await saveModFiles(project.id, files);
      await refresh();
      return project;
    },
    [refresh],
  );

  const removeProject = useCallback(
    async (id: string) => {
      await dbDeleteProject(id);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<LibraryContextValue>(
    () => ({
      mods,
      collections,
      projects,
      storage,
      loading,
      refresh,
      importCandidates,
      removeMod,
      patchMod,
      readFiles,
      createCollection,
      removeCollection,
      toggleCollection,
      createProjectFromMod,
      removeProject,
    }),
    [
      mods,
      collections,
      projects,
      storage,
      loading,
      refresh,
      importCandidates,
      removeMod,
      patchMod,
      readFiles,
      createCollection,
      removeCollection,
      toggleCollection,
      createProjectFromMod,
      removeProject,
    ],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryContextValue {
  const context = useContext(LibraryContext);
  if (!context) throw new Error('useLibrary must be used inside LibraryProvider');
  return context;
}
