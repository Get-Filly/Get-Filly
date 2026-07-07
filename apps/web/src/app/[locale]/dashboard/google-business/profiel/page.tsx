"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useLocaleTag } from "@/lib/locale-format";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "../../_components/skeleton";
import {
  fetchGoogleProfileMine,
  fetchRestaurant,
  googleBusinessCreatePost,
  googleBusinessLocations,
  googleBusinessReplyReview,
  googleBusinessReviews,
  googleBusinessUpdateDescription,
  googleBusinessUpdateHours,
  googleBusinessUpdateSpecialDays,
  googleBusinessUploadMedia,
  reviewsSuggestReplyForText,
  type GoogleBusinessLocation,
  type GoogleDayHours,
  type GooglePlaceDetails,
  type GoogleProfileMine,
  type GoogleReview,
  type Restaurant,
  type RestaurantMediaItem,
} from "@/lib/api";
import { MediaLibraryPicker } from "../../_components/media-library-picker";

// ============================================================
// /dashboard/google-business/profiel — Google Business Profiel preview
// ============================================================
//
// Doel (Floris-wens 2026-05-29): alvast laten zien WAT er straks op
// deze pagina staat, zodat zodra de Google Business Profile OAuth live
// is (fase E/F) de structuur al klaar is en alleen de bewerk-acties
// hoeven te worden aangezet.
//
// Wat NU werkt: alle read-only velden worden gevuld met de openbare
// Google-Maps-data die we al via de Places API cachen
// (restaurants.google_place_data, mig 0034). Zo ziet de eigenaar
// meteen z'n echte profiel-gegevens.
//
// Wat na de koppeling komt: bewerken van die velden (push naar Google)
// + features die de Places API niet geeft (posts, Q&A, inzichten,
// foto-upload). Die staan hier als "Beschikbaar na koppeling"-blokken
// zodat de roadmap zichtbaar is.
//
// De koppeling zelf wordt beheerd via Account → Koppelingen (net als
// bij de andere Vindbaarheid-features); deze pagina toont 'm alleen.
// ============================================================

// Mapt Google's primaryType (bv. "italian_restaurant") naar iets
// leesbaars. Beperkte set — onbekende types tonen we opgeschoond
// (underscores → spaties).
function prettyType(type: string | null): string {
  if (!type) return "—";
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Eén veld-rij: label links, waarde rechts. value null/leeg → "—".
function FieldRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "var(--space-4)",
        padding: "10px 0",
        borderBottom: "1px solid var(--border, #E5DFD0)",
        fontSize: 14,
      }}
    >
      <span style={{ color: "var(--tl, #6B6F71)", flexShrink: 0 }}>
        {label}
      </span>
      <span
        style={{
          color: "var(--text, #18181B)",
          textAlign: "right",
          fontWeight: 500,
        }}
      >
        {value && value.trim() ? value : "—"}
      </span>
    </div>
  );
}

// Sectie-kop met titel + een badge die de databron/status aangeeft.
function SectionCard({
  title,
  badge,
  children,
}: {
  title: string;
  badge: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card elevated style={{ marginBottom: "var(--space-4)" }}>
      <CardBody>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "var(--space-2)",
            marginBottom: "var(--space-2)",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 16 }}>{title}</div>
          {badge}
        </div>
        {children}
      </CardBody>
    </Card>
  );
}

