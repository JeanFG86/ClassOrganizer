import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { generationRequestSchema } from '@classorganizer/contracts';
import type { GenerationResult } from '@classorganizer/core';
import { runGeneration } from './thread-runner.ts';

const path = process.argv[2];
const cancellation = new AbortController();
process.once('SIGINT', () => cancellation.abort());
process.once('SIGTERM', () => cancellation.abort());
function output(result: GenerationResult, inputDigest: string | null): void {
  process.stdout.write(
    JSON.stringify({
      ...result,
      engineVersion: 'typescript-reference/1',
      inputDigest,
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
    }) + '\n',
  );
  process.exitCode = {
    feasible: 0,
    infeasible: 3,
    inconclusive: 4,
    cancelled: 130,
    invalid_model: 2,
    failed: 1,
  }[result.status];
}
function inputFailure(reason: string, message: string, paths: string[] = []): void {
  output(
    {
      status: 'invalid_model',
      reason,
      proposal: null,
      diagnostics: [{ code: 'input.' + reason, message, entityIds: paths }],
      sourceRevision: '',
      teacherIdleMinutes: null,
      warnings: [],
      elapsedMs: 0,
      visitedNodes: 0,
      backtracks: 0,
      restarts: 0,
    },
    null,
  );
}
try {
  if (!path) throw new Error('Informe o caminho de um arquivo JSON de entrada.');
  const input: unknown = JSON.parse(await readFile(path, 'utf8'));
  const request = generationRequestSchema.safeParse(input);
  if (!request.success)
    inputFailure(
      'request',
      'A entrada não segue o contrato do motor.',
      request.error.issues.map((i) => i.path.join('.')),
    );
  else {
    const result = await runGeneration(
      request.data.snapshot,
      request.data.options,
      cancellation.signal,
    );
    const inputDigest = createHash('sha256').update(JSON.stringify(request.data)).digest('hex');
    output(result, inputDigest);
  }
} catch {
  inputFailure('input_file', 'Não foi possível ler o arquivo JSON de entrada.');
}
