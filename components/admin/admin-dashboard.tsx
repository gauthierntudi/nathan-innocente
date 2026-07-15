"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { CeremoniesSection } from "@/components/admin/ceremonies-section";
import { GuestAddModal } from "@/components/admin/guest-add-modal";
import { GuestEditModal } from "@/components/admin/guest-edit-modal";
import {
  AdminBusyOverlay,
  type AdminBusyState,
} from "@/components/admin/admin-busy-overlay";
import type { CeremonyId } from "@/lib/admin/ceremony-types";
import {
  DEFAULT_VARIABLES_MAP,
  canSendReminder,
  computeStats,
  getAvailabilityKey,
  type AdminGuest,
  type AdminStats,
  type VariablesMap,
} from "@/lib/admin/types";
import {
  type AdminSection,
  useAdminNavigation,
} from "@/lib/admin/navigation";

const VAR_OPTIONS = [
  { value: "genre", label: "Genre (Cher/Chère)" },
  { value: "nom", label: "Nom" },
  { value: "token", label: "Token" },
  { value: "lien", label: "Lien (URL)" },
  { value: "convives", label: "Convives (Nombre)" },
];

type AdminSectionPanelProps = {
  id: AdminSection;
  activeSection: AdminSection;
  visitedSections: Set<AdminSection>;
  children: ReactNode;
};

function AdminSectionPanel({
  id,
  activeSection,
  visitedSections,
  children,
}: AdminSectionPanelProps) {
  if (!visitedSections.has(id)) return null;

  return (
    <div className="admin-section-panel" hidden={activeSection !== id}>
      {children}
    </div>
  );
}

function availabilityBadge(guest: AdminGuest) {
  const key = getAvailabilityKey(guest);

  if (key === "yes") {
    return (
      <span className="admin-badge admin-badge--success">
        Oui ({guest.confirmedGuests})
      </span>
    );
  }

  if (key === "no") {
    return <span className="admin-badge admin-badge--danger">Non</span>;
  }

  return <span className="admin-badge admin-badge--muted">En attente</span>;
}

type AdminDashboardProps = {
  initialGuests: AdminGuest[];
  initialStats: AdminStats;
};

const SECTION_META: Record<AdminSection, { title: string; subtitle: string }> = {
  overview: {
    title: "Vue d'ensemble",
    subtitle: "Suivez l'activité des invitations et des confirmations",
  },
  guests: {
    title: "Invités",
    subtitle: "Recherchez, filtrez et gérez les envois WhatsApp",
  },
  ceremonies: {
    title: "Cérémonies & tables",
    subtitle: "Affectez les invités aux cérémonies et organisez le plan de table",
  },
  settings: {
    title: "Configuration",
    subtitle: "Paramétrez le mapping du template Twilio",
  },
};

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

