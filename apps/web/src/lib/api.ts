// Response contract shared by API handlers and the client.
export type FieldErrors = Record<string, string>;

export type ApiResponse<T = undefined> = {
  message?: string;
  fieldErrors?: FieldErrors;
  data?: T;
};

/** The JSON shape of a server type: dates arrive as ISO strings. */
export type Jsonify<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Jsonify<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonify<T[K]> }
      : T;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiResponse<unknown>,
  ) {
    super(body.message ?? `Request failed with status ${status}`);
  }

  get fieldErrors(): FieldErrors {
    return this.body.fieldErrors ?? {};
  }
}

/**
 * Calls an API route and returns the parsed body, throwing ApiError on non-2xx.
 * During SSR the request is dispatched in-process instead of over the network.
 */
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const response = import.meta.env.SSR
    ? await (await import('~/server/internal-fetch')).internalFetch(path, init)
    : await fetch(path, init);

  const body = (await response.json().catch(() => ({}))) as ApiResponse<T>;
  if (!response.ok) throw new ApiError(response.status, body);
  return body;
}

export async function apiGet<T>(path: string): Promise<T> {
  return (await apiRequest<T>(path)).data as T;
}

export function apiSend<T>(path: string, method: string, payload: unknown) {
  const isForm = payload instanceof FormData;
  return apiRequest<T>(path, {
    method,
    headers: isForm ? undefined : { 'content-type': 'application/json' },
    body: isForm ? payload : JSON.stringify(payload),
  });
}
