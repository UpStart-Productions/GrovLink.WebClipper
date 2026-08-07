/** Lets api.ts signal "you're not really signed in" back to the UI. */
let onSessionExpired: (() => void) | null = null;

export function setAuthExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

export function notifyAuthExpired(): void {
  onSessionExpired?.();
}

export class AuthRequiredError extends Error {
  constructor(message = 'Your session expired. Please sign in again.') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}
