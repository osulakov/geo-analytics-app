import { makeAutoObservable, runInAction } from 'mobx';

const TOKEN_KEY = 'ga_auth_token';
const EMAIL_KEY = 'ga_auth_email';

/**
 * Authentication state. Talks to the Node backend (proxied at /auth) for
 * signup/login/session-restore and persists the JWT in localStorage. All geo
 * data continues to load directly from the DB via /api — this store is only
 * for identity.
 */
export class AuthStore {
  token: string | null = null;
  email: string | null = null;
  error: string | null = null;
  loading = false;

  constructor() {
    makeAutoObservable(this);
    this.restore();
  }

  get isAuthenticated(): boolean {
    return this.token !== null;
  }

  /** Re-hydrate from localStorage, then validate the token against the backend. */
  private restore(): void {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    this.token = token;
    this.email = localStorage.getItem(EMAIL_KEY);
    void this.verify();
  }

  private persist(): void {
    if (this.token) {
      localStorage.setItem(TOKEN_KEY, this.token);
      localStorage.setItem(EMAIL_KEY, this.email ?? '');
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EMAIL_KEY);
    }
  }

  private async authenticate(path: string, email: string, password: string): Promise<boolean> {
    this.loading = true;
    this.error = null;
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { token?: string; email?: string; error?: string };
      if (!res.ok || !data.token) {
        runInAction(() => {
          this.error = data.error ?? 'Request failed';
        });
        return false;
      }
      runInAction(() => {
        this.token = data.token!;
        this.email = data.email ?? email;
        this.persist();
      });
      return true;
    } catch {
      runInAction(() => {
        this.error = 'Could not reach the server';
      });
      return false;
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  login(email: string, password: string): Promise<boolean> {
    return this.authenticate('/auth/login', email, password);
  }

  signup(email: string, password: string): Promise<boolean> {
    return this.authenticate('/auth/signup', email, password);
  }

  /** Validate the stored token; clears the session if it's invalid/expired. */
  private async verify(): Promise<void> {
    try {
      const res = await fetch('/auth/me', {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (!res.ok) throw new Error('invalid');
      const data = (await res.json()) as { email: string };
      runInAction(() => {
        this.email = data.email;
        this.persist();
      });
    } catch {
      this.logout();
    }
  }

  logout(): void {
    runInAction(() => {
      this.token = null;
      this.email = null;
      this.error = null;
      this.persist();
    });
  }
}
