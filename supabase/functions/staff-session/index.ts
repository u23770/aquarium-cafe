// supabase/functions/staff-session/index.ts
// ============================================================
// Access-code gate for the login-free Admin/Waiter apps.
//
// The Admin/Waiter frontends never hold a privileged credential.
// A staff member types a short access code ONCE per device (not
// an email/password account, no signup). This function checks it
// server-side against a bcrypt hash stored in Supabase Vault and,
// on success, mints a real Supabase session for a dedicated
// staff_profiles-linked identity (role: admin or waiter). From
// then on the app holds a genuine `authenticated` session and
// every RLS policy / SECURITY DEFINER role check (is_admin(),
// is_staff()) evaluates that real session — not a client-claimed
// role, not "the URL is secret".
//
// SUPABASE_SERVICE_ROLE_KEY is only ever used here, server-side,
// inside this Edge Function. It is never sent to the browser.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const STAFF_EMAILS: Record<"admin" | "waiter", string> = {
  admin: "staff-admin@internal.aquarium-cafe.local",
  waiter: "staff-waiter@internal.aquarium-cafe.local",
};

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders(origin) });
  }

  let app: "admin" | "waiter";
  let code: string;
  try {
    const body = await req.json();
    app = body.app;
    code = String(body.code ?? "");
    if (app !== "admin" && app !== "waiter") throw new Error("bad app");
    if (!code) throw new Error("missing code");
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers: corsHeaders(origin) });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // 1) verify the submitted code against the bcrypt hash in Vault — never
  //    compare against a hardcoded value here, and never log/return the code.
  const { data: hashRow, error: hashErr } = await admin
    .schema("vault")
    .from("decrypted_secrets")
    .select("decrypted_secret")
    .eq("name", `staff_access_${app}_hash`)
    .maybeSingle();

  if (hashErr || !hashRow?.decrypted_secret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders(origin) });
  }

  const { data: matchRow } = await admin.rpc("_verify_staff_code", { p_code: code, p_hash: hashRow.decrypted_secret });
  if (!matchRow) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders(origin) });
  }

  // 2) get-or-create the dedicated staff identity for this app (never
  //    signable-up publicly — only this function ever creates it) and
  //    make sure staff_profiles maps it to the right role.
  const email = STAFF_EMAILS[app];
  let userId: string | undefined;

  const { data: existing } = await admin.auth.admin.listUsers();
  const found = existing?.users?.find((u) => u.email === email);
  if (found) {
    userId = found.id;
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: crypto.randomUUID() + crypto.randomUUID(), // never used to sign in directly
      user_metadata: { staff_app: app },
    });
    if (createErr || !created?.user) {
      return new Response(JSON.stringify({ error: "Server error" }), { status: 500, headers: corsHeaders(origin) });
    }
    userId = created.user.id;
  }

  await admin.from("staff_profiles").upsert({ user_id: userId, role: app, active: true, updated_at: new Date().toISOString() });

  // 3) mint a real session for that identity via a one-time magic link,
  //    then exchange it server-side — the browser only ever receives
  //    the resulting access/refresh tokens, never a password.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr || !link?.properties?.hashed_token) {
    return new Response(JSON.stringify({ error: "Server error" }), { status: 500, headers: corsHeaders(origin) });
  }

  const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: verified, error: verifyErr } = await anonClient.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });
  if (verifyErr || !verified?.session) {
    return new Response(JSON.stringify({ error: "Server error" }), { status: 500, headers: corsHeaders(origin) });
  }

  return new Response(
    JSON.stringify({
      access_token: verified.session.access_token,
      refresh_token: verified.session.refresh_token,
      expires_at: verified.session.expires_at,
    }),
    { status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } },
  );
});