export function AdminDashboard({
  initialGuests,
  initialStats,
}: AdminDashboardProps) {
  const router = useRouter();
  const { section, ceremonyId, setSection, setCeremonyId } = useAdminNavigation();
  const [visitedSections, setVisitedSections] = useState<Set<AdminSection>>(
    () => new Set([section]),
  );
  const [guests, setGuests] = useState(initialGuests);
  const [stats, setStats] = useState(initialStats);
  const [variablesMap, setVariablesMap] = useState<VariablesMap>(
    DEFAULT_VARIABLES_MAP,
  );
  const [search, setSearch] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reminderLimit, setReminderLimit] = useState(25);
  const [busyState, setBusyState] = useState<AdminBusyState>(null);
  const busy = busyState !== null;
  const [message, setMessage] = useState("");
  const [editingGuest, setEditingGuest] = useState<AdminGuest | null>(null);
  const [addGuestOpen, setAddGuestOpen] = useState(false);

  useEffect(() => {
    setVisitedSections((current) => {
      if (current.has(section)) return current;
      const next = new Set(current);
      next.add(section);
      return next;
    });
  }, [section]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return guests.filter((guest) => {
      if (availabilityFilter !== "all" && getAvailabilityKey(guest) !== availabilityFilter) {
        return false;
      }

      if (!query) return true;
      return (
        guest.name.toLowerCase().includes(query) ||
        guest.phone.toLowerCase().includes(query)
      );
    });
  }, [guests, search, availabilityFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageGuests = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const totalGuests = guests.length;
  const responseRate = percent(stats.confirmationsTotal, totalGuests);
  const yesRate = percent(stats.availabilityYes, totalGuests);
  const pendingRate = percent(stats.confirmationsPending, totalGuests);
  const dressCodeRate = percent(stats.dressCodeDownloads, totalGuests);

  async function refreshData() {
    const response = await fetch("/api/admin/guests");
    const data = await response.json();
    if (data.success) {
      setGuests(data.guests);
      setStats(data.stats);
    }
  }

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    router.refresh();
  }

  async function saveGuestEdit(payload: {
    guestId: string;
    name: string;
    phone: string;
    numGuests: number;
    ceremonyIds: CeremonyId[];
    resetCeremonyIds: CeremonyId[];
  }) {
    setBusyState({
      title: "Enregistrement",
      detail: `Mise à jour de ${payload.name}…`,
    });
    setMessage("");
    try {
      const response = await fetch(`/api/admin/guests/${payload.guestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: payload.name,
          phone: payload.phone,
          numGuests: payload.numGuests,
          ceremonyIds: payload.ceremonyIds,
          resetCeremonyIds: payload.resetCeremonyIds,
        }),
      });
      const data = await response.json();
      if (!data.success) {
        setMessage(data.message ?? "Modification impossible");
        return false;
      }

      setGuests((current) => {
        const next = current.map((guest) =>
          guest.id === payload.guestId ? (data.guest as AdminGuest) : guest,
        );
        setStats(computeStats(next));
        return next;
      });
      setMessage(data.message);
      return true;
    } catch {
      setMessage("Erreur réseau lors de la modification.");
      return false;
    } finally {
      setBusyState(null);
    }
  }

  async function sendInvite(guestId: string) {
    const guest = guests.find((item) => item.id === guestId);
    setBusyState({
      title: "Envoi WhatsApp",
      variant: "whatsapp",
      detail: guest
        ? `Invitation pour ${guest.name}…`
        : "Envoi de l'invitation…",
    });
    setMessage("");
    try {
      const response = await fetch("/api/admin/whatsapp/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId, variablesMap }),
      });
      const data = await response.json();
      setMessage(data.success ? data.message : data.message);
      if (data.success) await refreshData();
    } finally {
      setBusyState(null);
    }
  }

  async function sendBulkInvite() {
    const phones = [...selected];
    if (phones.length === 0) {
      setMessage("Aucun invité sélectionné.");
      setSection("guests");
      return;
    }

    if (!confirm(`Envoyer ${phones.length} invitation(s) WhatsApp ?`)) return;

    const recipients = phones
      .map((phoneKey) => {
        const guest = guests.find(
          (item) => item.phone.replace(/[^\d+]/g, "") === phoneKey,
        );
        return guest ? { guestId: guest.id, name: guest.name } : null;
      })
      .filter((item): item is { guestId: string; name: string } => item !== null);

    if (recipients.length === 0) {
      setMessage("Aucun destinataire valide dans la sélection.");
      return;
    }

    setMessage("");
    let sentCount = 0;
    let failCount = 0;

    try {
      for (let index = 0; index < recipients.length; index += 1) {
        const recipient = recipients[index];
        setBusyState({
          title: "Envoi WhatsApp groupé",
          variant: "whatsapp",
          detail: `Invitation pour ${recipient.name}…`,
          current: index + 1,
          total: recipients.length,
          sent: sentCount,
          failed: failCount,
        });

        try {
          const response = await fetch("/api/admin/whatsapp/invite", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              guestId: recipient.guestId,
              variablesMap,
            }),
          });
          const data = await response.json();
          if (data.success) sentCount += 1;
          else failCount += 1;
        } catch {
          failCount += 1;
        }

        setBusyState({
          title: "Envoi WhatsApp groupé",
          variant: "whatsapp",
          detail: `Invitation pour ${recipient.name}…`,
          current: index + 1,
          total: recipients.length,
          sent: sentCount,
          failed: failCount,
        });
      }

      setMessage(`Envoyés: ${sentCount} | Erreurs: ${failCount}`);
      setSelected(new Set());
      await refreshData();
    } finally {
      setBusyState(null);
      setSection("guests");
    }
  }

  async function sendReminder(guestId: string) {
    const guest = guests.find((item) => item.id === guestId);
    setBusyState({
      title: "Envoi du rappel",
      variant: "whatsapp",
      detail: guest ? `Rappel pour ${guest.name}…` : "Envoi du rappel…",
    });
    setMessage("");
    try {
      const response = await fetch("/api/admin/whatsapp/reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId }),
      });
      const data = await response.json();
      setMessage(data.success ? "Rappel envoyé" : data.message);
      if (data.success) await refreshData();
    } finally {
      setBusyState(null);
    }
  }

  async function sendBulkReminders() {
    if (!confirm(`Envoyer jusqu'à ${reminderLimit || "tous les"} rappel(s) ?`)) {
      return;
    }

    const eligible = guests.filter((guest) => canSendReminder(guest));
    const recipients =
      reminderLimit > 0 ? eligible.slice(0, reminderLimit) : eligible;

    if (recipients.length === 0) {
      setMessage("Aucun invité éligible au rappel.");
      return;
    }

    setMessage("");
    let sentCount = 0;
    let failCount = 0;

    try {
      for (let index = 0; index < recipients.length; index += 1) {
        const guest = recipients[index];
        setBusyState({
          title: "Envoi des rappels",
          variant: "whatsapp",
          detail: `Rappel pour ${guest.name}…`,
          current: index + 1,
          total: recipients.length,
          sent: sentCount,
          failed: failCount,
        });

        try {
          const response = await fetch("/api/admin/whatsapp/reminder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ guestId: guest.id }),
          });
          const data = await response.json();
          if (data.success) sentCount += 1;
          else failCount += 1;
        } catch {
          failCount += 1;
        }

        setBusyState({
          title: "Envoi des rappels",
          variant: "whatsapp",
          detail: `Rappel pour ${guest.name}…`,
          current: index + 1,
          total: recipients.length,
          sent: sentCount,
          failed: failCount,
        });
      }

      setMessage(
        `${sentCount} rappel(s) envoyé(s), ${failCount} erreur(s)`,
      );
      await refreshData();
    } finally {
      setBusyState(null);
    }
  }

  function toggleAllOnPage(checked: boolean) {
    const next = new Set(selected);
    for (const guest of pageGuests) {
      if (guest.statusSend) continue;
      const phone = guest.phone.replace(/[^\d+]/g, "");
      if (checked) next.add(phone);
      else next.delete(phone);
    }
    setSelected(next);
  }

  const sectionMeta = SECTION_META[section];

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__brand">
          <Image
            src="/img/logo-white.png"
            alt="Nathan & Innocente"
            width={124}
            height={49}
            className="admin-sidebar__logo"
          />
          <p className="admin-sidebar__eyebrow">Dashboard</p>
          <p className="admin-sidebar__title">Administration</p>
        </div>

        <nav className="admin-nav" aria-label="Navigation admin">
          <button
            type="button"
            className={`admin-nav__item${section === "overview" ? " admin-nav__item--active" : ""}`}
            onClick={() => setSection("overview")}
          >
            <span className="admin-nav__icon">◫</span>
            Vue d&apos;ensemble
          </button>
          <button
            type="button"
            className={`admin-nav__item${section === "guests" ? " admin-nav__item--active" : ""}`}
            onClick={() => setSection("guests")}
          >
            <span className="admin-nav__icon">☰</span>
            Invités
          </button>
          <button
            type="button"
            className={`admin-nav__item${section === "ceremonies" ? " admin-nav__item--active" : ""}`}
            onClick={() => setSection("ceremonies")}
          >
            <span className="admin-nav__icon">⌁</span>
            Cérémonies
          </button>
          <button
            type="button"
            className={`admin-nav__item${section === "settings" ? " admin-nav__item--active" : ""}`}
            onClick={() => setSection("settings")}
          >
            <span className="admin-nav__icon">⚙</span>
            Configuration
          </button>
        </nav>

        <div className="admin-sidebar__footer">
          <Link href="/home" className="admin-btn admin-btn--sidebar">
            Voir le site
          </Link>
          <button type="button" onClick={logout} className="admin-btn admin-btn--sidebar">
            Déconnexion
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-header">
          <div>
            <h1 className="admin-header__title">{sectionMeta.title}</h1>
            <p className="admin-header__subtitle">{sectionMeta.subtitle}</p>
          </div>
          <div className="admin-actions">
            <a href="/api/admin/export/excel" className="admin-btn admin-btn--success">
              Export Excel
            </a>
            {section !== "guests" ? (
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                onClick={() => setSection("guests")}
              >
                Gérer les invités
              </button>
            ) : null}
          </div>
        </header>

        <div className="admin-content">
          {message ? <div className="admin-message-banner">{message}</div> : null}

          <AdminSectionPanel
            id="overview"
            activeSection={section}
            visitedSections={visitedSections}
          >
            <section className="admin-overview-grid" aria-label="Indicateurs principaux">
                <article className="admin-kpi admin-kpi--highlight">
                  <div className="admin-kpi__label">Invités total</div>
                  <div className="admin-kpi__value">{totalGuests.toLocaleString("fr-FR")}</div>
                  <div className="admin-kpi__hint">{stats.convivesTotal.toLocaleString("fr-FR")} convives attendus</div>
                </article>
                <article className="admin-kpi">
                  <div className="admin-kpi__label">Messages envoyés</div>
                  <div className="admin-kpi__value">{stats.messagesSent.toLocaleString("fr-FR")}</div>
                  <div className="admin-kpi__hint">Invitations WhatsApp</div>
                </article>
                <article className="admin-kpi">
                  <div className="admin-kpi__label">Confirmations</div>
                  <div className="admin-kpi__value">{stats.confirmationsTotal.toLocaleString("fr-FR")}</div>
                  <div className="admin-kpi__hint">{responseRate}% ont répondu</div>
                </article>
                <article className="admin-kpi">
                  <div className="admin-kpi__label">En attente</div>
                  <div className="admin-kpi__value">{stats.confirmationsPending.toLocaleString("fr-FR")}</div>
                  <div className="admin-kpi__hint">Sans réponse pour l&apos;instant</div>
                </article>
                <article className="admin-kpi">
                  <div className="admin-kpi__label">Dress code</div>
                  <div className="admin-kpi__value">{stats.dressCodeDownloads.toLocaleString("fr-FR")}</div>
                  <div className="admin-kpi__hint">{dressCodeRate}% ont téléchargé</div>
                </article>
              </section>

              <section className="admin-overview-panels">
                <article className="admin-panel">
                  <h2 className="admin-panel__title">Répartition des réponses</h2>
                  <div className="admin-progress-list">
                    <div className="admin-progress-item">
                      <div className="admin-progress-item__head">
                        <span>Disponibles</span>
                        <strong>{stats.availabilityYes.toLocaleString("fr-FR")} · {yesRate}%</strong>
                      </div>
                      <div className="admin-progress-item__bar">
                        <div className="admin-progress-item__fill admin-progress-item__fill--success" style={{ width: `${yesRate}%` }} />
                      </div>
                    </div>
                    <div className="admin-progress-item">
                      <div className="admin-progress-item__head">
                        <span>Non disponibles</span>
                        <strong>{stats.availabilityNo.toLocaleString("fr-FR")} · {percent(stats.availabilityNo, totalGuests)}%</strong>
                      </div>
                      <div className="admin-progress-item__bar">
                        <div className="admin-progress-item__fill admin-progress-item__fill--danger" style={{ width: `${percent(stats.availabilityNo, totalGuests)}%` }} />
                      </div>
                    </div>
                    <div className="admin-progress-item">
                      <div className="admin-progress-item__head">
                        <span>En attente</span>
                        <strong>{stats.confirmationsPending.toLocaleString("fr-FR")} · {pendingRate}%</strong>
                      </div>
                      <div className="admin-progress-item__bar">
                        <div className="admin-progress-item__fill admin-progress-item__fill--warning" style={{ width: `${pendingRate}%` }} />
                      </div>
                    </div>
                    <div className="admin-progress-item">
                      <div className="admin-progress-item__head">
                        <span>Dress code téléchargé</span>
                        <strong>{stats.dressCodeDownloads.toLocaleString("fr-FR")} · {dressCodeRate}%</strong>
                      </div>
                      <div className="admin-progress-item__bar">
                        <div className="admin-progress-item__fill" style={{ width: `${dressCodeRate}%` }} />
                      </div>
                    </div>
                  </div>
                </article>

                <article className="admin-panel">
                  <h2 className="admin-panel__title">Actions rapides</h2>
                  <div className="admin-quick-actions">
                    <button type="button" className="admin-btn admin-btn--primary" onClick={() => setSection("guests")}>
                      Ouvrir la liste des invités
                    </button>
                    <button type="button" disabled={busy} onClick={sendBulkReminders} className="admin-btn admin-btn--warning">
                      Rappels groupés ({reminderLimit || "∞"})
                    </button>
                    <button type="button" disabled={busy || selected.size === 0} onClick={sendBulkInvite} className="admin-btn admin-btn--secondary">
                      Envoyer sélection ({selected.size})
                    </button>
                    <a href="/api/admin/export/excel" className="admin-btn admin-btn--success">
                      Télécharger Excel
                    </a>
                  </div>
                </article>
              </section>

              <section className="admin-stats" style={{ marginTop: "1rem" }} aria-label="Statistiques détaillées">
                <article className="admin-stat">
                  <div className="admin-stat__label">Couples</div>
                  <div className="admin-stat__value">{stats.couplesTotal.toLocaleString("fr-FR")}</div>
                </article>
                <article className="admin-stat">
                  <div className="admin-stat__label">Singles</div>
                  <div className="admin-stat__value">{stats.singlesTotal.toLocaleString("fr-FR")}</div>
                </article>
                <article className="admin-stat">
                  <div className="admin-stat__label">Disponibles</div>
                  <div className="admin-stat__value">{stats.availabilityYes.toLocaleString("fr-FR")}</div>
                </article>
                <article className="admin-stat">
                  <div className="admin-stat__label">Dress code</div>
                  <div className="admin-stat__value">{stats.dressCodeDownloads.toLocaleString("fr-FR")}</div>
                </article>
              </section>
          </AdminSectionPanel>

          <AdminSectionPanel
            id="ceremonies"
            activeSection={section}
            visitedSections={visitedSections}
          >
            <CeremoniesSection
              guests={guests}
              busy={busy}
              setBusyState={setBusyState}
              onMessage={setMessage}
              activeCeremonyId={ceremonyId}
              onCeremonyChange={setCeremonyId}
            />
          </AdminSectionPanel>

          <AdminSectionPanel
            id="settings"
            activeSection={section}
            visitedSections={visitedSections}
          >
            <section className="admin-panel">
              <h2 className="admin-panel__title">Configuration template Twilio</h2>
              <div className="admin-template-grid">
                {Object.entries(variablesMap).map(([pos, value]) => (
                  <div key={pos} className="admin-template-row">
                    <span className="admin-template-badge">{`{{${pos}}}`}</span>
                    <select
                      value={value}
                      onChange={(e) =>
                        setVariablesMap((current) => ({
                          ...current,
                          [pos]: e.target.value,
                        }))
                      }
                      className="admin-select"
                    >
                      {VAR_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </section>
          </AdminSectionPanel>

          <AdminSectionPanel
            id="guests"
            activeSection={section}
            visitedSections={visitedSections}
          >
            <section className="admin-table-card">
              <div className="admin-toolbar">
                <div className="admin-toolbar__group">
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Rechercher nom ou téléphone..."
                    className="admin-field"
                    style={{ minWidth: "14rem", flex: "1 1 14rem" }}
                  />
                  <select
                    value={availabilityFilter}
                    onChange={(e) => {
                      setAvailabilityFilter(e.target.value);
                      setPage(1);
                    }}
                    className="admin-select"
                    style={{ width: "auto", minWidth: "11rem" }}
                  >
                    <option value="all">Disponibilité: Tous</option>
                    <option value="yes">Disponible</option>
                    <option value="no">Non disponible</option>
                    <option value="pending">En attente</option>
                  </select>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="admin-select"
                    style={{ width: "auto", minWidth: "7rem" }}
                  >
                    <option value={25}>25 / page</option>
                    <option value={50}>50 / page</option>
                    <option value={100}>100 / page</option>
                  </select>
                </div>

                <div className="admin-toolbar__group admin-toolbar__group--actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setAddGuestOpen(true)}
                    className="admin-btn admin-btn--success"
                  >
                    Ajouter
                  </button>
                  <select
                    value={reminderLimit}
                    onChange={(e) => setReminderLimit(Number(e.target.value))}
                    className="admin-select"
                    style={{ width: "auto", minWidth: "8rem" }}
                  >
                    <option value={10}>10 rappels</option>
                    <option value={25}>25 rappels</option>
                    <option value={50}>50 rappels</option>
                    <option value={100}>100 rappels</option>
                    <option value={0}>Tout (illimité)</option>
                  </select>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={sendBulkReminders}
                    className="admin-btn admin-btn--warning"
                  >
                    Rappels groupés
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={sendBulkInvite}
                    className="admin-btn admin-btn--primary"
                  >
                    Envoyer sélection ({selected.size})
                  </button>
                </div>
              </div>

              <div className="admin-table-wrap">
                {pageGuests.length === 0 ? (
                  <p className="admin-empty">Aucun invité ne correspond à votre recherche.</p>
                ) : (
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>
                          <input
                            type="checkbox"
                            aria-label="Sélectionner la page"
                            onChange={(e) => toggleAllOnPage(e.target.checked)}
                          />
                        </th>
                        <th>Nom</th>
                        <th>Téléphone</th>
                        <th>Convives</th>
                        <th>Confirmation</th>
                        <th>Messages</th>
                        <th>Device</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageGuests.map((guest) => {
                        const phoneKey = guest.phone.replace(/[^\d+]/g, "");

                        return (
                          <tr key={guest.id}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selected.has(phoneKey)}
                                disabled={guest.statusSend}
                                onChange={(e) => {
                                  const next = new Set(selected);
                                  if (e.target.checked) next.add(phoneKey);
                                  else next.delete(phoneKey);
                                  setSelected(next);
                                }}
                              />
                            </td>
                            <td className="admin-table__name">{guest.name}</td>
                            <td className="admin-table__phone">{guest.phone}</td>
                            <td>{guest.numGuests}</td>
                            <td>{availabilityBadge(guest)}</td>
                            <td>
                              {guest.statusSend ? (
                                <span className="admin-badge admin-badge--success">Invitation</span>
                              ) : null}
                              {guest.statusReminderSent ? (
                                <span className="admin-badge admin-badge--warning">Rappel</span>
                              ) : null}
                              {guest.dressCodeDownloadedAt ? (
                                <span className="admin-badge admin-badge--info">Dress code</span>
                              ) : null}
                              {!guest.statusSend && !guest.statusReminderSent && !guest.dressCodeDownloadedAt ? (
                                <span className="admin-badge admin-badge--muted">—</span>
                              ) : null}
                            </td>
                            <td>
                              {guest.deviceId ? (
                                <span className="admin-badge admin-badge--success">Lié</span>
                              ) : (
                                <span className="admin-badge admin-badge--muted">—</span>
                              )}
                            </td>
                            <td>
                              <div className="admin-table__actions">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => setEditingGuest(guest)}
                                  className="admin-btn admin-btn--secondary"
                                >
                                  Modifier
                                </button>
                                <button
                                  type="button"
                                  disabled={busy || guest.statusSend}
                                  onClick={() => sendInvite(guest.id)}
                                  className="admin-btn admin-btn--ghost"
                                >
                                  WhatsApp
                                </button>
                                <button
                                  type="button"
                                  disabled={busy || !canSendReminder(guest)}
                                  onClick={() => sendReminder(guest.id)}
                                  className="admin-btn admin-btn--warning"
                                >
                                  Rappel
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="admin-pagination">
                <span>
                  Affichage {(currentPage - 1) * pageSize + 1}–
                  {Math.min(currentPage * pageSize, filtered.length)} sur {filtered.length}
                </span>
                <div className="admin-pagination__controls">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="admin-btn admin-btn--secondary"
                  >
                    Précédent
                  </button>
                  <span>
                    Page {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="admin-btn admin-btn--secondary"
                  >
                    Suivant
                  </button>
                </div>
              </div>
            </section>
          </AdminSectionPanel>
        </div>
      </div>

      <GuestEditModal
        guest={editingGuest}
        busy={busy}
        onClose={() => {
          if (!busy) setEditingGuest(null);
        }}
        onSave={saveGuestEdit}
      />

      <GuestAddModal
        open={addGuestOpen}
        busy={busy}
        onBusyChange={setBusyState}
        onClose={() => {
          if (!busy) setAddGuestOpen(false);
        }}
        onCreated={async (createdMessage) => {
          setBusyState({
            title: "Actualisation",
            detail: "Mise à jour de la liste des invités…",
          });
          try {
            await refreshData();
            setMessage(createdMessage);
            setSection("guests");
          } finally {
            setBusyState(null);
          }
        }}
      />

      <AdminBusyOverlay state={busyState} />
    </div>
  );
}
