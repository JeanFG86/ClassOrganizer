import { describe, expect, it } from 'vitest';
import { InvalidTeacherNameError, TEACHER_NAME_MAX_LENGTH, createTeacher } from './teacher.ts';

const createdAt = new Date('2026-02-01T12:00:00Z');

describe('createTeacher', () => {
  it('limpa espaços extras do nome', () => {
    const teacher = createTeacher({ id: 't1', name: '  Ana   Souza ', subjectIds: [], createdAt });

    expect(teacher.name).toBe('Ana Souza');
  });

  it('remove habilitações repetidas preservando a ordem', () => {
    const teacher = createTeacher({
      id: 't1',
      name: 'Ana',
      subjectIds: ['s2', 's1', 's2'],
      createdAt,
    });

    expect(teacher.subjectIds).toEqual(['s2', 's1']);
  });

  it('permite cadastrar sem habilitações', () => {
    expect(createTeacher({ id: 't1', name: 'Ana', subjectIds: [], createdAt }).subjectIds).toEqual(
      [],
    );
  });

  it.each(['', '   '])('rejeita nome vazio (%j)', (name) => {
    expect(() => createTeacher({ id: 't1', name, subjectIds: [], createdAt })).toThrow(
      InvalidTeacherNameError,
    );
  });

  it('aceita nome no limite e rejeita acima dele', () => {
    const atLimit = 'a'.repeat(TEACHER_NAME_MAX_LENGTH);

    expect(createTeacher({ id: 't1', name: atLimit, subjectIds: [], createdAt }).name).toBe(
      atLimit,
    );
    expect(() =>
      createTeacher({ id: 't1', name: `${atLimit}a`, subjectIds: [], createdAt }),
    ).toThrow(InvalidTeacherNameError);
  });
});