// Formatteert een ISO-datum (YYYY-MM-DD) naar leesbaar NL, bv.
// "25 december 2026". Faalt stil terug op de ruwe string.
function formatClosedDate(iso: string, tag: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(tag, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function GoogleProfilePreviewPage() {
  const t = useTranslations("dash_google_business_profiel_page");
  const localeTag = useLocaleTag();
  // Badge: read-only data die we nu al hebben.
  const visibleBadge = <Badge variant="success">{t("badge.visible")}</Badge>;
  // Badge: veld is leesbaar maar aanpassen + pushen naar Google vereist de
  // OAuth-koppeling (fase E/F).
  const editLaterBadge = (
    <Badge variant="neutral">{t("badge.editLater")}</Badge>
  );
  // Badge: veld is NU bewerkbaar en wordt naar Google gepusht (na koppeling).
  const editableBadge = (
    <Badge variant="success">{t("badge.editable")}</Badge>
  );
  // Badge: feature bestaat alleen ná koppeling (geen Places-equivalent).
  const afterConnectBadge = (
    <Badge variant="neutral">{t("badge.afterConnect")}</Badge>
  );

  const [mine, setMine] = useState<GoogleProfileMine | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);

  // ---- Bewerkbare Google-omschrijving (de business.manage-write) ----
  // null = nog niet geladen, [] = geladen maar geen locatie gevonden.
  const [locations, setLocations] = useState<GoogleBusinessLocation[] | null>(
    null,
  );
  const [locIndex, setLocIndex] = useState(0);
  const [descDraft, setDescDraft] = useState("");
  const [descSaving, setDescSaving] = useState(false);
  const [descStatus, setDescStatus] = useState<"idle" | "saved" | "error">(
    "idle",
  );
  const [descMessage, setDescMessage] = useState<string | null>(null);

  // Bewerkbare openingstijden (regularHours-write).
  const [hoursDraft, setHoursDraft] = useState<GoogleDayHours[]>([]);
  const [hoursSaving, setHoursSaving] = useState(false);
  const [hoursStatus, setHoursStatus] = useState<"idle" | "saved" | "error">(
    "idle",
  );
  const [hoursMessage, setHoursMessage] = useState<string | null>(null);

  // Speciale dagen (sluitingsdata) naar Google pushen (specialHours-write).
  const [specialSaving, setSpecialSaving] = useState(false);
  const [specialStatus, setSpecialStatus] = useState<
    "idle" | "saved" | "error"
  >("idle");
  const [specialMessage, setSpecialMessage] = useState<string | null>(null);

  // Reviews (Google My Business API v4). Op aanvraag geladen zodat de pagina
  // niet faalt als de v4-API nog niet is ingeschakeld.
  const [reviews, setReviews] = useState<GoogleReview[] | null>(null);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState<string | null>(null);
  // Antwoord-concept + bezig-status per review (op review-naam).
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyingName, setReplyingName] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  // Welke review laat Filly nu een concept voor genereren (op review-naam).
  const [suggestingName, setSuggestingName] = useState<string | null>(null);

  // Google Post (localPosts.create).
  const [postDraft, setPostDraft] = useState("");
  const [postSaving, setPostSaving] = useState(false);
  const [postStatus, setPostStatus] = useState<"idle" | "saved" | "error">(
    "idle",
  );
  const [postMessage, setPostMessage] = useState<string | null>(null);

  // Foto-beheer: upload naar het profiel (v4 media.create).
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const [photoCategory, setPhotoCategory] = useState<
    "COVER" | "LOGO" | "ADDITIONAL"
  >("ADDITIONAL");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoStatus, setPhotoStatus] = useState<"idle" | "saved" | "error">(
    "idle",
  );
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([fetchGoogleProfileMine(), fetchRestaurant()])
      .then(([mineRes, restRes]) => {
        if (cancelled) return;
        if (mineRes.status === "fulfilled") setMine(mineRes.value);
        if (restRes.status === "fulfilled") setRestaurant(restRes.value);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Locaties + huidige omschrijving ophalen zodra de koppeling verbonden is.
  // Losse effect (niet in de eerste fetch) omdat het van de connected-status
  // afhangt en een andere (schrijfbare) API raakt.
  useEffect(() => {
    if (!mine?.connected) return;
    let cancelled = false;
    googleBusinessLocations()
      .then((res) => {
        if (cancelled) return;
        setLocations(res.locations);
        setLocIndex(0);
        setDescDraft(res.locations[0]?.description ?? "");
        setHoursDraft(res.locations[0]?.hours ?? []);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setLocations([]);
        setDescStatus("error");
        setDescMessage(t("description.loadError", { reason: e.message }));
      });
    return () => {
      cancelled = true;
    };
  }, [mine?.connected, t]);

  // Schrijft de bewerkte omschrijving terug naar Google (locations.patch).
  const handleSaveDescription = async () => {
    const loc = locations?.[locIndex];
    if (!loc) return;
    setDescSaving(true);
    setDescStatus("idle");
    setDescMessage(null);
    try {
      const res = await googleBusinessUpdateDescription(loc.name, descDraft);
      // Lokale kopie bijwerken zodat de char-count/legenda blijft kloppen.
      setLocations((prev) =>
        prev
          ? prev.map((l, i) =>
              i === locIndex ? { ...l, description: res.description } : l,
            )
          : prev,
      );
      setDescDraft(res.description);
      setDescStatus("saved");
      setDescMessage(t("description.saved"));
    } catch (e) {
      setDescStatus("error");
      setDescMessage((e as Error).message);
    } finally {
      setDescSaving(false);
    }
  };

  // Eén weekdag in de openingstijden-editor bijwerken.
  const updateDay = (i: number, patch: Partial<GoogleDayHours>) => {
    setHoursDraft((prev) =>
      prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)),
    );
    setHoursStatus("idle");
  };

  // Schrijft de weekopeningstijden terug naar Google (regularHours).
  const handleSaveHours = async () => {
    const loc = locations?.[locIndex];
    if (!loc) return;
    setHoursSaving(true);
    setHoursStatus("idle");
    setHoursMessage(null);
    try {
      const res = await googleBusinessUpdateHours(loc.name, hoursDraft);
      setHoursDraft(res.hours);
      setLocations((prev) =>
        prev
          ? prev.map((l, i) =>
              i === locIndex ? { ...l, hours: res.hours } : l,
            )
          : prev,
      );
      setHoursStatus("saved");
      setHoursMessage(t("hours.saved"));
    } catch (e) {
      setHoursStatus("error");
      setHoursMessage((e as Error).message);
    } finally {
      setHoursSaving(false);
    }
  };

  // Zet de (toekomstige) sluitingsdata als specialHours op de listing.
  const handleSaveSpecialDays = async () => {
    const loc = locations?.[locIndex];
    if (!loc) return;
    setSpecialSaving(true);
    setSpecialStatus("idle");
    setSpecialMessage(null);
    try {
      const res = await googleBusinessUpdateSpecialDays(loc.name, closedDates);
      setSpecialStatus("saved");
      setSpecialMessage(t("specialDays.saved", { count: res.count }));
    } catch (e) {
      setSpecialStatus("error");
      setSpecialMessage((e as Error).message);
    } finally {
      setSpecialSaving(false);
    }
  };

  // Reviews van de geselecteerde locatie laden (v4-API).
  const handleLoadReviews = async () => {
    const loc = locations?.[locIndex];
    if (!loc) return;
    setReviewsLoading(true);
    setReviewsError(null);
    try {
      const res = await googleBusinessReviews(loc.name);
      setReviews(res.reviews);
    } catch (e) {
      setReviews(null);
      setReviewsError((e as Error).message);
    } finally {
      setReviewsLoading(false);
    }
  };

  // Antwoord op één review plaatsen (v4 reviews.reply).
  const handleReply = async (reviewName: string) => {
    const comment = (replyDrafts[reviewName] ?? "").trim();
    if (!comment) return;
    setReplyingName(reviewName);
    setReplyError(null);
    try {
      const res = await googleBusinessReplyReview(reviewName, comment);
      // Antwoord lokaal tonen + concept wissen.
      setReviews((prev) =>
        prev
          ? prev.map((r) =>
              r.name === reviewName ? { ...r, reply: res.comment } : r,
            )
          : prev,
      );
      setReplyDrafts((prev) => {
        const next = { ...prev };
        delete next[reviewName];
        return next;
      });
    } catch (e) {
      setReplyError((e as Error).message);
    } finally {
      setReplyingName(null);
    }
  };

  // Filly een concept-antwoord laten genereren voor een review; vult het
  // antwoordveld dat de eigenaar daarna zelf bewerkt en goedkeurt.
  const handleSuggestReply = async (r: GoogleReview) => {
    setSuggestingName(r.name);
    setReplyError(null);
    try {
      const { suggestion } = await reviewsSuggestReplyForText(
        r.stars,
        r.comment,
        r.reviewer,
      );
      setReplyDrafts((prev) => ({ ...prev, [r.name]: suggestion }));
    } catch (e) {
      setReplyError((e as Error).message);
    } finally {
      setSuggestingName(null);
    }
  };

  // Foto uit de bibliotheek uploaden naar het Google-profiel.
  const handlePickPhoto = async (item: RestaurantMediaItem) => {
    setPhotoPickerOpen(false);
    const loc = locations?.[locIndex];
    if (!loc || !item.url) return;
    setPhotoUploading(true);
    setPhotoStatus("idle");
    setPhotoMessage(null);
    try {
      await googleBusinessUploadMedia(loc.name, item.url, photoCategory);
      setPhotoStatus("saved");
      setPhotoMessage(t("photoManagement.saved"));
    } catch (e) {
      setPhotoStatus("error");
      setPhotoMessage((e as Error).message);
    } finally {
      setPhotoUploading(false);
    }
  };

  // Een Google Post plaatsen op de geselecteerde locatie.
  const handleCreatePost = async () => {
    const loc = locations?.[locIndex];
    if (!loc || !postDraft.trim()) return;
    setPostSaving(true);
    setPostStatus("idle");
    setPostMessage(null);
    try {
      await googleBusinessCreatePost(loc.name, postDraft.trim());
      setPostDraft("");
      setPostStatus("saved");
      setPostMessage(t("posts.saved"));
    } catch (e) {
      setPostStatus("error");
      setPostMessage((e as Error).message);
    } finally {
      setPostSaving(false);
    }
  };

  const p: GooglePlaceDetails | null = mine?.data ?? null;
  const connected = mine?.connected ?? false;
  // De geselecteerde, via de Google-API gelezen locatie (null tot geladen).
  const loc =
    connected && locations && locations[locIndex] ? locations[locIndex] : null;

  // Speciale dagen / sluitingsdata uit account-instellingen. Alleen
  // datums van vandaag of later tonen (verleden is niet relevant voor
  // Google's special hours), oplopend gesorteerd.
  const todayIso = new Date().toISOString().slice(0, 10);
  const closedDates = (restaurant?.closed_dates ?? [])
    .filter((d) => d >= todayIso)
    .sort();

  return (
    <div className="page-full">
      <Link
        href="/dashboard/google-business"
        style={{
          fontSize: 13,
          color: "var(--ts)",
          textDecoration: "none",
          marginBottom: 14,
          display: "inline-block",
        }}
      >
        {t("backToFindability")}
      </Link>
      <PageHeader title={t("title")} />

      {/* Uitleg-banner: wat zien we nu vs wat komt er na de koppeling. */}
      <div
        style={{
          padding: "12px 16px",
          marginBottom: "var(--space-4)",
          background: "var(--color-white, #FFFFFF)",
          border: "1px solid var(--border, #E5DFD0)",
          borderRadius: "var(--rs, 8px)",
          boxShadow: "inset 4px 0 0 0 #1F4A2D",
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--text, #18181B)",
        }}
      >
        <strong>
          {connected ? t("banner.titleConnected") : t("banner.titlePreview")}
        </strong>{" "}
        {t.rich("banner.body", {
          link: (chunks) => (
            <Link
              href="/dashboard/account?tab=koppelingen"
              style={{
                color: "var(--color-brand, #1F4A2D)",
                fontWeight: 600,
              }}
            >
              {chunks}
            </Link>
          ),
        })}
      </div>

      {loading ? (
        <>
          <Skeleton style={{ height: 160, marginBottom: 16 }} />
          <Skeleton style={{ height: 160, marginBottom: 16 }} />
        </>
      ) : (
        <>
          {/* ---- Basisgegevens ----
              Verbonden → gelezen via de geauthenticeerde Business Profile API
              (scène 5 "read"). Niet verbonden → openbare Places-data. */}
          <SectionCard
            title={t("basics.title")}
            badge={connected ? visibleBadge : editLaterBadge}
          >
            {connected && loc ? (
              <>
                <FieldRow label={t("basics.name")} value={loc.title} />
                <FieldRow
                  label={t("basics.category")}
                  value={loc.categories.length ? loc.categories.join(", ") : null}
                />
                <FieldRow label={t("basics.phone")} value={loc.phone} />
                <FieldRow label={t("basics.website")} value={loc.website} />
                <FieldRow label={t("basics.address")} value={loc.address} />
              </>
            ) : (
              <>
                <FieldRow label={t("basics.name")} value={p?.displayName} />
                <FieldRow
                  label={t("basics.category")}
                  value={prettyType(p?.primaryType ?? null)}
                />
                <FieldRow
                  label={t("basics.phone")}
                  value={p?.internationalPhoneNumber}
                />
                <FieldRow label={t("basics.website")} value={p?.websiteUri} />
                <FieldRow
                  label={t("basics.address")}
                  value={p?.formattedAddress}
                />
              </>
            )}
          </SectionCard>

          {/* ---- Openingstijden ----
              Verbonden → per-dag editor die via regularHours naar Google
              wordt geschreven. Niet verbonden → read-only Places-tekst. */}
          <SectionCard
            title={t("hours.title")}
            badge={connected ? editableBadge : editLaterBadge}
          >
            {connected ? (
              locations === null ? (
                <Skeleton style={{ height: 200 }} />
              ) : locations.length === 0 ? (
                <div style={{ fontSize: 14, color: "var(--tl, #6B6F71)" }}>
                  {descMessage ?? t("description.noLocation")}
                </div>
              ) : (
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--tl, #6B6F71)",
                      marginBottom: 10,
                    }}
                  >
                    {t("hours.editableHint")}
                  </div>
                  {hoursDraft.map((d, i) => (
                    <div
                      key={d.day}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                        padding: "8px 0",
                        borderBottom: "1px solid var(--border, #E5DFD0)",
                      }}
                    >
                      <label
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          width: 150,
                          fontSize: 14,
                          cursor: "pointer",
                          marginBottom: 0,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={d.open}
                          onChange={(e) =>
                            updateDay(i, { open: e.target.checked })
                          }
                        />
                        {t(`hours.days.${d.day}`)}
                      </label>
                      {d.open ? (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <input
                            type="time"
                            value={d.openTime}
                            onChange={(e) =>
                              updateDay(i, { openTime: e.target.value })
                            }
                            style={{
                              padding: "6px 8px",
                              border: "1px solid var(--border, #E5DFD0)",
                              borderRadius: 6,
                              fontSize: 14,
                              fontFamily: "inherit",
                            }}
                          />
                          <span style={{ fontSize: 13, color: "var(--tl)" }}>
                            {t("hours.to")}
                          </span>
                          <input
                            type="time"
                            value={d.closeTime}
                            onChange={(e) =>
                              updateDay(i, { closeTime: e.target.value })
                            }
                            style={{
                              padding: "6px 8px",
                              border: "1px solid var(--border, #E5DFD0)",
                              borderRadius: 6,
                              fontSize: 14,
                              fontFamily: "inherit",
                            }}
                          />
                        </div>
                      ) : (
                        <span
                          style={{ fontSize: 13, color: "var(--tl, #6B6F71)" }}
                        >
                          {t("hours.closedLabel")}
                        </span>
                      )}
                    </div>
                  ))}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: 10,
                      marginTop: 12,
                    }}
                  >
                    {hoursMessage && (
                      <span
                        style={{
                          fontSize: 13,
                          color:
                            hoursStatus === "error"
                              ? "var(--red, #DC2626)"
                              : "var(--color-brand, #1F4A2D)",
                        }}
                      >
                        {hoursMessage}
                      </span>
                    )}
                    <Button
                      variant="primary"
                      loading={hoursSaving}
                      onClick={handleSaveHours}
                    >
                      {t("hours.save")}
                    </Button>
                  </div>
                </div>
              )
            ) : p?.regularOpeningHours?.weekdayDescriptions?.length ? (
              p.regularOpeningHours.weekdayDescriptions.map((d, i) => (
                <div
                  key={i}
                  style={{
                    padding: "8px 0",
                    borderBottom: "1px solid var(--border, #E5DFD0)",
                    fontSize: 14,
                  }}
                >
                  {d}
                </div>
              ))
            ) : (
              <div style={{ fontSize: 14, color: "var(--tl, #6B6F71)" }}>
                {t("hours.empty")}
              </div>
            )}
          </SectionCard>

          {/* ---- Speciale dagen / sluitingsdata (uit account) ---- */}
          {/* Deze komen uit Account → Sluitingsdata & vakanties en
              worden straks gepusht naar Google's 'special hours'
              (afwijkende openingstijden op feestdagen/vakanties). */}
          <SectionCard
            title={t("specialDays.title")}
            badge={connected ? editableBadge : editLaterBadge}
          >
            {closedDates.length > 0 ? (
              <>
                {closedDates.map((d) => (
                  <FieldRow
                    key={d}
                    label={formatClosedDate(d, localeTag)}
                    value={t("specialDays.closed")}
                  />
                ))}
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--tl, #6B6F71)",
                    marginTop: 10,
                  }}
                >
                  {t.rich("specialDays.manage", {
                    link: (chunks) => (
                      <Link
                        href="/dashboard/account"
                        style={{
                          color: "var(--color-brand, #1F4A2D)",
                          fontWeight: 600,
                        }}
                      >
                        {chunks}
                      </Link>
                    ),
                  })}
                </div>
                {/* Verbonden → deze sluitingsdagen als specialHours naar
                    Google pushen. */}
                {connected && (locations?.length ?? 0) > 0 && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: 10,
                      marginTop: 14,
                    }}
                  >
                    {specialMessage && (
                      <span
                        style={{
                          fontSize: 13,
                          color:
                            specialStatus === "error"
                              ? "var(--red, #DC2626)"
                              : "var(--color-brand, #1F4A2D)",
                        }}
                      >
                        {specialMessage}
                      </span>
                    )}
                    <Button
                      variant="secondary"
                      loading={specialSaving}
                      onClick={handleSaveSpecialDays}
                    >
                      {t("specialDays.push")}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 14, color: "var(--tl, #6B6F71)" }}>
                {t.rich("specialDays.empty", {
                  link: (chunks) => (
                    <Link
                      href="/dashboard/account"
                      style={{
                        color: "var(--color-brand, #1F4A2D)",
                        fontWeight: 600,
                      }}
                    >
                      {chunks}
                    </Link>
                  ),
                })}
              </div>
            )}
          </SectionCard>

          {/* ---- Beschrijving ----
              Verbonden → bewerkbaar veld dat via locations.patch naar Google
              wordt geschreven (de business.manage-write). Niet verbonden →
              read-only redactionele samenvatting uit de Places-data. */}
          <SectionCard
            title={t("description.title")}
            badge={connected ? editableBadge : editLaterBadge}
          >
            {connected ? (
              locations === null ? (
                <Skeleton style={{ height: 120 }} />
              ) : locations.length === 0 ? (
                <div style={{ fontSize: 14, color: "var(--tl, #6B6F71)" }}>
                  {descMessage ?? t("description.noLocation")}
                </div>
              ) : (
                <div>
                  {/* Bij meerdere vestigingen: kies welke je bewerkt. */}
                  {locations.length > 1 && (
                    <div style={{ marginBottom: 12 }}>
                      <label
                        htmlFor="gbp-location"
                        style={{
                          fontSize: 13,
                          color: "var(--tl, #6B6F71)",
                          display: "block",
                          marginBottom: 4,
                        }}
                      >
                        {t("description.locationLabel")}
                      </label>
                      <select
                        id="gbp-location"
                        value={locIndex}
                        onChange={(e) => {
                          const i = parseInt(e.target.value, 10);
                          setLocIndex(i);
                          setDescDraft(locations[i]?.description ?? "");
                          setHoursDraft(locations[i]?.hours ?? []);
                          setDescStatus("idle");
                          setDescMessage(null);
                          setHoursStatus("idle");
                          setHoursMessage(null);
                          setSpecialStatus("idle");
                          setSpecialMessage(null);
                        }}
                        style={{
                          padding: "8px 12px",
                          border: "1px solid var(--border, #E5DFD0)",
                          borderRadius: 6,
                          fontSize: 14,
                          background: "var(--white, #FFFFFF)",
                          color: "var(--text, #18181B)",
                          maxWidth: 360,
                        }}
                      >
                        {locations.map((l, i) => (
                          <option key={l.name} value={i}>
                            {l.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--tl, #6B6F71)",
                      marginBottom: 8,
                    }}
                  >
                    {t("description.editableHint")}
                  </div>

                  <textarea
                    value={descDraft}
                    onChange={(e) => {
                      setDescDraft(e.target.value);
                      setDescStatus("idle");
                    }}
                    rows={5}
                    maxLength={750}
                    placeholder={t("description.placeholder")}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      border: "1px solid var(--border, #E5DFD0)",
                      borderRadius: 6,
                      fontSize: 14,
                      background: "var(--white, #FFFFFF)",
                      color: "var(--text, #18181B)",
                      resize: "vertical",
                      fontFamily: "inherit",
                      lineHeight: 1.5,
                    }}
                  />

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      marginTop: 8,
                    }}
                  >
                    <span
                      style={{ fontSize: 12, color: "var(--tl, #6B6F71)" }}
                    >
                      {t("description.charCount", {
                        count: descDraft.trim().length,
                      })}
                    </span>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      {descMessage && (
                        <span
                          style={{
                            fontSize: 13,
                            color:
                              descStatus === "error"
                                ? "var(--red, #DC2626)"
                                : "var(--color-brand, #1F4A2D)",
                          }}
                        >
                          {descMessage}
                        </span>
                      )}
                      <Button
                        variant="primary"
                        loading={descSaving}
                        onClick={handleSaveDescription}
                      >
                        {t("description.save")}
                      </Button>
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div
                style={{
                  fontSize: 14,
                  lineHeight: 1.5,
                  color: p?.editorialSummary
                    ? "var(--text, #18181B)"
                    : "var(--tl, #6B6F71)",
                }}
              >
                {p?.editorialSummary ?? t("description.empty")}
              </div>
            )}
          </SectionCard>

          {/* ---- Reviews beantwoorden (v4-API) ----
              Alleen verbonden. Op aanvraag geladen zodat de pagina niet faalt
              als de v4-API nog niet is ingeschakeld. */}
          {connected && (
            <SectionCard title={t("reviews.title")} badge={editableBadge}>
              {reviews === null ? (
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--tl, #6B6F71)",
                      marginBottom: 10,
                    }}
                  >
                    {t("reviews.loadHint")}
                  </div>
                  {reviewsError && (
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--red, #DC2626)",
                        marginBottom: 10,
                      }}
                    >
                      {reviewsError}
                    </div>
                  )}
                  <Button
                    variant="secondary"
                    loading={reviewsLoading}
                    onClick={handleLoadReviews}
                    disabled={(locations?.length ?? 0) === 0}
                  >
                    {t("reviews.load")}
                  </Button>
                </div>
              ) : reviews.length === 0 ? (
                <div style={{ fontSize: 14, color: "var(--tl, #6B6F71)" }}>
                  {t("reviews.empty")}
                </div>
              ) : (
                <div>
                  {replyError && (
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--red, #DC2626)",
                        marginBottom: 10,
                      }}
                    >
                      {replyError}
                    </div>
                  )}
                  {reviews.map((r) => (
                    <div
                      key={r.name}
                      style={{
                        padding: "14px 0",
                        borderBottom: "1px solid var(--border, #E5DFD0)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          marginBottom: 4,
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: 14 }}>
                          {r.reviewer}
                        </span>
                        <span
                          style={{
                            color: "#E8B04B",
                            fontSize: 14,
                            flexShrink: 0,
                            letterSpacing: 1,
                          }}
                          aria-label={`${r.stars}/5`}
                        >
                          {"★".repeat(r.stars)}
                          {"☆".repeat(5 - r.stars)}
                        </span>
                      </div>
                      {r.comment && (
                        <div
                          style={{
                            fontSize: 14,
                            lineHeight: 1.5,
                            color: "var(--text, #18181B)",
                            marginBottom: 8,
                          }}
                        >
                          {r.comment}
                        </div>
                      )}
                      {r.reply !== null ? (
                        <div
                          style={{
                            marginTop: 6,
                            padding: "8px 12px",
                            background: "var(--brand-soft, #EDF2EE)",
                            borderRadius: 8,
                            fontSize: 13,
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 600,
                              color: "var(--color-brand, #1F4A2D)",
                              marginBottom: 2,
                            }}
                          >
                            {t("reviews.existingReply")}
                          </div>
                          {r.reply}
                        </div>
                      ) : (
                        <div style={{ marginTop: 6 }}>
                          <textarea
                            value={replyDrafts[r.name] ?? ""}
                            onChange={(e) =>
                              setReplyDrafts((prev) => ({
                                ...prev,
                                [r.name]: e.target.value,
                              }))
                            }
                            rows={2}
                            placeholder={t("reviews.replyPlaceholder")}
                            style={{
                              width: "100%",
                              padding: "8px 12px",
                              border: "1px solid var(--border, #E5DFD0)",
                              borderRadius: 6,
                              fontSize: 14,
                              background: "var(--white, #FFFFFF)",
                              color: "var(--text, #18181B)",
                              resize: "vertical",
                              fontFamily: "inherit",
                              lineHeight: 1.5,
                            }}
                          />
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "flex-end",
                              gap: 8,
                              marginTop: 6,
                            }}
                          >
                            {/* Filly stelt een concept voor; eigenaar bewerkt
                                + keurt het daarna zelf goed. */}
                            <Button
                              variant="secondary"
                              size="sm"
                              loading={suggestingName === r.name}
                              onClick={() => handleSuggestReply(r)}
                            >
                              {t("reviews.suggest")}
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              loading={replyingName === r.name}
                              disabled={!(replyDrafts[r.name] ?? "").trim()}
                              onClick={() => handleReply(r.name)}
                            >
                              {t("reviews.reply")}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          {/* ---- Status & cijfers (puur read-only, Google bepaalt deze) ---- */}
          <SectionCard title={t("stats.title")} badge={visibleBadge}>
            <FieldRow
              label={t("stats.businessStatus")}
              value={
                p?.businessStatus === "OPERATIONAL"
                  ? t("stats.statusOperational")
                  : p?.businessStatus ?? null
              }
            />
            <FieldRow
              label={t("stats.rating")}
              value={p?.rating != null ? `${p.rating} ★` : null}
            />
            <FieldRow
              label={t("stats.reviewCount")}
              value={
                p?.userRatingCount != null ? `${p.userRatingCount}` : null
              }
            />
            <FieldRow
              label={t("stats.photos")}
              value={p?.photos?.length ? `${p.photos.length}` : null}
            />
          </SectionCard>

          {/* ---- Google Posts ----
              Verbonden → tekst schrijven + publiceren naar Google
              (localPosts.create). Niet verbonden → placeholder. */}
          <SectionCard
            title={t("posts.title")}
            badge={connected ? editableBadge : afterConnectBadge}
          >
            {connected && loc ? (
              <div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--tl, #6B6F71)",
                    marginBottom: 8,
                  }}
                >
                  {t("posts.editableHint")}
                </div>
                <textarea
                  value={postDraft}
                  onChange={(e) => {
                    setPostDraft(e.target.value);
                    setPostStatus("idle");
                  }}
                  rows={4}
                  maxLength={1500}
                  placeholder={t("posts.placeholder")}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid var(--border, #E5DFD0)",
                    borderRadius: 6,
                    fontSize: 14,
                    background: "var(--white, #FFFFFF)",
                    color: "var(--text, #18181B)",
                    resize: "vertical",
                    fontFamily: "inherit",
                    lineHeight: 1.5,
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    gap: 10,
                    marginTop: 8,
                  }}
                >
                  {postMessage && (
                    <span
                      style={{
                        fontSize: 13,
                        color:
                          postStatus === "error"
                            ? "var(--red, #DC2626)"
                            : "var(--color-brand, #1F4A2D)",
                      }}
                    >
                      {postMessage}
                    </span>
                  )}
                  <Button
                    variant="primary"
                    loading={postSaving}
                    disabled={!postDraft.trim()}
                    onClick={handleCreatePost}
                  >
                    {t("posts.publish")}
                  </Button>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 14, color: "var(--tl, #6B6F71)" }}>
                {t("posts.body")}
              </div>
            )}
          </SectionCard>

          {/* Vragen & antwoorden verwijderd (2026-07-07): Google's Q&A-API is
              in november 2025 stopgezet. Inzichten verwijderd: vereist de
              aparte Performance API en is voor nu geen must-have. */}

          <SectionCard
            title={t("photoManagement.title")}
            badge={connected ? editableBadge : afterConnectBadge}
          >
            {connected && loc ? (
              <div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--tl, #6B6F71)",
                    marginBottom: 10,
                  }}
                >
                  {t("photoManagement.editableHint")}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <select
                    value={photoCategory}
                    onChange={(e) => {
                      setPhotoCategory(
                        e.target.value as "COVER" | "LOGO" | "ADDITIONAL",
                      );
                      setPhotoStatus("idle");
                    }}
                    style={{
                      padding: "8px 12px",
                      border: "1px solid var(--border, #E5DFD0)",
                      borderRadius: 6,
                      fontSize: 14,
                      background: "var(--white, #FFFFFF)",
                      color: "var(--text, #18181B)",
                    }}
                  >
                    <option value="ADDITIONAL">
                      {t("photoManagement.catAdditional")}
                    </option>
                    <option value="COVER">
                      {t("photoManagement.catCover")}
                    </option>
                    <option value="LOGO">
                      {t("photoManagement.catLogo")}
                    </option>
                  </select>
                  <Button
                    variant="primary"
                    loading={photoUploading}
                    onClick={() => {
                      setPhotoStatus("idle");
                      setPhotoMessage(null);
                      setPhotoPickerOpen(true);
                    }}
                  >
                    {t("photoManagement.pick")}
                  </Button>
                  {photoMessage && (
                    <span
                      style={{
                        fontSize: 13,
                        color:
                          photoStatus === "error"
                            ? "var(--red, #DC2626)"
                            : "var(--color-brand, #1F4A2D)",
                      }}
                    >
                      {photoMessage}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 14, color: "var(--tl, #6B6F71)" }}>
                {t("photoManagement.body")}
              </div>
            )}
          </SectionCard>
        </>
      )}

      {/* Foto-bibliotheek-picker voor Foto-beheer: kies een foto → upload naar
          het Google-profiel in de gekozen categorie. */}
      <MediaLibraryPicker
        open={photoPickerOpen}
        onClose={() => setPhotoPickerOpen(false)}
        onPick={handlePickPhoto}
        initialFilter="image"
      />
    </div>
  );
}
