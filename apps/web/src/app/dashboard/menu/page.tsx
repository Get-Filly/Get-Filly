"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchMenu, type MenuItem } from "../../../lib/api";
import { Skeleton } from "../_components/skeleton";

const categoryOrder = [
  "voorgerecht",
  "hoofd",
  "dessert",
  "drank",
  "overig",
] as const;

type Category = (typeof categoryOrder)[number];
type CategoryFilter = "alle" | Category;

const categoryLabel: Record<Category, string> = {
  voorgerecht: "Voorgerechten",
  hoofd: "Hoofdgerechten",
  dessert: "Desserts",
  drank: "Dranken",
  overig: "Overig",
};

const seasonLabel: Record<string, string> = {
  spring: "Lente",
  summer: "Zomer",
  autumn: "Herfst",
  winter: "Winter",
};

const seasonOptions: { key: string; label: string }[] = [
  { key: "spring", label: "Lente" },
  { key: "summer", label: "Zomer" },
  { key: "autumn", label: "Herfst" },
  { key: "winter", label: "Winter" },
];

// Standaardset dieet-tags die een horeca-eigenaar meestal nodig heeft.
// In productie mogelijk uit een centrale tags-tabel. De keys komen overeen
// met wat er in de DB wordt opgeslagen; de labels zijn voor de UI.
const dietaryTagOptions: { key: string; label: string }[] = [
  { key: "vega", label: "Vegetarisch" },
  { key: "vegan", label: "Veganistisch" },
  { key: "gluten_vrij", label: "Glutenvrij" },
  { key: "lactose_vrij", label: "Lactosevrij" },
  { key: "noten_vrij", label: "Notenvrij" },
];

function formatEuroFromCents(cents: number | null): string {
  if (cents === null) return "—";
  return `€${(cents / 100).toFixed(2).replace(".", ",")}`;
}

// Lege template voor een nieuw gerecht — gebruikt bij "+ Toevoegen".
function emptyDraft(): MenuItem {
  return {
    id: "",
    name: "",
    description: null,
    category: "hoofd",
    price_cents: null,
    is_signature: false,
    is_seasonal: false,
    season: null,
    is_available: true,
    dietary_tags: [],
  };
}

// Stages voor de menu-upload flow. "idle" = nog niets gedaan, daarna
// lopen we door de processing-fases heen en eindigen in "done".
type UploadStage =
  | "idle"
  | "reading"
  | "recognizing"
  | "categorizing"
  | "done";

// Mock-herkende gerechten — deze "herkent" Filly uit een geüploade menu.
// In productie komt dit uit Claude Vision API + OCR + AI-classificatie.
const MOCK_RECOGNIZED: Omit<MenuItem, "id">[] = [
  {
    name: "Tomatensoep met basilicum",
    category: "voorgerecht",
    price_cents: 650,
    description: "Klassiek, met croutons en een scheut room.",
    is_signature: false,
    is_seasonal: false,
    season: null,
    is_available: true,
    dietary_tags: ["vega"],
  },
  {
    name: "Bruschetta met tomaat & burrata",
    category: "voorgerecht",
    price_cents: 850,
    description: "Op geroosterd desembrood met verse basilicum.",
    is_signature: false,
    is_seasonal: false,
    season: null,
    is_available: true,
    dietary_tags: ["vega"],
  },
  {
    name: "Osso buco met risotto milanese",
    category: "hoofd",
    price_cents: 2295,
    description: "Langzaam gegaarde kalfsschenkel met safraanrisotto.",
    is_signature: false,
    is_seasonal: false,
    season: null,
    is_available: true,
    dietary_tags: [],
  },
  {
    name: "Pappardelle met truffel",
    category: "hoofd",
    price_cents: 1950,
    description: "Verse pappardelle, Italiaanse zwarte truffel, parmezaan.",
    is_signature: false,
    is_seasonal: false,
    season: null,
    is_available: true,
    dietary_tags: ["vega"],
  },
  {
    name: "Gegrilde zeebaars",
    category: "hoofd",
    price_cents: 2495,
    description: "Citrus-beurre blanc, seizoensgroenten, aardappelpuree.",
    is_signature: false,
    is_seasonal: false,
    season: null,
    is_available: true,
    dietary_tags: ["gluten_vrij"],
  },
  {
    name: "Tiramisu",
    category: "dessert",
    price_cents: 795,
    description: "Huisgemaakt, met espresso en marsala.",
    is_signature: false,
    is_seasonal: false,
    season: null,
    is_available: true,
    dietary_tags: ["vega"],
  },
  {
    name: "Crème brûlée",
    category: "dessert",
    price_cents: 850,
    description: "Klassiek, met vanillestokje uit Madagaskar.",
    is_signature: false,
    is_seasonal: false,
    season: null,
    is_available: true,
    dietary_tags: ["vega", "gluten_vrij"],
  },
  {
    name: "Verse muntthee",
    category: "drank",
    price_cents: 325,
    description: "Met honing en citroen.",
    is_signature: false,
    is_seasonal: false,
    season: null,
    is_available: true,
    dietary_tags: ["vega", "vegan"],
  },
];

