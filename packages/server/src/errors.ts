// Typed, safe-to-surface errors. Messages never include stack traces or DB
// internals (Req 22.6). The HTTP layer maps these to status codes.

export class ValidationError extends Error {
  readonly code = "VALIDATION";
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends Error {
  readonly code = "NOT_FOUND";
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class MissingProfileFieldError extends Error {
  readonly code = "MISSING_PROFILE_FIELD";
  readonly field: string;
  constructor(field: string) {
    super(`Missing required profile field: ${field}`);
    this.name = "MissingProfileFieldError";
    this.field = field;
  }
}
