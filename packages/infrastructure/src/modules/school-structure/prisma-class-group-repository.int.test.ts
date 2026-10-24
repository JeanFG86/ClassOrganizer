import {
  ClassGroupNameAlreadyInUseError,
  StaleVersionError,
  ClassGroupEntity,
} from '@classorganizer/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDatabase } from '../../testing/postgres-container.ts';
import type { TestDatabase } from '../../testing/postgres-container.ts';
import { PrismaClassGroupRepository } from './prisma-class-group-repository.ts';

const createdAt = new Date('2026-02-01T12:00:00.000Z');
const A = '6a6a6a6a-6a6a-4a6a-8a6a-6a6a6a6a6a6a';
const B = '6b6b6b6b-6b6b-4b6b-8b6b-6b6b6b6b6b6b';

describe('PrismaClassGroupRepository (PostgreSQL)', () => {
  let testDb: TestDatabase;
  let repository: PrismaClassGroupRepository;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new PrismaClassGroupRepository(testDb.db);
  });

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await testDb.truncateAll();
  });

  it('grava, busca e lista a turma', async () => {
    const turma = ClassGroupEntity.create({ id: A, name: '6º ano A', createdAt }).snapshot();

    await repository.add(turma);

    expect(await repository.findById(A)).toEqual(turma);
    expect(await repository.findByNormalizedName('6º ano a')).toEqual(turma);
    expect(await repository.listAll()).toEqual([turma]);
    expect(await repository.findById('não-é-uuid')).toBeNull();
  });

  it('nome duplicado vira erro de domínio, no cadastro e na renomeação', async () => {
    await repository.add(
      ClassGroupEntity.create({ id: A, name: '6º ano A', createdAt }).snapshot(),
    );
    const b = ClassGroupEntity.create({ id: B, name: '6º ano B', createdAt }).snapshot();

    await expect(
      repository.add(ClassGroupEntity.create({ id: B, name: '6º ANO A', createdAt }).snapshot()),
    ).rejects.toThrow(ClassGroupNameAlreadyInUseError);

    await repository.add(b);
    await expect(
      repository.update({ ...b, name: '6º ano A', normalizedName: '6º ano a' }),
    ).rejects.toThrow(ClassGroupNameAlreadyInUseError);
  });

  it('atualiza com versão e rejeita versão antiga', async () => {
    const turma = ClassGroupEntity.create({ id: A, name: '6A', createdAt }).snapshot();
    await repository.add(turma);

    const saved = await repository.update({ ...turma, archivedAt: createdAt });

    expect(saved.version).toBe(2);
    await expect(repository.update({ ...turma, name: 'X' })).rejects.toThrow(StaleVersionError);
    expect(await repository.classGroupStatus(A)).toBe('archived');
  });

  it('informa a situação da turma', async () => {
    await repository.add(ClassGroupEntity.create({ id: A, name: '6A', createdAt }).snapshot());

    expect(await repository.classGroupStatus(A)).toBe('active');
    expect(await repository.classGroupStatus(B)).toBeUndefined();
    expect(await repository.classGroupStatus('não-é-uuid')).toBeUndefined();
  });
});
