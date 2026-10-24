import type { Resource } from '../../domain/resource.ts';
export interface ResourceRepository {
  findById(id: string): Promise<Resource | null>;
  findByNormalizedName(normalizedName: string): Promise<Resource | null>;
  /** Deve lançar `ResourceNameAlreadyInUseError` em caso de nome duplicado concorrente. */
  add(resource: Resource): Promise<void>;
  /** Grava condicionado à versão; lança `StaleVersionError` se outra alteração chegou antes. */
  update(resource: Resource): Promise<Resource>;
  listAll(): Promise<Resource[]>;
}
