// Supabase Edge Function: auth_admin
// Purpose: Create or update a Supabase Auth user with a given password (admin-only)
// Env required (set in Supabase project settings):
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY (never expose client-side)
//
// Request (JSON):
// { action: 'upsert_user', email: string, password: string }
//
// Response: 200 { ok: true, user: { id, email } } or { error }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
if (!supabaseUrl || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables");
}
const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false }
});

function corsHeaders(origin?: string) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  } as HeadersInit;
}

async function findUserByEmail(email: string) {
  // Try listUsers pages to find by email (limited pages for safety)
  let page = 1;
  const perPage = 200;
  for (let i = 0; i < 10; i++) { // up to 2000 users scan
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const hit = data?.users?.find(u => (u.email || "").toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (!data || data.users.length < perPage) break; // no more pages
    page++;
  }
  return null;
}

serve(async (req) => {
  const origin = req.headers.get("Origin") || "*";
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(origin) });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action !== "upsert_user") {
      return new Response(JSON.stringify({ error: "invalid_action" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }

    const email = String(body?.email || "").trim();
    const password = String(body?.password || "").trim();
    if (!email || !password) {
      return new Response(JSON.stringify({ error: "email_and_password_required" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }

    // Try create user first
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (!createErr && created?.user) {
      return new Response(JSON.stringify({ ok: true, user: { id: created.user.id, email: created.user.email } }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }

    // If exists, update password by user id
    const existing = await findUserByEmail(email);
    if (!existing) {
      return new Response(JSON.stringify({ error: createErr?.message || "user_not_found" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }
    const { data: updated, error: updErr } = await admin.auth.admin.updateUserById(existing.id, { password });
    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }
    return new Response(JSON.stringify({ ok: true, user: { id: existing.id, email: existing.email } }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } });
  }
});
