export const QUICK_TUNNEL_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

export function parseCloudflaredQuickUrl(output: string): string | null {
  const m = output.match(QUICK_TUNNEL_URL_RE);
  return m ? m[0].replace(/\/$/, "") : null;
}

export function parseListeningUrl(output: string): string | null {
  const m = output.match(/listening on (https?:\/\/\S+)/i);
  return m ? m[1].replace(/\/$/, "") : null;
}
