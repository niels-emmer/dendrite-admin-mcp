import type { Config } from "./config.js";

export class DendriteApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`Dendrite admin API responded ${status}: ${JSON.stringify(body)}`);
  }
}

export class DendriteClient {
  constructor(private readonly config: Config) {}

  /**
   * Shared-secret registration's nonce step is intentionally unauthenticated
   * (the shared secret is proven via the HMAC in the follow-up POST), so
   * auth is opt-out rather than opt-in.
   */
  async request<T = unknown>(
    method: string,
    path: string,
    options: { body?: unknown; auth?: boolean } = {},
  ): Promise<T> {
    const { body, auth = true } = options;
    const headers: Record<string, string> = {};
    if (auth) {
      headers.Authorization = `Bearer ${this.config.adminToken}`;
    }
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    const parsed = text ? JSON.parse(text) : {};

    if (!res.ok) {
      throw new DendriteApiError(res.status, parsed);
    }
    return parsed as T;
  }
}
