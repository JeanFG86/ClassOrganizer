import {
  GENERATION_OUTCOMES,
  PREFERENCE_CRITERIA,
  PlanningError,
  stoppedOutcome,
  type ClaimedGeneration,
  type GenerationOutcome,
  type GenerationQueue,
  type GenerationRun,
  type GenerationRunOptions,
  type GenerationRunRepository,
  type GenerationRunStatus,
  type NewGenerationRun,
  type PreferenceCriterion,
  type PreferenceMetrics,
  type TimetableIssue,
  type TimetableSnapshot,
} from '@classorganizer/core';
import type { Prisma } from '../../generated/prisma/client.ts';
import type { Database, PersistenceClient } from '../../persistence/database.ts';
import { placements } from '../planning/prisma-grid-repository.ts';
import { PrismaErrorCode, translatePrismaError } from '../../persistence/prisma-errors.ts';
import { isUuid } from '../../persistence/uuid.ts';

type Row = Prisma.GenerationRunGetPayload<{
  include: { requester: { select: { username: true } }; applier: { select: { username: true } } };
}>;
const include = {
  requester: { select: { username: true } },
  applier: { select: { username: true } },
} as const;

function invalid(): never {
  throw new Error('Execução de geração inválida no banco.');
}
function record(value: Prisma.JsonValue | null): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid();
}
function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : invalid();
}
function issues(value: unknown): TimetableIssue[] {
  if (!Array.isArray(value)) invalid();
  return value.map((item: unknown) => {
    const { code, message, entityIds } = record(item as Prisma.JsonValue);
    if (typeof code !== 'string' || typeof message !== 'string' || !Array.isArray(entityIds))
      invalid();
    return {
      code,
      message,
      entityIds: entityIds.map((id) => (typeof id === 'string' ? id : invalid())),
    };
  });
}
function status(value: string): GenerationRunStatus {
  return value === 'queued' ||
    value === 'running' ||
    (GENERATION_OUTCOMES as readonly string[]).includes(value)
    ? (value as GenerationRunStatus)
    : invalid();
}
function options(value: Prisma.JsonValue): GenerationRunOptions {
  const raw = record(value);
  return {
    timeLimitMs: count(raw['timeLimitMs']),
    nodeLimit: count(raw['nodeLimit']),
    seed: count(raw['seed']),
    memoryLimitMb: count(raw['memoryLimitMb']),
    preferences: criteria(raw['preferences']),
  };
}
/** Execuções anteriores às preferências não gravaram critérios nem métricas. */
function criteria(value: unknown): PreferenceCriterion[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) invalid();
  return value.map((item: unknown) =>
    (PREFERENCE_CRITERIA as readonly unknown[]).includes(item)
      ? (item as PreferenceCriterion)
      : invalid(),
  );
}
function preferenceMetrics(value: unknown): PreferenceMetrics | null {
  if (value === undefined || value === null) return null;
  const raw = record(value as Prisma.JsonValue);
  return {
    changes: count(raw['changes']),
    teacherWindows: count(raw['teacherWindows']),
    dailySpread: count(raw['dailySpread']),
  };
}
function outcome(value: Prisma.JsonValue | null): GenerationOutcome | null {
  if (value === null) return null;
  const raw = record(value);
  const result = status(String(raw['status']));
  if (result === 'queued' || result === 'running' || typeof raw['reason'] !== 'string') invalid();
  const metrics = record(raw['metrics'] as Prisma.JsonValue);
  return {
    status: result,
    reason: raw['reason'],
    placements:
      raw['placements'] === null ? null : placements(raw['placements'] as Prisma.JsonValue),
    diagnostics: issues(raw['diagnostics']),
    warnings: issues(raw['warnings']),
    metrics: {
      elapsedMs: count(metrics['elapsedMs']),
      visitedNodes: count(metrics['visitedNodes']),
      backtracks: count(metrics['backtracks']),
      restarts: count(metrics['restarts']),
      preferences: preferenceMetrics(metrics['preferences']),
    },
  };
}
function toRun(row: Row): GenerationRun {
  return {
    id: row.id,
    planningId: row.planningId,
    revisionId: row.revisionId,
    requestedBy: row.requestedBy,
    requestedByUsername: row.requester.username,
    requestedAt: row.requestedAt,
    status: status(row.status),
    options: options(row.options),
    inputDigest: row.inputDigest,
    attempts: row.attempts,
    cancelRequestedAt: row.cancelRequestedAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    outcome: outcome(row.result),
    appliedAt: row.appliedAt,
    appliedByUsername: row.applier?.username ?? null,
  };
}
const json = (value: unknown) => value as Prisma.InputJsonObject;

