-- ============================================================
-- Get Filly — Migratie 0008
-- Invitations-tabel voor team-uitnodigingen via e-mail
-- ============================================================
-- Flow:
--   1. Owner stuurt invite vanuit team-UI.
--   2. Backend maakt invitation-rij met token + rol + expires.
--   3. Backend vraagt Supabase een magic-link naar email te sturen,
--      met redirect naar /invite/accept?inv=<token>.
--   4. Ontvanger klikt link → /invite/accept pagina roept
--      POST /api/invites/accept aan met token.
--   5. Backend valideert token, checkt expires, maakt
--      restaurant_users-rij met rol, markeert invite als accepted.
--
-- Security notes:
--   - token is een random uuid (niet-rate-te-radden).
--   - status-check voorkomt dubbel-accepteren van dezelfde invite.
--   - expires_at maakt invite-links tijdelijk (standaard 7 dagen).
-- ============================================================

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'manager', 'staff')),
  -- Optioneel: custom permissions meegeven bij invite (null = rol-defaults).
  permissions jsonb,
  -- Uniek, random token dat in de URL terugkomt.
  token uuid not null default gen_random_uuid() unique,
  -- Wie heeft de invite verstuurd (voor audit trail).
  invited_by uuid references public.users(id) on delete set null,
  -- Tijdstip waarop invite ongeldig wordt (default 7 dagen).
  expires_at timestamptz not null default (now() + interval '7 days'),
  -- Status: pending → accepted / revoked / expired.
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references public.users(id) on delete set null
);

-- Index voor snel zoeken op token en op openstaande invites per restaurant.
create index if not exists invitations_token_idx on public.invitations(token);
create index if not exists invitations_restaurant_status_idx on public.invitations(restaurant_id, status);

-- RLS aan, maar we lezen + schrijven via service_role vanuit de backend
-- (geen policies voor gewone users nodig).
alter table public.invitations enable row level security;

comment on table public.invitations is
  'Openstaande team-uitnodigingen. Backend maakt ze bij /team/invites, accept-pagina zet ze op accepted.';
