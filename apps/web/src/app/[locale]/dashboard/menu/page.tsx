"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  fetchMenu,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  importMenuCard,
  importDrinksCard,
  fetchActiveCards,
  fetchCardSignedUrl,
  deleteMenuCard,
  fetchMenuSuggestions,
  type MenuItem,
  type MenuItemInput,
  type ActiveMenuCard,
  type SuggestedMenuItem,
} from "@/lib/api";
import { Skeleton } from "../_components/skeleton";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { MenuSuggestionsTab } from "./_components/menu-suggestions-tab";
import { logger } from "@/lib/logger";
import { useLocaleTag } from "@/lib/locale-format";

const categoryOrder = [
  "voorgerecht",
  "tussen",
  "hoofd",
  "dessert",
  "drank",
  "overig",
] as const;

type Category = (typeof categoryOrder)[number];
// "voorgesteld" en "afgewezen" zijn aparte views, tonen
// suggested_menu_items met respectievelijk status='pending' of
// 'rejected'. Gebundeld in dezelfde filter-state zodat de UI maar
// één active-tab tegelijk heeft.
type CategoryFilter = "alle" | "voorgesteld" | "afgewezen" | Category;

// Map van Category → label-key in de namespace; het label zelf wordt
// uit t() gehaald binnen de component (i18n).
const categoryLabelKey: Record<Category, string> = {
  voorgerecht: "category.voorgerecht",
  tussen: "category.tussen",
  hoofd: "category.hoofd",
  dessert: "category.dessert",
  drank: "category.drank",
  overig: "category.overig",
};

// Sub-categorieën voor de drank-tab. Visuele groepering in de UI;
// vaste volgorde zodat wijnen + champagnes als blok bovenaan staan,
// daarna bier/cocktail/sterk, dan koffie/thee/fris.
const DRINK_SUBCATEGORY_ORDER = [
  "wijn-rood",
  "wijn-wit",
  "wijn-rose",
  "wijn-mousserend",
  "bier",
  "cocktail",
  "sterke-drank",
  "koffie-thee",
  "fris",
  "overig",
] as const;

const DRINK_SUBCATEGORY_LABEL_KEY: Record<string, string> = {
  "wijn-rood": "drinkSub.wijnRood",
  "wijn-wit": "drinkSub.wijnWit",
  "wijn-rose": "drinkSub.wijnRose",
  "wijn-mousserend": "drinkSub.wijnMousserend",
  bier: "drinkSub.bier",
  cocktail: "drinkSub.cocktail",
  "sterke-drank": "drinkSub.sterkeDrank",
  "koffie-thee": "drinkSub.koffieThee",
  fris: "drinkSub.fris",
  overig: "drinkSub.overig",
};

// Filly (en handmatige invoer) levert soms variaties op de
// categorie-naam aan. Deze mapping normaliseert wat binnenkomt
// zodat de tabs/teller op alle items grip houden, ook als Claude
// of een eigenaar afwijkt van de standaardvocabulaire.
const CATEGORY_ALIASES: Record<string, Category> = {
  voor: "voorgerecht",
  voorgerecht: "voorgerecht",
  voorgerechten: "voorgerecht",
  starter: "voorgerecht",
  starters: "voorgerecht",
  amuse: "voorgerecht",
  borrel: "voorgerecht",
  borrelhap: "voorgerecht",
  borrelhapje: "voorgerecht",
  borrelhapjes: "voorgerecht",

  tussen: "tussen",
  tussengerecht: "tussen",
  tussengerechten: "tussen",
  middel: "tussen",
  middelgerecht: "tussen",

  hoofd: "hoofd",
  hoofdgerecht: "hoofd",
  hoofdgerechten: "hoofd",
  main: "hoofd",
  mains: "hoofd",
  vis: "hoofd",
  vlees: "hoofd",
  vegetarisch: "hoofd",
  pasta: "hoofd",
  pizza: "hoofd",
  salade: "hoofd",
  salades: "hoofd",
  bijgerecht: "hoofd",
  bijgerechten: "hoofd",

  dessert: "dessert",
  desserts: "dessert",
  nagerecht: "dessert",
  nagerechten: "dessert",
  desert: "dessert",
  zoet: "dessert",

  drank: "drank",
  dranken: "drank",
  drinks: "drank",
  wijn: "drank",
  wijnen: "drank",
  wijnkaart: "drank",
  bier: "drank",
  bieren: "drank",
  cocktail: "drank",
  cocktails: "drank",
  alcoholvrij: "drank",
  koffie: "drank",
  thee: "drank",
};

// Normaliseert wat in de DB staat naar één van de 6 UI-categorieën.
// Onbekend → "overig" zodat het item nooit uit de tabs wegvalt.
function normalizeCategory(raw: string | null | undefined): Category {
  if (!raw) return "overig";
  const key = raw.trim().toLowerCase();
  return CATEGORY_ALIASES[key] ?? "overig";
}

