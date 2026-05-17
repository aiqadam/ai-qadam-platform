import { Injectable, Logger } from '@nestjs/common';
import { env } from '../../config/env';

// Thin Directus REST wrapper. Authenticated with a static admin token —
// API proxies member writes as admin (members never get a Directus
// session). Tenant scoping is the caller's responsibility (pass
// `country` in filters). No retries: callers handle 4xx → mapped HTTP
// errors; 5xx surfaces as DirectusError so Nest's filter renders 502.

export class DirectusError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    public readonly body: string,
  ) {
    super(`Directus ${status} ${path}: ${body.slice(0, 200)}`);
    this.name = 'DirectusError';
  }
}

@Injectable()
export class DirectusClient {
  private readonly logger = new Logger(DirectusClient.name);
  private readonly base = env.DIRECTUS_URL.replace(/\/$/, '');
  private readonly token = env.DIRECTUS_TOKEN;

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  async delete(path: string): Promise<void> {
    await this.request<unknown>('DELETE', path);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.base}${path.startsWith('/') ? path : `/${path}`}`;
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
      },
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const res = await fetch(url, init);
    if (!res.ok) {
      const text = await res.text();
      this.logger.warn(`Directus ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
      throw new DirectusError(res.status, path, text);
    }
    if (res.status === 204) {
      return undefined as T;
    }
    return (await res.json()) as T;
  }
}
