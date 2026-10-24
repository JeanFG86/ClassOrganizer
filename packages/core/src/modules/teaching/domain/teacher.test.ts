import { describe, expect, it } from 'vitest';
import { InvalidTeacherNameError, TEACHER_NAME_MAX_LENGTH, TeacherEntity } from './teacher.ts';

const createdAt = new Date('2026-02-01T12:00:00Z');

describe('createTeacher', () => {
  it('limpa espaços extras do nome', () => {
    const teacher = TeacherEntity.create({
      id: 't1',
      name: '  Ana   Souza ',
      subjectIds: [],
      createdAt,
    }).snapshot();

    expect(teacher.name).toBe('Ana Souza');
  });

  it('remove habilitações repetidas preservando a ordem', () => {
    const teacher = TeacherEntity.create({
      id: 't1',
      name: 'Ana',
      subjectIds: ['s2', 's1', 's2'],
      createdAt,
    }).snapshot();

    expect(teacher.subjectIds).toEqual(['s2', 's1']);
  });

  it('permite cadastrar sem habilitações', () => {
    expect(
      TeacherEntity.create({ id: 't1', name: 'Ana', subjectIds: [], createdAt }).snapshot()
        .subjectIds,
    ).toEqual([]);
  });

  it.each(['', '   '])('rejeita nome vazio (%j)', (name) => {
    expect(() =>
      TeacherEntity.create({ id: 't1', name, subjectIds: [], createdAt }).snapshot(),
    ).toThrow(InvalidTeacherNameError);
  });

  it('aceita nome no limite e rejeita acima dele', () => {
    const atLimit = 'a'.repeat(TEACHER_NAME_MAX_LENGTH);

    expect(
      TeacherEntity.create({ id: 't1', name: atLimit, subjectIds: [], createdAt }).snapshot().name,
    ).toBe(atLimit);
    expect(() =>
      TeacherEntity.create({ id: 't1', name: `${atLimit}a`, subjectIds: [], createdAt }).snapshot(),
    ).toThrow(InvalidTeacherNameError);
  });
});
