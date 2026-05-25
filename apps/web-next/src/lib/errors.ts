// L1 runtime — error types for apiClient.
//
// AuthExpiredError signals "the session is gone": the first 401 from
// the API triggered a /auth/refresh attempt that itself failed (or
// the second 401 came back after a successful refresh, meaning the
// access token was instantly invalidated). Either way the runtime is
// out of options — useAuth's effect catches this, clears local state,
// and pushes the user to /auth/sign-in.
//
// Other API errors throw a plain ApiError so callers can read .status
// and decide. This is the only auth-specific surface useAuth needs.

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export class AuthExpiredError extends ApiError {
  constructor(message = 'auth expired') {
    super(401, message);
    this.name = 'AuthExpiredError';
  }
}
