import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const cli = join(root, 'node_modules/dependency-cruiser/bin/dependency-cruiser.mjs');

function check(from: string, to: string) {
  const workspace = mkdtempSync(join(tmpdir(), 'classorganizer-architecture-'));
  // Confere o destino absoluto antes de remover a árvore temporária ao terminar.
  if (
    dirname(resolve(workspace)) !== resolve(tmpdir()) ||
    !basename(workspace).startsWith('classorganizer-architecture-')
  )
    throw new Error('Diretório temporário fora do destino de teste.');
  try {
    const source = join(workspace, from);
    const target = join(workspace, to);
    mkdirSync(dirname(source), { recursive: true });
    mkdirSync(dirname(target), { recursive: true });
    const dependency = relative(dirname(source), target).split(sep).join('/');
    writeFileSync(target, 'export const value = 1;\n');
    writeFileSync(
      source,
      `import {value} from '${dependency.startsWith('.') ? dependency : './' + dependency}';\nexport const result=value;\n`,
    );
    return spawnSync(
      process.execPath,
      [cli, from, '--config', join(root, '.dependency-cruiser.cjs'), '--output-type', 'err'],
      { cwd: workspace, encoding: 'utf8', windowsHide: true, timeout: 10_000 },
    );
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

describe('fronteiras arquiteturais executáveis', () => {
  it.each([
    [
      'internos de outro módulo',
      'packages/core/src/modules/school-structure/domain/source.ts',
      'packages/core/src/modules/teaching/domain/private.ts',
      'core-modules-use-public-apis',
    ],
    [
      'aplicação no domínio',
      'packages/core/src/modules/school-structure/domain/source.ts',
      'packages/core/src/modules/school-structure/application/usecases/private.ts',
      'domain-does-not-depend-on-application',
    ],
    [
      'persistência no controller',
      'apps/api/src/controllers/source.ts',
      'packages/infrastructure/src/modules/teaching/private.ts',
      'api-transport-does-not-compose',
    ],
    [
      'cliente HTTP na apresentação',
      'apps/web/src/modules/teaching/presentation/source.ts',
      'apps/web/src/modules/teaching/infra/private.ts',
      'web-presentation-uses-ports',
    ],
    [
      'fixture na produção',
      'apps/web/src/app/source.ts',
      'apps/web/src/testing/private.ts',
      'production-does-not-depend-on-test-support',
    ],
  ])('rejeita %s', (_description, from, to, rule) => {
    const result = check(from, to);
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain(rule);
  });

  it.each([
    [
      'packages/core/src/modules/school-structure/domain/source.ts',
      'packages/core/src/modules/teaching/domain/index.ts',
    ],
    [
      'apps/web/src/modules/planning/presentation/source.ts',
      'apps/web/src/modules/school-structure/index.ts',
    ],
  ])('aceita o contrato público usado por %s', (from, to) => {
    const result = check(from, to);
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });
});
