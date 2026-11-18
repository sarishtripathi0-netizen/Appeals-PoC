/** A plain-language refusal that the UI shows to the user. */
export class DomainError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = "DomainError";
  }
}
