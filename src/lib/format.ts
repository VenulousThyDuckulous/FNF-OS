import type { EngineId } from './engines/types';

export function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatRelative(iso: string | null): string {
  if (!iso) return 'Never';
  const date = new Date(iso).getTime();
  if (Number.isNaN(date)) return 'Unknown';
  const diff = Date.now() - date;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return formatDate(iso);
}

export function engineName(id: EngineId | null): string {
  switch (id) {
    case 'psych':
      return 'Psych Engine';
    case 'vslice':
      return 'V-Slice';
    case 'kade':
      return 'Kade Engine';
    case 'codename':
      return 'Codename Engine';
    default:
      return 'Unknown engine';
  }
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
