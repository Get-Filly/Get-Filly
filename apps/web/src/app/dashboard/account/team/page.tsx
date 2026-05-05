"use client";

import { useEffect, useState } from "react";
import {
  fetchTeam,
  removeTeamMember,
  updateTeamMember,
  fetchInvites,
  revokeInvite,
  getInviteMagicLink,
  type TeamMember,
  type InvitationRecord,
} from "../../../../lib/api";
import { InviteModal } from "./invite-modal";
import {
  DEFAULT_PERMISSIONS,
  MODULES,
  type Module,
  type Role,
} from "@getfilly/shared";
import { useRestaurant } from "../../../../lib/restaurant-context";

/**
 * ============================================================
 * Team-pagina (/dashboard/account/team)
 * ============================================================
 *
 * Laat de eigenaar:
 *   - Zien wie er gekoppeld is aan dit restaurant
 *   - Rol aanpassen (owner / manager / staff)
 *   - Custom permissies aan/uit vinken per user
 *   - Een teamlid verwijderen
 *
 * Uitnodigen-knop is voorlopig nog leeg — die flow komt in stap 5
 * (invite via e-mail).
 */

/**
 * Leesbare labels bij elke module-key (voor de checkboxes).
 */
const MODULE_LABELS: Record<Module, string> = {
  dashboard: "Dashboard",
  taken: "Taken",
  suggesties: "Suggesties",
  reserveringen: "Reserveringen",
  campagnes: "Campagnes",
  gasten: "Gasten",
  google_business: "Google Business",
  menu: "Menu",
  rapportages: "Rapportages",
  koppelingen: "Koppelingen",
  account: "Account",
  team: "Team-beheer",
};

const ROLE_LABELS: Record<Role, string> = {
  owner: "Eigenaar",
  manager: "Manager",
  staff: "Medewerker",
};

