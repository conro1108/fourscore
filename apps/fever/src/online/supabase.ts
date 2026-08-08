/**
 * The connection to the shared toybox Supabase project.
 *
 * Ported from the old client unchanged, because nothing about it was visual.
 * Both values are public: the publishable key ships in the bundle and is only
 * useful alongside the RLS policies in `db/schema.sql`, which are what actually
 * decide who may read a match or write a move.
 *
 * Sign-in is anonymous and silent, and it happens the first time you open the
 * lobby rather than on boot — an invite link that asks your opponent to make an
 * account is an invite link nobody clicks, and an app that mints an auth user
 * for every person who came to play Moss is worse than one that waits.
 */

import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    db: { schema: "fourscore" },
    auth: { persistSession: true, autoRefreshToken: true },
  },
);

/**
 * The current user, signing in anonymously if there isn't one yet.
 *
 * The session persists in localStorage, so coming back to a tab you left an
 * hour ago resumes the same identity and therefore the same match.
 */
export async function ensureSignedIn(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;

  const { data: signed, error } = await supabase.auth.signInAnonymously();
  if (error || !signed.user) throw error ?? new Error("could not sign in");
  return signed.user.id;
}
