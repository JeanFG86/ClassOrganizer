import {
  StaleVersionError,
  SubjectNameAlreadyInUseError,
  createSubject,
} from '@classorganizer/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDatabase } from '../testing/postgres-container.ts';
import type { TestDatabase } from '../testing/postgres-container.ts';
import { checkDatabase } from './database.ts';
import { PrismaSubjectRepository } from '../modules/school-structure/prisma-subject-repository.ts';

const createdAt = new Date('2026-02-01T12:00:00.000Z');
const MATH = '0b9d3a52-5c39-4a7e-9a34-1f0a51a8f0c1';
const HISTORY = 'a5f0c1b4-0d0e-4c43-8e3b-3d1f1f1f1f01';

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
    const subject = createSubject({ id: MATH, name: 'Matemática', createdAt });

    await repository.add(subject);

    expect(await repository.listAll()).toEqual([subject]);
    expect(await repository.findById(MATH)).toEqual(subject);
    expect(await repository.findByNormalizedName('matematica')).toEqual(subject);
    expect(await repository.findByNormalizedName('historia')).toBeNull();
    expect(await repository.findById('não-é-uuid')).toBeNull();
  });

  it('traduz violação de unicidade em erro de domínio', async () => {
    await repository.add(createSubject({ id: MATH, name: 'História', createdAt }));

    await expect(
      repository.add(createSubject({ id: HISTORY, name: 'HISTORIA', createdAt })),
    ).rejects.toThrow(SubjectNameAlreadyInUseError);
    expect(await repository.listAll()).toHaveLength(1);
  });

  it('atualiza nome e arquivamento incrementando a versão', async () => {
    const subject = createSubject({ id: MATH, name: 'Matematica', createdAt });
    await repository.add(subject);
    const archivedAt = new Date('2026-03-01T00:00:00.000Z');

    const saved = await repository.update({
      ...subject,
      name: 'Matemática',
      normalizedName: 'matematica',
      archivedAt,
    });

    expect(saved.version).toBe(2);
    expect(await repository.findById(MATH)).toEqual(saved);
  });

  it('rejeita gravação baseada em versão antiga', async () => {
    const subject = createSubject({ id: MATH, name: 'Matemática', createdAt });
    await repository.add(subject);
    await repository.update({ ...subject, name: 'Matemática I' });

    await expect(repository.update({ ...subject, name: 'Mat' })).rejects.toThrow(StaleVersionError);
    expect((await repository.findById(MATH))?.name).toBe('Matemática I');
  });

  it('em gravações simultâneas da mesma versão, só uma vence', async () => {
    const subject = createSubject({ id: MATH, name: 'Matemática', createdAt });
    await repository.add(subject);

    const results = await Promise.allSettled([
      repository.update({ ...subject, name: 'Versão A' }),
      repository.update({ ...subject, name: 'Versão B' }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(StaleVersionError);
    expect((await repository.findById(MATH))?.version).toBe(2);
  });

  it('renomear para nome já usado vira erro de domínio', async () => {
    await repository.add(createSubject({ id: MATH, name: 'Matemática', createdAt }));
    const history = createSubject({ id: HISTORY, name: 'História', createdAt });
    await repository.add(history);

    await expect(
      repository.update({ ...history, name: 'Matemática', normalizedName: 'matematica' }),
    ).rejects.toThrow(SubjectNameAlreadyInUseError);
  });

  it('informa a situação das disciplinas, tolerando ids inválidos', async () => {
    const math = createSubject({ id: MATH, name: 'Matemática', createdAt });
    await repository.add(math);
    await repository.add(createSubject({ id: HISTORY, name: 'História', createdAt }));
    await repository.update({ ...math, archivedAt: createdAt });

    const statuses = await repository.subjectStatuses([
      MATH,
      HISTORY,
      '99999999-9999-4999-8999-999999999999',
      'não-é-uuid',
    ]);

    expect(statuses).toEqual(
      new Map([
        [MATH, 'archived'],
        [HISTORY, 'active'],
      ]),
    );
  });

  it('o banco rejeita nome em branco mesmo fora do domínio', async () => {
    await expect(
      testDb.db.subject.create({
        data: { id: MATH, name: '   ', normalizedName: 'x', createdAt },
      }),
    ).rejects.toThrow(/subject_name_not_blank/);
  });
});
