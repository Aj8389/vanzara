import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TokenService {
  private readonly KEY = 'derivbot_token';

  save(token: string): void {
    try { localStorage.setItem(this.KEY, token); } catch (_) {}
  }

  load(): string {
    try { return localStorage.getItem(this.KEY) || ''; } catch (_) { return ''; }
  }

  remove(): void {
    try { localStorage.removeItem(this.KEY); } catch (_) {}
  }

  // Persist token on the server (survives page refresh / server restart via env var)
  syncToBackend(token: string): void {
    const base = environment.apiUrl || '';
    fetch(`${base}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    }).catch(() => {});
  }
}
