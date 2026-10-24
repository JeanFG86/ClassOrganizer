export interface CatalogItem {
  id: string;
  name: string;
  archivedAt: string | null;
  version: number;
}
export interface CatalogApi<T extends CatalogItem> {
  /** Inclui os arquivados (`archivedAt` preenchido). */
  list(): Promise<T[]>;
  register(name: string): Promise<T>;
  update(id: string, input: { name: string; version: number }): Promise<T>;
  archive(id: string, version: number): Promise<T>;
  restore(id: string, version: number): Promise<T>;
}
