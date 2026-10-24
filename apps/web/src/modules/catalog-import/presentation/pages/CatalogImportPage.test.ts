import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogImportPreviewDto } from '@classorganizer/contracts';
import { ApiRequestError } from '../../../../shared/application/api-error.ts';
import { accessApiKey, createAccessApi } from '../../../../testing/access-fixture.ts';
import type { CatalogImportApi } from '../../application/catalog-import-api.ts';
import { catalogImportApiKey } from '../catalog-import-key.ts';
import { decodeCsv } from '../use-catalog-import.ts';
import CatalogImportPage from './CatalogImportPage.vue';

function preview(overrides: Partial<CatalogImportPreviewDto> = {}): CatalogImportPreviewDto {
  return {
    kind: 'teachers',
    digest: 'resumo-da-previa',
    columns: ['Professor', 'Disciplinas'],
    fileErrors: [],
    summary: { total: 2, create: 1, existing: 1, invalid: 0 },
    rows: [
      { line: 2, cells: ['Ana Exemplo', 'Arte'], status: 'create', messages: [] },
      {
        line: 3,
        cells: ['Otávio Modelo', ''],
        status: 'existing',
        messages: [{ severity: 'warning', text: 'O professor já está cadastrado.' }],
      },
    ],
    ...overrides,
  };
}

function fakeApi(overrides: Partial<CatalogImportApi> = {}): CatalogImportApi {
  return {
    template: vi.fn(async () => new Blob(['modelo'])),
    preview: vi.fn(async () => preview()),
    import: vi.fn(async () => ({ kind: 'teachers' as const, created: 1, existing: 1 })),
    ...overrides,
  };
}

let wrapper: VueWrapper;
afterEach(() => {
  wrapper?.unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render(api: CatalogImportApi, role: 'editor' | 'viewer' = 'editor') {
  const access = createAccessApi();
  access.session.value = {
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      username: role + '-teste',
      role,
      disabled: false,
      version: 1,
      createdAt: '2026-02-01T12:00:00Z',
    },
    expiresAt: '2026-02-02T12:00:00Z',
  };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/importacao', component: CatalogImportPage },
      { path: '/turnos', component: { template: '<div />' } },
    ],
  });
  await router.push('/importacao');
  await router.isReady();
  wrapper = mount(CatalogImportPage, {
    global: {
      plugins: [router],
      provide: { [catalogImportApiKey as symbol]: api, [accessApiKey as symbol]: access },
    },
  });
  await flushPromises();
}

async function choose(content: BlobPart, name = 'professores.csv') {
  const input = wrapper.get('#import-file');
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: [new File([content], name, { type: 'text/csv' })],
  });
  await input.trigger('change');
  await flushPromises();
}

async function button(label: string) {
  const found = wrapper.findAll('button').find((b) => b.text() === label);
  if (!found) throw new Error(`Botão ausente: ${label}`);
  await found.trigger('click');
  await flushPromises();
}

