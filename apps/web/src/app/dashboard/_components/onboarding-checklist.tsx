"use client";

// ============================================================
// OnboardingChecklist — setup-stappen voor nieuwe klanten
// ============================================================
// Verschijnt bovenaan dashboard-home zolang het restaurant nog
// niet alle basis-instellingen heeft afgevinkt. Items die op ✓
// staan vervagen; items op ○ blijven prominent zichtbaar met
// een rechtstreekse link naar de plek waar je ze invult.
//
// Doel: nieuwe klant weet wat er nog moet gebeuren zonder dat
// we hem dwingen door een onboarding-tunnel; hij kan stap voor
// stap aftikken in zijn eigen tempo.
//
// Render-logica:
//   - Geen data binnen → niets renderen (vermijdt flash bij load)
//   - Alle items ✓ → niets renderen (verbergt zich vanzelf)
//   - Anders: progress-bar + lijst
//
// Aanvullende items toevoegen in de toekomst:
//   - Voeg een entry toe aan `buildChecklist`. Geen state, geen
//     extra fetch nodig zolang het uit Restaurant + menu + campagnes
//     af te leiden is.
// ============================================================

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  fetchCampaigns,
  fetchMenu,
  fetchRestaurant,
  type Restaurant,
} from "../../../lib/api";

type ChecklistItem = {
  id: string;
  label: string;
  hint: string;
  href: string;
  done: boolean;
};

function buildChecklist(
  restaurant: Restaurant,
  menuCount: number,
  campaignCount: number,
): ChecklistItem[] {
  // Profielbasis: minimum dat Filly nodig heeft voor ZINVOLLE
  // voorstellen. Mist één van deze velden, dan zijn campagne-
  // suggesties oppervlakkig of generiek.
  const profileBasicsDone =
    !!restaurant.name &&
    !!restaurant.type &&
    !!restaurant.address &&
    !!restaurant.postal_code &&
    !!restaurant.city &&
    Array.isArray(restaurant.cuisine_style) &&
    restaurant.cuisine_style.length > 0 &&
    restaurant.capacity_seats != null;

  const openingHoursDone =
    restaurant.opening_hours != null &&
    Object.keys(restaurant.opening_hours).length > 0;

  const logoDone = !!restaurant.logo_url;

  // KvK + legal_name samen — handig voor mailings en verplicht
  // op verloop voor verzonden marketing-uitingen.
  const businessDetailsDone =
    !!restaurant.legal_name && !!restaurant.kvk_number;

  return [
    {
      id: "profile",
      label: "Profielbasis: type, keuken, adres en capaciteit",
      hint: "Zonder dit kan Filly geen voorstellen op maat doen.",
      href: "/dashboard/account",
      done: profileBasicsDone,
    },
    {
      id: "hours",
      label: "Openingstijden invullen",
      hint: "Voorkomt dat Filly mailings verstuurt op gesloten dagen.",
      href: "/dashboard/account",
      done: openingHoursDone,
    },
    {
      id: "logo",
      label: "Logo uploaden",
      hint: "Verschijnt in mail-headers en social-previews.",
      href: "/dashboard/account",
      done: logoDone,
    },
    {
      id: "menu",
      label: "Menukaart toevoegen of importeren",
      hint: "Filly leert je gerechten kennen en kan ze in campagnes noemen.",
      href: "/dashboard/menu",
      done: menuCount > 0,
    },
    {
      id: "campaign",
      label: "Eerste campagne aanmaken",
      hint: "Maak een test-concept om de flow te leren kennen.",
      href: "/dashboard/campagnes",
      done: campaignCount > 0,
    },
    {
      id: "business",
      label: "Bedrijfsgegevens (legal name + KvK)",
      hint: "Verschijnt in mail-footers en is verplicht voor mailings naar gasten.",
      href: "/dashboard/account",
      done: businessDetailsDone,
    },
  ];
}

export function OnboardingChecklist() {
  const [items, setItems] = useState<ChecklistItem[] | null>(null);

  useEffect(() => {
    // Drie endpoints parallel; allemaal endpoints die het dashboard
    // toch al kent (geen extra fetch-load voor de klant).
    Promise.all([fetchRestaurant(), fetchMenu(), fetchCampaigns()])
      .then(([restaurant, menu, campaigns]) => {
        setItems(buildChecklist(restaurant, menu.length, campaigns.length));
      })
      .catch(() => {
        // Fail-soft: bij fout verbergt de checklist zich. Het dashboard
        // mag nooit kapot gaan door een onboarding-component.
        setItems(null);
      });
  }, []);

  // Niets renderen tot data binnen is — voorkomt flash bij load.
  if (!items) return null;

  const doneCount = items.filter((i) => i.done).length;
  const total = items.length;

  // Alles klaar? Component verbergt zichzelf voor altijd.
  if (doneCount === total) return null;

  const percent = Math.round((doneCount / total) * 100);

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: 20,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
        }}
      >
        <div
          style={{
            fontWeight: 700,
            color: "var(--accent-dark)",
            fontSize: 15,
          }}
        >
          Filly aan het werk zetten
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {doneCount} van {total} klaar
        </div>
      </div>

      <div
        style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          marginBottom: 12,
        }}
      >
        Vink deze setup-stappen af zodat Filly betere voorstellen kan
        doen. De lijst verdwijnt automatisch zodra alles klaar is.
      </div>

      {/* Progress-bar */}
      <div
        style={{
          height: 6,
          background: "var(--border)",
          borderRadius: 999,
          overflow: "hidden",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: "100%",
            background: "var(--accent)",
            transition: "width 0.4s ease",
          }}
        />
      </div>

      {/* Items */}
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {items.map((item) => (
          <li
            key={item.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              padding: "10px 12px",
              background: "var(--white)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-soft)",
              opacity: item.done ? 0.55 : 1,
            }}
          >
            <div
              aria-hidden
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                flexShrink: 0,
                marginTop: 2,
                background: item.done ? "var(--green)" : "var(--bg)",
                border: item.done
                  ? "1px solid var(--green)"
                  : "1px solid var(--border)",
                color: "var(--white)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {item.done ? "✓" : ""}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: item.done
                    ? "var(--text-secondary)"
                    : "var(--text)",
                  textDecoration: item.done ? "line-through" : "none",
                }}
              >
                {item.label}
              </div>
              {!item.done && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    marginTop: 2,
                  }}
                >
                  {item.hint}
                </div>
              )}
            </div>
            {!item.done && (
              <Link
                href={item.href}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--accent)",
                  textDecoration: "none",
                  flexShrink: 0,
                  alignSelf: "center",
                }}
              >
                Instellen →
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
