import type { AppEnv } from "./env";

export async function searchManualUrl(
  env: AppEnv,
  fetchImpl: typeof fetch,
  query: string,
): Promise<string | null> {
  const res = await fetchImpl(
    `https://api.search.brave.com/res/v1/web/search?count=3&q=${encodeURIComponent(query)}`,
    { headers: { Accept: "application/json", "X-Subscription-Token": env.braveKey } },
  );
  if (!res.ok) return null;
  const data: any = await res.json();
  const results = data?.web?.results ?? [];
  const urls: string[] = results.map((r: any) => r.url).filter(Boolean);
  const htmlUrl = urls.find((u) => !u.toLowerCase().endsWith(".pdf"));
  return htmlUrl ?? urls[0] ?? null;
}

export async function fetchManualText(
  env: AppEnv,
  fetchImpl: typeof fetch,
  query: string,
): Promise<{ found: boolean; sourceUrl?: string; excerpt?: string }> {
  const url = await searchManualUrl(env, fetchImpl, `${query} user manual`);
  if (!url) return { found: false };
  try {
    const res = await fetchImpl(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15" },
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok) return { found: true, sourceUrl: url };
    const body = await res.text();
    if (contentType.includes("pdf") || body.slice(0, 5) === "%PDF-") {
      return { found: true, sourceUrl: url };
    }
    const text = body
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    return { found: true, sourceUrl: url, excerpt: text.slice(0, 3500) };
  } catch {
    return { found: true, sourceUrl: url, excerpt: undefined };
  }
}