describe('importação CSV na interface', () => {
  it('decodifica UTF-8 com BOM e planilhas antigas em Windows-1252', () => {
    expect(decodeCsv(new TextEncoder().encode('\uFEFFDisciplina\nEducação').buffer)).toBe(
      'Disciplina\nEducação',
    );
    expect(decodeCsv(new Uint8Array([0x45, 0x64, 0x75, 0x63, 0x61, 0xe7, 0xe3, 0x6f]).buffer)).toBe(
      'Educação',
    );
  });

  it('mostra a prévia linha a linha e confirma com o resumo do resultado', async () => {
    const api = fakeApi();
    await render(api);
    await wrapper.get('#import-kind').setValue('teachers');
    await choose('Professor;Disciplinas\nAna Exemplo;Arte\nOtávio Modelo;');

    expect(api.preview).toHaveBeenCalledWith({
      kind: 'teachers',
      content: 'Professor;Disciplinas\nAna Exemplo;Arte\nOtávio Modelo;',
    });
    const rows = wrapper.findAll('tbody tr').map((row) => row.text());
    expect(rows[0]).toContain('Ana Exemplo');
    expect(rows[0]).toContain('Será cadastrada');
    expect(rows[1]).toContain('Já cadastrada');
    expect(rows[1]).toContain('Aviso: O professor já está cadastrado.');
    expect(wrapper.text()).toContain('2 linhas: 1 para cadastrar, 1 já cadastrada e 0 com erro.');

    await wrapper.get('input[type="checkbox"]').setValue(true);
    expect(wrapper.findAll('tbody tr')).toHaveLength(1);

    await button('Importar 1 linha');
    expect(api.import).toHaveBeenCalledWith({
      kind: 'teachers',
      content: 'Professor;Disciplinas\nAna Exemplo;Arte\nOtávio Modelo;',
      digest: 'resumo-da-previa',
    });
    expect(wrapper.find('table').exists()).toBe(false);
    expect(wrapper.get('[role="status"]').text()).toBe(
      'Importação de professores concluída: 1 linha cadastrada e 1 já existente mantida.',
    );
  });

  it('não oferece a confirmação enquanto houver erros no arquivo ou nas linhas', async () => {
    const api = fakeApi({
      preview: vi
        .fn()
        .mockResolvedValueOnce(
          preview({
            summary: { total: 1, create: 0, existing: 0, invalid: 1 },
            rows: [
              {
                line: 2,
                cells: ['Ana Exemplo', 'Química'],
                status: 'invalid',
                messages: [
                  { severity: 'error', text: 'A disciplina "Química" não está cadastrada.' },
                ],
              },
            ],
          }),
        )
        .mockResolvedValueOnce(
          preview({ columns: [], rows: [], fileErrors: ['Falta a coluna "Professor".'] }),
        ),
    });
    await render(api);
    await choose('Professor;Disciplinas\nAna Exemplo;Química');

    expect(wrapper.text()).toContain('Erro: A disciplina "Química" não está cadastrada.');
    expect(wrapper.text()).toContain('Nada será gravado enquanto houver erros.');
    expect(wrapper.findAll('button').some((b) => b.text().startsWith('Importar'))).toBe(false);

    await choose('Nome\nAna');
    expect(wrapper.get('section[aria-labelledby="preview-title"] [role="alert"]').text()).toContain(
      'Falta a coluna "Professor".',
    );
    expect(wrapper.find('table').exists()).toBe(false);
  });

  it('orienta a gerar a prévia de novo quando os cadastros mudaram', async () => {
    const api = fakeApi({
      import: vi.fn(async () => {
        throw new ApiRequestError('concurrency.stale', 'Os cadastros foram alterados.', 409);
      }),
    });
    await render(api);
    await choose('Professor\nAna Exemplo');
    await button('Importar 1 linha');

    expect(wrapper.get('.error[role="alert"]').text()).toContain('Os cadastros foram alterados.');
    await button('Gerar a prévia novamente');
    expect(api.preview).toHaveBeenCalledTimes(2);
  });

  it('descarta a prévia pendente quando o tipo de cadastro muda', async () => {
    let resolve: (value: CatalogImportPreviewDto) => void = () => {};
    const api = fakeApi({
      preview: vi.fn(
        () =>
          new Promise<CatalogImportPreviewDto>((done) => {
            resolve = done;
          }),
      ),
    });
    await render(api);
    await choose('Professor\nAna Exemplo');
    await wrapper.get('#import-kind').setValue('subjects');
    resolve(preview());
    await flushPromises();

    expect(wrapper.find('table').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Arquivo escolhido');
  });

  it('baixa o modelo do tipo escolhido e libera a URL temporária', async () => {
    const api = fakeApi();
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:modelo'), revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('modelo-atribuicoes.csv');
    });
    await render(api);
    await wrapper.get('#import-kind').setValue('assignments');
    await button('Baixar modelo de atribuições');

    expect(api.template).toHaveBeenCalledWith('assignments');
    expect(click).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:modelo');
  });

  it('o perfil de consulta só baixa os modelos', async () => {
    await render(fakeApi(), 'viewer');

    expect(wrapper.find('#import-file').exists()).toBe(false);
    expect(wrapper.text()).toContain('Seu perfil permite apenas baixar os modelos.');
  });
});
