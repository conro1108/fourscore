#!/usr/bin/env node
// Prove the schema still enforces what it claims to. Run after `npm run db:push`.
//
// This is not part of `npm test`: it needs the network and the live shared
// database, and vitest should stay offline and instant. But it earns its keep —
// RLS bugs don't typecheck and don't show up in unit tests. The first run of
// this file caught the ply-contiguity check recursing (42P17), which looked
// perfectly fine as SQL and failed only on the first real insert.
//
// It signs in two throwaway anonymous users and deletes them at the end.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync(join(homedir(), "projects", ".supabase.env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { SUPABASE_URL: URL_, SUPABASE_PUBLISHABLE_KEY: KEY, SUPABASE_SECRET_KEY: SECRET } = env;

let failures = 0;
const users = [];

async function signInAnonymously(label) {
  const res = await fetch(`${URL_}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const body = await res.json();
  if (!body.access_token) throw new Error(`${label} sign-in failed: ${JSON.stringify(body)}`);
  users.push(body.user.id);
  return { token: body.access_token, id: body.user.id };
}

function rest(user, path, opts = {}, schema = "fourscore") {
  return fetch(`${URL_}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${user.token}`,
      "Content-Type": "application/json",
      "Accept-Profile": schema,
      "Content-Profile": schema,
      Prefer: "return=representation",
    },
  });
}

async function check(label, res, wantStatus) {
  const body = await res.text();
  const ok = res.status === wantStatus;
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : ` — got ${res.status}, wanted ${wantStatus}: ${body.slice(0, 200)}`}`);
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

const host = await signInAnonymously("host");
const guest = await signInAnonymously("guest");

console.log("identity");
const profiles = await check(
  "signup auto-creates a row in app.profiles",
  await rest(host, `profiles?id=eq.${host.id}&select=handle`, {}, "app"),
  200,
);
if (profiles?.length !== 1) {
  failures++;
  console.log("  FAIL profile row missing");
}

console.log("\nmatch lifecycle");
const created = await check(
  "host creates a waiting match",
  await rest(host, "matches", {
    method: "POST",
    body: JSON.stringify({ host: host.id, variant: "connect4", join_code: "ABCD", host_seat: 1 }),
  }),
  201,
);
const matchId = created?.[0]?.id;

const unseen = await check(
  "guest queries a match they haven't joined",
  await rest(guest, `matches?id=eq.${matchId}`),
  200,
);
if (unseen?.length !== 0) {
  failures++;
  console.log("  FAIL RLS leaked a match to a non-participant");
} else {
  console.log("  ok   ...and RLS returns zero rows");
}

await check(
  "guest joins by code (case-insensitive)",
  await rest(guest, "rpc/join_match", { method: "POST", body: JSON.stringify({ p_code: "abcd" }) }),
  200,
);

console.log("\nturn enforcement");
const move = (user, ply, col) =>
  rest(user, "moves", {
    method: "POST",
    body: JSON.stringify({ match_id: matchId, ply, col, player: user.id }),
  });

await check("host plays ply 0", await move(host, 0, 3), 201);
await check("host cannot also play ply 1 — not their turn", await move(host, 1, 4), 403);
await check("guest cannot skip ahead to ply 2", await move(guest, 2, 4), 400);
await check("guest plays ply 1", await move(guest, 1, 4), 201);
// Caught by the contiguity trigger, which fires before the primary key does.
await check("neither player can replay ply 1", await move(guest, 1, 5), 400);

// Realtime is the piece with no fallback: if it stops delivering, the game just
// silently stops updating for one player and looks like a hang. It is also the
// piece most likely to break invisibly, since a table has to be in the
// supabase_realtime publication and the schema has to be granted — miss either
// and subscribe() still reports SUBSCRIBED.
console.log("\nrealtime");
{
  // Watches as the host. Realtime applies the same RLS as a plain select, so a
  // spectator would correctly see nothing and the test would pass or fail for
  // entirely the wrong reason.
  const rt = createClient(URL_, KEY, { db: { schema: "fourscore" }, auth: { persistSession: false } });
  await rt.realtime.setAuth(host.token);

  const watcher = await rest(host, "matches", {
    method: "POST",
    body: JSON.stringify({ host: host.id, join_code: "RTST", host_seat: 1 }),
  }).then((r) => r.json());
  const id = watcher[0].id;

  const seen = [];
  const channel = rt
    .channel(`verify:${id}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "fourscore", table: "moves", filter: `match_id=eq.${id}` },
      (p) => seen.push(p.new.col),
    )
    .subscribe();
  await new Promise((r) => setTimeout(r, 1500));

  await rest(guest, "rpc/join_match", { method: "POST", body: JSON.stringify({ p_code: "RTST" }) });
  await rest(host, "moves", {
    method: "POST",
    body: JSON.stringify({ match_id: id, ply: 0, col: 5, player: host.id }),
  });
  await new Promise((r) => setTimeout(r, 2500));

  const ok = seen.includes(5);
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} an inserted move arrives over the wire${ok ? "" : ` — got ${JSON.stringify(seen)}`}`);
  await rt.removeChannel(channel);
}

for (const id of users) {
  await fetch(`${URL_}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` },
  });
}

console.log(failures ? `\n${failures} failure(s)` : "\nall checks passed");
process.exit(failures ? 1 : 0);
