import { PlanningError } from './planning-error.ts';

/** Itens da conferência de um rascunho, na ordem em que a secretaria revisa (ADR 0022). */
export const REVIEW_ITEMS = [
  'structure',
  'teachers',
  'assignments',
  'availability',
  'rules',
] as const;
export type ReviewItem = (typeof REVIEW_ITEMS)[number];

export const REVIEW_ITEM_TEXTS: Readonly<
  Record<ReviewItem, { readonly title: string; readonly description: string }>
> = {
  structure: {
    title: 'Disciplinas, turnos e turmas',
    description: 'Disciplinas oferecidas, horários de cada turno e as aulas que cada turma usa.',
  },
  teachers: {
    title: 'Professores e habilitações',
    description: 'Professores ativos, disciplinas que cada um pode lecionar e carga máxima.',
  },
  assignments: {
    title: 'Atribuições, cargas e recursos',
    description: 'Quem leciona cada disciplina em cada turma, aulas por semana, blocos e recursos.',
  },
  availability: {
    title: 'Disponibilidade e hora-atividade',
    description: 'Horários indisponíveis e quantidade de hora-atividade de cada professor.',
  },
  rules: {
    title: 'Regras da grade',
    description: 'Limite diário por disciplina, exceções e onde cumprir a hora-atividade.',
  },
};

/** Confere os itens vindos da tela ou do banco, sem repetições e na ordem da conferência. */
export function validReviewedItems(value: unknown): ReviewItem[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => !(REVIEW_ITEMS as readonly unknown[]).includes(item))
  )
    throw new PlanningError(
      'planning.review_invalid',
      'Informe os itens conferidos desta revisão.',
      'validation',
    );
  return REVIEW_ITEMS.filter((item) => value.includes(item));
}

/** Aviso dos relatórios de uma revisão com itens do checklist pendentes. */
export const REVIEW_PENDING_NOTICE = 'Conferência do checklist da revisão pendente.';

export function isRevisionReviewed(revision: {
  readonly reviewedItems: readonly ReviewItem[];
}): boolean {
  return REVIEW_ITEMS.every((item) => revision.reviewedItems.includes(item));
}
