# The shopping list

`manifest.json` is it. Every sound in the game has an entry, and every `want`
is a description of one short **CC0** recording to go find or make:

```json
"spike-truck": { "want": "airhorn, dry, single sustained blast, <1s", "file": "airhorn.wav" }
```

To install one: drop the file in this folder and add its name as `file`. Reload.
That's the whole ceremony — no rebuild, no code change, nothing else references
a filename. Anything the game can decode works (wav, mp3, ogg); wav is safest.

Entries with no `file` play a synthesized placeholder instead, so the game is
fully audible with this folder empty. You can do one at a time, in any order,
and hear each swap on its own.

Two things to know when picking:

- **Dry.** No reverb, no fade, no room. Every sound in this game gets mangled
  on the way out — distorted, convolved, reversed, chopped — and a source with
  a room baked in fights that. Trimmed hard at the start matters most; a spike
  that begins 80ms late reads as lag.
- **The choreography stays.** A recipe uses your sample as the *voice* and
  keeps its own envelopes and pitch bends, so the horn still falls a fifth at
  the end and the plane still dopplers past. You are picking a timbre, not a
  performance.

`want` strings live in `src/audio/library.ts` next to the placeholder they
describe; `library.test.ts` fails if this file drifts from them.
