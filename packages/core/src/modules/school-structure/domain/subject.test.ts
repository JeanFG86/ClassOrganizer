import { describe, expect, it } from 'vitest';
import {
  InvalidSubjectNameError,
  SUBJECT_NAME_MAX_LENGTH,
  createSubject,
  normalizeSubjectName,
} from './subject.ts';

const createdAt = new Date('2026-02-01T12:00:00Z');

describe('createSubject', () => {
  it('limpa espaços extras do nome', () => {
    const subject = createSubject({ id: 's1', name: '  Língua   Portuguesa ', createdAt });

    expect(subject.name).toBe('Língua Portuguesa');
  });

  it('gera chave normalizada sem acentos nem maiúsculas', () => {
    const subject = createSubject({ id: 's1', name: 'Educação Física', createdAt });

    expect(subject.normalizedName).toBe('educacao fisica');
  });

  it.each(['', '   '])('rejeita nome vazio (%j)', (name) => {
    expect(() => createSubject({ id: 's1', name, createdAt })).toThrow(InvalidSubjectNameError);
  });

  it('aceita nome no limite de tamanho', () => {
    const name = 'a'.repeat(SUBJECT_NAME_MAX_LENGTH);

    expect(createSubject({ id: 's1', name, createdAt }).name).toBe(name);
  });

  it('rejeita nome acima do limite de tamanho', () => {
    const name = 'a'.repeat(SUBJECT_NAME_MAX_LENGTH + 1);

    expect(() => createSubject({ id: 's1', name, createdAt })).toThrow(InvalidSubjectNameError);
  });
});

describe('normalizeSubjectName', () => {
  it('considera equivalentes nomes que só diferem em acento, caixa e espaços', () => {
    expect(normalizeSubjectName(' MATEMÁTICA ')).toBe(normalizeSubjectName('matematica'));
  });
});
