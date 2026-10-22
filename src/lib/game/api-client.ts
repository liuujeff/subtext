import { getSessionToken, resetSession } from "@/lib/supabase/browser";

import type {
  ApiErrorBody,
  ApiErrorCode,
  BetterResponse,
  DistributionResponse,
  GuessResponse,
  LinkResponse,
  RandomResponse,
  RevealResponse,
  StartResponse,
  StatsResponse,
  TodayResponse,
} from "./types";

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode | "network",
    readonly status: number,
    readonly suggestion?: string,
  ) {
    super(code);
  }
}

// Signed-in players send their access token; guests are identified by the
// HttpOnly player cookie, which the browser sends on its own.
async function call<T>(path: string, body?: unknown, retried = false): Promise<T> {
  const token = await getSessionToken();
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("network", 0);
  }
  const data = (await res.json().catch(() => ({}))) as Partial<ApiErrorBody>;

  // A session the server rejects (expired, or its user is gone): drop it and
  // carry on as a guest.
  if (res.status === 401 && token && !retried) {
    await resetSession();
    return call<T>(path, body, true);
  }
  if (!res.ok) throw new ApiError(data.error ?? "server_error", res.status, data.suggestion);
  return data as T;
}

export const api = {
  today: () => call<TodayResponse>("/api/today"),
  start: (puzzleId: number) => call<StartResponse>("/api/start", { puzzleId }),
  guess: (puzzleId: number, word: string) => call<GuessResponse>("/api/guess", { puzzleId, word }),
  reveal: (puzzleId: number) => call<RevealResponse>(`/api/reveal?puzzleId=${puzzleId}`),
  better: (puzzleId: number) => call<BetterResponse>(`/api/better?puzzleId=${puzzleId}`),
  random: (exclude?: number) => call<RandomResponse>("/api/random", { exclude }),
  stats: () => call<StatsResponse>("/api/stats"),
  distribution: () => call<DistributionResponse>("/api/distribution"),
  link: () => call<LinkResponse>("/api/account/link", {}),
};