// Groepeert drank-items op subcategory voor de visuele groepering
// in de drank-tab. Onbekende of lege subcategories vallen in "overig"
// zodat de items zichtbaar blijven.
function groupBySubcategory(items: MenuItem[]): Map<string, MenuItem[]> {
  const groups = new Map<string, MenuItem[]>();
  for (const item of items) {
    const sub = item.subcategory?.trim().toLowerCase() || "overig";
    const key = (DRINK_SUBCATEGORY_ORDER as readonly string[]).includes(sub)
      ? sub
      : "overig";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return groups;
}

// Seizoen-keys → label-key in de namespace; de keys (spring/summer/…)
// blijven de DB-waarden, alleen de labels zijn i18n.
const seasonLabelKey: Record<string, string> = {
  spring: "season.spring",
  summer: "season.summer",
  autumn: "season.autumn",
  winter: "season.winter",
};

const seasonOptionKeys: { key: string; labelKey: string }[] = [
  { key: "spring", labelKey: "season.spring" },
  { key: "summer", labelKey: "season.summer" },
  { key: "autumn", labelKey: "season.autumn" },
  { key: "winter", labelKey: "season.winter" },
];

// Standaardset dieet-tags die een horeca-eigenaar meestal nodig heeft.
// In productie mogelijk uit een centrale tags-tabel. De keys komen overeen
// met wat er in de DB wordt opgeslagen; de labels zijn voor de UI (i18n).
const dietaryTagOptionKeys: { key: string; labelKey: string }[] = [
  { key: "vega", labelKey: "diet.vega" },
  { key: "vegan", labelKey: "diet.vegan" },
  { key: "gluten_vrij", labelKey: "diet.glutenVrij" },
  { key: "lactose_vrij", labelKey: "diet.lactoseVrij" },
  { key: "noten_vrij", labelKey: "diet.notenVrij" },
];

function formatEuroFromCents(cents: number | null): string {
  if (cents === null) return "—";
  return `€${(cents / 100).toFixed(2).replace(".", ",")}`;
}

// Lege template voor een nieuw gerecht, gebruikt bij "+ Toevoegen".
function emptyDraft(): MenuItem {
  return {
    id: "",
    name: "",
    description: null,
    category: "hoofd",
    subcategory: null,
    price_cents: null,
    is_signature: false,
    is_seasonal: false,
    season: null,
    is_available: true,
    dietary_tags: [],
  };
}

// Stages voor de menu-upload flow.
//   idle         , modal open, nog geen bestand gekozen
//   reading      , bestand naar backend gestuurd
//   recognizing  , Claude Vision is bezig (cosmetische sub-stage)
//   categorizing , items worden in DB weggeschreven (cosmetisch)
//   done         , succes, items zichtbaar
//   error        , backend gaf een fout; toon melding + "Opnieuw"-knop
//
// reading/recognizing/categorizing zijn één HTTP-call onder water, maar
// we cyclen er visueel doorheen op een vaste timer zodat de gebruiker
// vooruitgang ziet tijdens de 5-15s wachttijd. Bij eerder of later
// resolve van de echte call springen we direct naar 'done' of 'error'.
type UploadStage =
  | "idle"
  | "reading"
  | "recognizing"
  | "categorizing"
  | "done"
  | "error";

// Per 2026-05-21: MenuPage accepteert nu een `embedded`-prop zodat
// dezelfde component zowel als standalone-route (/dashboard/menu)
// als embedded in /dashboard/vindbaarheid/identiteit?subtab=menu
// gebruikt kan worden. Bij embedded=true skippen we de page-shell
// (page-full wrapper + PageHeader met titel) zodat de identiteit-
// pagina-header bovenaan blijft staan en de upload-actions in een
// inline-rij verschijnen.
type MenuPageProps = { embedded?: boolean };

export default function MenuPage({ embedded = false }: MenuPageProps = {}) {
  const t = useTranslations("dash_menu_page");
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<CategoryFilter>("alle");
  const [query, setQuery] = useState("");

  // Modal-state. selected = null betekent "modal dicht". Bij toevoegen
  // wordt een fresh draft gezet, bij bewerken de geselecteerde item.
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [isNew, setIsNew] = useState(false);
  // Tijdens een API-call (POST/PATCH/DELETE) zetten we 'saving' op true
  // zodat de modal-knoppen disabled gaan en de gebruiker niet dubbel kan
  // klikken. Onafhankelijk van de upload-flow hieronder.
  const [saving, setSaving] = useState(false);

  // Upload-flow state. Zichtbaar wanneer uploadOpen=true. Stage volgt
  // de verwerking: reading → recognizing → categorizing → done|error.
  // uploadKind bepaalt of we de menu-kaart of de drank-kaart importeren
  // (verschillende endpoints, prompts en tabel-mapping op de backend).
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadKind, setUploadKind] = useState<"menu" | "drinks">("menu");
  const [uploadStage, setUploadStage] = useState<UploadStage>("idle");
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  // Items die zojuist door Filly zijn geïmporteerd, al in DB, met
  // echte uuid's. Tonen we in de "✓ N gerechten herkend"-lijst zodat
  // de eigenaar direct ziet wat er is toegevoegd.
  const [importedItems, setImportedItems] = useState<MenuItem[]>([]);
  const [importNotes, setImportNotes] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Actieve kaarten, maximaal 2: 1 menu-kaart + 1 drankkaart.
  // Gevuld vanuit menu_uploads-tabel zodat de banners ook na een F5
  // zichtbaar blijven.
  const [uploadedCards, setUploadedCards] = useState<ActiveMenuCard[]>([]);
  const menuCard = uploadedCards.find((c) => c.kind === "menu") ?? null;
  const drinksCard = uploadedCards.find((c) => c.kind === "drinks") ?? null;

  // Filly-voorstellen voor nieuwe gerechten. Aparte tabel
  // (suggested_menu_items) zodat ze niet meetellen in echte menu_items
  // tot acceptatie. Twee aparte lijsten: pending (Voorgesteld-tab) en
  // rejected (Afgewezen-tab). Lazy-fetch bij mount + opnieuw na elke
  // mutation.
  const [suggestions, setSuggestions] = useState<SuggestedMenuItem[]>([]);
  const [rejectedSuggestions, setRejectedSuggestions] = useState<
    SuggestedMenuItem[]
  >([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [rejectedLoading, setRejectedLoading] = useState(true);

  const reloadSuggestions = async () => {
    try {
      const [fresh, rej] = await Promise.all([
        fetchMenuSuggestions("pending"),
        fetchMenuSuggestions("rejected"),
      ]);
      setSuggestions(fresh);
      setRejectedSuggestions(rej);
    } catch {
      // Niet-fataal, UI toont laatste cached lijst. Echte fout zien
      // we al via de generate/accept/reject-handlers in de tab zelf.
    }
  };

  useEffect(() => {
    // Bij mount: parallel ophalen van menu-items, actieve kaarten,
    // pending én rejected Filly-voorstellen. Vier roundtrips parallel;
    // minder UI-flicker dan sequentieel.
    Promise.all([
      fetchMenu(),
      fetchActiveCards(),
      fetchMenuSuggestions("pending"),
      fetchMenuSuggestions("rejected"),
    ])
      .then(([menuData, cards, suggs, rejected]) => {
        setItems(menuData);
        setUploadedCards(cards);
        setSuggestions(suggs);
        setRejectedSuggestions(rejected);
        setLoading(false);
        setSuggestionsLoading(false);
        setRejectedLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
        setSuggestionsLoading(false);
        setRejectedLoading(false);
      });
  }, []);

  // Wordt aangeroepen door MenuSuggestionsTab na elke mutation.
  // menuChanged=true → ook de echte menu-items opnieuw fetchen
  // zodat een net-geaccepteerd voorstel meteen onder Alle/Hoofd/etc
  // verschijnt.
  const handleSuggestionsMutated = async (menuChanged: boolean) => {
    await reloadSuggestions();
    if (menuChanged) {
      try {
        const fresh = await fetchMenu();
        setItems(fresh);
      } catch {
        // niet-fataal
      }
    }
  };

  // Escape sluit de modal.
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const openAdd = () => {
    setEditing(emptyDraft());
    setIsNew(true);
  };

  const openEdit = (item: MenuItem) => {
    setEditing({ ...item });
    setIsNew(false);
  };

  const closeModal = () => {
    setEditing(null);
    setIsNew(false);
  };

  // Vorm de UI-state om naar het input-formaat dat de backend verwacht.
  // We sturen alleen velden die zin hebben (geen `id`); de backend
  // valideert + normaliseert verder. is_seasonal=false → season weglaten
  // zodat we geen ongeldige combinaties verzenden.
  const toInput = (m: MenuItem): MenuItemInput => ({
    name: m.name,
    description: m.description,
    category: m.category,
    price_cents: m.price_cents,
    is_signature: m.is_signature,
    is_seasonal: m.is_seasonal,
    season: m.is_seasonal ? m.season : null,
    is_available: m.is_available,
    dietary_tags: m.dietary_tags,
  });

  // Bij create én update doen we na success een verse fetchMenu(). Een
  // round-trip extra (~50ms) is verwaarloosbaar en garandeert dat de
  // lijst exact matcht met wat in de DB staat, inclusief sortering en
  // server-side defaults. Filly leest dezelfde tabel, dus wat je hier
  // ziet is precies wat hij in zijn volgende prompt mee krijgt.
  const saveItem = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      if (isNew) {
        await createMenuItem(toInput(editing));
      } else {
        await updateMenuItem(editing.id, toInput(editing));
      }
      const fresh = await fetchMenu();
      setItems(fresh);
      closeModal();
    } catch (e) {
      // Fout-message van de backend (bv. "Naam is verplicht.") tonen.
      // Modal blijft open zodat de gebruiker kan corrigeren zonder z'n
      // werk te verliezen.
      alert(e instanceof Error ? e.message : t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async () => {
    if (!editing || isNew) return;
    if (
      !window.confirm(
        t("confirm.deleteItem", {
          name: editing.name || t("confirm.thisDish"),
        }),
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      await deleteMenuItem(editing.id);
      const fresh = await fetchMenu();
      setItems(fresh);
      closeModal();
    } catch (e) {
      alert(e instanceof Error ? e.message : t("errors.deleteFailed"));
    } finally {
      setSaving(false);
    }
  };

  // Upload-flow handlers.
  const openUpload = (kind: "menu" | "drinks" = "menu") => {
    setUploadKind(kind);
    setUploadOpen(true);
    setUploadStage("idle");
    setUploadFileName(null);
    setImportedItems([]);
    setImportNotes(null);
    setUploadError(null);
  };

  const closeUpload = () => {
    setUploadOpen(false);
    setUploadStage("idle");
    setUploadFileName(null);
    setImportedItems([]);
    setImportNotes(null);
    setUploadError(null);
  };

  // Echte upload-flow: bestand → backend → Claude Vision → menu_items.
  // Tijdens de wachttijd (5-15s) cyclen we visueel door reading →
  // recognizing → categorizing zodat de gebruiker vooruitgang voelt.
  // Zodra de Promise resolve't springen we direct naar 'done' (of
  // 'error' bij falen) en cancellen we de cosmetische timers.
  const handleFileSelected = async (file: File) => {
    setUploadFileName(file.name);
    setUploadError(null);
    setUploadStage("reading");

    // Cosmetische stage-rotation. Als de echte call sneller klaar is
    // dan deze timeouts, overschrijft het 'done' / 'error'-pad gewoon
    // de stage en clearen we de timers in finally.
    const t1 = setTimeout(() => setUploadStage("recognizing"), 4000);
    const t2 = setTimeout(() => setUploadStage("categorizing"), 9000);

    try {
      const result =
        uploadKind === "drinks"
          ? await importDrinksCard(file)
          : await importMenuCard(file);
      setImportedItems(result.items);
      setImportNotes(result.notes);
      setUploadStage("done");
    } catch (e) {
      setUploadError(
        e instanceof Error ? e.message : t("errors.uploadFailed"),
      );
      setUploadStage("error");
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
    }
  };

  // Sluit de upload-modal én ververs de menu-lijst + banner zodat de
  // pagina alle nieuwe items toont (zonder F5 nodig). Wordt gebruikt
  // op de "Klaar"-knop na een succesvolle import.
  const closeUploadAndRefresh = async () => {
    closeUpload();
    try {
      const [menuData, cards] = await Promise.all([
        fetchMenu(),
        fetchActiveCards(),
      ]);
      setItems(menuData);
      setUploadedCards(cards);
    } catch (e) {
      logger.error("Refresh na upload faalde:", e);
    }
  };

  // Verwijder een specifieke kaart-upload (menu OF drank) inclusief
  // de items die er uit kwamen. Handmatig toegevoegde items blijven
  // staan (geen menu_upload_id-link in DB).
  const removeUploadedCard = async (card: ActiveMenuCard) => {
    const cardLabel =
      card.kind === "drinks"
        ? t("cardNoun.drinksCard")
        : t("cardNoun.menuCard");
    const itemNoun =
      card.kind === "drinks" ? t("itemNoun.drinks") : t("itemNoun.dishes");
    const ok = window.confirm(
      t("confirm.deleteCard", {
        cardLabel,
        count: card.items_count,
        itemNoun,
      }),
    );
    if (!ok) return;
    try {
      await deleteMenuCard(card.id);
      const [menuData, cards] = await Promise.all([
        fetchMenu(),
        fetchActiveCards(),
      ]);
      setItems(menuData);
      setUploadedCards(cards);
    } catch (e) {
      alert(e instanceof Error ? e.message : t("errors.deleteFailed"));
    }
  };

  // Open het bron-bestand van een upload in een nieuw tabblad. Vraagt
  // een 1-uur signed URL aan bij de backend (alleen toegankelijk voor
  // de eigenaar dankzij tenant-check op de upload-id).
  const openUploadedCard = async (card: ActiveMenuCard) => {
    try {
      const url = await fetchCardSignedUrl(card.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      alert(e instanceof Error ? e.message : t("errors.openCardFailed"));
    }
  };

  const filtered = useMemo(() => {
    let out = items;
    if (filter !== "alle") {
      // Vergelijk via normalize zodat varianten als "voor" of
      // "hoofdgerechten" toch in de juiste tab vallen.
      out = out.filter((i) => normalizeCategory(i.category) === filter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter((i) =>
        `${i.name} ${i.description ?? ""}`.toLowerCase().includes(q),
      );
    }
    return out;
  }, [items, filter, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const item of filtered) {
      const cat = normalizeCategory(item.category);
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    }
    // Sorteer op logische volgorde, onbekende categorieën achteraan.
    const sorted = new Map<string, MenuItem[]>();
    for (const c of categoryOrder) {
      if (map.has(c)) sorted.set(c, map.get(c)!);
    }
    for (const [k, v] of map) {
      if (!sorted.has(k)) sorted.set(k, v);
    }
    return sorted;
  }, [filtered]);

  // Top-3 signature gerechten die Filly het vaakst in zijn voorstellen
  // gebruikt, mock, maar geeft een concreet "Filly waardeert dit"-signaal.
  const fillyTop = useMemo(() => {
    return items.filter((i) => i.is_signature).slice(0, 3);
  }, [items]);

  const countPer = (c: CategoryFilter) => {
    if (c === "alle") return items.length;
    return items.filter((i) => normalizeCategory(i.category) === c).length;
  };

  // Helper voor 1 menu-item-rij. Wordt vanuit twee plekken gerenderd:
  // platte category-block (alle non-drank-tabs) én sub-grouped drank-
  // block (waar de items per wijn-rood/bier/etc gegroepeerd staan).
  const renderMenuItem = (item: MenuItem) => (
    <button
      key={item.id}
      className={`menu-item ${
        !item.is_available ? "menu-item-unavailable" : ""
      }`}
      onClick={() => openEdit(item)}
      type="button"
    >
      <div className="menu-item-main">
        <div className="menu-item-name-row">
          <span className="menu-item-name">{item.name}</span>
          {!item.is_available && (
            <span className="menu-item-badge-soft">
              {t("badge.temporarilyOff")}
            </span>
          )}
          {item.is_signature && (
            <span className="menu-item-badge-signature">
              {t("badge.signature")}
            </span>
          )}
          {item.is_seasonal && item.season && (
            <span className="menu-item-badge-season">
              {t(seasonLabelKey[item.season])}
            </span>
          )}
          {item.dietary_tags.map((t) => (
            <span key={t} className="menu-item-badge-diet">
              {t.replace("_", "-")}
            </span>
          ))}
        </div>
        {item.description && (
          <div className="menu-item-desc">{item.description}</div>
        )}
      </div>
      <div className="menu-item-price">
        {formatEuroFromCents(item.price_cents)}
      </div>
    </button>
  );

  // Upload + add-actie-knoppen. Worden bij standalone-route in de
  // PageHeader-rechts geplaatst, bij embedded in een inline-rij.
  const headerActions = (
    <>
      {/* Header-knoppen tonen alléén het type kaart dat nog niet
          actief is. Brand-soft-variant: licht-groen default,
          donker-groen op hover (Floris-keuze 2026-05-12). */}
      {!menuCard && (
        <Button variant="brand-soft" onClick={() => openUpload("menu")}>
          📄 {t("actions.uploadMenuCard")}
        </Button>
      )}
      {!drinksCard && (
        <Button variant="brand-soft" onClick={() => openUpload("drinks")}>
          🍷 {t("actions.uploadDrinksCard")}
        </Button>
      )}
      <Button variant="primary" onClick={openAdd}>
        ＋ {t("actions.addDish")}
      </Button>
    </>
  );

  // Wrapper-element: bij standalone gebruiken we .page-full voor
  // padding + scroll. Bij embedded gewone <div> zodat de parent-
  // pagina (Vindbaarheid > Identiteit > Menu-tab) z'n eigen
  // padding/scroll-context behoudt.
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    embedded ? <div>{children}</div> : <div className="page-full">{children}</div>;

  return (
    <Wrapper>
      {!embedded && <PageHeader title={t("pageTitle")} actions={headerActions} />}
      {embedded && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          {headerActions}
        </div>
      )}

      {/* Status-banners voor actieve kaarten: één voor de menu-kaart,
          één voor de drankkaart. Beide tonen filename (klikbaar →
          opent het bron-PDF/foto in een nieuw tabblad), datum en
          aantal items + per-banner acties. Data komt uit menu_uploads
          in de DB, dus zichtbaar gebleven na een F5. */}
      {menuCard && (
        <CardStatusBanner
          card={menuCard}
          onOpen={() => openUploadedCard(menuCard)}
          onReplace={() => openUpload("menu")}
          onRemove={() => removeUploadedCard(menuCard)}
        />
      )}
      {drinksCard && (
        <CardStatusBanner
          card={drinksCard}
          onOpen={() => openUploadedCard(drinksCard)}
          onReplace={() => openUpload("drinks")}
          onRemove={() => removeUploadedCard(drinksCard)}
        />
      )}

      {/* Filly-tip blok: laat zien dat het menu de "grondstof" is voor
          wat Filly in campagnes gebruikt, signaleert belang van goed
          onderhouden menu-data. */}
      {!loading && fillyTop.length > 0 && (
        <div className="menu-filly-tip">
          <div>
            <div className="menu-filly-tip-label">
              🌱 {t("fillyTip.label")}
            </div>
            <div className="menu-filly-tip-body">
              {t.rich("fillyTip.body", {
                dishes: fillyTop.map((i) => i.name).join(" · "),
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </div>
          </div>
        </div>
      )}

      {/* Filter-rij: categorie-tabs (Alle/Voorgerecht/.../Overig),
          gevolgd door Voorgesteld + Afgewezen, Filly's tabs sluiten
          aan op de categorie-rij zodat de chef ze als natuurlijk
          verlengstuk ervaart, niet als losse balk. */}
      <div className="menu-filters">
        <div className="tabs">
          {(["alle", ...categoryOrder] as CategoryFilter[]).map((c) => (
            <button
              key={c}
              className={`tab-btn ${filter === c ? "active" : ""}`}
              onClick={() => setFilter(c)}
            >
              {c === "alle" ? t("tabs.all") : t(categoryLabelKey[c as Category])}{" "}
              ({countPer(c)})
            </button>
          ))}
          <button
            className={`tab-btn ${filter === "voorgesteld" ? "active" : ""}`}
            onClick={() => setFilter("voorgesteld")}
            title={t("tabs.suggestedTitle")}
          >
            {t("tabs.suggested")} ({suggestions.length})
          </button>
          <button
            className={`tab-btn ${filter === "afgewezen" ? "active" : ""}`}
            onClick={() => setFilter("afgewezen")}
            title={t("tabs.rejectedTitle")}
          >
            {t("tabs.rejected")} ({rejectedSuggestions.length})
          </button>
        </div>
      </div>

      {/* Zoekveld alleen bij echte menu-tabs. Voorgesteld/Afgewezen
          hebben eigen interactie en zoeken op 3 voorstellen heeft
          geen zin. */}
      {filter !== "voorgesteld" && filter !== "afgewezen" && (
        <input
          type="search"
          placeholder={t("searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="search-input"
        />
      )}

      {filter === "voorgesteld" ? (
        <MenuSuggestionsTab
          mode="pending"
          items={suggestions}
          loading={suggestionsLoading}
          onMutate={handleSuggestionsMutated}
        />
      ) : filter === "afgewezen" ? (
        <MenuSuggestionsTab
          mode="rejected"
          items={rejectedSuggestions}
          loading={rejectedLoading}
          onMutate={handleSuggestionsMutated}
        />
      ) : loading ? (
        <div>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={60} style={{ marginBottom: 8 }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="🍽️"
          title={error ? t("empty.loadFailedTitle") : t("empty.noMenuTitle")}
          description={
            error ? t("empty.loadFailedDesc") : t("empty.noMenuDesc")
          }
          action={
            !error && (
              <Button variant="primary" onClick={openAdd}>
                {t("actions.addDish")}
              </Button>
            )
          }
        />
      ) : filtered.length === 0 ? (
        <div className="table-empty">{t("empty.noResults")}</div>
      ) : (
        <div>
          {Array.from(grouped.entries()).map(([cat, list]) => {
            const catLabelKey = categoryLabelKey[cat as Category];
            const catLabel = catLabelKey
              ? t(catLabelKey)
              : cat.charAt(0).toUpperCase() + cat.slice(1);
            const catAvg =
              list.length > 0
                ? Math.round(
                    list.reduce((s, i) => s + (i.price_cents ?? 0), 0) /
                      list.length,
                  )
                : 0;

            // Drank-tab: extra sub-groepering op subcategory zodat
            // wijnen/bier/cocktails visueel uit elkaar getrokken
            // worden. Andere categorieën blijven plat.
            const isDrinks = cat === "drank";
            const drinkSubGroups = isDrinks
              ? groupBySubcategory(list)
              : null;
            const noun = isDrinks
              ? list.length === 1
                ? t("itemNoun.drinkSingular")
                : t("itemNoun.drinks")
              : list.length === 1
                ? t("itemNoun.dishSingular")
                : t("itemNoun.dishes");

            return (
              <div key={cat} className="menu-category-block">
                <div className="menu-category-head">
                  <h3 className="menu-category-title">{catLabel}</h3>
                  <div className="menu-category-meta">
                    {list.length} {noun} · {t("avgPrefix")}{" "}
                    {formatEuroFromCents(catAvg)}
                  </div>
                </div>
                {drinkSubGroups ? (
                  DRINK_SUBCATEGORY_ORDER.map((sub) => {
                    const subList = drinkSubGroups.get(sub);
                    if (!subList || subList.length === 0) return null;
                    return (
                      <div key={sub} className="menu-subcategory-block">
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--text-secondary)",
                            margin: "12px 0 6px 0",
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                          }}
                        >
                          {DRINK_SUBCATEGORY_LABEL_KEY[sub]
                            ? t(DRINK_SUBCATEGORY_LABEL_KEY[sub])
                            : sub}
                          <span
                            style={{
                              marginLeft: 8,
                              fontWeight: 400,
                              textTransform: "none",
                              letterSpacing: 0,
                            }}
                          >
                            ({subList.length})
                          </span>
                        </div>
                        <div className="menu-list">
                          {subList.map((item) => renderMenuItem(item))}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="menu-list">
                    {list.map((item) => renderMenuItem(item))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit / toevoeg-modal. Open bij klik op gerecht-kaart of op
          "+ Gerecht toevoegen". Bevat alle velden in een simpele
          form-layout. */}
      {editing && (
        <MenuModal
          item={editing}
          isNew={isNew}
          saving={saving}
          onChange={setEditing}
          onSave={saveItem}
          onDelete={deleteItem}
          onClose={closeModal}
        />
      )}

      {/* Upload-modal: echte Vision-flow.
          Flow: kies bestand → Filly leest (5-15s) → resultaat + items
          al in DB. "Klaar"-knop sluit + ververst de menu-lijst. */}
      {uploadOpen && (
        <UploadMenuModal
          kind={uploadKind}
          stage={uploadStage}
          fileName={uploadFileName}
          imported={importedItems}
          notes={importNotes}
          errorMessage={uploadError}
          onFileSelected={handleFileSelected}
          onDone={closeUploadAndRefresh}
          onClose={closeUpload}
        />
      )}
    </Wrapper>
  );
}

// ============================================================
// CardStatusBanner, toont een actieve menu/drank-kaart
// ============================================================
// Eén component voor beide kaart-types. UI-tekst en icoon switchen
// op `card.kind`. Bestandsnaam is klikbaar → opent het bron-bestand
// in een nieuw tabblad via een 1-uur signed URL.
function CardStatusBanner({
  card,
  onOpen,
  onReplace,
  onRemove,
}: {
  card: ActiveMenuCard;
  onOpen: () => void;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations("dash_menu_page");
  const localeTag = useLocaleTag();
  const isDrinks = card.kind === "drinks";
  const title = isDrinks ? t("banner.drinksActive") : t("banner.menuActive");
  const replaceLabel = isDrinks
    ? `🍷 ${t("banner.newDrinksCard")}`
    : `📄 ${t("banner.newMenuCard")}`;
  const itemsCount = card.items_count;
  const noun =
    itemsCount === 1
      ? isDrinks
        ? t("itemNoun.drinkSingular")
        : t("itemNoun.dishSingular")
      : isDrinks
        ? t("itemNoun.drinks")
        : t("itemNoun.dishes");

  return (
    <div className="menu-card-status">
      <div className="menu-card-status-icon">✓</div>
      <div className="menu-card-status-body">
        <div className="menu-card-status-title">{title}</div>
        <div className="menu-card-status-meta">
          <button
            type="button"
            onClick={onOpen}
            title={t("banner.openCardTitle")}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "inherit",
              fontSize: "inherit",
              cursor: "pointer",
              textDecoration: "underline",
              fontFamily: "inherit",
            }}
          >
            {card.file_name ??
              (isDrinks
                ? t("banner.fallbackDrinksCard")
                : t("banner.fallbackMenuCard"))}
          </button>
          <span>·</span>
          <span>
            {new Date(card.uploaded_at).toLocaleDateString(localeTag, {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
          <span>·</span>
          <span>
            {t("banner.imported", { count: itemsCount, noun })}
          </span>
        </div>
      </div>
      <div className="menu-card-status-actions">
        <Button
          variant="secondary"
          size="sm"
          onClick={onReplace}
          className="menu-card-status-btn"
        >
          {replaceLabel}
        </Button>
        <button className="menu-card-status-remove" onClick={onRemove}>
          {t("actions.remove")}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Upload-modal (menu-kaart importeren via AI)
// ============================================================

function UploadMenuModal({
  kind,
  stage,
  fileName,
  imported,
  notes,
  errorMessage,
  onFileSelected,
  onDone,
  onClose,
}: {
  // Bepaalt copy + icoon: 'menu' = standaard menu-kaart, 'drinks' =
  // drankkaart (subcategorie wijn-rood/bier/etc).
  kind: "menu" | "drinks";
  stage: UploadStage;
  fileName: string | null;
  // Items die al in de DB staan na een succesvolle import. Ids zijn
  // echte uuid's, niet meer 'imported-xyz'-prefixen.
  imported: MenuItem[];
  // Optionele opmerkingen van Filly (bv. "wijnkaart kon ik niet
  // helemaal lezen"). Tonen we als info-banner als 'm gevuld is.
  notes: string | null;
  // Backend-foutmelding bij upload-fail. Toont in de error-stage.
  errorMessage: string | null;
  onFileSelected: (file: File) => void;
  // Klaar-knop na success: sluit modal + ververs menu-lijst op de
  // pagina. De items zijn al weggeschreven in de DB tijdens upload.
  onDone: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("dash_menu_page");
  const isDrinks = kind === "drinks";
  const cardLabel = isDrinks
    ? t("cardNoun.drinksCard")
    : t("cardNoun.menuCard");
  const cardIcon = isDrinks ? "🍷" : "📄";
  const itemNoun = isDrinks ? t("itemNoun.drinks") : t("itemNoun.dishes");
  const isProcessing =
    stage === "reading" ||
    stage === "recognizing" ||
    stage === "categorizing";

  const stageLabel: Record<UploadStage, string> = {
    idle: "",
    reading: t("upload.stageReading"),
    recognizing: isDrinks
      ? t("upload.stageRecognizingDrinks")
      : t("upload.stageRecognizingMenu"),
    categorizing: t("upload.stageCategorizing", { itemNoun }),
    done: t("upload.stageDone"),
    error: t("upload.stageError"),
  };

  // Volgorde van de verwerkingsstappen voor de UI-indicator.
  const steps: { key: UploadStage; label: string }[] = [
    { key: "reading", label: t("upload.stepUpload") },
    { key: "recognizing", label: t("upload.stepFillyReads") },
    { key: "categorizing", label: t("upload.stepAdd") },
  ];

  const stageIndex = (s: UploadStage) =>
    s === "reading" ? 0 : s === "recognizing" ? 1 : s === "categorizing" ? 2 : 3;

  // Tijdens processing willen we niet dat de gebruiker de modal sluit
  // (request blijft dan open op de server, items komen toch in DB,
  // verwarrend). Sluiten alleen toestaan in idle/done/error.
  const canClose = !isProcessing;

  return (
    <div
      className="sg-modal-overlay"
      onClick={canClose ? onClose : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div className="sg-modal" onClick={(e) => e.stopPropagation()}>
        {canClose && (
          <button
            className="sg-modal-close"
            onClick={onClose}
            aria-label={t("actions.close")}
          >
            ×
          </button>
        )}

        <div className="sg-modal-header">
          <div className="sg-trigger">
            <span>{cardIcon}</span>
            <span>
              {isDrinks
                ? t("upload.triggerDrinks")
                : t("upload.triggerMenu")}
            </span>
          </div>
        </div>

        <h2 className="sg-modal-title">
          {isDrinks ? t("upload.titleDrinks") : t("upload.titleMenu")}
        </h2>
        <p className="menu-upload-intro">
          {isDrinks
            ? t("upload.introDrinks", { cardLabel, itemNoun })
            : t("upload.introMenu", { cardLabel, itemNoun })}
        </p>

        {stage === "idle" && (
          <label className="menu-upload-dropzone">
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFileSelected(f);
              }}
              style={{ display: "none" }}
            />
            <div className="menu-upload-dropzone-icon">📄</div>
            <div className="menu-upload-dropzone-title">
              {t("upload.dropzoneTitle")}
            </div>
            <div className="menu-upload-dropzone-sub">
              {t("upload.dropzoneSub")}
            </div>
          </label>
        )}

        {isProcessing && (
          <div className="menu-upload-processing">
            <div className="menu-upload-filename">
              <span>📎</span>
              <span>{fileName ?? t("upload.fileFallback")}</span>
            </div>
            <div className="menu-upload-steps">
              {steps.map((s, i) => {
                const current = stageIndex(stage);
                const done = i < current;
                const active = i === current;
                return (
                  <div
                    key={s.key}
                    className={`menu-upload-step ${
                      done ? "done" : active ? "active" : ""
                    }`}
                  >
                    <div className="menu-upload-step-indicator">
                      {done ? "✓" : active ? <Spinner /> : i + 1}
                    </div>
                    <span>{s.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="menu-upload-status">{stageLabel[stage]}</div>
            <div
              style={{
                fontSize: 12,
                color: "var(--tl)",
                textAlign: "center",
                marginTop: 8,
              }}
            >
              {t("upload.durationNote")}
            </div>
          </div>
        )}

        {stage === "error" && (
          <div className="menu-upload-processing">
            <div className="menu-upload-filename">
              <span>⚠️</span>
              <span>{fileName ?? t("upload.fileFallback")}</span>
            </div>
            <div
              style={{
                padding: "12px 14px",
                background: "var(--red-soft, #fee)",
                color: "var(--red, #b00)",
                borderRadius: 8,
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {errorMessage ?? t("upload.genericError")}
            </div>
            <div className="sg-actions sg-modal-actions">
              <button className="sg-btn primary" onClick={onClose}>
                {t("actions.close")}
              </button>
            </div>
          </div>
        )}

        {stage === "done" && (
          <div>
            <div className="menu-upload-done-banner">
              <strong>
                ✓ {t("upload.doneCount", { count: imported.length })}
              </strong>
              {imported.length > 0
                ? t("upload.doneTailSuccess")
                : t("upload.doneTailEmpty")}
            </div>
            {notes && (
              <div
                style={{
                  padding: "10px 12px",
                  background: "var(--bg, #FAF7F1)",
                  border: "1px solid var(--border, #E5DFD0)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--ts)",
                  marginBottom: 12,
                  fontStyle: "italic",
                }}
              >
                {t("upload.fillyNote", { notes })}
              </div>
            )}
            <div className="menu-upload-result-list">
              {imported.map((r) => (
                <div key={r.id} className="menu-upload-result-item">
                  <div>
                    <div className="menu-upload-result-name">{r.name}</div>
                    <div className="menu-upload-result-meta">
                      {r.category &&
                        (categoryLabelKey[r.category as Category]
                          ? t(categoryLabelKey[r.category as Category])
                          : r.category)}
                      {r.dietary_tags.length > 0 &&
                        " · " +
                          r.dietary_tags
                            .map((t) => t.replace("_", "-"))
                            .join(", ")}
                    </div>
                  </div>
                  <div className="menu-upload-result-price">
                    {r.price_cents !== null
                      ? `€${(r.price_cents / 100).toFixed(2).replace(".", ",")}`
                      : "—"}
                  </div>
                </div>
              ))}
            </div>
            <div className="sg-actions sg-modal-actions">
              <button className="sg-btn primary" onClick={onDone}>
                {t("actions.done")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Simpele CSS-spinner voor processing-steps.
function Spinner() {
  return <span className="menu-upload-spinner" aria-hidden />;
}

// ============================================================
// Edit/toevoeg-modal
// ============================================================

function MenuModal({
  item,
  isNew,
  saving,
  onChange,
  onSave,
  onDelete,
  onClose,
}: {
  item: MenuItem;
  isNew: boolean;
  // Tijdens een API-call (toevoegen/opslaan/verwijderen) zetten we de
  // knoppen en inputs op disabled zodat de gebruiker niet dubbel klikt.
  saving: boolean;
  onChange: (m: MenuItem) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("dash_menu_page");
  // Prijs als string input zodat komma/leeg toegestaan is; bij save
  // converteren we naar cents.
  const priceInput =
    item.price_cents === null
      ? ""
      : (item.price_cents / 100).toFixed(2).replace(".", ",");

  const updatePrice = (v: string) => {
    const normalized = v.replace(",", ".").trim();
    if (normalized === "") {
      onChange({ ...item, price_cents: null });
      return;
    }
    const num = parseFloat(normalized);
    if (Number.isFinite(num)) {
      onChange({ ...item, price_cents: Math.round(num * 100) });
    }
  };

  const toggleTag = (tag: string) => {
    const tags = item.dietary_tags.includes(tag)
      ? item.dietary_tags.filter((t) => t !== tag)
      : [...item.dietary_tags, tag];
    onChange({ ...item, dietary_tags: tags });
  };

  return (
    <div
      className="sg-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="sg-modal" onClick={(e) => e.stopPropagation()}>
        <button
          className="sg-modal-close"
          onClick={onClose}
          aria-label={t("actions.close")}
        >
          ×
        </button>

        <div className="sg-modal-header">
          <div className="sg-trigger">
            <span>🍽️</span>
            <span>{isNew ? t("modal.newDish") : t("modal.editDish")}</span>
          </div>
        </div>

        <h2 className="sg-modal-title">{item.name || t("modal.unnamedDish")}</h2>

        <div className="menu-form">
          <div className="menu-form-row">
            <label className="menu-form-label">{t("form.name")}</label>
            <input
              className="menu-form-input"
              type="text"
              value={item.name}
              onChange={(e) => onChange({ ...item, name: e.target.value })}
              placeholder={t("form.namePlaceholder")}
            />
          </div>

          <div className="menu-form-grid-2">
            <div className="menu-form-row">
              <label className="menu-form-label">{t("form.category")}</label>
              <select
                className="menu-form-input"
                value={item.category ?? "hoofd"}
                onChange={(e) =>
                  onChange({ ...item, category: e.target.value })
                }
              >
                {categoryOrder.map((c) => (
                  <option key={c} value={c}>
                    {t(categoryLabelKey[c as Category])}
                  </option>
                ))}
              </select>
            </div>
            <div className="menu-form-row">
              <label className="menu-form-label">{t("form.price")}</label>
              <input
                className="menu-form-input"
                type="text"
                inputMode="decimal"
                value={priceInput}
                onChange={(e) => updatePrice(e.target.value)}
                placeholder="18,95"
              />
            </div>
          </div>

          <div className="menu-form-row">
            <label className="menu-form-label">{t("form.description")}</label>
            <textarea
              className="menu-form-input"
              rows={3}
              value={item.description ?? ""}
              onChange={(e) =>
                onChange({ ...item, description: e.target.value || null })
              }
              placeholder={t("form.descriptionPlaceholder")}
            />
          </div>

          {/* Toggles: signature / seizoen / beschikbaar. Groene vink
              als de optie aanstaat, grijs kruisje als uit. */}
          <div className="menu-form-toggles">
            <label className="menu-toggle">
              <input
                type="checkbox"
                checked={item.is_signature}
                onChange={(e) =>
                  onChange({ ...item, is_signature: e.target.checked })
                }
              />
              <span className="menu-toggle-label">
                {t.rich("form.signatureToggle", {
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </span>
            </label>
            <label className="menu-toggle">
              <input
                type="checkbox"
                checked={item.is_seasonal}
                onChange={(e) =>
                  onChange({
                    ...item,
                    is_seasonal: e.target.checked,
                    season: e.target.checked ? item.season ?? "spring" : null,
                  })
                }
              />
              <span className="menu-toggle-label">
                {t.rich("form.seasonalToggle", {
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </span>
            </label>
            {item.is_seasonal && (
              <div className="menu-form-row menu-form-season">
                <label className="menu-form-label">{t("form.season")}</label>
                <select
                  className="menu-form-input"
                  value={item.season ?? "spring"}
                  onChange={(e) =>
                    onChange({ ...item, season: e.target.value })
                  }
                >
                  {seasonOptionKeys.map((s) => (
                    <option key={s.key} value={s.key}>
                      {t(s.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <label className="menu-toggle">
              <input
                type="checkbox"
                checked={item.is_available}
                onChange={(e) =>
                  onChange({ ...item, is_available: e.target.checked })
                }
              />
              <span className="menu-toggle-label">
                {t.rich("form.availableToggle", {
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </span>
            </label>
          </div>

          {/* Dieet-tags als klikbare chips. Multi-select. */}
          <div className="menu-form-row">
            <label className="menu-form-label">{t("form.dietaryTags")}</label>
            <div className="menu-tag-chips">
              {dietaryTagOptionKeys.map((opt) => {
                const active = item.dietary_tags.includes(opt.key);
                return (
                  <button
                    key={opt.key}
                    type="button"
                    className={`menu-tag-chip ${active ? "active" : ""}`}
                    onClick={() => toggleTag(opt.key)}
                  >
                    {t(opt.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="sg-actions sg-modal-actions menu-modal-actions">
          <button
            className="sg-btn primary"
            onClick={onSave}
            disabled={!item.name.trim() || saving}
          >
            {saving
              ? isNew
                ? t("modal.adding")
                : t("modal.saving")
              : isNew
                ? t("actions.add")
                : t("actions.save")}
          </button>
          <button className="sg-btn" onClick={onClose} disabled={saving}>
            {t("actions.cancel")}
          </button>
          {!isNew && (
            <button
              className="sg-btn danger menu-modal-delete"
              onClick={onDelete}
              disabled={saving}
            >
              {saving ? t("modal.deleting") : t("actions.remove")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