export default function MenuPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<CategoryFilter>("alle");
  const [query, setQuery] = useState("");

  // Modal-state. selected = null betekent "modal dicht". Bij toevoegen
  // wordt een fresh draft gezet, bij bewerken de geselecteerde item.
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [isNew, setIsNew] = useState(false);

  // Upload-flow state. Zichtbaar wanneer uploadOpen=true. Stage volgt
  // de mock-verwerking: reading → recognizing → categorizing → done.
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadStage, setUploadStage] = useState<UploadStage>("idle");
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [recognizedItems, setRecognizedItems] = useState<
    Omit<MenuItem, "id">[]
  >([]);

  // Ids van items die aan de huidige menu-kaart gekoppeld zijn. Deze
  // items zijn afkomstig uit de upload en worden visueel gemarkeerd
  // als "Nieuw". Als de gebruiker de kaart verwijdert of vervangt,
  // worden precies deze items opgeruimd — handmatig toegevoegde
  // gerechten blijven staan.
  const [cardItemIds, setCardItemIds] = useState<Set<string>>(new Set());

  // Metadata over de huidige geüploade menu-kaart. Null = nog geen
  // kaart geüpload. Later: opslaan op restaurant-level (Supabase storage
  // bucket + tabel `menu_uploads`) zodat upload vanuit instellingen
  // hier ook zichtbaar is.
  const [uploadedCard, setUploadedCard] = useState<{
    fileName: string;
    uploadedAt: string;
    itemCount: number;
  } | null>(null);

  useEffect(() => {
    fetchMenu()
      .then((d) => {
        setItems(d);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

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

  const saveItem = () => {
    if (!editing) return;
    // Mock: update lokaal. Later: POST/PATCH naar backend + setItems
    // op basis van server-response.
    if (isNew) {
      const withId = {
        ...editing,
        id: `local-${Date.now()}`,
      };
      setItems((prev) => [...prev, withId]);
    } else {
      setItems((prev) =>
        prev.map((i) => (i.id === editing.id ? editing : i)),
      );
    }
    closeModal();
  };

  const deleteItem = () => {
    if (!editing || isNew) return;
    setItems((prev) => prev.filter((i) => i.id !== editing.id));
    closeModal();
  };

  // Upload-flow handlers.
  const openUpload = () => {
    setUploadOpen(true);
    setUploadStage("idle");
    setUploadFileName(null);
    setRecognizedItems([]);
  };

  const closeUpload = () => {
    setUploadOpen(false);
    setUploadStage("idle");
    setUploadFileName(null);
    setRecognizedItems([]);
  };

  // Mock: simuleer OCR + AI-herkenning met stappen. In productie wordt
  // het bestand naar de backend gestuurd die Claude Vision aanroept.
  const handleFileSelected = (file: File) => {
    setUploadFileName(file.name);
    setUploadStage("reading");
    setTimeout(() => {
      setUploadStage("recognizing");
      setTimeout(() => {
        setUploadStage("categorizing");
        setTimeout(() => {
          setRecognizedItems(MOCK_RECOGNIZED);
          setUploadStage("done");
        }, 800);
      }, 1000);
    }, 700);
  };

  // Verwijder de kaart én de gerechten die uit de upload kwamen.
  // Handmatig toegevoegde gerechten (niet in cardItemIds) blijven
  // staan. Bevestigt via browser-dialog om per-ongeluk klikken te
  // voorkomen.
  const removeUploadedCard = () => {
    if (!uploadedCard) return;
    const count = cardItemIds.size;
    const ok = window.confirm(
      `Weet je zeker dat je de menu-kaart wil verwijderen?\n\n` +
        `De ${count} gerechten die uit deze kaart geïmporteerd zijn ` +
        `worden ook verwijderd. Handmatig toegevoegde gerechten ` +
        `blijven staan.`,
    );
    if (!ok) return;
    setItems((prev) => prev.filter((i) => !cardItemIds.has(i.id)));
    setCardItemIds(new Set());
    setUploadedCard(null);
  };

  const importRecognized = () => {
    // Bij een nieuwe upload: verwijder eerst eventuele items van de
    // vorige kaart (kaart wordt vervangen, items moeten mee). Daarna
    // voeg de nieuwe items toe en track hun ids als actieve kaart-set.
    const newIds = new Set<string>();
    const newItems = recognizedItems.map((r) => {
      const id = `imported-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      newIds.add(id);
      return { ...r, id };
    });
    setItems((prev) => [
      ...prev.filter((i) => !cardItemIds.has(i.id)),
      ...newItems,
    ]);
    setCardItemIds(newIds);
    // Sla kaart-metadata op zodat de status-banner zichtbaar wordt.
    setUploadedCard({
      fileName: uploadFileName ?? "menukaart.pdf",
      uploadedAt: new Date().toISOString(),
      itemCount: newItems.length,
    });
    closeUpload();
  };

  const filtered = useMemo(() => {
    let out = items;
    if (filter !== "alle") {
      out = out.filter((i) => i.category === filter);
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
      const cat = item.category ?? "overig";
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

  const stats = useMemo(() => {
    return {
      total: items.length,
      signature: items.filter((i) => i.is_signature).length,
      seasonal: items.filter((i) => i.is_seasonal).length,
      avgPrice:
        items.length > 0
          ? Math.round(
              items.reduce((s, i) => s + (i.price_cents ?? 0), 0) /
                items.length,
            )
          : 0,
    };
  }, [items]);

  // Top-3 signature gerechten die Filly het vaakst in zijn voorstellen
  // gebruikt — mock, maar geeft een concreet "Filly waardeert dit"-signaal.
  const fillyTop = useMemo(() => {
    return items.filter((i) => i.is_signature).slice(0, 3);
  }, [items]);

  const countPer = (c: CategoryFilter) => {
    if (c === "alle") return items.length;
    return items.filter((i) => i.category === c).length;
  };

  return (
    <div className="page-full">
      {/* Titel-rij met primary-CTA rechts: "+ Gerecht toevoegen" is de
          belangrijkste actie op deze pagina, altijd direct zichtbaar. */}
      <div className="page-header-row">
        <div>
          <div className="page-title">Menu</div>
          <div className="page-subtitle">
            Jouw huidige kaart. Filly gebruikt deze gerechten in
            campagne-teksten — dus &quot;3-gangen met asperges voor
            €24,50&quot; i.p.v. generieke tekst.
          </div>
        </div>
        <div className="menu-header-actions">
          {/* Upload-knop alleen wanneer er nog geen menu-kaart is.
              Na upload is de status-banner hieronder de plek om te
              vervangen — voorkomt dubbele knoppen. */}
          {!uploadedCard && (
            <button className="btn-secondary-dash" onClick={openUpload}>
              📄 Upload menu-kaart
            </button>
          )}
          <button className="btn-primary-dash" onClick={openAdd}>
            ＋ Gerecht toevoegen
          </button>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-card-label">Totaal gerechten</div>
          <div className="stat-card-val">
            {loading ? <Skeleton height={22} width="40%" /> : stats.total}
          </div>
        </div>
        <div className="stat-card stat-card-filly">
          <div className="stat-card-label">Signature dishes</div>
          <div className="stat-card-val">
            {loading ? <Skeleton height={22} width="40%" /> : stats.signature}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Seizoensgerechten</div>
          <div className="stat-card-val">
            {loading ? <Skeleton height={22} width="40%" /> : stats.seasonal}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Gem. prijs</div>
          <div className="stat-card-val">
            {loading ? (
              <Skeleton height={22} width="50%" />
            ) : (
              formatEuroFromCents(stats.avgPrice)
            )}
          </div>
        </div>
      </div>

      {/* Status-banner voor geüploade menu-kaart: groene check + filename
          + datum + "vervang"-knop. Alleen zichtbaar zodra er een kaart
          is, vanuit deze pagina of later vanuit de instellingen. */}
      {uploadedCard && (
        <div className="menu-card-status">
          <div className="menu-card-status-icon">✓</div>
          <div className="menu-card-status-body">
            <div className="menu-card-status-title">Menu-kaart actief</div>
            <div className="menu-card-status-meta">
              <span>{uploadedCard.fileName}</span>
              <span>·</span>
              <span>
                {new Date(uploadedCard.uploadedAt).toLocaleDateString(
                  "nl-NL",
                  { day: "numeric", month: "long", year: "numeric" },
                )}
              </span>
              <span>·</span>
              <span>{uploadedCard.itemCount} gerechten geïmporteerd</span>
            </div>
          </div>
          <div className="menu-card-status-actions">
            <button
              className="btn-secondary-dash menu-card-status-btn"
              onClick={openUpload}
            >
              Nieuwe menu-kaart uploaden
            </button>
            <button
              className="menu-card-status-remove"
              onClick={removeUploadedCard}
            >
              Verwijderen
            </button>
          </div>
        </div>
      )}

      {/* Filly-tip blok: laat zien dat het menu de "grondstof" is voor
          wat Filly in campagnes gebruikt — signaleert belang van goed
          onderhouden menu-data. */}
      {!loading && fillyTop.length > 0 && (
        <div className="menu-filly-tip">
          <div>
            <div className="menu-filly-tip-label">
              🌱 Filly&apos;s favorieten deze maand
            </div>
            <div className="menu-filly-tip-body">
              Deze gerechten gebruikt Filly het vaakst in zijn voorstellen:{" "}
              <strong>
                {fillyTop.map((i) => i.name).join(" · ")}
              </strong>
              . Houd ze up-to-date voor de beste campagnes.
            </div>
          </div>
        </div>
      )}

      {/* Filter-rij: categorie-tabs links, zoekveld rechts */}
      <div className="menu-filters">
        <div className="tabs">
          {(["alle", ...categoryOrder] as CategoryFilter[]).map((c) => (
            <button
              key={c}
              className={`tab-btn ${filter === c ? "active" : ""}`}
              onClick={() => setFilter(c)}
            >
              {c === "alle" ? "Alle" : categoryLabel[c as Category]} (
              {countPer(c)})
            </button>
          ))}
        </div>
      </div>

      <input
        type="search"
        placeholder="Zoek gerecht op naam of beschrijving..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="search-input"
      />

      {loading ? (
        <div>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={60} style={{ marginBottom: 8 }} />
          ))}
        </div>
      ) : error ? (
        <div className="table-empty" style={{ color: "var(--red)" }}>
          Fout: {error}
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🍽️</div>
          <div className="empty-title">Nog geen menu</div>
          <div className="empty-desc">
            Voeg gerechten toe zodat Filly ze kan gebruiken in campagnes.
          </div>
          <button className="btn-primary-dash" onClick={openAdd}>
            Gerecht toevoegen
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="table-empty">
          Geen gerechten gevonden met deze filters.
        </div>
      ) : (
        <div>
          {Array.from(grouped.entries()).map(([cat, list]) => {
            const catLabel =
              categoryLabel[cat as Category] ?? cat.charAt(0).toUpperCase() + cat.slice(1);
            const catAvg =
              list.length > 0
                ? Math.round(
                    list.reduce((s, i) => s + (i.price_cents ?? 0), 0) /
                      list.length,
                  )
                : 0;
            return (
              <div key={cat} className="menu-category-block">
                <div className="menu-category-head">
                  <h3 className="menu-category-title">{catLabel}</h3>
                  <div className="menu-category-meta">
                    {list.length}{" "}
                    {list.length === 1 ? "gerecht" : "gerechten"} · gem.{" "}
                    {formatEuroFromCents(catAvg)}
                  </div>
                </div>
                <div className="menu-list">
                  {list.map((item) => (
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
                          {cardItemIds.has(item.id) && (
                            <span className="menu-item-badge-new">Nieuw</span>
                          )}
                          {!item.is_available && (
                            <span className="menu-item-badge-soft">
                              Tijdelijk uit
                            </span>
                          )}
                          {item.is_signature && (
                            <span className="menu-item-badge-signature">
                              Signature
                            </span>
                          )}
                          {item.is_seasonal && item.season && (
                            <span className="menu-item-badge-season">
                              {seasonLabel[item.season]}
                            </span>
                          )}
                          {item.dietary_tags.map((t) => (
                            <span key={t} className="menu-item-badge-diet">
                              {t.replace("_", "-")}
                            </span>
                          ))}
                        </div>
                        {item.description && (
                          <div className="menu-item-desc">
                            {item.description}
                          </div>
                        )}
                      </div>
                      <div className="menu-item-price">
                        {formatEuroFromCents(item.price_cents)}
                      </div>
                    </button>
                  ))}
                </div>
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
          onChange={setEditing}
          onSave={saveItem}
          onDelete={deleteItem}
          onClose={closeModal}
        />
      )}

      {/* Upload-modal: mock AI-herkenning van een geüploade menu-kaart.
          Flow: kies bestand → Filly "leest" → gerechten herkennen →
          categoriseren → resultaat + toevoegen-knop. */}
      {uploadOpen && (
        <UploadMenuModal
          stage={uploadStage}
          fileName={uploadFileName}
          recognized={recognizedItems}
          onFileSelected={handleFileSelected}
          onImport={importRecognized}
          onClose={closeUpload}
        />
      )}
    </div>
  );
}

// ============================================================
// Upload-modal (menu-kaart importeren via AI)
// ============================================================

function UploadMenuModal({
  stage,
  fileName,
  recognized,
  onFileSelected,
  onImport,
  onClose,
}: {
  stage: UploadStage;
  fileName: string | null;
  recognized: Omit<MenuItem, "id">[];
  onFileSelected: (file: File) => void;
  onImport: () => void;
  onClose: () => void;
}) {
  const isProcessing =
    stage === "reading" ||
    stage === "recognizing" ||
    stage === "categorizing";

  const stageLabel: Record<UploadStage, string> = {
    idle: "",
    reading: "Bestand lezen…",
    recognizing: "Gerechten herkennen…",
    categorizing: "Categorieën indelen…",
    done: "Klaar",
  };

  // Volgorde van de processing-stappen voor de UI-indicator.
  const steps: { key: UploadStage; label: string }[] = [
    { key: "reading", label: "Bestand lezen" },
    { key: "recognizing", label: "Gerechten herkennen" },
    { key: "categorizing", label: "Categorieën indelen" },
  ];

  const stageIndex = (s: UploadStage) =>
    s === "reading" ? 0 : s === "recognizing" ? 1 : s === "categorizing" ? 2 : 3;

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
          aria-label="Sluiten"
        >
          ×
        </button>

        <div className="sg-modal-header">
          <div className="sg-trigger">
            <span>📄</span>
            <span>Menu-kaart importeren</span>
          </div>
        </div>

        <h2 className="sg-modal-title">Upload je menu</h2>
        <p className="menu-upload-intro">
          Upload een PDF of foto van je menu-kaart. Filly herkent de
          gerechten automatisch en maakt je menu compleet — je hoeft ze
          alleen nog te controleren.
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
              Sleep hier je menu-kaart of klik om te kiezen
            </div>
            <div className="menu-upload-dropzone-sub">
              PDF, JPG of PNG — max. 10 MB
            </div>
          </label>
        )}

        {isProcessing && (
          <div className="menu-upload-processing">
            <div className="menu-upload-filename">
              <span>📎</span>
              <span>{fileName ?? "bestand"}</span>
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
          </div>
        )}

        {stage === "done" && (
          <div>
            <div className="menu-upload-done-banner">
              <strong>✓ {recognized.length} gerechten herkend</strong> —
              controleer de lijst en voeg toe aan je menu.
            </div>
            <div className="menu-upload-result-list">
              {recognized.map((r, i) => (
                <div key={i} className="menu-upload-result-item">
                  <div>
                    <div className="menu-upload-result-name">{r.name}</div>
                    <div className="menu-upload-result-meta">
                      {r.category &&
                        (categoryLabel[r.category as Category] ??
                          r.category)}
                      {r.dietary_tags.length > 0 &&
                        " · " +
                          r.dietary_tags.map((t) => t.replace("_", "-")).join(", ")}
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
              <button className="sg-btn primary" onClick={onImport}>
                Voeg toe aan menu
              </button>
              <button className="sg-btn" onClick={onClose}>
                Annuleren
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
  onChange,
  onSave,
  onDelete,
  onClose,
}: {
  item: MenuItem;
  isNew: boolean;
  onChange: (m: MenuItem) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
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
          aria-label="Sluiten"
        >
          ×
        </button>

        <div className="sg-modal-header">
          <div className="sg-trigger">
            <span>🍽️</span>
            <span>{isNew ? "Nieuw gerecht" : "Gerecht bewerken"}</span>
          </div>
        </div>

        <h2 className="sg-modal-title">{item.name || "Naamloos gerecht"}</h2>

        <div className="menu-form">
          <div className="menu-form-row">
            <label className="menu-form-label">Naam</label>
            <input
              className="menu-form-input"
              type="text"
              value={item.name}
              onChange={(e) => onChange({ ...item, name: e.target.value })}
              placeholder="Bijv. Rundersukade in rode wijn"
            />
          </div>

          <div className="menu-form-grid-2">
            <div className="menu-form-row">
              <label className="menu-form-label">Categorie</label>
              <select
                className="menu-form-input"
                value={item.category ?? "hoofd"}
                onChange={(e) =>
                  onChange({ ...item, category: e.target.value })
                }
              >
                {categoryOrder.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel[c as Category]}
                  </option>
                ))}
              </select>
            </div>
            <div className="menu-form-row">
              <label className="menu-form-label">Prijs (€)</label>
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
            <label className="menu-form-label">Beschrijving</label>
            <textarea
              className="menu-form-input"
              rows={3}
              value={item.description ?? ""}
              onChange={(e) =>
                onChange({ ...item, description: e.target.value || null })
              }
              placeholder="Korte omschrijving — wordt door Filly gebruikt in campagne-teksten."
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
                <strong>Signature</strong> — onze handtekening
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
                <strong>Seizoensgerecht</strong>
              </span>
            </label>
            {item.is_seasonal && (
              <div className="menu-form-row menu-form-season">
                <label className="menu-form-label">Seizoen</label>
                <select
                  className="menu-form-input"
                  value={item.season ?? "spring"}
                  onChange={(e) =>
                    onChange({ ...item, season: e.target.value })
                  }
                >
                  {seasonOptions.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
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
                <strong>Beschikbaar</strong> — staat op de kaart
              </span>
            </label>
          </div>

          {/* Dieet-tags als klikbare chips. Multi-select. */}
          <div className="menu-form-row">
            <label className="menu-form-label">Dieet-tags</label>
            <div className="menu-tag-chips">
              {dietaryTagOptions.map((t) => {
                const active = item.dietary_tags.includes(t.key);
                return (
                  <button
                    key={t.key}
                    type="button"
                    className={`menu-tag-chip ${active ? "active" : ""}`}
                    onClick={() => toggleTag(t.key)}
                  >
                    {t.label}
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
            disabled={!item.name.trim()}
          >
            {isNew ? "Toevoegen" : "Opslaan"}
          </button>
          <button className="sg-btn" onClick={onClose}>
            Annuleren
          </button>
          {!isNew && (
            <button
              className="sg-btn danger menu-modal-delete"
              onClick={onDelete}
            >
              Verwijderen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
