import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Vercel transpiles the api/ functions rather than bundling them, so they run as
 * real Node ESM. Node ESM will not resolve an extensionless relative import, and
 * the function then dies at cold start with FUNCTION_INVOCATION_FAILED and no
 * runtime log — which is exactly how this shipped to production twice.
 *
 * Vite and tsx both paper over the missing extension in dev, so no other check
 * in this repo catches it. This one does.
 *
 * The second time, the offending import was not in server code at all: it was in
 * src/utils/routeProfile.ts, a file the browser and the route handler share. So
 * the check no longer stops at the server directory — it follows the imports
 * wherever they lead, because that is what Node does at cold start.
 */

function tsFilesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return tsFilesUnder(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

const RELATIVE_IMPORT = /from\s+'(\.\.?\/[^']*)'/g;

function relativeImportsIn(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(RELATIVE_IMPORT)].map((match) => match[1]);
}

/**
 * The source file a specifier points at, whether or not it carries the
 * extension — an import that is about to crash in production still has to be
 * followed, or the files beyond it go unchecked.
 */
function sourceFileFor(fromFile: string, specifier: string): string | null {
  const base = join(dirname(fromFile), specifier.replace(/\.js$/, ''));
  return (
    [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')].find(
      (candidate) => existsSync(candidate) && statSync(candidate).isFile()
    ) ?? null
  );
}

/** Everything Node would load when a function in api/ starts up. */
function reachableFromServer(): string[] {
  const seen = new Set<string>();
  const queue = [...tsFilesUnder('api'), ...tsFilesUnder('server')];

  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);

    for (const specifier of relativeImportsIn(file)) {
      const target = sourceFileFor(file, specifier);
      if (target && !seen.has(target)) queue.push(target);
    }
  }

  return [...seen].sort();
}

describe('relative imports in server code', () => {
  const files = reachableFromServer();

  it('finds the files it is meant to guard', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('follows the imports out of server/ and into the shared code', () => {
    expect(files).toContain(join('src', 'utils', 'routeProfile.ts'));
    expect(files).toContain(join('src', 'utils', 'geo.ts'));
  });

  it.each(files)('%s carries an explicit extension on every relative import', (file) => {
    const offenders = relativeImportsIn(file).filter(
      (specifier) => !/\.(js|json|css)$/.test(specifier)
    );

    expect(offenders).toEqual([]);
  });
});
