/**
 * Drive media: WEIGHTS.BIN (260,032 one-byte weights + tables), made by
 * tools/llm/pack.ts, read by /src/llm.c. Fetched, not bundled (361KB); until
 * it lands the drive reads empty and llm.c reports that rather than faulting.
 * `mount()` returns a copy — llm.c writes its KV cache into the drive.
 */

// BASE_URL ends in a slash and may be a full origin — don't collapse slashes.
const MEDIA_URL = `${import.meta.env.BASE_URL ?? "/"}WEIGHTS.BIN`;

let media: Uint8Array | null = null;

/** Start the fetch; nothing waits on it. Called once at boot. */
export function loadMedia(fetcher: typeof fetch = fetch): void {
  fetcher(MEDIA_URL)
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((b) => {
      if (b) media = new Uint8Array(b);
    })
    .catch(() => {
      /* empty drive is a valid state */
    });
}

/** What a running program sees on the drive: its own copy, or nothing. */
export function mount(): Uint8Array | null {
  return media === null ? null : Uint8Array.from(media);
}

/** Tests/harnesses supply their own media. */
export function setMedia(bytes: Uint8Array | null): void {
  media = bytes;
}
