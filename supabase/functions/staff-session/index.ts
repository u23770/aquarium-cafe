import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@3.0.2";

const ALLOWED_ORIGINS = new Set([
  "https://aquarium-cafe-admin.vercel.app",
  "https://aquarium-cafe-waiter.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
  if (ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const origin = req.headers.get("origin") || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(req, { error: "Forbidden" }, 403);

  const forwarded = req.headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip")?.trim() || "unknown";

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Supabase service credentials are not configured");
    return json(req, { error: "Service unavailable" }, 503);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: allowed, error: rateError } = await adminClient.rpc("consume_staff_login_attempt", { p_ip: ip });
  if (rateError || allowed !== true) return json(req, { error: "Too many attempts. Try again later." }, 429);

  let body: { role?: unknown; access_code?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "Invalid request" }, 400);
  }

  const role = body.role;
  const accessCode = body.access_code;
  if (
    (role !== "admin" && role !== "waiter") ||
    typeof accessCode !== "string" ||
    accessCode.length < 12 ||
    accessCode.length > 256
  ) {
    return json(req, { error: "Invalid credentials" }, 401);
  }

  const hashSecret = role === "admin"
    ? Deno.env.get("ADMIN_ACCESS_CODE_HASH")
    : Deno.env.get("WAITER_ACCESS_CODE_HASH");

  if (!hashSecret) {
    console.error("Staff access secret is not configured");
    return json(req, { error: "Service unavailable" }, 503);
  }

  const valid = await bcrypt.compare(accessCode, hashSecret);
  if (!valid) return json(req, { error: "Invalid credentials" }, 401);

  const { data: profile, error: profileError } = await adminClient
    .from("staff_profiles")
    .select("user_id, role, active")
    .eq("role", role)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (profileError || !profile) {
    console.error("Active staff profile lookup failed", profileError?.message);
    return json(req, { error: "Service unavailable" }, 503);
  }

  const { data: usersData, error: usersError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) {
    console.error("Auth user lookup failed", usersError.message);
    return json(req, { error: "Service unavailable" }, 503);
  }

  const user = usersData.users.find((u) => u.id === profile.user_id);
  if (!user?.email) {
    console.error("Staff auth identity missing email", profile.user_id);
    return json(req, { error: "Service unavailable" }, 503);
  }

  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email: user.email,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    console.error("Staff session credential generation failed", linkError?.message);
    return json(req, { error: "Service unavailable" }, 503);
  }

  return json(req, {
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });
});
