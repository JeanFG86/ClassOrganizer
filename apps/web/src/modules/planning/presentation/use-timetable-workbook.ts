import { onScopeDispose, ref, watch } from 'vue';
import type { TimetableReportDto } from '@classorganizer/contracts';
import { injectRequired } from '../../../shared/presentation/inject-required.ts';
import { errorMessage, isOutdatedError } from '../../../shared/presentation/feedback.ts';
import { timetableWorkbooksApiKey } from './timetable-reports-key.ts';

export function useTimetableWorkbook(
  source: () => TimetableReportDto | null,
  blocked: () => boolean,
) {
  const api = injectRequired(timetableWorkbooksApiKey);
  const downloading = ref(false);
  const exportError = ref('');
  const exportStatus = ref('');
  let request = 0;
  watch(
    () => {
      const report = source();
      return report ? `${report.planning.id}:${report.revision.id}:${report.planning.version}` : '';
    },
    () => {
      request++;
      downloading.value = false;
      exportError.value = '';
      exportStatus.value = '';
    },
  );
  onScopeDispose(() => {
    request++;
  });
  async function downloadWorkbook() {
    const report = source();
    if (!report || blocked() || downloading.value) return;
    const current = ++request;
    downloading.value = true;
    exportError.value = '';
    exportStatus.value = '';
    try {
      const blob = await api.download(
        report.planning.id,
        report.revision.id,
        report.planning.version,
      );
      if (current !== request || blocked() || source()?.revision.id !== report.revision.id) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      try {
        link.href = url;
        link.download = `entreaulas-${report.planning.year}-${report.planning.id.slice(0, 8)}-revisao-${report.revision.number}-v${report.planning.version}.xlsx`;
        document.body.append(link);
        link.click();
        exportStatus.value = 'Planilha XLSX baixada com os horários e as cargas de toda a revisão.';
      } finally {
        link.remove();
        URL.revokeObjectURL(url);
      }
    } catch (cause) {
      if (current === request)
        exportError.value =
          errorMessage(cause) +
          (isOutdatedError(cause) ? ' Use Atualizar prévia antes de tentar novamente.' : '');
    } finally {
      if (current === request) downloading.value = false;
    }
  }
  return { downloading, exportError, exportStatus, downloadWorkbook };
}
