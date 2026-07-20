// Automated tests for slug -> owner isolation in the public-player-data edge function.
//
// Guarantees under test:
//  1) Each $userSlug resolves DETERMINISTICALLY to the same owner across calls.
//  2) Different slugs resolve to different owners (no shared user_id).
//  3) The bootstrap payload for a slug NEVER contains rows owned by a different slug
//     (no cross-radio data leakage — e.g., Interativa must not receive Positiva channels).
//  4) The now_playing fast path preserves the same owner as the bootstrap path.
//  5) UUID slugs bypass email matching and always return the exact user requested.
//
// Run with: supabase--test_edge_functions { functions: ["public-player-data"] }

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const ANON_KEY =
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

assert(SUPABASE_URL, "SUPABASE_URL missing from env");
assert(ANON_KEY, "SUPABASE anon/publishable key missing from env");

const FN_URL = `${SUPABASE_URL}/functions/v1/public-player-data`;

// Known-good fixtures. These are real slugs in the DB with distinct owners.
// If either slug is renamed, update this list — the tests will fail loudly first.
const FIXTURES = [
  { slug: "positivafm", expectedUserId: "d17e65af-e407-466f-9b60-b55c43399513" },
  { slug: "interativafm", expectedUserId: "b2f70324-d086-4a5d-a407-cbc4acf98dce" },
];

async function callPublicPlayer(params: Record<string, string>): Promise<{ status: number; body: any }> {
  const url = new URL(FN_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
  });
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { status: res.status, body };
}

Deno.test("slug resolves deterministically to the same owner across repeated calls", async () => {
  for (const { slug, expectedUserId } of FIXTURES) {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => callPublicPlayer({ slug })),
    );
    for (const r of results) {
      assertEquals(r.status, 200, `slug=${slug} unexpected status ${r.status}`);
      assertEquals(r.body.userId, expectedUserId, `slug=${slug} resolved to wrong owner`);
    }
  }
});

Deno.test("different slugs resolve to different owners", async () => {
  const [a, b] = await Promise.all(FIXTURES.map((f) => callPublicPlayer({ slug: f.slug })));
  assertEquals(a.status, 200);
  assertEquals(b.status, 200);
  assertNotEquals(
    a.body.userId,
    b.body.userId,
    "two distinct radio slugs must never share the same owner",
  );
});

Deno.test("bootstrap payload never leaks rows from another radio (data isolation)", async () => {
  const payloads = await Promise.all(
    FIXTURES.map(async (f) => ({ ...f, body: (await callPublicPlayer({ slug: f.slug })).body })),
  );

  // Every returned row that carries a user_id must belong to the resolved owner.
  for (const { slug, body } of payloads) {
    const ownerId: string = body.userId;
    const rowSets: Array<[string, any[]]> = [
      ["channels", body.channels ?? []],
      ["programas", body.programas ?? []],
      ["apresentadores", body.apresentadores ?? []],
      ["prerolls", body.prerolls ?? []],
      ["shopProducts", body.shopProducts ?? []],
    ];
    for (const [name, rows] of rowSets) {
      for (const row of rows) {
        if (row && typeof row === "object" && "user_id" in row) {
          assertEquals(
            row.user_id,
            ownerId,
            `slug=${slug} leaked ${name} row owned by ${row.user_id} (expected ${ownerId})`,
          );
        }
      }
    }
  }

  // Cross-slug check: no channel/programa/apresentador ID from slug A may appear in slug B.
  for (let i = 0; i < payloads.length; i++) {
    for (let j = 0; j < payloads.length; j++) {
      if (i === j) continue;
      const a = payloads[i];
      const b = payloads[j];
      for (const key of ["channels", "programas", "apresentadores"] as const) {
        const idsA = new Set<string>((a.body[key] ?? []).map((r: any) => r.id));
        const overlap = (b.body[key] ?? []).filter((r: any) => idsA.has(r.id));
        assertEquals(
          overlap.length,
          0,
          `slug=${b.slug} received ${key} that belong to slug=${a.slug}: ${JSON.stringify(overlap.map((r: any) => r.id))}`,
        );
      }
    }
  }
});

Deno.test("now_playing fast path returns the same owner as the bootstrap path", async () => {
  for (const { slug, expectedUserId } of FIXTURES) {
    const [boot, now] = await Promise.all([
      callPublicPlayer({ slug }),
      callPublicPlayer({ slug, section: "now_playing" }),
    ]);
    assertEquals(boot.status, 200);
    assertEquals(now.status, 200);
    assertEquals(boot.body.userId, expectedUserId, `bootstrap wrong owner for ${slug}`);
    assertEquals(now.body.userId, expectedUserId, `now_playing wrong owner for ${slug}`);
    assertEquals(
      boot.body.userId,
      now.body.userId,
      `bootstrap/now_playing disagree on owner for ${slug}`,
    );
  }
});

Deno.test("UUID slug bypasses email matching and returns that exact user", async () => {
  for (const { expectedUserId } of FIXTURES) {
    const { status, body } = await callPublicPlayer({ slug: expectedUserId });
    assertEquals(status, 200);
    assertEquals(body.userId, expectedUserId);
  }
});

Deno.test("unknown slug returns 404 and never falls back to another owner", async () => {
  const { status, body } = await callPublicPlayer({ slug: "this-slug-definitely-does-not-exist-xyz" });
  assertEquals(status, 404);
  assert(!body.userId, "404 response must not include a userId");
});
