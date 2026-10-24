/** Adapta um caso de uso à fronteira de operações autorizadas, preservando o contexto. */
export function bindUseCase<Args extends unknown[], Result>(useCase: {
  execute(...args: Args): Result;
}): (...args: Args) => Result {
  return useCase.execute.bind(useCase);
}
