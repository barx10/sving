import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Vercel transpiles the api/ functions rather than bundling them, so they run as
 * real Node ESM. Node ESM will not resolve an extensionless relative import, and
 * the function then dies at cold start with FUNCTION_INVOCATION_FAILED and no
 * runtime log — which is exactly how this shipped to production once.
 *
 * Vite and tsx both paper over the missing extension in dev, so no other check
 * in this repo catches it. This one does.
 */

function tsFilesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return tsFilesUnder(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

const RELATIVE_IMPORT = /from\s+'(\.\.?\/[^']*)'/g;

describe('relative imports in server code', () => {
  const files = [...tsFilesUnder('api'), ...tsFilesUnder('server')];

  it('finds the files it is meant to guard', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files)('%s carries an explicit extension on every relative import', (file) => {
    const offenders = [...readFileSync(file, 'utf8').matchAll(RELATIVE_IMPORT)]
      .map((match) => match[1])
      .filter((specifier) => !/\.(js|json|css)$/.test(specifier));

    expect(offenders).toEqual([]);
  });
});