/** Execuções vistas pela API; as garantias de imutabilidade ficam também no banco. */
export class PrismaGenerationRunRepository implements GenerationRunRepository {
  readonly #db: PersistenceClient;
  constructor(db: PersistenceClient) {
    this.#db = db;
  }
  async add(run: NewGenerationRun, input: TimetableSnapshot): Promise<void> {
    await translatePrismaError(
      () =>
        this.#db.generationRun.create({
          data: { ...run, options: json(run.options), input: json(input) },
        }),
      PrismaErrorCode.uniqueViolation,
      () =>
        new PlanningError(
          'generation.active',
          'Já há uma geração em andamento neste planejamento. Aguarde o resultado ou cancele.',
        ),
    );
  }
  async find(id: string): Promise<GenerationRun | null> {
    if (!isUuid(id)) return null;
    const row = await this.#db.generationRun.findUnique({ where: { id }, include });
    return row ? toRun(row) : null;
  }
  async list(revisionId: string, limit: number): Promise<GenerationRun[]> {
    if (!isUuid(revisionId)) return [];
    const rows = await this.#db.generationRun.findMany({
      where: { revisionId },
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include,
    });
    return rows.map(toRun);
  }
  async active(planningId: string): Promise<GenerationRun | null> {
    if (!isUuid(planningId)) return null;
    const row = await this.#db.generationRun.findFirst({
      where: { planningId, status: { in: ['queued', 'running'] } },
      include,
    });
    return row ? toRun(row) : null;
  }
  async cancel(id: string, at: Date): Promise<void> {
    await this.#db.generationRun.updateMany({
      where: { id, status: 'queued' },
      data: {
        status: 'cancelled',
        finishedAt: at,
        result: json(
          stoppedOutcome('cancelled', 'cancelled', 'A geração foi cancelada antes de começar.'),
        ),
      },
    });
    await this.#db.generationRun.updateMany({
      where: { id, status: 'running', cancelRequestedAt: null },
      data: { cancelRequestedAt: at },
    });
  }
  async markApplied(id: string, actorId: string, at: Date): Promise<boolean> {
    const { count: changed } = await this.#db.generationRun.updateMany({
      where: { id, status: 'feasible', appliedAt: null },
      data: { appliedAt: at, appliedBy: actorId },
    });
    return changed === 1;
  }
}

const ABANDONED = stoppedOutcome(
  'failed',
  'abandoned',
  'A geração foi interrompida repetidamente e não terminou. A grade atual foi preservada.',
);
const CANCELLED = stoppedOutcome('cancelled', 'cancelled', 'A geração foi cancelada.');

/**
 * Fila sobre a própria tabela de execuções, com `FOR UPDATE SKIP LOCKED` e reserva com prazo
 * pelo relógio do banco. Uma reserva vencida volta a ser oferecida até o limite de tentativas.
 */
export class PrismaGenerationQueue implements GenerationQueue {
  readonly #db: Database;
  constructor(db: Database) {
    this.#db = db;
  }
  async claim(
    workerId: string,
    leaseMs: number,
    maxAttempts: number,
  ): Promise<ClaimedGeneration | null> {
    return this.#db.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE generation_run SET status = 'failed', finished_at = now(), lease_owner = NULL,
          lease_expires_at = NULL, result = ${JSON.stringify(ABANDONED)}::jsonb
        WHERE status = 'running' AND lease_expires_at < now() AND cancel_requested_at IS NULL
          AND attempts >= ${maxAttempts}`;
      await tx.$executeRaw`
        UPDATE generation_run SET status = 'cancelled', finished_at = now(), lease_owner = NULL,
          lease_expires_at = NULL, result = ${JSON.stringify(CANCELLED)}::jsonb
        WHERE status = 'running' AND lease_expires_at < now() AND cancel_requested_at IS NOT NULL`;
      const [claimed] = await tx.$queryRaw<{ id: string }[]>`
        UPDATE generation_run SET status = 'running', lease_owner = ${workerId},
          lease_expires_at = now() + ${leaseMs}::int * interval '1 millisecond',
          heartbeat_at = now(), attempts = attempts + 1, started_at = COALESCE(started_at, now())
        WHERE id = (
          SELECT id FROM generation_run
          WHERE status = 'queued' OR (status = 'running' AND lease_expires_at < now())
          ORDER BY requested_at, id
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id`;
      if (!claimed) return null;
      const row = await tx.generationRun.findUniqueOrThrow({
        where: { id: claimed.id },
        select: { id: true, attempts: true, input: true, options: true },
      });
      return {
        id: row.id,
        attempt: row.attempts,
        snapshot: row.input as unknown as TimetableSnapshot,
        options: options(row.options),
      };
    });
  }
  async heartbeat(
    id: string,
    workerId: string,
    leaseMs: number,
  ): Promise<{ cancelRequested: boolean } | null> {
    const [row] = await this.#db.$queryRaw<{ cancel_requested_at: Date | null }[]>`
      UPDATE generation_run SET heartbeat_at = now(),
        lease_expires_at = now() + ${leaseMs}::int * interval '1 millisecond'
      WHERE id = ${id}::uuid AND lease_owner = ${workerId} AND status = 'running'
      RETURNING cancel_requested_at`;
    return row ? { cancelRequested: row.cancel_requested_at !== null } : null;
  }
  async finish(id: string, workerId: string, result: GenerationOutcome): Promise<boolean> {
    const cancelled = { ...CANCELLED, metrics: result.metrics };
    const changed = await this.#db.$executeRaw`
      UPDATE generation_run SET
        status = CASE WHEN cancel_requested_at IS NULL THEN ${result.status} ELSE 'cancelled' END,
        result = CASE WHEN cancel_requested_at IS NULL THEN ${JSON.stringify(result)}::jsonb
          ELSE ${JSON.stringify(cancelled)}::jsonb END,
        finished_at = now(), lease_owner = NULL, lease_expires_at = NULL
      WHERE id = ${id}::uuid AND lease_owner = ${workerId} AND status = 'running'`;
    return changed === 1;
  }
  async release(id: string, workerId: string): Promise<void> {
    // Encerrar o worker não é uma tentativa falha: a execução volta à fila sem consumi-la.
    await this.#db.$executeRaw`
      UPDATE generation_run SET
        status = CASE WHEN cancel_requested_at IS NULL THEN 'queued' ELSE 'cancelled' END,
        result = CASE WHEN cancel_requested_at IS NULL THEN NULL
          ELSE ${JSON.stringify(CANCELLED)}::jsonb END,
        finished_at = CASE WHEN cancel_requested_at IS NULL THEN NULL ELSE now() END,
        attempts = GREATEST(attempts - 1, 0), lease_owner = NULL, lease_expires_at = NULL
      WHERE id = ${id}::uuid AND lease_owner = ${workerId} AND status = 'running'`;
  }
}
