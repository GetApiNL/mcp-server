/**
 * Validatie van het opstartgedrag van de server (bin).
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { spawnSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const binPath = path.join(rootDir, 'dist', 'bin.js');

beforeAll(() => {
  if (!existsSync(binPath)) {
    execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });
  }
});

function run(env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [binPath], {
    cwd: rootDir,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 20000
  });
}

describe('Server startup', () => {
  test('stopt met exitcode 1 zonder API_KEY', () => {
    const env = { ...process.env };
    delete env.API_KEY;
    const result = run({ API_KEY: '' });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/API_KEY/i);
    expect(result.stdout).toBe('');
  });

  test('weigert een ongeldig API_KEY-formaat', () => {
    const result = run({ API_KEY: 'not-a-valid-key' });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
  });
});
