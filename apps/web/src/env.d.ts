interface ImportMetaEnv {
  /** Origem da API quando ela não está no mesmo domínio (ex.: front-end na Vercel). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