export default function TeamPage() {
  const { active } = useRestaurant();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<InvitationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Welk teamlid staat uitgeklapt (detail-view met checkboxes)?
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  // Status per user-id wanneer we aan het opslaan / verwijderen zijn,
  // zodat we buttons kunnen disabled'en en feedback kunnen tonen.
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  // Invite-modal open-state.
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Laad teamleden + openstaande invites parallel.
  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ms, ins] = await Promise.all([fetchTeam(), fetchInvites()]);
      setMembers(ms);
      setInvites(ins);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  // Invite intrekken.
  const handleRevokeInvite = async (inviteId: string) => {
    if (!confirm("Deze uitnodiging intrekken?")) return;
    try {
      await revokeInvite(inviteId);
      setInvites((ins) => ins.filter((i) => i.id !== inviteId));
    } catch (err) {
      alert(`Kon invite niet intrekken: ${err instanceof Error ? err.message : err}`);
    }
  };

  // Wijzig rol van een teamlid.
  const handleRoleChange = async (userId: string, newRole: Role) => {
    setBusyUserId(userId);
    try {
      const updated = await updateTeamMember(userId, { role: newRole });
      setMembers((ms) =>
        ms.map((m) => (m.user_id === userId ? updated : m)),
      );
    } catch (err) {
      alert(`Kon rol niet wijzigen: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusyUserId(null);
    }
  };

  // Toggle één module in de permissies voor deze user.
  // Onder water: custom permissies bouwen op basis van de rol-defaults,
  // dan de gewenste module toevoegen/verwijderen.
  const handleTogglePermission = async (
    member: TeamMember,
    module: Module,
    enabled: boolean,
  ) => {
    setBusyUserId(member.user_id);
    try {
      const current =
        member.permissions?.modules ??
        Array.from(DEFAULT_PERMISSIONS[member.role]);

      const next = enabled
        ? Array.from(new Set([...current, module]))
        : current.filter((m) => m !== module);

      const updated = await updateTeamMember(member.user_id, {
        permissions: next,
      });
      setMembers((ms) =>
        ms.map((m) => (m.user_id === member.user_id ? updated : m)),
      );
    } catch (err) {
      alert(
        `Kon permissie niet wijzigen: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      setBusyUserId(null);
    }
  };

  // Terug naar rol-defaults (custom permissies weg).
  const handleResetToRoleDefaults = async (member: TeamMember) => {
    setBusyUserId(member.user_id);
    try {
      const updated = await updateTeamMember(member.user_id, {
        permissions: null,
      });
      setMembers((ms) =>
        ms.map((m) => (m.user_id === member.user_id ? updated : m)),
      );
    } catch (err) {
      alert(`Kon niet resetten: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleRemove = async (member: TeamMember) => {
    const confirmed = window.confirm(
      `Weet je zeker dat je ${member.full_name ?? member.email ?? "dit teamlid"} wilt verwijderen?`,
    );
    if (!confirmed) return;

    setBusyUserId(member.user_id);
    try {
      await removeTeamMember(member.user_id);
      setMembers((ms) => ms.filter((m) => m.user_id !== member.user_id));
    } catch (err) {
      alert(
        `Kon teamlid niet verwijderen: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      setBusyUserId(null);
    }
  };

  /**
   * Bereken welke modules een teamlid effectief mag zien.
   * Als custom permissies zijn gezet: die. Anders: rol-defaults.
   * Deze lijst gebruiken we om de checkboxes vooraf aan te vinken.
   */
  const effectiveModules = (m: TeamMember): Module[] =>
    m.permissions?.modules ?? Array.from(DEFAULT_PERMISSIONS[m.role]);

  const hasCustomPermissions = (m: TeamMember): boolean =>
    m.permissions !== null && m.permissions.modules.length > 0;

  if (loading) {
    return <div className="team-empty">Team wordt geladen…</div>;
  }

  if (error) {
    return (
      <div className="team-empty team-error">
        Kon team niet laden: {error}
      </div>
    );
  }

  return (
    <div className="team-page">
      <div className="team-header">
        <div>
          <h1 className="team-title">Team</h1>
          <p className="team-subtitle">
            Beheer wie toegang heeft tot {active?.name ?? "dit restaurant"} en
            welke onderdelen ze mogen zien.
          </p>
        </div>
        <button
          className="team-invite-btn"
          onClick={() => setShowInviteModal(true)}
        >
          + Teamlid uitnodigen
        </button>
      </div>

      {/* Openstaande uitnodigingen — zichtbaar tot ze geaccepteerd of
          ingetrokken worden. */}
      {invites.length > 0 && (
        <div className="team-invites">
          <div className="team-invites-title">Openstaande uitnodigingen</div>
          {invites.map((inv) => {
            return (
              <div key={inv.id} className="team-invite-row">
                <div className="team-who">
                  <div className="team-name">{inv.email}</div>
                  <div className="team-email">
                    Rol: {inv.role} · verloopt{" "}
                    {new Date(inv.expires_at).toLocaleDateString("nl-NL")}
                  </div>
                </div>
                <span className="team-invite-pending">Wacht op acceptatie</span>
                <button
                  className="team-toggle-btn"
                  onClick={async () => {
                    try {
                      // Backend genereert een verse Supabase magic link.
                      // Deze werkt ook zonder dat de user ingelogd is —
                      // klikken logt hem automatisch in en brengt hem
                      // bij de accept-pagina.
                      const link = await getInviteMagicLink(inv.id);
                      await navigator.clipboard.writeText(link);
                      alert("Magic link gekopieerd — plak 'm in een browser om de invite te accepteren.");
                    } catch (err) {
                      alert(
                        `Kon geen link genereren: ${err instanceof Error ? err.message : err}`,
                      );
                    }
                  }}
                  title="Verse magic link — deel handmatig als de mail niet aankomt"
                >
                  Kopieer link
                </button>
                <button
                  className="team-remove-btn"
                  onClick={() => handleRevokeInvite(inv.id)}
                >
                  Intrekken
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showInviteModal && (
        <InviteModal
          onClose={() => setShowInviteModal(false)}
          onSent={() => void loadAll()}
        />
      )}

      <div className="team-list">
        {members.map((m) => {
          const expanded = expandedUserId === m.user_id;
          const mods = effectiveModules(m);
          const busy = busyUserId === m.user_id;

          return (
            <div key={m.user_id} className={`team-card ${expanded ? "open" : ""}`}>
              <div className="team-row">
                <div className="team-who">
                  <div className="team-name">
                    {m.full_name ?? m.email ?? "Onbekend"}
                  </div>
                  <div className="team-email">{m.email ?? "—"}</div>
                </div>

                <select
                  className="team-role-select"
                  value={m.role}
                  onChange={(e) => handleRoleChange(m.user_id, e.target.value as Role)}
                  disabled={busy}
                >
                  {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>

                <button
                  className="team-toggle-btn"
                  onClick={() =>
                    setExpandedUserId(expanded ? null : m.user_id)
                  }
                >
                  {expanded ? "Sluiten" : "Permissies"}
                </button>

                <button
                  className="team-remove-btn"
                  onClick={() => handleRemove(m)}
                  disabled={busy}
                  title="Teamlid verwijderen"
                >
                  Verwijderen
                </button>
              </div>

              {expanded && (
                <div className="team-permissions">
                  <div className="team-permissions-header">
                    <span>
                      {hasCustomPermissions(m)
                        ? "Aangepaste permissies actief"
                        : `Standaard permissies voor rol "${ROLE_LABELS[m.role]}"`}
                    </span>
                    {hasCustomPermissions(m) && (
                      <button
                        className="team-reset-btn"
                        onClick={() => handleResetToRoleDefaults(m)}
                        disabled={busy}
                      >
                        Reset naar rol-standaard
                      </button>
                    )}
                  </div>

                  <div className="team-modules-grid">
                    {MODULES.map((mod) => {
                      const checked = mods.includes(mod);
                      // 'account' mag iedereen altijd (zelf beheren), dus
                      // vergrendelen we die checkbox zodat er niet per
                      // ongeluk iemand zichzelf uit sluit.
                      const locked = mod === "account";
                      return (
                        <label
                          key={mod}
                          className={`team-module ${checked ? "on" : ""} ${locked ? "locked" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={busy || locked}
                            onChange={(e) =>
                              handleTogglePermission(m, mod, e.target.checked)
                            }
                          />
                          {MODULE_LABELS[mod]}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
