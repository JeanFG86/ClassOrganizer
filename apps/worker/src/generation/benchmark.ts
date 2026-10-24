import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { cpus, platform, release, arch } from 'node:os';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generationRequestSchema, generationResultSchema } from '@classorganizer/contracts';
import { z } from 'zod';
import { validateTimetableProposal } from '@classorganizer/core';

const inputPath = process.argv[2];
const outputPath = process.argv[3];
const runs = Number(process.argv[4] ?? 3);
const rssBudgetMb = Number(process.argv[5] ?? 512);
if (
  !inputPath ||
  !outputPath ||
  !Number.isInteger(runs) ||
  runs < 1 ||
  runs > 10 ||
  !Number.isFinite(rssBudgetMb) ||
  rssBudgetMb < 32
) {
  process.stderr.write(
    'Uso: benchmark <entrada.json> <relatorio.json> [execuções: 1..10] [limite RSS em MiB]\n',
  );
  process.exitCode = 2;
} else {
  let temporary: string | undefined;
  try {
    const request = generationRequestSchema.parse(
      JSON.parse(await readFile(resolve(inputPath), 'utf8')),
    );
    const reportPath = resolve(outputPath);
    if (reportPath === resolve(inputPath))
      throw new Error('O relatório não pode substituir a entrada.');
    temporary = await mkdtemp(join(dirname(reportPath), '.engine-benchmark-'));
    const results = [];
    for (let i = 0; i < runs; i++) {
      const seed = (request.options.seed + i) >>> 0;
      const path = join(temporary, 'request.json');
      await writeFile(path, JSON.stringify({ ...request, options: { ...request.options, seed } }));
      const started = performance.now();
      const raw = await new Promise<string>((accept, reject) => {
        const child = spawn(
          process.execPath,
          [fileURLToPath(new URL('./cli.ts', import.meta.url)), path],
          { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
        );
        let output = '';
        let errors = '';
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error('A execução excedeu o prazo de segurança.'));
        }, request.options.timeLimitMs + 5000);
        child.stdout.on('data', (chunk: Buffer) => {
          output += chunk.toString();
        });
        child.stderr.on('data', (chunk: Buffer) => {
          errors += chunk.toString();
        });
        child.once('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once('close', () => {
          clearTimeout(timer);
          if (output.trim()) accept(output);
          else reject(new Error(errors || 'O processo encerrou sem resposta.'));
        });
      });
      const parsed: unknown = JSON.parse(raw);
      const result = generationResultSchema.parse(parsed);
      const metrics = z
        .object({ peakRssBytes: z.number().positive(), inputDigest: z.string() })
        .parse(parsed);
      const validationErrors = result.proposal
        ? validateTimetableProposal(request.snapshot, result.proposal)
        : [];
      results.push({
        seed,
        status: result.status,
        reason: result.reason,
        elapsedMs: result.elapsedMs,
        wallTimeMs: performance.now() - started,
        peakRssBytes: metrics.peakRssBytes,
        inputDigest: metrics.inputDigest,
        visitedNodes: result.visitedNodes,
        backtracks: result.backtracks,
        restarts: result.restarts,
        teacherIdleMinutes: result.teacherIdleMinutes,
        preferences: result.preferences,
        independentlyValidated: result.status === 'feasible' && validationErrors.length === 0,
        diagnostics: [...result.diagnostics, ...validationErrors],
      });
    }
    const passed = results.every(
      (r) =>
        r.independentlyValidated &&
        r.elapsedMs <= request.options.timeLimitMs &&
        r.wallTimeMs <= request.options.timeLimitMs + 2000 &&
        r.peakRssBytes <= rssBudgetMb * 1024 * 1024,
    );
    const report = {
      engineVersion: 'typescript-reference/1',
      datasetDigest: createHash('sha256').update(JSON.stringify(request.snapshot)).digest('hex'),
      sourceRevision: request.snapshot.sourceRevision,
      recordedAt: new Date().toISOString(),
      hardware: {
        node: process.version,
        platform: platform(),
        release: release(),
        architecture: arch(),
        cpu: cpus()[0]?.model,
        logicalCpus: cpus().length,
      },
      limits: { ...request.options, rssBudgetMb, wallTimeGraceMs: 2000 },
      passed,
      results,
    };
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
    process.stdout.write(
      (passed
        ? 'Benchmark aprovado nos limites informados.'
        : 'Benchmark não atingiu os limites informados.') + '\n',
    );
    process.exitCode = passed ? 0 : 1;
  } catch {
    process.stderr.write(
      'Falha ao executar o benchmark. Confira o contrato da entrada e o caminho do relatório.\n',
    );
    process.exitCode = 2;
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
}
