import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { generationResultSchema } from '@classorganizer/contracts';
import { validateTimetableProposal } from '@classorganizer/core';
import { makeTimetableFixture } from '@classorganizer/core/testing';
import { runGeneration } from './thread-runner.ts';

const options = { timeLimitMs: 1000, nodeLimit: 100000, seed: 7, memoryLimitMb: 64 };
const folders: string[] = [];
afterEach(async () => {
  await Promise.all(folders.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('motor isolado em thread e linha de comando', () => {
  it('executa a busca real e devolve uma proposta validada pelo contrato e pelo domínio', async () => {
    const snapshot = makeTimetableFixture();
    const result = generationResultSchema.parse(await runGeneration(snapshot, options));
    expect(result.status).toBe('feasible');
    if (!result.proposal) throw new Error('Proposta ausente.');
    expect(validateTimetableProposal(snapshot, result.proposal)).toEqual([]);
  });
  it('mantém o processo principal responsivo e encerra após cancelamento real', async () => {
    const controller = new AbortController();
    let beat = false;
    const timer = setTimeout(() => {
      beat = true;
      controller.abort();
    }, 10);
    const result = await runGeneration(makeTimetableFixture(), options, controller.signal);
    clearTimeout(timer);
    expect(beat).toBe(true);
    expect(result.status).toBe('cancelled');
    expect(result.proposal).toBeNull();
  });
  it('não inicia trabalho se já cancelado e rejeita entrada fora do contrato', async () => {
    const controller = new AbortController();
    controller.abort();
    expect((await runGeneration(makeTimetableFixture(), options, controller.signal)).status).toBe(
      'cancelled',
    );
    expect(
      (await runGeneration(makeTimetableFixture(), { ...options, timeLimitMs: 0 })).status,
    ).toBe('invalid_model');
  });
  it('executa o CLI sem banco e registra digest e memória', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'engine-test-'));
    folders.push(folder);
    const input = join(folder, 'input.json');
    await writeFile(input, JSON.stringify({ snapshot: makeTimetableFixture(), options }));
    const result = await promisify(execFile)(
      process.execPath,
      [fileURLToPath(new URL('./cli.ts', import.meta.url)), input],
      { timeout: 10000 },
    );
    const parsed: unknown = JSON.parse(result.stdout);
    expect(generationResultSchema.parse(parsed).status).toBe('feasible');
    expect(parsed).toMatchObject({
      inputDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      peakRssBytes: expect.any(Number),
    });
  });
  it('grava relatório de benchmark reproduzível em processos separados', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'benchmark-test-'));
    folders.push(folder);
    const input = join(folder, 'input.json');
    const output = join(folder, 'report.json');
    await writeFile(input, JSON.stringify({ snapshot: makeTimetableFixture(), options }));
    await promisify(execFile)(
      process.execPath,
      [fileURLToPath(new URL('./benchmark.ts', import.meta.url)), input, output, '2', '512'],
      { timeout: 20000 },
    );
    const report: unknown = JSON.parse(await readFile(output, 'utf8'));
    expect(report).toMatchObject({
      passed: true,
      engineVersion: 'typescript-reference/1',
      results: [
        { seed: 7, status: 'feasible', independentlyValidated: true },
        { seed: 8, status: 'feasible', independentlyValidated: true },
      ],
    });
  });

  it('entrada JSON inválida retorna o mesmo contrato estruturado e código 2', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'engine-invalid-'));
    folders.push(folder);
    const input = join(folder, 'broken.json');
    await writeFile(input, '{');
    const result = await new Promise<{ code: string | number | null | undefined; stdout: string }>(
      (accept) => {
        execFile(
          process.execPath,
          [fileURLToPath(new URL('./cli.ts', import.meta.url)), input],
          { timeout: 10000 },
          (error, stdout) => accept({ code: error?.code, stdout }),
        );
      },
    );
    expect(result.code).toBe(2);
    expect(generationResultSchema.parse(JSON.parse(result.stdout))).toMatchObject({
      status: 'invalid_model',
      proposal: null,
      reason: 'input_file',
    });
  });
});
