<script setup lang="ts">
import type { CatalogImportKind, CatalogImportRowDto } from '@classorganizer/contracts';
import { importKinds, useCatalogImport } from '../use-catalog-import.ts';
const {
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
} = useCatalogImport();

const statusLabels: Record<CatalogImportRowDto['status'], string> = {
  create: 'Será cadastrada',
  existing: 'Já cadastrada',
  invalid: 'Com erro',
};

function onKind(event: Event) {
  chooseKind((event.target as HTMLSelectElement).value as CatalogImportKind);
}
async function onFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  // Limpa a escolha para que o mesmo arquivo, corrigido, possa ser escolhido de novo.
  input.value = '';
  await chooseFile(file);
}
</script>
<template>
  <section class="import-page" aria-labelledby="import-title">
    <h1 id="import-title">Importar cadastros (CSV)</h1>
    <p>
      Cadastre vários itens de uma vez a partir de uma planilha salva em CSV. A prévia mostra o
      resultado de cada linha e nada é gravado até você confirmar. Se alguma linha tiver erro,
      nenhuma linha do arquivo é importada.
    </p>
    <p class="hint">
      Importe nesta ordem: disciplinas, turmas, professores e atribuições. Turnos e horários são
      cadastrados na tela de <RouterLink to="/turnos">Turnos</RouterLink>. A importação só
      acrescenta cadastros novos; o que já existe com o mesmo nome fica como está.
    </p>

    <div class="card stack-form">
      <label for="import-kind">O que importar</label>
      <select id="import-kind" :value="kind" :disabled="busy === 'import'" @change="onKind">
        <option v-for="item in importKinds" :key="item.kind" :value="item.kind">
          {{ item.label }}
        </option>
      </select>
      <p class="hint">{{ option?.columns }}</p>
      <p>
        <button class="secondary-button" :disabled="downloading" @click="downloadTemplate">
          {{
            downloading
              ? 'Baixando modelo…'
              : `Baixar modelo de ${option?.label.toLocaleLowerCase('pt-BR')}`
          }}
        </button>
      </p>
      <template v-if="canWrite">
        <label for="import-file">Arquivo CSV</label>
        <input
          id="import-file"
          type="file"
          accept=".csv,text/csv"
          :disabled="busy === 'import'"
          aria-describedby="import-file-hint"
          @change="onFile"
        />
        <p id="import-file-hint" class="hint">
          No Excel, use Salvar como e escolha CSV. Separe várias disciplinas ou recursos na mesma
          célula com |. Até 1.000 linhas por arquivo.
        </p>
        <p v-if="fileName" class="item-detail">Arquivo escolhido: {{ fileName }}</p>
      </template>
      <p v-else class="hint">Seu perfil permite apenas baixar os modelos.</p>
    </div>

    <p v-if="busy === 'reading' || busy === 'preview'" role="status">Conferindo o arquivo…</p>
    <p v-if="busy === 'import'" role="status">Importando…</p>
    <div v-if="error" role="alert" class="error">
      <p>{{ error }}</p>
      <button v-if="content !== null" :disabled="busy !== ''" @click="runPreview">
        {{ outdated ? 'Gerar a prévia novamente' : 'Tentar novamente' }}
      </button>
    </div>
    <p v-if="status" role="status" class="success">{{ status }}</p>

    <section v-if="preview" class="card" aria-labelledby="preview-title">
      <h2 id="preview-title">Prévia de {{ fileName }}</h2>
      <div v-if="preview.fileErrors.length" role="alert" class="error">
        <p>O arquivo não pôde ser conferido:</p>
        <ul>
          <li v-for="(problem, index) in preview.fileErrors" :key="index">{{ problem }}</li>
        </ul>
      </div>
      <template v-else>
        <p>
          {{ preview.summary.total }} {{ preview.summary.total === 1 ? 'linha' : 'linhas' }}:
          {{ preview.summary.create }} para cadastrar, {{ preview.summary.existing }} já
          {{ preview.summary.existing === 1 ? 'cadastrada' : 'cadastradas' }} e
          {{ preview.summary.invalid }} com erro.
        </p>
        <label class="check">
          <input v-model="onlyProblems" type="checkbox" />
          Mostrar só linhas com erro ou aviso
        </label>
        <div class="group table-scroll">
          <table class="table">
            <caption class="visually-hidden">
              Resultado de cada linha do arquivo
            </caption>
            <thead>
              <tr>
                <th scope="col" class="num">Linha</th>
                <th v-for="column in preview.columns" :key="column" scope="col">{{ column }}</th>
                <th scope="col">Situação</th>
                <th scope="col">Observações</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in visibleRows" :key="row.line" :class="'row-' + row.status">
                <th scope="row" class="num">{{ row.line }}</th>
                <td v-for="(cell, index) in row.cells" :key="index">{{ cell }}</td>
                <td>{{ statusLabels[row.status] }}</td>
                <td>
                  <ul v-if="row.messages.length" class="messages">
                    <li
                      v-for="(message, index) in row.messages"
                      :key="index"
                      :class="message.severity === 'error' ? 'error' : 'muted'"
                    >
                      {{ message.severity === 'error' ? 'Erro: ' : 'Aviso: ' }}{{ message.text }}
                    </li>
                  </ul>
                </td>
              </tr>
              <tr v-if="!visibleRows.length">
                <td :colspan="preview.columns.length + 3">Nenhuma linha com erro ou aviso.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="preview.summary.invalid" class="error">
          Corrija as linhas com erro na planilha e escolha o arquivo de novo. Nada será gravado
          enquanto houver erros.
        </p>
        <p v-else-if="!preview.summary.create">
          Todas as linhas já estão cadastradas; não há nada novo para importar.
        </p>
        <div class="actions">
          <button v-if="ready" :disabled="busy !== ''" @click="confirm">
            Importar {{ preview.summary.create }}
            {{ preview.summary.create === 1 ? 'linha' : 'linhas' }}
          </button>
          <button class="secondary-button" :disabled="busy !== ''" @click="chooseKind(kind)">
            Cancelar
          </button>
        </div>
      </template>
    </section>
  </section>
</template>
<style scoped>
.import-page {
  min-width: 0;
}
.import-page select,
.import-page input[type='file'] {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}
.import-page p,
.import-page li {
  overflow-wrap: anywhere;
}
.secondary-button {
  color: var(--accent);
  background: transparent;
  border: 1px solid var(--accent);
}
.table-scroll {
  padding: 0;
  margin: 0.75rem 0;
}
.table td,
.table th {
  vertical-align: top;
}
.messages {
  margin: 0;
  padding-left: 1rem;
  min-width: 14rem;
}
.row-invalid th {
  color: var(--error);
}
</style>
