export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  requestKey?: string,
): Promise<T> {
  const keyed =
    requestKey ??
    ((method === "POST" || method === "PUT") &&
    /^(rooms(?:$|\/join$|\/[^/]+\/(?:ready|start|advance|share|vote|leave|resume|rehost|notes)$)|solo\/attempts(?:$|\/)|daily\/start)/.test(
      path,
    )
      ? crypto.randomUUID()
      : undefined);
  const send = () =>
    fetch("/api/v1/" + path, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(keyed ? { "Idempotency-Key": keyed } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  let r: Response;
  try {
    r = await send();
  } catch (e) {
    if (!keyed) throw e;
    r = await send();
  }
  const value = await r.json();
  if (!r.ok)
    throw new ApiError(
      value.error?.message ?? "Something went wrong.",
      r.status,
      value.error?.code,
    );
  return value.data;
}
