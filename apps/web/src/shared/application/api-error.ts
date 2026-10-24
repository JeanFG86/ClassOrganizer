export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number | undefined;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
