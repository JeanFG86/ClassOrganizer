import { readFileSync, readdirSync } from 'node:fs';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from './database.ts';
import { PrismaAssignmentRepository } from './prisma-assignment-repository.ts';

const migrations = new URL('../../prisma/migrations/', import.meta.url);
const targetMigration = '20261024010000_shared_assignments';
const subjectId = '11111111-1111-4111-8111-111111111111';
const teacherId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const classGroupId = '6a6a6a6a-6a6a-4a6a-8a6a-6a6a6a6a6a6a';
const otherClassGroupId = '6b6b6b6b-6b6b-4b6b-8b6b-6b6b6b6b6b6b';
const firstId = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const secondId = 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2';
const createdAt = new Date('2026-02-01T12:00:00.000Z');

describe('migração de atribuições existentes para blocos', () => {
  let container: StartedPostgreSqlContainer;
  let db: Database;
  async function sql(source: string): Promise<void> {
    const result = await container.exec([
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      container.getUsername(),
      '-d',
      container.getDatabase(),
      '-c',
      source,
    ]);
    if (result.exitCode !== 0) throw new Error(result.output);
  }
  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18.6-alpine').start();
    const all = readdirSync(migrations, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const previous = all.filter((name) => name < targetMigration);
    for (const migration of previous)
      await sql(readFileSync(new URL(migration + '/migration.sql', migrations), 'utf8'));
    await sql(`
      INSERT INTO subject (id, name, normalized_name, created_at) VALUES ('${subjectId}', 'Disciplina teste', 'disciplina teste', '${createdAt.toISOString()}');
      INSERT INTO teacher (id, name, created_at) VALUES ('${teacherId}', 'Docente teste', '${createdAt.toISOString()}');
      INSERT INTO teacher_subject (teacher_id, subject_id, position) VALUES ('${teacherId}', '${subjectId}', 0);
      INSERT INTO class_group (id, name, normalized_name, created_at) VALUES ('${classGroupId}', 'Turma teste A', 'turma teste a', '${createdAt.toISOString()}'), ('${otherClassGroupId}', 'Turma teste B', 'turma teste b', '${createdAt.toISOString()}');
      INSERT INTO teaching_assignment (id, class_group_id, subject_id, teacher_id, weekly_lessons, created_at, version) VALUES
        ('${firstId}', '${classGroupId}', '${subjectId}', '${teacherId}', 5, '${createdAt.toISOString()}', 3),
        ('${secondId}', '${otherClassGroupId}', '${subjectId}', '${teacherId}', 2, '${createdAt.toISOString()}', 7);
    `);
    // A migração-alvo e as seguintes: o repositório atual lê o esquema mais recente.
    for (const migration of all.filter((name) => name >= targetMigration))
      await sql(readFileSync(new URL(migration + '/migration.sql', migrations), 'utf8'));
    db = createDatabase(container.getConnectionUri());
  });
  afterAll(async () => {
    await db?.$disconnect();
    await container?.stop();
  });

  it('preserva todos os vínculos, ids, cargas, datas e versões e permite seguir editando', async () => {
    const repository = new PrismaAssignmentRepository(db);
    const expected = [
      {
        id: firstId,
        classGroupId,
        weeklyLessons: 5,
        version: 3,
        createdAt,
        participants: [{ teacherId, subjectId }],
        resourceIds: [],
      },
      {
        id: secondId,
        classGroupId: otherClassGroupId,
        weeklyLessons: 2,
        version: 7,
        createdAt,
        participants: [{ teacherId, subjectId }],
        resourceIds: [],
      },
    ];
    expect((await repository.listAll()).toSorted((a, b) => a.id.localeCompare(b.id))).toEqual(
      expected,
    );
    expect(await db.assignmentParticipant.count()).toBe(2);
    const first = await repository.findById(firstId);
    if (!first) throw new Error('Bloco migrado ausente.');
    await expect(repository.update({ ...first, weeklyLessons: 4 })).resolves.toMatchObject({
      weeklyLessons: 4,
      version: 4,
    });
  });
});
