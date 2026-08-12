"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { CeremoniesSection } from "@/components/admin/ceremonies-section";
import { DuplicatesSection } from "@/components/admin/duplicates-section";
import { FictitiousGuestsSection } from "@/components/admin/fictitious-guests-section";
import { GuestAddModal } from "@/components/admin/guest-add-modal";
import { GuestEditModal } from "@/components/admin/guest-edit-modal";
import { InvitationsSection } from "@/components/admin/invitations-section";
import { MessagesSection } from "@/components/admin/messages-section";
import { AdminConfirmModal } from "@/components/admin/admin-confirm-modal";
import {
  AdminBusyOverlay,
  type AdminBusyState,
} from "@/components/admin/admin-busy-overlay";
import type { CeremonyId } from "@/lib/admin/ceremony-types";
import {
  INVITE_VARIABLES_MAP,
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
  activeWhen?: AdminSection[];
  children: ReactNode;
};

function AdminSectionPanel({
  id,
  activeSection,
  visitedSections,
  activeWhen,
  children,
}: AdminSectionPanelProps) {
  const sections = activeWhen ?? [id];
  const wasVisited = sections.some((sectionId) => visitedSections.has(sectionId));
  if (!wasVisited) return null;
  const isActive = sections.includes(activeSection);

  return (
    <div className="admin-section-panel" hidden={!isActive}>
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
    subtitle: "Recherchez, filtrez et gérez la liste des invités",
  },
  fictitious: {
    title: "Numéros fictifs",
    subtitle:
      "Invités sans téléphone réel — assignez un numéro pour WhatsApp",
  },
  duplicates: {
    title: "Doublons",
    subtitle:
      "Même téléphone, nom différent — fusionnez, renommez ou ignorez",
  },
  messages: {
    title: "Messages",
    subtitle:
      "Envoyez les invitations et rappels WhatsApp aux invités déjà affectés à une table",
  },
  invitations: {
    title: "Invitations",
    subtitle:
      "Confirmations des invités affectés à une table — réinitialisez si besoin",
  },
  ceremonies: {
    title: "Cérémonies & tables",
    subtitle: "Affectez les invités aux cérémonies et organisez le plan de table",
  },
  tables: {
    title: "Tables",
    subtitle: "Consultez les tables et les invités affectés",
  },
  groups: {
    title: "Groupes",
    subtitle: "Consultez les groupes et leurs membres",
  },
  settings: {
    title: "Configuration",
    subtitle: "Template Twilio et maintenance de la base",
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
    INVITE_VARIABLES_MAP,
  );
  const [search, setSearch] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [busyState, setBusyState] = useState<AdminBusyState>(null);
  const busy = busyState !== null;
  const [message, setMessage] = useState("");
  const [editingGuest, setEditingGuest] = useState<AdminGuest | null>(null);
  const [addGuestOpen, setAddGuestOpen] = useState(false);
  const [resetDbOpen, setResetDbOpen] = useState(false);
  const [resetDbConfirm, setResetDbConfirm] = useState("");
  const [resettingDb, setResettingDb] = useState(false);

  useEffect(() => {
    setVisitedSections((current) => {
      if (current.has(section)) return current;
      const next = new Set(current);
      next.add(section);
      return next;
    });
  }, [section]);

  const refreshData = useCallback(async () => {
    const response = await fetch("/api/admin/guests");
    const data = await response.json();
    if (data.success) {
      setGuests(data.guests);
      setStats(data.stats);
    }
  }, []);

  useEffect(() => {
    void refreshData();
  }, [section, refreshData]);

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

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    router.refresh();
  }

  async function confirmResetDatabase() {
    if (resetDbConfirm.trim().toUpperCase() !== "VIDER") {
      setMessage('Tapez VIDER pour confirmer le reset de la base.');
      return;
    }

    setResettingDb(true);
    setBusyState({
      title: "Reset base de données",
      detail: "Suppression de tous les invités, tables, groupes…",
    });

    try {
      const response = await fetch("/api/admin/reset-db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "VIDER" }),
      });
      const data = await response.json();

      if (!data.success) {
        setMessage(data.message ?? "Reset impossible");
        return;
      }

      setGuests([]);
      setStats({
        messagesSent: 0,
        confirmationsTotal: 0,
        availabilityYes: 0,
        availabilityNo: 0,
        confirmationsPending: 0,
        convivesTotal: 0,
        couplesTotal: 0,
        singlesTotal: 0,
        dressCodeDownloads: 0,
      });
      setMessage(data.message ?? "Base vidée");
      setResetDbOpen(false);
      setResetDbConfirm("");
      await refreshData();
    } catch {
      setMessage("Erreur réseau lors du reset de la base.");
    } finally {
      setResettingDb(false);
      setBusyState(null);
    }
  }

  async function saveGuestEdit(payload: {
    guestId: string;
    name: string;
    phone: string;
    numGuests: number;
    guestType: "standard" | "honor";
    groupName: string;
    ceremonyIds: CeremonyId[];
    ceremonyNumGuests: Array<{ ceremonyId: CeremonyId; numGuests: number }>;
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
          guestType: payload.guestType,
          groupName: payload.groupName,
          ceremonyIds: payload.ceremonyIds,
          ceremonyNumGuests: payload.ceremonyNumGuests,
          resetCeremonyIds: payload.resetCeremonyIds,
        }),
      });
      const data = await response.json();
      if (!data.success) {
        setMessage(data.message ?? "Modification impossible");
        return false;
      }

      setGuests((current) => {
        let next = current;
        if (typeof data.removedGuestId === "string") {
          next = current.filter((guest) => guest.id !== data.removedGuestId);
        }

        const updatedGuest = data.guest as AdminGuest;
        const exists = next.some((guest) => guest.id === updatedGuest.id);
        next = exists
          ? next.map((guest) =>
              guest.id === updatedGuest.id ? updatedGuest : guest,
            )
          : [...next, updatedGuest].sort((a, b) =>
              a.name.localeCompare(b.name, "fr"),
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

  const sectionMeta = SECTION_META[section];
  const ceremonyViewMode =
    section === "tables" ? "tables" : section === "groups" ? "groups" : "guests";

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
            className={`admin-nav__item${section === "fictitious" ? " admin-nav__item--active" : ""}`}
            onClick={() => setSection("fictitious")}
          >
            <span className="admin-nav__icon">⌀</span>
            N° fictifs
          </button>
          <button
            type="button"
            className={`admin-nav__item${section === "duplicates" ? " admin-nav__item--active" : ""}`}
            onClick={() => setSection("duplicates")}
          >
            <span className="admin-nav__icon">⇄</span>
            Doublons
          </button>
          <button
            type="button"
            className={`admin-nav__item${section === "messages" ? " admin-nav__item--active" : ""}`}
            onClick={() => setSection("messages")}
          >
            <span className="admin-nav__icon">💬</span>
            Messages
          </button>
          <button
            type="button"
            className={`admin-nav__item${section === "invitations" ? " admin-nav__item--active" : ""}`}
            onClick={() => setSection("invitations")}
          >
            <span className="admin-nav__icon">✉</span>
            Invitations
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
            className={`admin-nav__item${section === "tables" ? " admin-nav__item--active" : ""}`}
            onClick={() => setSection("tables")}
          >
            <span className="admin-nav__icon">▦</span>
            Tables
          </button>
          <button
            type="button"
            className={`admin-nav__item${section === "groups" ? " admin-nav__item--active" : ""}`}
            onClick={() => setSection("groups")}
          >
            <span className="admin-nav__icon">◉</span>
            Groupes
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
          <Link href="/notre-histoire" className="admin-btn admin-btn--sidebar">
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
                    <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setSection("duplicates")}>
                      Voir les doublons
                    </button>
                    <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setSection("messages")}>
                      Messages WhatsApp
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
            activeWhen={["ceremonies", "tables", "groups"]}
          >
            <CeremoniesSection
              guests={guests}
              busy={busy}
              setBusyState={setBusyState}
              onMessage={setMessage}
              active={
                section === "ceremonies" ||
                section === "tables" ||
                section === "groups"
              }
              activeCeremonyId={ceremonyId}
              viewMode={ceremonyViewMode}
              showViewTabs={section === "ceremonies"}
              onCeremonyChange={setCeremonyId}
            />
          </AdminSectionPanel>

          <AdminSectionPanel
            id="invitations"
            activeSection={section}
            visitedSections={visitedSections}
          >
            <InvitationsSection
              guests={guests}
              busy={busy}
              setBusyState={setBusyState}
              onMessage={setMessage}
              onGuestUpdated={(guest) => {
                setGuests((current) => {
                  const next = current.map((item) =>
                    item.id === guest.id ? guest : item,
                  );
                  setStats(computeStats(next));
                  return next;
                });
              }}
            />
          </AdminSectionPanel>

          <AdminSectionPanel
            id="fictitious"
            activeSection={section}
            visitedSections={visitedSections}
          >
            <FictitiousGuestsSection
              busy={busy}
              active={section === "fictitious"}
              setBusyState={setBusyState}
              onMessage={setMessage}
              onGuestUpdated={(guest) => {
                setGuests((current) => {
                  const next = current.map((item) =>
                    item.id === guest.id ? guest : item,
                  );
                  setStats(computeStats(next));
                  return next;
                });
              }}
            />
          </AdminSectionPanel>

          <AdminSectionPanel
            id="duplicates"
            activeSection={section}
            visitedSections={visitedSections}
          >
            <DuplicatesSection
              busy={busy}
              active={section === "duplicates"}
              setBusyState={setBusyState}
              onMessage={setMessage}
              onGuestUpdated={(guest) => {
                setGuests((current) => {
                  const next = current.map((item) =>
                    item.id === guest.id ? guest : item,
                  );
                  setStats(computeStats(next));
                  return next;
                });
              }}
            />
          </AdminSectionPanel>

          <AdminSectionPanel
            id="messages"
            activeSection={section}
            visitedSections={visitedSections}
          >
            <MessagesSection
              guests={guests}
              busy={busy}
              setBusyState={setBusyState}
              onMessage={setMessage}
              onRefresh={refreshData}
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

            <section className="admin-panel admin-settings-danger" style={{ marginTop: "1rem" }}>
              <h2 className="admin-panel__title">Zone dangereuse</h2>
              <p className="admin-settings-danger__text">
                Vide toute la base : invités, doublons, tables, groupes, affectations
                et cérémonies. Le schéma est conservé ; les cérémonies seront
                recréées au prochain usage.
              </p>
              <button
                type="button"
                className="admin-btn admin-btn--danger"
                disabled={busy}
                onClick={() => {
                  setResetDbConfirm("");
                  setResetDbOpen(true);
                }}
              >
                Reset DB
              </button>
            </section>

            <AdminConfirmModal
              open={resetDbOpen}
              busy={resettingDb}
              eyebrow="Zone dangereuse"
              title="Vider toute la base de données ?"
              tone="danger"
              confirmLabel="Vider la base"
              confirmDisabled={resetDbConfirm.trim().toUpperCase() !== "VIDER"}
              description={
                <>
                  Cette action est irréversible. Tous les invités, doublons,
                  tables, groupes et RSVP seront supprimés.
                  <label
                    className="admin-modal__field"
                    style={{ display: "block", marginTop: "1rem" }}
                  >
                    <span>Tapez <strong>VIDER</strong> pour confirmer</span>
                    <input
                      type="text"
                      className="admin-input"
                      value={resetDbConfirm}
                      disabled={resettingDb}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="VIDER"
                      onChange={(e) => setResetDbConfirm(e.target.value)}
                      style={{ marginTop: "0.4rem", width: "100%" }}
                    />
                  </label>
                </>
              }
              onClose={() => {
                if (resettingDb) return;
                setResetDbOpen(false);
                setResetDbConfirm("");
              }}
              onConfirm={() => {
                void confirmResetDatabase();
              }}
            />
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
                  <button
                    type="button"
                    className="admin-btn admin-btn--secondary"
                    onClick={() => setSection("messages")}
                  >
                    Messages WhatsApp
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
                        <th>Nom</th>
                        <th>Téléphone</th>
                        <th>Type</th>
                        <th>Convives</th>
                        <th>Confirmation</th>
                        <th>Messages</th>
                        <th>Device</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageGuests.map((guest) => (
                          <tr key={guest.id}>
                            <td className="admin-table__name">{guest.name}</td>
                            <td className="admin-table__phone">
                              {guest.phone}
                              {guest.phoneFictitious ? (
                                <>
                                  {" "}
                                  <span className="admin-badge admin-badge--warning">
                                    fictif
                                  </span>
                                </>
                              ) : null}
                            </td>
                            <td>
                              {guest.guestType === "honor" ? (
                                <span className="admin-badge admin-badge--info">
                                  Honneur
                                </span>
                              ) : (
                                <span className="admin-badge admin-badge--muted">
                                  Standard
                                </span>
                              )}
                            </td>
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
                              </div>
                            </td>
                          </tr>
                        ))}
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
