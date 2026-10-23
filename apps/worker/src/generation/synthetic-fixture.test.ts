import { describe, expect, it } from 'vitest';
import { validateTimetableProposal } from '@classorganizer/core';
import { makeSyntheticTimetable } from './synthetic-fixture.ts';

describe('cenário sintético com testemunha', () => {
  it('reproduz os parâmetros inventados e mantém uma solução válida fora da entrada do motor', () => {
    const volume = {
      classGroups: 3,
      teachers: 8,
      lessons: 22,
      assignments: 12,
      planningPeriods: 6,
      periodsPerDay: 2,
      shifts: 2,
    };
    const { snapshot, witness } = makeSyntheticTimetable(volume);
    expect(validateTimetableProposal(snapshot, witness)).toEqual([]);
    expect(snapshot.classGroups).toHaveLength(3);
    expect(snapshot.teachers).toHaveLength(8);
    expect(snapshot.assignments).toHaveLength(12);
    expect(witness.lessons).toHaveLength(22);
    expect(witness.planning).toHaveLength(6);
    expect(snapshot.fixedLessons).toEqual([]);
    expect(snapshot.fixedPlanning).toEqual([]);
  });
  it('recusa volume para o qual não pode construir uma testemunha', () => {
    expect(() =>
      makeSyntheticTimetable({
        classGroups: 3,
        teachers: 1,
        lessons: 22,
        assignments: 12,
        planningPeriods: 6,
        periodsPerDay: 2,
        shifts: 2,
      }),
    ).toThrow();
  });
});
