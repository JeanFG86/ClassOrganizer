import { computed, onScopeDispose, ref } from 'vue';
import type {
  CatalogImportKind,
  CatalogImportPreviewDto,
  CatalogImportResultDto,
} from '@classorganizer/contracts';
import { useAccess } from '../../access/index.ts';
import { injectRequired } from '../../../shared/presentation/inject-required.ts';
import { errorMessage, isOutdatedError } from '../../../shared/presentation/feedback.ts';
import { catalogImportApiKey } from './catalog-import-key.ts';

/** Arquivos maiores que isso nem são enviados; o servidor aceita até cerca de 400 mil caracteres. */
const MAX_FILE_BYTES = 1024 * 1024;

export const importKinds: readonly {
  kind: CatalogImportKind;
  label: string;
  fileName: string;
  columns: string;
}[] = [
  {
    kind: 'subjects',
    label: 'Disciplinas',
    fileName: 'modelo-disciplinas.csv',
    columns: 'Coluna Disciplina, uma por linha.',
  },
  {
    kind: 'classGroups',
    label: 'Turmas',
    fileName: 'modelo-turmas.csv',
    columns:
      'Turma; opcionalmente Turno (já cadastrado) e Aulas do turno, a quantidade das primeiras ' +
      'aulas que a turma usa (vazio usa todas).',
  },
  {
    kind: 'teachers',
    label: 'Professores',
    fileName: 'modelo-professores.csv',
    columns:
      'Professor; opcionalmente Disciplinas em que é habilitado (separadas por |), Carga máxima ' +
      'e Hora-atividade, em aulas por semana.',
  },
  {
    kind: 'assignments',
    label: 'Atribuições',
    fileName: 'modelo-atribuicoes.csv',
    columns:
      'Turma, Disciplina, Professor e Aulas por semana. Linhas da mesma turma com o mesmo código ' +
      'em Bloco formam aulas simultâneas; Recursos são separados por |.',
  },
];

/**
 * Planilhas salvas pelo Excel em português podem vir em Windows-1252 em vez de UTF-8.
 * O BOM do UTF-8 é descartado pelo decodificador.
 */
export function decodeCsv(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function useCatalogImport() {
  const api = injectRequired(catalogImportApiKey);
  const { canWrite } = useAccess();
  const kind = ref<CatalogImportKind>('subjects');
  const fileName = ref('');
  const content = ref<string | null>(null);
  const preview = ref<CatalogImportPreviewDto | null>(null);
  const busy = ref<'' | 'reading' | 'preview' | 'import'>('');
  const downloading = ref(false);
  const error = ref('');
  const outdated = ref(false);
  const status = ref('');
  const onlyProblems = ref(false);
  let request = 0;
  let templateRequest = 0;
  onScopeDispose(() => {
    request++;
    templateRequest++;
  });

  const option = computed(() => importKinds.find((item) => item.kind === kind.value));
  const ready = computed(
    () =>
      preview.value !== null &&
      preview.value.fileErrors.length === 0 &&
      preview.value.summary.invalid === 0 &&
      preview.value.summary.create > 0,
  );
  const visibleRows = computed(() =>
    (preview.value?.rows ?? []).filter((row) => !onlyProblems.value || row.messages.length > 0),
  );

  function clear() {
    request++;
    busy.value = '';
    preview.value = null;
    error.value = '';
    outdated.value = false;
    onlyProblems.value = false;
  }

  function chooseKind(next: CatalogImportKind) {
    clear();
    kind.value = next;
    fileName.value = '';
    content.value = null;
    status.value = '';
  }

  async function runPreview() {
    if (content.value === null || !canWrite.value) return;
    const current = ++request;
    busy.value = 'preview';
    error.value = '';
    outdated.value = false;
    status.value = '';
    try {
      const result = await api.preview({ kind: kind.value, content: content.value });
      if (current !== request) return;
      preview.value = result;
      status.value = result.fileErrors.length
        ? ''
        : `Prévia pronta: ${plural(result.summary.total, 'linha lida', 'linhas lidas')}.`;
    } catch (cause) {
      if (current === request) error.value = errorMessage(cause);
    } finally {
      if (current === request) busy.value = '';
    }
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    clear();
    status.value = '';
    fileName.value = file.name;
    content.value = null;
    if (file.size > MAX_FILE_BYTES) {
      error.value = 'O arquivo é grande demais. Divida-o em arquivos de até 1.000 linhas.';
      return;
    }
    const current = ++request;
    busy.value = 'reading';
    try {
      const text = decodeCsv(await file.arrayBuffer());
      if (current !== request) return;
      content.value = text;
    } catch {
      if (current === request) error.value = 'Não foi possível ler o arquivo escolhido.';
      return;
    } finally {
      if (current === request) busy.value = '';
    }
    await runPreview();
  }

  async function confirm() {
    const shown = preview.value;
    if (!shown || content.value === null || !ready.value || busy.value) return;
    const current = ++request;
    busy.value = 'import';
    error.value = '';
    outdated.value = false;
    try {
      const result: CatalogImportResultDto = await api.import({
        kind: shown.kind,
        content: content.value,
        digest: shown.digest,
      });
      if (current !== request) return;
      const label = option.value?.label.toLocaleLowerCase('pt-BR') ?? 'cadastros';
      chooseKind(kind.value);
      status.value =
        `Importação de ${label} concluída: ${plural(result.created, 'linha cadastrada', 'linhas cadastradas')}` +
        (result.existing
          ? ` e ${plural(result.existing, 'já existente mantida', 'já existentes mantidas')}.`
          : '.');
    } catch (cause) {
      if (current !== request) return;
      outdated.value = isOutdatedError(cause);
      error.value = errorMessage(cause);
    } finally {
      if (current === request) busy.value = '';
    }
  }

  async function downloadTemplate() {
    const chosen = option.value;
    if (!chosen || downloading.value) return;
    const current = ++templateRequest;
    downloading.value = true;
    error.value = '';
    try {
      const blob = await api.template(chosen.kind);
      if (current !== templateRequest) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      try {
        link.href = url;
        link.download = chosen.fileName;
        document.body.append(link);
        link.click();
        status.value = `Modelo de ${chosen.label.toLocaleLowerCase('pt-BR')} baixado.`;
      } finally {
        link.remove();
        URL.revokeObjectURL(url);
      }
    } catch (cause) {
      if (current === templateRequest) error.value = errorMessage(cause);
    } finally {
      if (current === templateRequest) downloading.value = false;
    }
  }

  return {
    canWrite,
    kind,
    option,
    fileName,
    content,
    preview,
    visibleRows,
    onlyProblems,
    busy,
    downloading,
    error,
    outdated,
    status,
    ready,
    chooseKind,
    chooseFile,
    runPreview,
    confirm,
    downloadTemplate,
  };
}
