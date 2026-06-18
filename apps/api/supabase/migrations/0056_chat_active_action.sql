-- ============================================================
-- 0056: active_action — gedeelde "lopende actie"-state per gesprek
-- ============================================================
-- Audit-item #8: de geleide flow (frontend-kaart-state) en de chat
-- (LLM-tekst) deelden geen bron-van-waarheid. Een in de flow gekozen
-- dag/thema ging verloren zodra de eigenaar ging typen, waardoor Filly
-- de dag opnieuw vroeg of het gerecht kwijtraakte (3× gepatcht met een
-- tekst-annotatie-workaround in de prompt).
--
-- Eén jsonb-object per gesprek dat zowel de flow (schrijft bij elke
-- keuze) als de chat-prompt (leest 'm deterministisch i.p.v. de
-- annotatie) voedt. Vorm (alle velden optioneel):
--   { "date": "YYYY-MM-DD", "topic": "Burrata",
--     "channels": ["mail","instagram"], "step": "channels",
--     "updated_at": "ISO" }
--
-- Nullable: een vers gesprek heeft (nog) geen lopende actie. Reset is
-- gratis per kalenderdag — getOrCreateActiveConversation maakt dan een
-- nieuwe conversation-rij, die start dus met active_action = null.
-- Herhaal-veilig met `if not exists`.

alter table public.chat_conversations
  add column if not exists active_action jsonb;
