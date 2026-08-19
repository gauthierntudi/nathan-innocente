"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { CeremoniesSection } from "@/components/admin/ceremonies-section";
import { CompareSection } from "@/components/admin/compare-section";
import { ConvivesSection } from "@/components/admin/convives-section";
import { DuplicatesSection } from "@/components/admin/duplicates-section";
import { FictitiousGuestsSection } from "@/components/admin/fictitious-guests-section";
import { GuestAddModal } from "@/components/admin/guest-add-modal";
import { GuestEditModal } from "@/components/admin/guest-edit-modal";
import { InvitationsSection } from "@/components/admin/invitations-section";
import { MessagesSection } from "@/components/admin/messages-section";
import { GroupExportPicker } from "@/components/admin/group-export-picker";
import { GuestDateExportPicker } from "@/components/admin/guest-date-export-picker";
import { AdminConfirmModal } from "@/components/admin/admin-confirm-modal";
import {
  AdminBusyOverlay,
  type AdminBusyState,
} from "@/components/admin/admin-busy-overlay";
import {
  CEREMONY_DEFINITIONS,
  type CeremonyId,
} from "@/lib/admin/ceremony-types";
import {
  filterAdminGuests,
  getGuestConvivesCount,
} from "@/lib/admin/guest-search";
import {
  INVITE_VARIABLES_MAP,
  canResendConfirmation,
  computeStats,
  getConfirmedCeremonyStatuses,
  getGuestRsvpSummary,
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

function availabilityBadge(
  guest: AdminGuest,
  ceremonyId?: CeremonyId | null,
) {
  if (ceremonyId) {
    const status = (guest.ceremonyStatuses ?? []).find(
      (item) => item.ceremonyId === ceremonyId,
    );
    if (!status || status.availability === null) {
      return <span className="admin-badge admin-badge--muted">En attente</span>;
    }
    if (status.availability) {
      return (
        <span className="admin-badge admin-badge--success">
          Oui ({status.confirmedGuests})
        </span>
      );
    }
    return <span className="admin-badge admin-badge--danger">Non</span>;
  }

  const summary = getGuestRsvpSummary(guest);

  if (summary.key === "yes") {
    const detail =
      summary.yes + summary.no + summary.pending > 1
        ? ` · ${summary.yes} oui${summary.no > 0 ? ` / ${summary.no} non` : ""}${
            summary.pending > 0 ? ` / ${summary.pending} attente` : ""
          }`
        : "";
    return (
      <span className="admin-badge admin-badge--success">
        Oui ({summary.confirmedGuests}){detail}
      </span>
    );
  }

  if (summary.key === "no") {
    const detail =
      summary.no + summary.pending > 1
        ? ` · ${summary.no} non${
            summary.pending > 0 ? ` / ${summary.pending} attente` : ""
          }`
        : "";
    return (
      <span className="admin-badge admin-badge--danger">Non{detail}</span>
    );
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
  convives: {
    title: "Convives par cérémonie",
    subtitle: "Total des places attendues pour chaque cérémonie",
  },
  compare: {
    title: "Comparer",
    subtitle: "Rapport des écarts entre un fichier Excel/CSV et la base",
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
      "Envoyez les invitations et rappels WhatsApp aux invités avec invitation activée",
  },
  invitations: {
    title: "Invitations",
    subtitle:
      "Confirmations des invités avec invitation activée — réinitialisez si besoin",
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
  const [guestTypeFilter, setGuestTypeFilter] = useState<"all" | "honor" | "standard">(
    "all",
  );
  const [ceremonyFilter, setCeremonyFilter] = useState<"all" | CeremonyId>("all");
  const [messageFilter, setMessageFilter] = useState<
    "all" | "invite_sent" | "invite_pending" | "reminder_sent" | "dress_code"
  >("all");
  const [deviceFilter, setDeviceFilter] = useState<"all" | "linked" | "none">("all");
  const [phoneFilter, setPhoneFilter] = useState<"all" | "real" | "fictitious">(
    "all",
  );
  const [convivesFilter, setConvivesFilter] = useState<"all" | number>("all");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [busyState, setBusyState] = useState<AdminBusyState>(null);
  const busy = busyState !== null;
  const [message, setMessage] = useState("");
  const [editingGuest, setEditingGuest] = useState<AdminGuest | null>(null);
  const [deletingGuest, setDeletingGuest] = useState<AdminGuest | null>(null);
  const [addGuestOpen, setAddGuestOpen] = useState(false);
  const [resetDbOpen, setResetDbOpen] = useState(false);
  const [resetDbConfirm, setResetDbConfirm] = useState("");
  const [resettingDb, setResettingDb] = useState(false);
  const [coupleSeatsOpen, setCoupleSeatsOpen] = useState(false);
  const [groupExportOpen, setGroupExportOpen] = useState(false);
  const [dateExportOpen, setDateExportOpen] = useState(false);
  const [confirmResendOpen, setConfirmResendOpen] = useState(false);
  const [selectedGuestIds, setSelectedGuestIds] = useState<Set<string>>(
    () => new Set(),
  );

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

  const filtered = useMemo(
    () =>
      filterAdminGuests(guests, {
        search,
        availability: availabilityFilter as "all" | "yes" | "no" | "pending",
        guestType: guestTypeFilter,
        ceremonyId: ceremonyFilter,
        message: messageFilter,
        device: deviceFilter,
        phone: phoneFilter,
        convives: convivesFilter,
      }),
    [
      guests,
      search,
      availabilityFilter,
      guestTypeFilter,
      ceremonyFilter,
      messageFilter,
      deviceFilter,
      phoneFilter,
      convivesFilter,
    ],
  );

  const convivesColumnCeremony =
    ceremonyFilter === "all" ? null : ceremonyFilter;

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageGuests = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const pageGuestIds = useMemo(
    () => pageGuests.map((guest) => guest.id),
    [pageGuests],
  );
  const allPageSelected =
    pageGuestIds.length > 0 &&
    pageGuestIds.every((id) => selectedGuestIds.has(id));
  const selectedCount = useMemo(
    () => filtered.filter((guest) => selectedGuestIds.has(guest.id)).length,
    [filtered, selectedGuestIds],
  );
  const selectedConfirmGuests = useMemo(
    () =>
      filtered.filter(
        (guest) =>
          selectedGuestIds.has(guest.id) && canResendConfirmation(guest),
      ),
    [filtered, selectedGuestIds],
  );
  const selectedConfirmMessages = useMemo(
    () =>
      selectedConfirmGuests.reduce((sum, guest) => {
        const count = getConfirmedCeremonyStatuses(guest).length;
        return sum + (count > 0 ? count : guest.availability === true ? 1 : 0);
      }, 0),
    [selectedConfirmGuests],
  );

  function toggleGuestSelected(guestId: string, checked: boolean) {
    setSelectedGuestIds((current) => {
      const next = new Set(current);
      if (checked) next.add(guestId);
      else next.delete(guestId);
      return next;
    });
  }

  function toggleSelectPage(checked: boolean) {
    setSelectedGuestIds((current) => {
      const next = new Set(current);
      for (const id of pageGuestIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function selectAllFiltered() {
    setSelectedGuestIds(new Set(filtered.map((guest) => guest.id)));
  }

  function clearSelection() {
    setSelectedGuestIds(new Set());
  }

  async function setInvitationEnabledBulk(
    guestIds: string[],
    enabled: boolean,
  ) {
    if (guestIds.length === 0) return;

    setBusyState({
      title: enabled ? "Activation invitation" : "Désactivation invitation",
      detail: `${guestIds.length} invité${guestIds.length > 1 ? "s" : ""}…`,
    });
    setMessage("");

    try {
      const response = await fetch("/api/admin/guests/invitation-enabled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestIds, enabled }),
      });
      const data = await response.json();
      if (!data.success) {
        setMessage(data.message ?? "Mise à jour impossible");
        return;
      }

      const updatedGuests = (data.guests ?? []) as AdminGuest[];
      const updatedById = new Map(
        updatedGuests.map((guest) => [guest.id, guest]),
      );

      setGuests((current) => {
        const next = current.map((guest) => updatedById.get(guest.id) ?? guest);
        setStats(computeStats(next));
        return next;
      });
      setEditingGuest((current) =>
        current && updatedById.has(current.id)
          ? updatedById.get(current.id) ?? current
          : current,
      );
      setMessage(data.message ?? "Invitations mises à jour");
    } catch {
      setMessage("Erreur réseau lors de la mise à jour des invitations.");
    } finally {
      setBusyState(null);
    }
  }

  async function executeConfirmResend() {
    const recipients = selectedConfirmGuests;
    if (recipients.length === 0) {
      setMessage("Aucun invité sélectionné n'a confirmé (disponible).");
      return;
    }

    setConfirmResendOpen(false);
    setMessage("");
    let sentCount = 0;
    let failCount = 0;

    try {
      for (let index = 0; index < recipients.length; index += 1) {
        const guest = recipients[index];
        const ceremonyCount = getConfirmedCeremonyStatuses(guest).length || 1;
        setBusyState({
          title: "Renvoi confirmation",
          variant: "whatsapp",
          detail: `Confirmation pour ${guest.name} (${ceremonyCount} cérémonie${ceremonyCount > 1 ? "s" : ""})…`,
          current: index + 1,
          total: recipients.length,
          sent: sentCount,
          failed: failCount,
        });

        try {
          const response = await fetch("/api/admin/whatsapp/confirm", {
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
      }

      setMessage(`Confirmations — Envoyés: ${sentCount} | Erreurs: ${failCount}`);
      await refreshData();
      clearSelection();
    } finally {
      setBusyState(null);
    }
  }

  const totalGuests = guests.length;
  const rsvpTotal =
    stats.availabilityYes + stats.availabilityNo + stats.confirmationsPending;
  const rsvpBase = rsvpTotal || totalGuests;
  const responseRate = percent(stats.confirmationsTotal, rsvpBase);
  const yesRate = percent(stats.availabilityYes, rsvpBase);
  const noRate = percent(stats.availabilityNo, rsvpBase);
  const pendingRate = percent(stats.confirmationsPending, rsvpBase);
  const dressCodeRate = percent(stats.dressCodeDownloads, totalGuests);

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    router.refresh();
  }

  async function confirmCoupleSeatsBackfill() {
    setCoupleSeatsOpen(false);
    setBusyState({
      title: "Règle couple",
      detail: "Mise à jour des convives pour les noms couple…",
    });
    setMessage("");

    try {
      const response = await fetch("/api/admin/guests/couple-seats", {
        method: "POST",
      });
      const data = await response.json();
      if (!data.success) {
        setMessage(data.message ?? "Impossible d'appliquer la règle couple");
        return;
      }
      await refreshData();
      setMessage(data.message ?? "Règle couple appliquée");
    } catch {
      setMessage("Erreur réseau lors de l'application de la règle couple.");
    } finally {
      setBusyState(null);
    }
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

  async function confirmDeleteGuest() {
    if (!deletingGuest || busy) return;
    const guest = deletingGuest;

    setBusyState({
      title: "Suppression",
      detail: `Suppression de ${guest.name}…`,
    });
    setMessage("");

    try {
      const response = await fetch(`/api/admin/guests/${guest.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!data.success) {
        setMessage(data.message ?? "Suppression impossible");
        return;
      }

      setGuests((current) => {
        const next = current.filter((item) => item.id !== guest.id);
        setStats(computeStats(next));
        return next;
      });
      if (editingGuest?.id === guest.id) setEditingGuest(null);
      setDeletingGuest(null);
      setMessage(data.message ?? `Invité « ${guest.name} » supprimé`);
    } catch {
      setMessage("Erreur réseau lors de la suppression.");
    } finally {
      setBusyState(null);
    }
  }

  async function saveGuestEdit(payload: {
    guestId: string;
    name: string;
    phone: string;
    numGuests: number;
    guestType: "standard" | "honor";
    invitationEnabled: boolean;
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
          invitationEnabled: payload.invitationEnabled,
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
            className={`admin-nav__item${section === "convives" ? " admin-nav__item--active" : ""}`}
            onClick={() => setSection("convives")}
          >
            <span className="admin-nav__icon">▣</span>
            Convives
          </button>
          <button
            type="button"
            className={`admin-nav__item${section === "compare" ? " admin-nav__item--active" : ""}`}
            onClick={() => setSection("compare")}
          >
            <span className="admin-nav__icon">⧉</span>
            Comparer
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
            <button
              type="button"
              className="admin-btn admin-btn--success"
              onClick={() => setGroupExportOpen(true)}
            >
              Excel par groupe
            </button>
            <a
              href="/api/admin/export/excel/ceremonies"
              className="admin-btn admin-btn--success"
            >
              Excel par cérémonie
            </a>
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              onClick={() => setDateExportOpen(true)}
            >
              Export invités
            </button>
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
                  <p className="admin-panel__hint" style={{ marginTop: "-0.35rem", marginBottom: "0.85rem" }}>
                    Comptage par cérémonie (comme Invitations), pas par fiche invité.
                  </p>
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
                        <strong>{stats.availabilityNo.toLocaleString("fr-FR")} · {noRate}%</strong>
                      </div>
                      <div className="admin-progress-item__bar">
                        <div className="admin-progress-item__fill admin-progress-item__fill--danger" style={{ width: `${noRate}%` }} />
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
                    <button
                      type="button"
                      className="admin-btn admin-btn--success"
                      onClick={() => setGroupExportOpen(true)}
                    >
                      Excel par groupe
                    </button>
                    <a href="/api/admin/export/excel/ceremonies" className="admin-btn admin-btn--success">
                      Excel par cérémonie
                    </a>
                    <button
                      type="button"
                      className="admin-btn admin-btn--secondary"
                      onClick={() => setDateExportOpen(true)}
                    >
                      Export invités
                    </button>
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

            <section className="admin-panel" style={{ marginTop: "1rem" }}>
              <h2 className="admin-panel__title">Maintenance invités</h2>
              <p className="admin-settings-danger__text">
                Applique la règle couple aux invités déjà enregistrés : noms du
                type <code>Couple…</code>, <code>Me &amp; Mme</code>,{" "}
                <code>Mr &amp; Mme</code>, <code>Nom1 &amp; Nom2</code> → au
                moins 2 convives sur chaque cérémonie.
              </p>
              <button
                type="button"
                className="admin-btn admin-btn--secondary"
                disabled={busy}
                onClick={() => setCoupleSeatsOpen(true)}
              >
                Corriger les convives couples
              </button>
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
              open={coupleSeatsOpen}
              busy={busy}
              eyebrow="Maintenance"
              title="Corriger les convives couples ?"
              tone="primary"
              confirmLabel="Appliquer"
              description={
                <>
                  Parcourt tous les invités déjà en base. Pour chaque nom détecté
                  comme couple, met à jour le nombre de convives et les places
                  par cérémonie à <strong>au moins 2</strong>. Les valeurs déjà
                  ≥ 2 ne sont pas réduites.
                </>
              }
              onClose={() => {
                if (!busy) setCoupleSeatsOpen(false);
              }}
              onConfirm={() => {
                void confirmCoupleSeatsBackfill();
              }}
            />

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
                    placeholder="Rechercher nom, téléphone, groupe, cérémonie…"
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
                    <option value="yes">Au moins un oui</option>
                    <option value="no">Au moins un non</option>
                    <option value="pending">Au moins une attente</option>
                  </select>
                  <select
                    value={guestTypeFilter}
                    onChange={(e) => {
                      setGuestTypeFilter(
                        e.target.value as "all" | "honor" | "standard",
                      );
                      setPage(1);
                    }}
                    className="admin-select"
                    style={{ width: "auto", minWidth: "10rem" }}
                  >
                    <option value="all">Type: Tous</option>
                    <option value="honor">Honneur</option>
                    <option value="standard">Standard</option>
                  </select>
                  <select
                    value={ceremonyFilter}
                    onChange={(e) => {
                      setCeremonyFilter(e.target.value as "all" | CeremonyId);
                      setPage(1);
                    }}
                    className="admin-select"
                    style={{ width: "auto", minWidth: "12rem" }}
                  >
                    <option value="all">Cérémonie: Toutes</option>
                    {CEREMONY_DEFINITIONS.map((ceremony) => (
                      <option key={ceremony.id} value={ceremony.id}>
                        {ceremony.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={messageFilter}
                    onChange={(e) => {
                      setMessageFilter(
                        e.target.value as
                          | "all"
                          | "invite_sent"
                          | "invite_pending"
                          | "reminder_sent"
                          | "dress_code",
                      );
                      setPage(1);
                    }}
                    className="admin-select"
                    style={{ width: "auto", minWidth: "12rem" }}
                  >
                    <option value="all">Messages: Tous</option>
                    <option value="invite_sent">Invitation envoyée</option>
                    <option value="invite_pending">Invitation non envoyée</option>
                    <option value="reminder_sent">Rappel envoyé</option>
                    <option value="dress_code">Dress code téléchargé</option>
                  </select>
                  <select
                    value={deviceFilter}
                    onChange={(e) => {
                      setDeviceFilter(
                        e.target.value as "all" | "linked" | "none",
                      );
                      setPage(1);
                    }}
                    className="admin-select"
                    style={{ width: "auto", minWidth: "10rem" }}
                  >
                    <option value="all">Device: Tous</option>
                    <option value="linked">Device lié</option>
                    <option value="none">Sans device</option>
                  </select>
                  <select
                    value={phoneFilter}
                    onChange={(e) => {
                      setPhoneFilter(
                        e.target.value as "all" | "real" | "fictitious",
                      );
                      setPage(1);
                    }}
                    className="admin-select"
                    style={{ width: "auto", minWidth: "11rem" }}
                  >
                    <option value="all">Téléphone: Tous</option>
                    <option value="real">Numéro réel</option>
                    <option value="fictitious">Numéro fictif</option>
                  </select>
                  <select
                    value={convivesFilter === "all" ? "all" : String(convivesFilter)}
                    onChange={(e) => {
                      const value = e.target.value;
                      setConvivesFilter(
                        value === "all" ? "all" : Number(value),
                      );
                      setPage(1);
                    }}
                    className="admin-select"
                    style={{ width: "auto", minWidth: "10rem" }}
                  >
                    <option value="all">Convives: Tous</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(
                      (count) => (
                        <option key={count} value={count}>
                          {count} convive{count > 1 ? "s" : ""}
                        </option>
                      ),
                    )}
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
                    onClick={() => setDateExportOpen(true)}
                  >
                    Export par date
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

              {filtered.length > 0 ? (
                <div className="admin-unassigned-bulk" style={{ margin: "0.75rem 0" }}>
                  <p className="admin-unassigned-bulk__label">
                    Invitation — {selectedCount} sélectionné
                    {selectedCount > 1 ? "s" : ""}
                    {selectedCount === 0
                      ? ` · ${filtered.length} dans le filtre`
                      : ""}
                  </p>
                  <div className="admin-unassigned-bulk__controls">
                    <button
                      type="button"
                      className="admin-btn admin-btn--secondary"
                      disabled={busy || pageGuestIds.length === 0}
                      onClick={() => toggleSelectPage(!allPageSelected)}
                    >
                      {allPageSelected ? "Désél. page" : "Sél. page"}
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn--secondary"
                      disabled={busy || filtered.length === 0}
                      onClick={selectAllFiltered}
                    >
                      Tout sélectionner ({filtered.length})
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost"
                      disabled={busy || selectedCount === 0}
                      onClick={clearSelection}
                    >
                      Vider
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn--success"
                      disabled={busy || selectedConfirmGuests.length === 0}
                      onClick={() => setConfirmResendOpen(true)}
                    >
                      Renvoyer confirmation ({selectedConfirmGuests.length}
                      {selectedConfirmMessages > selectedConfirmGuests.length
                        ? ` · ${selectedConfirmMessages} msg`
                        : ""}
                      )
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn--success"
                      disabled={busy || selectedCount === 0}
                      onClick={() =>
                        void setInvitationEnabledBulk(
                          [...selectedGuestIds].filter((id) =>
                            filtered.some((guest) => guest.id === id),
                          ),
                          true,
                        )
                      }
                    >
                      Activer sélection ({selectedCount})
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn--secondary"
                      disabled={busy || selectedCount === 0}
                      onClick={() =>
                        void setInvitationEnabledBulk(
                          [...selectedGuestIds].filter((id) =>
                            filtered.some((guest) => guest.id === id),
                          ),
                          false,
                        )
                      }
                    >
                      Désactiver sélection
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn--primary"
                      disabled={busy || filtered.length === 0}
                      onClick={() =>
                        void setInvitationEnabledBulk(
                          filtered.map((guest) => guest.id),
                          true,
                        )
                      }
                    >
                      Activer tous ({filtered.length})
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn--secondary"
                      disabled={busy || filtered.length === 0}
                      onClick={() =>
                        void setInvitationEnabledBulk(
                          filtered.map((guest) => guest.id),
                          false,
                        )
                      }
                    >
                      Désactiver tous
                    </button>
                  </div>
                </div>
              ) : null}

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
                            checked={allPageSelected}
                            disabled={busy || pageGuestIds.length === 0}
                            onChange={(e) => toggleSelectPage(e.target.checked)}
                          />
                        </th>
                        <th>Nom</th>
                        <th>Téléphone</th>
                        <th>Type</th>
                        <th>Invitation</th>
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
                            <td>
                              <input
                                type="checkbox"
                                aria-label={`Sélectionner ${guest.name}`}
                                checked={selectedGuestIds.has(guest.id)}
                                disabled={busy}
                                onChange={(e) =>
                                  toggleGuestSelected(guest.id, e.target.checked)
                                }
                              />
                            </td>
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
                            <td>
                              <label className="admin-modal__checkbox-row">
                                <input
                                  type="checkbox"
                                  checked={Boolean(guest.invitationEnabled)}
                                  disabled={busy}
                                  aria-label={`Invitation pour ${guest.name}`}
                                  onChange={(e) =>
                                    void setInvitationEnabledBulk(
                                      [guest.id],
                                      e.target.checked,
                                    )
                                  }
                                />
                                <span>
                                  {guest.invitationEnabled ? "Oui" : "Non"}
                                </span>
                              </label>
                            </td>
                            <td>{getGuestConvivesCount(guest, convivesColumnCeremony)}</td>
                            <td>
                              {availabilityBadge(
                                guest,
                                ceremonyFilter === "all" ? null : ceremonyFilter,
                              )}
                            </td>
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
                                  disabled={busy}
                                  onClick={() => setDeletingGuest(guest)}
                                  className="admin-btn admin-btn--danger"
                                >
                                  Supprimer
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

          <AdminSectionPanel
            id="convives"
            activeSection={section}
            visitedSections={visitedSections}
          >
            <ConvivesSection guests={guests} />
          </AdminSectionPanel>

          <AdminSectionPanel
            id="compare"
            activeSection={section}
            visitedSections={visitedSections}
          >
            <CompareSection busy={busy} setBusyState={setBusyState} />
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

      <GroupExportPicker
        open={groupExportOpen}
        onClose={() => setGroupExportOpen(false)}
      />

      <GuestDateExportPicker
        open={dateExportOpen}
        onClose={() => setDateExportOpen(false)}
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

      <AdminConfirmModal
        open={confirmResendOpen}
        busy={busy}
        eyebrow="WhatsApp"
        title="Renvoyer les confirmations ?"
        confirmLabel={`Renvoyer ${selectedConfirmMessages} confirmation${selectedConfirmMessages > 1 ? "s" : ""}`}
        description={
          <>
            Vous allez renvoyer le message de confirmation (disponible) à{" "}
            <strong>
              {selectedConfirmGuests.length} invité
              {selectedConfirmGuests.length > 1 ? "s" : ""}
            </strong>
            , uniquement pour les cérémonies où ils ont dit oui (
            <strong>
              {selectedConfirmMessages} message
              {selectedConfirmMessages > 1 ? "s" : ""}
            </strong>
            ).
          </>
        }
        onClose={() => {
          if (!busy) setConfirmResendOpen(false);
        }}
        onConfirm={() => {
          void executeConfirmResend();
        }}
      />

      <AdminConfirmModal
        open={deletingGuest !== null}
        busy={busy}
        eyebrow="Invités"
        title="Supprimer l'invité ?"
        tone="danger"
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        description={
          deletingGuest ? (
            <>
              Supprimer définitivement{" "}
              <strong>{deletingGuest.name}</strong> ({deletingGuest.phone}) ?
              <br />
              Ses affectations, doublons liés et RSVP seront aussi supprimés.
              Cette action est irréversible.
            </>
          ) : null
        }
        onClose={() => {
          if (!busy) setDeletingGuest(null);
        }}
        onConfirm={() => {
          void confirmDeleteGuest();
        }}
      />

      <AdminBusyOverlay state={busyState} />
    </div>
  );
}
