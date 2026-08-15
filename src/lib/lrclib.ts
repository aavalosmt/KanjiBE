const LRCLIB = "https://lrclib.net/api";
const USER_AGENT = "KanjiBE/1.0 (https://github.com/aavalosmt/KanjiBE)";

export type LrcLine = {
  startTime: number;
  text: string;
};

export type LrcLibTrack = {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string | null;
  duration: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
};

async function lrclibGet(path: string): Promise<unknown> {
  const response = await fetch(`${LRCLIB}${path}`, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json"
    }
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`LRCLib error ${response.status}`);
  }
  return response.json();
}

function asTrack(value: unknown): LrcLibTrack | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = Number(row.id);
  const trackName = String(row.trackName ?? row.name ?? "");
  const artistName = String(row.artistName ?? "");
  if (!Number.isFinite(id) || !trackName || !artistName) return null;
  return {
    id,
    trackName,
    artistName,
    albumName: typeof row.albumName === "string" ? row.albumName : null,
    duration: typeof row.duration === "number" ? row.duration : null,
    instrumental: Boolean(row.instrumental),
    plainLyrics: typeof row.plainLyrics === "string" ? row.plainLyrics : null,
    syncedLyrics: typeof row.syncedLyrics === "string" ? row.syncedLyrics : null
  };
}

export function parseLrc(lrc: string): LrcLine[] {
  const lines: LrcLine[] = [];
  const stamp = /\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g;

  for (const raw of lrc.split(/\r?\n/)) {
    const stamps: number[] = [];
    let last = 0;
    stamp.lastIndex = 0;
    let match = stamp.exec(raw);
    while (match) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      stamps.push(Number((minutes * 60 + seconds).toFixed(3)));
      last = match.index + match[0].length;
      match = stamp.exec(raw);
    }
    const text = raw.slice(last).trim();
    if (!text || stamps.length === 0) continue;
    for (const startTime of stamps) {
      lines.push({ startTime, text });
    }
  }

  return lines.sort((a, b) => a.startTime - b.startTime);
}

export async function searchLrcLib(query: string): Promise<LrcLibTrack[]> {
  const data = await lrclibGet(`/search?q=${encodeURIComponent(query)}`);
  if (!Array.isArray(data)) return [];
  return data.map(asTrack).filter((track): track is LrcLibTrack => Boolean(track));
}

export async function getLrcLibTrack(input: {
  id?: number;
  artistName?: string;
  trackName?: string;
}): Promise<LrcLibTrack | null> {
  if (input.id) {
    return asTrack(await lrclibGet(`/get/${input.id}`));
  }
  if (input.artistName && input.trackName) {
    const params = new URLSearchParams({
      artist_name: input.artistName,
      track_name: input.trackName
    });
    return asTrack(await lrclibGet(`/get?${params.toString()}`));
  }
  return null;
}

export function linesFromTrack(track: LrcLibTrack): LrcLine[] {
  if (track.syncedLyrics) {
    return parseLrc(track.syncedLyrics);
  }
  if (track.plainLyrics) {
    return track.plainLyrics
      .split(/\r?\n/)
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({ startTime: 0, text }));
  }
  return [];
}
