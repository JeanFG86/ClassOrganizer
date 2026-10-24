<script setup lang="ts">
import { timeFromMinutes, type TimetableReportDto } from '@classorganizer/contracts';
defineProps<{ report: TimetableReportDto }>();
const days = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
const date = (value: string) => new Date(value).toLocaleString('pt-BR');
</script>
<template>
  <div class="report-sheets">
    <section
      v-for="sheet in report.sheets"
      :key="sheet.targetId + '|' + sheet.shiftName"
      class="report-sheet"
      :aria-label="sheet.targetName + ' - ' + sheet.shiftName"
    >
      <div class="report-table-scroll">
        <table
          class="report-table"
          :aria-label="'Horários de ' + sheet.targetName + ' - ' + sheet.shiftName"
        >
          <thead>
            <tr>
              <th colspan="6" class="report-heading">
                <p class="report-brand">EntreAulas · Grade semanal</p>
                <h2>{{ report.planning.name }} · {{ report.planning.year }}</h2>
                <p class="report-target">
                  {{ report.perspective === 'class' ? 'Turma' : 'Professor' }}:
                  {{ sheet.targetName }} · {{ sheet.shiftName }}
                </p>
                <p>
                  Revisão {{ report.revision.number
                  }}{{ report.revision.name ? ' - ' + report.revision.name : '' }} ·
                  {{ report.revision.sealedAt ? 'Concluída' : 'RASCUNHO - não concluída'
                  }}{{ report.revision.historical ? ' · Histórica' : ''
                  }}{{ report.planning.archived ? ' · Planejamento arquivado' : '' }}
                </p>
                <p v-if="report.notices.length" class="report-warning">
                  Pendências na revisão: {{ report.notices.length }}. Consulte os detalhes na
                  prévia.
                </p>
              </th>
            </tr>
            <tr>
              <th scope="col">Aula / horário</th>
              <th v-for="day in days" :key="day" scope="col">{{ day }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!sheet.rows.length">
              <td colspan="6">Nenhum horário configurado para esta folha.</td>
            </tr>
            <tr v-for="row in sheet.rows" :key="row.periodId">
              <th scope="row">
                {{ row.number }}ª aula<br />{{ timeFromMinutes(row.startMinute) }} -
                {{ timeFromMinutes(row.endMinute) }}
              </th>
              <td v-for="cell in row.cells" :key="cell.weekday">
                <div v-for="(item, index) in cell.items" :key="index" class="report-item">
                  <strong>{{ item.title }}</strong>
                  <span v-for="(detail, detailIndex) in item.details" :key="detailIndex">{{
                    detail
                  }}</span>
                  <span v-if="item.pinned" class="report-pinned">Fixada</span>
                </div>
                <span v-if="cell.unavailable" class="report-unavailable">Indisponível</span>
                <span v-if="!cell.items.length && !cell.unavailable" class="report-empty"
                  >Sem alocação</span
                >
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="6">
                <p>
                  {{ report.planning.name }} · Revisão {{ report.revision.number }} ·
                  {{ sheet.targetName }} · {{ sheet.shiftName }}
                </p>
                <p>
                  Base capturada em {{ date(report.revision.capturedAt) }} · Catálogo
                  {{ report.revision.catalogVersion }} · Gerado em {{ date(report.generatedAt) }} ·
                  Planejamento v{{ report.planning.version }}
                </p>
                <p>
                  Fixada: aula preservada na geração. Sem alocação: nenhum bloco neste horário.
                  Indisponível: bloqueio do professor.
                </p>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  </div>
</template>
<style>
.report-sheet {
  margin: 1.5rem 0;
  background: #fff;
  color: #17212e;
  border: 1px solid #c7ced7;
}
.report-table-scroll {
  overflow-x: auto;
}
.report-table {
  width: 100%;
  min-width: 900px;
  table-layout: fixed;
  border-collapse: collapse;
  font:
    12px/1.4 Arial,
    sans-serif;
}
.report-table th,
.report-table td {
  border: 1px solid #c7ced7;
  padding: 8px;
  vertical-align: top;
  overflow-wrap: anywhere;
  white-space: normal;
}
.report-table th {
  background: #eef2f6;
  color: #17212e;
}
.report-table .report-heading {
  text-align: left;
  background: #fff;
}
.report-heading h2 {
  margin: 4px 0;
  font-size: 20px;
  line-height: 1.25;
}
.report-heading p,
.report-table tfoot p {
  margin: 3px 0;
}
.report-brand {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 10px;
}
.report-target {
  font-size: 15px;
}
.report-draft,
.report-warning {
  font-weight: bold;
}
.report-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.report-item + .report-item {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px dashed #999;
}
.report-pinned {
  font-weight: bold;
  font-size: 10px;
}
.report-empty,
.report-unavailable {
  color: #4c5561;
}
.report-unavailable {
  font-weight: bold;
}
.report-table tfoot {
  font-size: 10px;
}
@page {
  size: A4 landscape;
  margin: 12mm;
  @bottom-right {
    content: 'Página ' counter(page) ' de ' counter(pages);
    font:
      8pt Arial,
      sans-serif;
    color: #333;
  }
}
@media print {
  html,
  body {
    color: #000 !important;
    background: #fff !important;
  }
  .report-chrome,
  .skip-link,
  .report-controls,
  .report-main > [role] {
    display: none !important;
  }
  main.report-main {
    max-width: none;
    margin: 0;
    padding: 0;
    width: auto;
  }
  .report-sheet {
    margin: 0;
    border: 0;
    break-after: page;
  }
  .report-sheet:last-child {
    break-after: auto;
  }
  .report-table-scroll {
    overflow: visible;
  }
  .report-table {
    min-width: 0;
    font-size: 9pt;
    width: 100%;
  }
  .report-table th,
  .report-table td {
    padding: 2mm;
  }
  .report-table thead {
    display: table-header-group;
    break-inside: avoid;
  }
  .report-table tfoot {
    display: table-footer-group;
    break-inside: avoid;
  }
  .report-table tr {
    break-inside: avoid;
  }
  /* Cabeçalhos compactos continuam repetíveis mesmo com nomes no limite de tamanho. */
  .report-heading {
    font-size: 8pt;
    line-height: 1.15;
  }
  .report-heading p {
    margin: 1px 0;
  }
  .report-heading h2 {
    font-size: 12pt;
    line-height: 1.15;
    margin: 2px 0;
  }
  .report-target {
    font-size: 9pt;
  }
  .report-brand,
  .report-pinned,
  .report-table tfoot {
    font-size: 8pt;
  }
  .report-brand {
    font-size: 7pt;
  }
  .report-sheet,
  .report-table {
    print-color-adjust: exact;
  }
}
</style>
