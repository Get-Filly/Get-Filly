-- ============================================================
-- 0076: rate_limit_counters — een rem per IP die op serverless werkt
-- ============================================================
-- Het probleem: /public/contact heeft alleen een honeypot, en de
-- pre-onboarding AI-limiet is een Map in het geheugen van de Node-instantie.
-- Op Vercel is elke request een mogelijk verse instantie, dus zo'n Map is
-- in de praktijk nauwelijks een limiet. Allebei kosten ze echt geld per
-- aanroep (Resend, Anthropic).
--
-- Daarom hetzelfde patroon als AiRateLimitGuard, die dit al goed doet: de
-- teller staat in de database. Overleeft een deploy, klopt over meerdere
-- instanties, en kost één round-trip.
--
-- VASTE VENSTERS (tumbling), geen glijdend venster. Eenvoudiger en goedkoper,
-- met één bekende eigenschap: rond een vensterovergang kan iemand tot 2× de
-- limiet halen (eind van venster A plus begin van venster B). Voor een rem
-- tegen scripts en kostenmisbruik is dat ruim voldoende; wie een exacte
-- limiet nodig heeft, moet een glijdend venster of Redis nemen.
--
-- `client_key` is bewust GEEN IP-adres maar een hash daarvan (zie
-- RateLimitGuard). Een IP is persoonsgegeven; voor een teller is de hash
-- genoeg, en dan staat er niets herleidbaars in de database.

create table if not exists public.rate_limit_counters (
  bucket text not null,          -- welk endpoint, bv. 'contact' of 'onboarding_ai'
  client_key text not null,      -- gehasht IP of user-id
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, client_key, window_start)
);

comment on table public.rate_limit_counters is
  'Tellers voor de rate-limit per IP/user. Vaste vensters; zie check_rate_limit(). client_key is een hash, nooit een rauw IP.';

-- RLS aan zonder policies: alleen de service-role raakt deze tabel, en de
-- functie hieronder draait als security definer.
alter table public.rate_limit_counters enable row level security;

-- ------------------------------------------------------------
-- check_rate_limit — tel op en zeg of het mag
-- ------------------------------------------------------------
-- Eén atomaire aanroep: de insert-met-increment en de check zitten in
-- dezelfde statement, dus twee gelijktijdige requests kunnen de limiet niet
-- samen omzeilen.
--
-- Retourneert true = toegestaan, false = over de limiet.
create or replace function public.check_rate_limit(
  p_bucket text,
  p_key text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_limit is null or p_limit <= 0 or p_window_seconds is null or p_window_seconds <= 0 then
    -- Onzinnige instelling: niet stilzwijgend alles doorlaten, maar ook geen
    -- exception die een publiek endpoint sloopt. Weiger.
    return false;
  end if;

  -- Begin van het huidige vaste venster.
  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limit_counters (bucket, client_key, window_start, hits)
  values (p_bucket, p_key, v_window, 1)
  on conflict (bucket, client_key, window_start)
    do update set hits = rate_limit_counters.hits + 1
  returning hits into v_hits;

  -- Oudere vensters van dezelfde sleutel opruimen, zodat er per sleutel
  -- hooguit één rij blijft staan. Gebruikt de primary key, dus goedkoop.
  delete from public.rate_limit_counters
  where bucket = p_bucket
    and client_key = p_key
    and window_start < v_window;

  return v_hits <= p_limit;
end;
$$;

comment on function public.check_rate_limit is
  'Telt een aanroep en zegt of hij binnen de limiet valt. Vast venster; rond een vensterovergang is tot 2x de limiet mogelijk.';

revoke all on function public.check_rate_limit(text, text, integer, integer) from public;
grant execute on function public.check_rate_limit(text, text, integer, integer) to service_role;
