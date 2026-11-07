import { useCallback, useEffect, useState } from 'react';

/**
 * Hash router.
 *
 * GitHub Pages cannot rewrite unknown paths to index.html, so every route lives
 * after the hash: #/library, #/mod/<id>, #/play/<id>. That also keeps deep links
 * working under a project URL without a 404.html shim.
 */

export function readHashPath(): string {
  if (typeof window === 'undefined') return '/';
  const hash = window.location.hash.replace(/^#/, '');
  return hash.length > 0 ? hash : '/';
}

export function useHashPath(): string {
  const [path, setPath] = useState<string>(() => readHashPath());

  useEffect(() => {
    const onChange = () => setPath(readHashPath());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return path;
}

export function useNavigate(): (to: string, options?: { replace?: boolean }) => void {
  return useCallback((to: string, options: { replace?: boolean } = {}) => {
    const target = `#${to.startsWith('/') ? to : `/${to}`}`;
    if (options.replace) {
      window.history.replaceState(null, '', target);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } else {
      window.location.hash = target;
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);
}

export interface ParsedPath {
  pathname: string;
  query: URLSearchParams;
}

export function parsePath(path: string): ParsedPath {
  const [pathname, search = ''] = path.split('?');
  return { pathname: pathname || '/', query: new URLSearchParams(search) };
}

/** Match "/mod/:id" against "/mod/abc" -> { id: 'abc' }. */
export function matchRoute(pattern: string, pathname: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    const part = patternParts[i];
    if (part.startsWith(':')) {
      params[part.slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (part !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

export function Link({
  to,
  className,
  children,
  onClick,
  ...rest
}: {
  to: string;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'>): JSX.Element {
  return (
    <a href={`#${to}`} className={className} onClick={() => onClick?.()} {...rest}>
      {children}
    </a>
  );
}
