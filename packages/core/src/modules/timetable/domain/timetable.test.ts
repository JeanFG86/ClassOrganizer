import { describe, expect, it } from 'vitest';
import {
  makeTimetableFixture,
  knownTimetableProposal,
} from '../../../testing/timetable-fixture.ts';
import type { TimetableSnapshot } from './model.ts';
import { validateTimetableModel } from './validate-model.ts';
import { measureTeacherIdleMinutes, validateTimetableProposal } from './validate-proposal.ts';

const codes = (snapshot: TimetableSnapshot, proposal = knownTimetableProposal()) =>
  validateTimetableProposal(snapshot, proposal).map((e) => e.code);

describe('modelo do motor', () => {
  it('distingue tamanho fora do suporte de inviabilidade escolar', () => {
    const snapshot = makeTimetableFixture();
    snapshot.periods = Array.from({ length: 600 }, (_, i) => ({
      id: 'large-' + i,
      shiftId: 'shift-a',
      startMinute: 480,
      endMinute: 530,
    }));
    expect(validateTimetableModel(snapshot)[0]?.code).toBe('model.limit');
  });

  it('aceita o snapshot autocontido de teste', () => {
    expect(validateTimetableModel(makeTimetableFixture())).toEqual([]);
  });
  it.each([
    (s: ReturnType<typeof makeTimetableFixture>) => {
      s.teachers[0]?.planningPeriodIds.splice(0);
    },
    (s: ReturnType<typeof makeTimetableFixture>) => {
      s.assignments[0]?.participants.push({ teacherId: 't1', subjectId: 's1' });
    },
    (s: ReturnType<typeof makeTimetableFixture>) => {
      s.assignments[0]?.participants.splice(0);
    },
    (s: ReturnType<typeof makeTimetableFixture>) => {
      s.assignments[0]?.participants.push({ teacherId: 'missing', subjectId: 's1' });
    },
    (s: ReturnType<typeof makeTimetableFixture>) => {
      s.teachers[1]?.subjectIds.splice(0);
    },
    (s: ReturnType<typeof makeTimetableFixture>) => {
      s.subjectRules.splice(0);
    },
    (s: ReturnType<typeof makeTimetableFixture>) => {
      s.classGroups[0]?.periodIds.push('p4');
    },
    (s: ReturnType<typeof makeTimetableFixture>) => {
      const p = s.periods[0];
      if (p) p.endMinute++;
    },
    (s: ReturnType<typeof makeTimetableFixture>) => {
      s.assignments[0]?.resourceIds.push('missing');
    },
    (s: ReturnType<typeof makeTimetableFixture>) => {
      s.periods.push({ id: 'p1', shiftId: 'shift-a', startMinute: 700, endMinute: 750 });
    },
    (s: ReturnType<typeof makeTimetableFixture>) => {
      s.weekdays.splice(0);
    },
    (s: ReturnType<typeof makeTimetableFixture>) => {
      s.subjectRules.push({
        classGroupId: 'c1',
        subjectId: 's1',
        maxPerDay: 2,
        consecutive: false,
      });
    },
  ])('rejeita modelagem inconsistente (%#)', (change) => {
    const snapshot = makeTimetableFixture();
    change(snapshot);
    expect(validateTimetableModel(snapshot).length).toBeGreaterThan(0);
  });
});

