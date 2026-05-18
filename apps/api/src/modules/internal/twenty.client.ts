import { Injectable, Logger } from '@nestjs/common';
import { env } from '../../config/env';

// Thin Twenty REST wrapper. Mirrors the shape of DirectusClient — static
// admin API token, no retries, 4xx/5xx → TwentyError.
//
// Used by /v1/internal/crm/* endpoints to upsert Person rows and append
// Activity timeline entries when Directus flows fire.

export class TwentyError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    public readonly body: string,
  ) {
    super(`Twenty ${status} ${path}: ${body.slice(0, 200)}`);
    this.name = 'TwentyError';
  }
}

@Injectable()
export class TwentyClient {
  private readonly logger = new Logger(TwentyClient.name);
  private readonly base = env.TWENTY_URL.replace(/\/$/, '');
  private readonly token = env.TWENTY_API_TOKEN;

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
      this.logger.warn(`Twenty ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
      throw new TwentyError(res.status, path, text);
    }
    if (res.status === 204) {
      return undefined as T;
    }
    return (await res.json()) as T;
  }
}
