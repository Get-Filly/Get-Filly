-- ============================================================
-- Fase 1: rijkere data voor Gasten + Suggesties
-- ============================================================

-- Gasten: bestedingsdata + allergieën
update public.guests
set average_spend_cents = 4800,
    lifetime_value_cents = 4800 * visit_count,
    preferences = jsonb_build_object('allergies', array['noten']),
    notes = 'Prefereert raamtafel, houdt van rode bourgogne'
where email = 'sophie.devries@example.nl';

update public.guests
set average_spend_cents = 5200,
    lifetime_value_cents = 5200 * visit_count,
    preferences = '{}'::jsonb,
    notes = 'Wijnliefhebber — vraag naar de chef''s pairing'
where email = 'marco.rossi@example.it';

update public.guests
set average_spend_cents = 3600,
    lifetime_value_cents = 3600 * visit_count,
    preferences = jsonb_build_object('allergies', array['gluten']),
    notes = 'Nieuw — leuk om haar welkom te heten'
where email = 'lisa.vdberg@example.nl';

update public.guests
set average_spend_cents = 4200,
    lifetime_value_cents = 4200 * visit_count,
    preferences = '{}'::jsonb
where email = 'tom.jansen@example.nl';

-- Suggesties: verrijkte velden voor AI-onderbouwing
alter table public.ai_suggestions
  add column if not exists confidence_score numeric(3, 2),
  add column if not exists expected_impact jsonb,
  add column if not exists urgency text check (urgency in ('low', 'medium', 'high')),
  add column if not exists reasoning text;

-- Bij de 3 pending suggesties alvast waardes invullen
update public.ai_suggestions
set confidence_score = 0.82,
    expected_impact = '{"extra_reservations": 10, "extra_revenue_cents": 48000}'::jsonb,
    urgency = 'high',
    reasoning = 'Donderdag 23 apr staat op 42%. Jouw donderdagen draaien gemiddeld 68% — een gap van 26%. Weer: regen verwacht. Soortgelijke actie op 17 apr leverde +12 reserveringen op.'
where trigger_type = 'low_occupancy';

update public.ai_suggestions
set confidence_score = 0.95,
    expected_impact = '{"extra_reservations": 18, "extra_revenue_cents": 86400}'::jsonb,
    urgency = 'medium',
    reasoning = 'Koningsdag valt dit jaar op maandag. Jouw vorige Koningsdag was een volle dag (98%). Brunch-aanbod ligt voor de hand — doelgroep: gezinnen + vrienden.'
where trigger_type = 'seasonal';

update public.ai_suggestions
set confidence_score = 0.68,
    expected_impact = '{"extra_reservations": 6, "extra_revenue_cents": 28000}'::jsonb,
    urgency = 'low',
    reasoning = '23 gasten zijn 3+ maanden niet geweest. Retentie-campagnes hebben historisch 8-12% respons. Lagere urgentie: geen deadline.'
where trigger_type = 'retention';