describe('validador independente da grade', () => {
  it('aceita solução conhecida com co-docência, dois turnos e hora-atividade', () => {
    expect(codes(makeTimetableFixture())).toEqual([]);
    expect(measureTeacherIdleMinutes(makeTimetableFixture(), knownTimetableProposal())).toBe(45);
  });
  it('exige toda a carga; só o modo parcial permite omissões', () => {
    const snapshot = makeTimetableFixture();
    const proposal = { lessons: [], planning: [] };
    expect(codes(snapshot, proposal)).toContain('load.lessons');
    expect(codes(snapshot, proposal)).toContain('load.planning');
    expect(validateTimetableProposal(snapshot, proposal, { complete: false })).toEqual([]);
  });
  it('detecta sobreposição entre turnos com ids distintos e no segundo professor', () => {
    const snapshot = makeTimetableFixture();
    const proposal = knownTimetableProposal();
    const overlapping = {
      ...proposal,
      lessons: proposal.lessons.map((p) =>
        p.assignmentId === 'a2' ? { ...p, weekday: 1 as const } : p,
      ),
    };
    expect(codes(snapshot, overlapping)).toContain('conflict.teacher');
    snapshot.teachers[1]?.unavailable.push({ weekday: 1, periodId: 'p4' });
    expect(codes(snapshot)).toContain('teacher.unavailable');
  });
  it('aceita atividades que apenas se tocam, sem choque de horários', () => {
    expect(codes(makeTimetableFixture())).not.toContain('conflict.teacher');
  });
  it('detecta hora-atividade sobreposta e fora dos períodos autorizados', () => {
    const snapshot = makeTimetableFixture();
    const proposal = knownTimetableProposal();
    expect(
      codes(snapshot, { ...proposal, planning: [{ teacherId: 't1', weekday: 1, periodId: 'p4' }] }),
    ).toEqual(expect.arrayContaining(['planning.period', 'conflict.teacher']));
  });
  it('detecta recurso exclusivo ocupado e dois blocos na mesma turma', () => {
    const snapshot = makeTimetableFixture();
    const proposal = knownTimetableProposal();
    snapshot.assignments[1]?.resourceIds.push('r1');
    const overlapping = {
      ...proposal,
      lessons: proposal.lessons.map((p) =>
        p.assignmentId === 'a2' ? { ...p, weekday: 1 as const } : p,
      ),
    };
    expect(codes(snapshot, overlapping)).toContain('conflict.resource');
    const assignment = snapshot.assignments[1];
    if (assignment) assignment.classGroupId = 'c1';
    snapshot.subjectRules.push({
      classGroupId: 'c1',
      subjectId: 's2',
      maxPerDay: 1,
      consecutive: false,
    });
    expect(
      codes(snapshot, {
        ...overlapping,
        lessons: overlapping.lessons.map((p) =>
          p.assignmentId === 'a2' ? { ...p, periodId: 'p1' } : p,
        ),
      }),
    ).toContain('conflict.class');
  });
  it('não aceita geminadas atravessando intervalo', () => {
    const proposal = knownTimetableProposal();
    expect(
      codes(makeTimetableFixture(), {
        ...proposal,
        lessons: proposal.lessons.map((p) =>
          p.assignmentId === 'a1' && p.periodId === 'p1' ? { ...p, periodId: 'p3' } : p,
        ),
      }),
    ).toContain('subject.consecutive');
  });
  it('soma o limite diário da disciplina entre blocos, sem multiplicar co-docência', () => {
    const snapshot = makeTimetableFixture();
    const original = snapshot.assignments[0];
    if (!original) throw new Error('Fixture ausente.');
    snapshot.assignments.push({ ...original, id: 'a3', weeklyLessons: 1 });
    const proposal = knownTimetableProposal();
    expect(
      codes(snapshot, {
        ...proposal,
        lessons: [...proposal.lessons, { assignmentId: 'a3', weekday: 1, periodId: 'p3' }],
      }),
    ).toContain('subject.daily_limit');
    expect(codes(makeTimetableFixture())).not.toContain('subject.daily_limit');
  });
  it('detecta duplicatas, referências desconhecidas e período de outra turma', () => {
    const proposal = knownTimetableProposal();
    const first = proposal.lessons[0];
    if (!first) throw new Error('Fixture ausente.');
    expect(
      codes(makeTimetableFixture(), {
        ...proposal,
        lessons: [
          ...proposal.lessons,
          first,
          { assignmentId: 'unknown', weekday: 1, periodId: 'p1' },
        ],
      }),
    ).toEqual(expect.arrayContaining(['placement.duplicate', 'placement.unknown', 'load.lessons']));
    expect(
      codes(makeTimetableFixture(), {
        ...proposal,
        lessons: proposal.lessons.map((p) => ({ ...p, periodId: 'p4' })),
      }),
    ).toContain('placement.class_period');
  });
  it('preserva fixações de aulas e hora-atividade', () => {
    const snapshot = makeTimetableFixture();
    snapshot.fixedLessons.push({ assignmentId: 'a1', weekday: 2, periodId: 'p1' });
    snapshot.fixedPlanning.push({ teacherId: 't1', weekday: 1, periodId: 'p3' });
    expect(codes(snapshot)).toEqual(expect.arrayContaining(['fixed.lesson', 'fixed.planning']));
  });
});
