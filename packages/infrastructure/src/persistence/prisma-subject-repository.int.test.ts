import { SubjectNameAlreadyInUseError, createSubject } from '@classorganizer/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDatabase } from '../testing/postgres-container.ts';
import type { TestDatabase } from '../testing/postgres-container.ts';
import { checkDatabase } from './database.ts';
import { PrismaSubjectRepository } from './prisma-subject-repository.ts';

const createdAt = new Date('2026-02-01T12:00:00.000Z');

describe('PrismaSubjectRepository (PostgreSQL)', () => {
  let testDb: TestDatabase;
  let repository: PrismaSubjectRepository;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new PrismaSubjectRepository(testDb.db);
  });

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await testDb.truncateAll();
  });

  it('responde ao healthcheck do banco', async () => {
    await expect(checkDatabase(testDb.db)).resolves.toBeUndefined();
  });

  it('grava e recupera a disciplina com todos os campos', async () => {
    const subject = createSubject({
      id: '0b9d3a52-5c39-4a7e-9a34-1f0a51a8f0c1',
      name: 'Matemática',
      createdAt,
    });

    await repository.add(subject);

    expect(await repository.listAll()).toEqual([subject]);
    expect(await repository.existsWithNormalizedName('matematica')).toBe(true);
    expect(await repository.existsWithNormalizedName('historia')).toBe(false);
  });

  it('traduz violação de unicidade em erro de domínio', async () => {
    await repository.add(
      createSubject({ id: 'a5f0c1b4-0d0e-4c43-8e3b-3d1f1f1f1f01', name: 'História', createdAt }),
    );

    await expect(
      repository.add(
        createSubject({ id: 'a5f0c1b4-0d0e-4c43-8e3b-3d1f1f1f1f02', name: 'HISTORIA', createdAt }),
      ),
    ).rejects.toThrow(SubjectNameAlreadyInUseError);
    expect(await repository.listAll()).toHaveLength(1);
  });

  it('o banco rejeita nome em branco mesmo fora do domínio', async () => {
    await expect(
      testDb.db.subject.create({
        data: {
          id: 'a5f0c1b4-0d0e-4c43-8e3b-3d1f1f1f1f03',
          name: '   ',
          normalizedName: 'x',
          createdAt,
        },
      }),
    ).rejects.toThrow(/subject_name_not_blank/);
  });
});
