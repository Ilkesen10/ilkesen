-- Add verify_token column to members and backfill unique tokens
-- Run this in Supabase SQL editor.

-- Ensure pgcrypto for gen_random_uuid and digest
create extension if not exists pgcrypto;

alter table public.members
  add column if not exists verify_token text unique;

-- Backfill tokens for existing rows (64-char sha256 hex)
update public.members m
set verify_token = encode(digest(
  coalesce(m.id::text,'') || '-' || coalesce(m.national_id,'') || '-' || coalesce(m.member_no::text,'') || '-' || gen_random_uuid()::text,
  'sha256'), 'hex')
where m.verify_token is null;

-- Optional: create an index for faster lookup
create index if not exists members_verify_token_idx on public.members (verify_token);

-- RLS: ensure tokens are never exposed to clients
-- Note: Keep your existing RLS as-is. We only tighten SELECT on verify_token.
-- Deny selecting verify_token for anon/authenticated by creating a view or using column-level privileges.
-- Supabase does not support per-column RLS, so we REVOKE column privileges from anon/authenticated.
revoke select (verify_token) on table public.members from anon;
revoke select (verify_token) on table public.members from authenticated;
-- Service role (used by Edge Function) keeps full access.
