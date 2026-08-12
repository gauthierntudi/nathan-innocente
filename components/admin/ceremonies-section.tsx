"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import type { AdminGuest } from "@/lib/admin/types";
import type { AdminCeremony, CeremonyAssignment, CeremonyBoard, CeremonyId } from "@/lib/admin/ceremony-types";
import { getGuestsNotInCeremony } from "@/lib/admin/ceremony-types";
import type { AdminBusyState } from "@/components/admin/admin-busy-overlay";
import { AdminConfirmModal } from "@/components/admin/admin-confirm-modal";
import { CreateGroupModal } from "@/components/admin/create-group-modal";
import { CreateTableModal } from "@/components/admin/create-table-modal";
import { WhatsAppBulkConfirmModal } from "@/components/admin/whatsapp-bulk-confirm-modal";

type CeremonyConfirm =
  | { type: "delete-table"; tableId: string; tableName: string }
  | { type: "delete-group"; groupId: string; groupName: string }
  | { type: "remove-from-ceremony"; groupId: string; guestIds: string[] };

function normalizePositiveInt(value: unknown, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) return fallback;
  return Math.floor(numeric);
}

function ceremonyRsvpBadge(assignment: CeremonyAssignment) {
  if (assignment.availability === null) {
    return <span className="admin-badge admin-badge--warning">En attente</span>;
  }

  if (assignment.availability) {
    return (
      <span className="admin-badge admin-badge--success">
        Oui ({assignment.confirmedGuests})
      </span>
    );
  }

  return <span className="admin-badge admin-badge--danger">Non</span>;
}

function getCeremonyAssignments(ceremony: AdminCeremony) {
  const byGuestId = new Map<string, CeremonyAssignment>();

  for (const assignment of ceremony.unassignedGuests) {
    byGuestId.set(assignment.guestId, assignment);
  }
  for (const table of ceremony.tables) {
    for (const assignment of table.assignments) {
      byGuestId.set(assignment.guestId, assignment);
    }
  }
  for (const group of ceremony.groups ?? []) {
    for (const assignment of group.assignments) {
      byGuestId.set(assignment.guestId, assignment);
    }
  }

  return [...byGuestId.values()];
}

function matchesAssignmentQuery(assignment: CeremonyAssignment, query: string) {
  if (!query) return true;
  const haystack = `${assignment.guest.name} ${assignment.guest.phone}`.toLowerCase();
  return haystack.includes(query);
}

const LIST_PAGE_SIZE = 25;

type CeremonyView = "guests" | "tables" | "groups";

type CeremoniesSectionProps = {
  guests: AdminGuest[];
  onMessage: (message: string) => void;
  busy: boolean;
  setBusyState: (state: AdminBusyState) => void;
  active: boolean;
  activeCeremonyId: CeremonyId;
  viewMode: CeremonyView;
  showViewTabs?: boolean;
  onCeremonyChange: (ceremonyId: CeremonyId) => void;
};

export function CeremoniesSection({
  guests,
  onMessage,
  busy,
  setBusyState,
  active,
  activeCeremonyId,
  viewMode,
  showViewTabs = true,
  onCeremonyChange,
}: CeremoniesSectionProps) {
  const [board, setBoard] = useState<CeremonyBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [guestSearch, setGuestSearch] = useState("");
  const [assignedSearch, setAssignedSearch] = useState("");
  const [createTableOpen, setCreateTableOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [ceremonyView, setCeremonyView] = useState<CeremonyView>("guests");
  const [unassignedPage, setUnassignedPage] = useState(1);
  const [ungroupedPage, setUngroupedPage] = useState(1);
  const [availablePage, setAvailablePage] = useState(1);
  const [selectedGuestIds, setSelectedGuestIds] = useState<Set<string>>(new Set());
  const [selectedAssignedGuestIds, setSelectedAssignedGuestIds] = useState<Set<string>>(new Set());
  const [bulkWhatsAppConfirm, setBulkWhatsAppConfirm] = useState<{
    sendAll: boolean;
    count: number;
    guestIds?: string[];
  } | null>(null);
  const [confirmAction, setConfirmAction] = useState<CeremonyConfirm | null>(
    null,
  );
  const [tablesPoolOpen, setTablesPoolOpen] = useState(true);
  const [groupsPoolOpen, setGroupsPoolOpen] = useState(true);

  const loadBoard = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/ceremonies");
      const data = await response.json();
      if (data.success) {
        setBoard(data);
      } else {
        onMessage(data.message ?? "Impossible de charger les cérémonies");
      }
    } finally {
      setLoading(false);
    }
  }, [onMessage]);

  useEffect(() => {
    if (!active) return;
    void loadBoard();
  }, [active, loadBoard]);

  useEffect(() => {
    setSelectedGuestIds(new Set());
    setSelectedAssignedGuestIds(new Set());
    setGuestSearch("");
    setAssignedSearch("");
    setUnassignedPage(1);
    setUngroupedPage(1);
    setAvailablePage(1);
  }, [activeCeremonyId]);

  useEffect(() => {
    setUnassignedPage(1);
    setUngroupedPage(1);
  }, [assignedSearch]);

  useEffect(() => {
    setAvailablePage(1);
  }, [guestSearch]);

  useEffect(() => {
    setUngroupedPage(1);
    setAvailablePage(1);
  }, [ceremonyView]);

  useEffect(() => {
    setCeremonyView(viewMode);
  }, [viewMode]);

  const activeCeremony = useMemo(
    () => board?.ceremonies.find((ceremony) => ceremony.id === activeCeremonyId) ?? null,
    [board, activeCeremonyId],
  );

  const activeCeremonyRsvp = useMemo(() => {
    if (!activeCeremony) {
      return { yes: 0, no: 0, pending: 0, total: 0 };
    }

    const assignments = getCeremonyAssignments(activeCeremony);

    return {
      yes: assignments.filter((assignment) => assignment.availability === true).length,
      no: assignments.filter((assignment) => assignment.availability === false).length,
      pending: assignments.filter((assignment) => assignment.availability === null).length,
      total: assignments.length,
    };
  }, [activeCeremony]);

  const availableGuests = useMemo(() => {
    if (!activeCeremony) return [];

    const pool = getGuestsNotInCeremony(guests, activeCeremony);
    const query = guestSearch.trim().toLowerCase();

    if (!query) return pool;
    return pool.filter(
      (guest) =>
        guest.name.toLowerCase().includes(query) ||
        guest.phone.toLowerCase().includes(query),
    );
  }, [activeCeremony, guests, guestSearch]);

  const availableTotalPages = Math.max(
    1,
    Math.ceil(availableGuests.length / LIST_PAGE_SIZE),
  );
  const availableCurrentPage = Math.min(availablePage, availableTotalPages);
  const pagedAvailableGuests = useMemo(() => {
    const start = (availableCurrentPage - 1) * LIST_PAGE_SIZE;
    return availableGuests.slice(start, start + LIST_PAGE_SIZE);
  }, [availableGuests, availableCurrentPage]);

  const availableIdsOnPage = useMemo(
    () => pagedAvailableGuests.map((guest) => guest.id),
    [pagedAvailableGuests],
  );
  const allAvailableOnPageSelected =
    availableIdsOnPage.length > 0 &&
    availableIdsOnPage.every((id) => selectedGuestIds.has(id));
  const selectedAvailableCount = useMemo(
    () =>
      availableGuests.filter((guest) => selectedGuestIds.has(guest.id)).length,
    [availableGuests, selectedGuestIds],
  );

  const assignedQuery = assignedSearch.trim().toLowerCase();

  const filteredUnassignedGuests = useMemo(() => {
    if (!activeCeremony) return [];
    return activeCeremony.unassignedGuests.filter((assignment) =>
      matchesAssignmentQuery(assignment, assignedQuery),
    );
  }, [activeCeremony, assignedQuery]);

  const unassignedTotalPages = Math.max(
    1,
    Math.ceil(filteredUnassignedGuests.length / LIST_PAGE_SIZE),
  );
  const unassignedCurrentPage = Math.min(unassignedPage, unassignedTotalPages);
  const pagedUnassignedGuests = useMemo(() => {
    const start = (unassignedCurrentPage - 1) * LIST_PAGE_SIZE;
    return filteredUnassignedGuests.slice(start, start + LIST_PAGE_SIZE);
  }, [filteredUnassignedGuests, unassignedCurrentPage]);

  const unassignedIdsOnPage = useMemo(
    () => pagedUnassignedGuests.map((item) => item.guestId),
    [pagedUnassignedGuests],
  );
  const allUnassignedOnPageSelected =
    unassignedIdsOnPage.length > 0 &&
    unassignedIdsOnPage.every((id) => selectedAssignedGuestIds.has(id));
  const selectedUnassignedCount = useMemo(() => {
    const ids = new Set(filteredUnassignedGuests.map((item) => item.guestId));
    return [...selectedAssignedGuestIds].filter((id) => ids.has(id)).length;
  }, [filteredUnassignedGuests, selectedAssignedGuestIds]);

  const filteredTables = useMemo(() => {
    if (!activeCeremony) return [];

    return activeCeremony.tables
      .map((table) => ({
        ...table,
        assignments: table.assignments.filter((assignment) =>
          matchesAssignmentQuery(assignment, assignedQuery),
        ),
      }))
      .filter((table) =>
        assignedQuery ? table.assignments.length > 0 : true,
      );
  }, [activeCeremony, assignedQuery]);

  const filteredGroups = useMemo(() => {
    if (!activeCeremony) return [];

    return (activeCeremony.groups ?? [])
      .map((group) => ({
        ...group,
        assignments: group.assignments.filter((assignment) =>
          matchesAssignmentQuery(assignment, assignedQuery),
        ),
      }))
      .filter((group) =>
        assignedQuery ? group.assignments.length > 0 : true,
      );
  }, [activeCeremony, assignedQuery]);

  const filteredUngroupedGuests = useMemo(() => {
    if (!activeCeremony) return [];
    return (activeCeremony.ungroupedGuests ?? []).filter((assignment) =>
      matchesAssignmentQuery(assignment, assignedQuery),
    );
  }, [activeCeremony, assignedQuery]);

  const ungroupedTotalPages = Math.max(
    1,
    Math.ceil(filteredUngroupedGuests.length / LIST_PAGE_SIZE),
  );
  const ungroupedCurrentPage = Math.min(ungroupedPage, ungroupedTotalPages);
  const pagedUngroupedGuests = useMemo(() => {
    const start = (ungroupedCurrentPage - 1) * LIST_PAGE_SIZE;
    return filteredUngroupedGuests.slice(start, start + LIST_PAGE_SIZE);
  }, [filteredUngroupedGuests, ungroupedCurrentPage]);

  const ungroupedIdsOnPage = useMemo(
    () => pagedUngroupedGuests.map((item) => item.guestId),
    [pagedUngroupedGuests],
  );
  const allUngroupedOnPageSelected =
    ungroupedIdsOnPage.length > 0 &&
    ungroupedIdsOnPage.every((id) => selectedAssignedGuestIds.has(id));
  const selectedUngroupedCount = useMemo(() => {
    const ids = new Set(filteredUngroupedGuests.map((item) => item.guestId));
    return [...selectedAssignedGuestIds].filter((id) => ids.has(id)).length;
  }, [filteredUngroupedGuests, selectedAssignedGuestIds]);

  const groupStats = useMemo(() => {
    if (!activeCeremony) {
      return { groupCount: 0, inGroups: 0, ungrouped: 0 };
    }
    const groups = activeCeremony.groups ?? [];
    const inGroups = groups.reduce(
      (total, group) => total + group.assignments.length,
      0,
    );
    return {
      groupCount: groups.length,
      inGroups,
      ungrouped: (activeCeremony.ungroupedGuests ?? []).length,
    };
  }, [activeCeremony]);

  const tableStats = useMemo(() => {
    if (!activeCeremony) {
      return { tableCount: 0, seated: 0, unassigned: 0, seatsUsed: 0 };
    }
    const seated = activeCeremony.tables.reduce(
      (total, table) => total + table.assignments.length,
      0,
    );
    const seatsUsed = activeCeremony.tables.reduce(
      (total, table) =>
        total +
        table.assignments.reduce(
          (sum, assignment) => sum + assignment.numGuests,
          0,
        ),
      0,
    );
    return {
      tableCount: activeCeremony.tables.length,
      seated,
      unassigned: activeCeremony.unassignedGuests.length,
      seatsUsed,
    };
  }, [activeCeremony]);

  const assignedMatchCount = useMemo(() => {
    if (!activeCeremony) return 0;
    if (ceremonyView === "groups") {
      return (
        filteredUngroupedGuests.length +
        filteredGroups.reduce(
          (total, group) => total + group.assignments.length,
          0,
        )
      );
    }
    return (
      filteredUnassignedGuests.length +
      filteredTables.reduce((total, table) => total + table.assignments.length, 0)
    );
  }, [
    activeCeremony,
    ceremonyView,
    filteredUnassignedGuests,
    filteredTables,
    filteredUngroupedGuests,
    filteredGroups,
  ]);

  async function createTable(payload: {
    name: string;
    capacity: number | null;
  }) {
    setBusyState({
      title: "Création de table",
      detail: `Création de « ${payload.name} »…`,
    });
    try {
      const response = await fetch("/api/admin/ceremonies/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ceremonyId: activeCeremonyId,
          name: payload.name,
          capacity: payload.capacity,
        }),
      });
      const data = await response.json();
      if (!data.success) {
        onMessage(data.message ?? "Création impossible");
        return false;
      }
      onMessage(`Table « ${data.table.name} » créée`);
      await loadBoard();
      return true;
    } catch {
      onMessage("Erreur réseau lors de la création de la table.");
      return false;
    } finally {
      setBusyState(null);
    }
  }

  function requestDeleteTable(tableId: string, tableName: string) {
    setConfirmAction({ type: "delete-table", tableId, tableName });
  }

  async function executeDeleteTable(tableId: string, tableName: string) {
    setBusyState({
      title: "Suppression",
      detail: `Suppression de la table « ${tableName} »…`,
    });
    try {
      const response = await fetch(`/api/admin/ceremonies/tables/${tableId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!data.success) {
        onMessage(data.message ?? "Suppression impossible");
        return;
      }
      onMessage(`Table « ${tableName} » supprimée`);
      await loadBoard();
    } finally {
      setBusyState(null);
    }
  }

  async function createGroup(payload: { name: string }) {
    setBusyState({
      title: "Création de groupe",
      detail: `Création de « ${payload.name} »…`,
    });
    try {
      const response = await fetch("/api/admin/ceremonies/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ceremonyId: activeCeremonyId,
          name: payload.name,
        }),
      });
      const data = await response.json();
      if (!data.success) {
        onMessage(data.message ?? "Création impossible");
        return false;
      }
      onMessage(`Groupe « ${data.group.name} » créé`);
      await loadBoard();
      return true;
    } catch {
      onMessage("Erreur réseau lors de la création du groupe.");
      return false;
    } finally {
      setBusyState(null);
    }
  }

  function requestDeleteGroup(
    groupId: string,
    groupName: string,
    guestCount: number,
  ) {
    if (guestCount > 0) {
      onMessage(
        `Impossible de supprimer « ${groupName} » : retirez d'abord ses ${guestCount} invité(s).`,
      );
      return;
    }
    setConfirmAction({ type: "delete-group", groupId, groupName });
  }

  async function executeDeleteGroup(groupId: string, groupName: string) {
    setBusyState({
      title: "Suppression",
      detail: `Suppression du groupe « ${groupName} »…`,
    });
    try {
      const response = await fetch(`/api/admin/ceremonies/groups/${groupId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!data.success) {
        onMessage(data.message ?? "Suppression impossible");
        return;
      }
      onMessage(`Groupe « ${groupName} » supprimé`);
      await loadBoard();
    } finally {
      setBusyState(null);
    }
  }

  async function putAssignment(
    guestId: string,
    options: {
      tableId?: string | null;
      groupId?: string | null;
      numGuests?: number;
    } = {},
  ) {
    const response = await fetch("/api/admin/ceremonies/assignments", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guestId,
        ceremonyId: activeCeremonyId,
        ...(options.tableId !== undefined ? { tableId: options.tableId } : {}),
        ...(options.groupId !== undefined ? { groupId: options.groupId } : {}),
        ...(options.numGuests !== undefined
          ? { numGuests: options.numGuests }
          : {}),
      }),
    });
    return response.json();
  }

  function guestLabel(guestId: string) {
    const fromGuests = guests.find((item) => item.id === guestId);
    if (fromGuests) return fromGuests.name;
    if (!activeCeremony) return "invité";
    const assignment = getCeremonyAssignments(activeCeremony).find(
      (item) => item.guestId === guestId,
    );
    return assignment?.guest.name ?? "invité";
  }

  async function assignGuest(
    guestId: string,
    options: {
      tableId?: string | null;
      groupId?: string | null;
      numGuests?: number;
    } = {},
  ) {
    setBusyState({
      title: options.numGuests != null ? "Convives" : "Affectation",
      detail:
        options.numGuests != null
          ? `Mise à jour des convives de ${guestLabel(guestId)}…`
          : `Affectation de ${guestLabel(guestId)}…`,
    });
    try {
      const data = await putAssignment(guestId, options);
      if (!data.success) {
        onMessage(data.message ?? "Affectation impossible");
        return;
      }
      await loadBoard();
    } finally {
      setBusyState(null);
    }
  }

  async function assignGuestsWithProgress(
    guestIds: string[],
    options: { tableId?: string | null; groupId?: string | null },
    title: string,
  ) {
    let okCount = 0;
    let failCount = 0;

    for (let index = 0; index < guestIds.length; index += 1) {
      const guestId = guestIds[index];
      const name = guestLabel(guestId);
      setBusyState({
        title,
        detail: `Traitement de ${name}…`,
        current: index + 1,
        total: guestIds.length,
        sent: okCount,
        failed: failCount,
      });

      try {
        const data = await putAssignment(guestId, options);
        if (data.success) okCount += 1;
        else failCount += 1;
      } catch {
        failCount += 1;
      }

      setBusyState({
        title,
        detail: `Traitement de ${name}…`,
        current: index + 1,
        total: guestIds.length,
        sent: okCount,
        failed: failCount,
      });
    }

    return { okCount, failCount };
  }

  async function assignSelected(
    options: { tableId?: string | null; groupId?: string | null } = {},
  ) {
    if (selectedGuestIds.size === 0) {
      onMessage("Sélectionnez au moins un invité");
      return;
    }

    const guestIds = [...selectedGuestIds];
    if (guestIds.length === 1) {
      setBusyState({
        title: "Affectation",
        detail: `Affectation de ${guestLabel(guestIds[0])}…`,
      });
      try {
        const data = await putAssignment(guestIds[0], options);
        if (!data.success) {
          onMessage(data.message ?? "Affectation impossible");
          return;
        }
        setSelectedGuestIds(new Set());
        onMessage(
          options.groupId
            ? "1 invité affecté au groupe"
            : "1 invité affecté",
        );
        await loadBoard();
      } finally {
        setBusyState(null);
      }
      return;
    }

    try {
      const { okCount, failCount } = await assignGuestsWithProgress(
        guestIds,
        options,
        options.groupId ? "Affectation aux groupes" : "Affectation groupée",
      );
      setBusyState({
        title: "Actualisation",
        detail: "Mise à jour du plan de table…",
      });
      setSelectedGuestIds(new Set());
      onMessage(
        failCount > 0
          ? `Affectés: ${okCount} | Erreurs: ${failCount}`
          : options.groupId
            ? `${okCount} invité(s) affecté(s) au groupe`
            : `${okCount} invité(s) affecté(s)`,
      );
      await loadBoard();
    } finally {
      setBusyState(null);
    }
  }

  async function removeGuest(guestId: string) {
    setBusyState({
      title: "Retrait",
      detail: `Retrait de ${guestLabel(guestId)}…`,
    });
    try {
      const response = await fetch("/api/admin/ceremonies/assignments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestId,
          ceremonyId: activeCeremonyId,
        }),
      });
      const data = await response.json();
      if (!data.success) {
        onMessage(data.message ?? "Retrait impossible");
        return;
      }
      await loadBoard();
    } finally {
      setBusyState(null);
    }
  }

  function toggleAssignedGuestSelection(guestId: string, checked: boolean) {
    const next = new Set(selectedAssignedGuestIds);
    if (checked) next.add(guestId);
    else next.delete(guestId);
    setSelectedAssignedGuestIds(next);
  }

  function toggleSelectUnassignedPage(checked: boolean) {
    const next = new Set(selectedAssignedGuestIds);
    for (const guestId of unassignedIdsOnPage) {
      if (checked) next.add(guestId);
      else next.delete(guestId);
    }
    setSelectedAssignedGuestIds(next);
  }

  function selectAllUnassignedFiltered() {
    const next = new Set(selectedAssignedGuestIds);
    for (const assignment of filteredUnassignedGuests) {
      next.add(assignment.guestId);
    }
    setSelectedAssignedGuestIds(next);
  }

  function clearUnassignedSelection() {
    const unassignedIds = new Set(
      filteredUnassignedGuests.map((item) => item.guestId),
    );
    const next = new Set(
      [...selectedAssignedGuestIds].filter((id) => !unassignedIds.has(id)),
    );
    setSelectedAssignedGuestIds(next);
  }

  function toggleSelectUngroupedPage(checked: boolean) {
    const next = new Set(selectedAssignedGuestIds);
    for (const guestId of ungroupedIdsOnPage) {
      if (checked) next.add(guestId);
      else next.delete(guestId);
    }
    setSelectedAssignedGuestIds(next);
  }

  function selectAllUngroupedFiltered() {
    const next = new Set(selectedAssignedGuestIds);
    for (const assignment of filteredUngroupedGuests) {
      next.add(assignment.guestId);
    }
    setSelectedAssignedGuestIds(next);
  }

  function clearUngroupedSelection() {
    const ungroupedIds = new Set(
      filteredUngroupedGuests.map((item) => item.guestId),
    );
    const next = new Set(
      [...selectedAssignedGuestIds].filter((id) => !ungroupedIds.has(id)),
    );
    setSelectedAssignedGuestIds(next);
  }

  async function assignSelectedUnassigned(options: {
    tableId?: string | null;
    groupId?: string | null;
  }) {
    const unassignedIds = new Set(
      filteredUnassignedGuests.map((item) => item.guestId),
    );
    const guestIds = [...selectedAssignedGuestIds].filter((id) =>
      unassignedIds.has(id),
    );

    if (guestIds.length === 0) {
      onMessage("Sélectionnez au moins un invité sans table");
      return;
    }

    if (guestIds.length === 1) {
      setBusyState({
        title: "Affectation",
        detail: `Affectation de ${guestLabel(guestIds[0])}…`,
      });
      try {
        const data = await putAssignment(guestIds[0], options);
        if (!data.success) {
          onMessage(data.message ?? "Affectation impossible");
          return;
        }
        clearUnassignedSelection();
        onMessage("1 invité mis à jour");
        await loadBoard();
      } finally {
        setBusyState(null);
      }
      return;
    }

    try {
      const { okCount, failCount } = await assignGuestsWithProgress(
        guestIds,
        options,
        "Mise à jour groupée",
      );
      setBusyState({
        title: "Actualisation",
        detail: "Mise à jour du plan de table…",
      });
      clearUnassignedSelection();
      onMessage(
        failCount > 0
          ? `Mis à jour: ${okCount} | Erreurs: ${failCount}`
          : `${okCount} invité(s) mis à jour`,
      );
      await loadBoard();
    } finally {
      setBusyState(null);
    }
  }

  async function assignSelectedUngrouped(options: {
    groupId?: string | null;
  }) {
    const ungroupedIds = new Set(
      filteredUngroupedGuests.map((item) => item.guestId),
    );
    const guestIds = [...selectedAssignedGuestIds].filter((id) =>
      ungroupedIds.has(id),
    );

    if (guestIds.length === 0) {
      onMessage("Sélectionnez au moins un invité sans groupe");
      return;
    }

    if (guestIds.length === 1) {
      setBusyState({
        title: "Affectation au groupe",
        detail: `Affectation de ${guestLabel(guestIds[0])}…`,
      });
      try {
        const data = await putAssignment(guestIds[0], options);
        if (!data.success) {
          onMessage(data.message ?? "Affectation impossible");
          return;
        }
        clearUngroupedSelection();
        onMessage("1 invité ajouté au groupe");
        await loadBoard();
      } finally {
        setBusyState(null);
      }
      return;
    }

    try {
      const { okCount, failCount } = await assignGuestsWithProgress(
        guestIds,
        options,
        "Affectation aux groupes",
      );
      setBusyState({
        title: "Actualisation",
        detail: "Mise à jour des groupes…",
      });
      clearUngroupedSelection();
      onMessage(
        failCount > 0
          ? `Ajoutés: ${okCount} | Erreurs: ${failCount}`
          : `${okCount} invité(s) ajouté(s) aux groupes`,
      );
      await loadBoard();
    } finally {
      setBusyState(null);
    }
  }

  function selectedGuestIdsInGroup(groupId: string) {
    const group = activeCeremony?.groups?.find((item) => item.id === groupId);
    if (!group) return [];
    const ids = new Set(group.assignments.map((item) => item.guestId));
    return [...selectedAssignedGuestIds].filter((id) => ids.has(id));
  }

  function clearGroupSelection(groupId: string) {
    const group = activeCeremony?.groups?.find((item) => item.id === groupId);
    if (!group) return;
    const groupIds = new Set(group.assignments.map((item) => item.guestId));
    setSelectedAssignedGuestIds(
      new Set([...selectedAssignedGuestIds].filter((id) => !groupIds.has(id))),
    );
  }

  function toggleSelectGroupPage(pageGuestIds: string[], checked: boolean) {
    const next = new Set(selectedAssignedGuestIds);
    for (const guestId of pageGuestIds) {
      if (checked) next.add(guestId);
      else next.delete(guestId);
    }
    setSelectedAssignedGuestIds(next);
  }

  function selectAllInGroup(groupId: string) {
    const group = activeCeremony?.groups?.find((item) => item.id === groupId);
    if (!group) return;
    const next = new Set(selectedAssignedGuestIds);
    for (const assignment of group.assignments) {
      next.add(assignment.guestId);
    }
    setSelectedAssignedGuestIds(next);
  }

  async function assignSelectedInGroup(
    groupId: string,
    options: { groupId?: string | null },
  ) {
    const guestIds = selectedGuestIdsInGroup(groupId);
    if (guestIds.length === 0) {
      onMessage("Sélectionnez au moins un invité dans ce groupe");
      return;
    }

    if (guestIds.length === 1) {
      setBusyState({
        title: "Mise à jour du groupe",
        detail: `Mise à jour de ${guestLabel(guestIds[0])}…`,
      });
      try {
        const data = await putAssignment(guestIds[0], options);
        if (!data.success) {
          onMessage(data.message ?? "Mise à jour impossible");
          return;
        }
        clearGroupSelection(groupId);
        onMessage(
          options.groupId === null
            ? "1 invité retiré du groupe"
            : "1 invité déplacé",
        );
        await loadBoard();
      } finally {
        setBusyState(null);
      }
      return;
    }

    try {
      const { okCount, failCount } = await assignGuestsWithProgress(
        guestIds,
        options,
        options.groupId === null
          ? "Retrait du groupe"
          : "Déplacement vers un groupe",
      );
      setBusyState({
        title: "Actualisation",
        detail: "Mise à jour des groupes…",
      });
      clearGroupSelection(groupId);
      onMessage(
        failCount > 0
          ? `Mis à jour: ${okCount} | Erreurs: ${failCount}`
          : options.groupId === null
            ? `${okCount} invité(s) retiré(s) du groupe`
            : `${okCount} invité(s) déplacé(s)`,
      );
      await loadBoard();
    } finally {
      setBusyState(null);
    }
  }

  function requestRemoveSelectedInGroup(groupId: string) {
    const guestIds = selectedGuestIdsInGroup(groupId);
    if (guestIds.length === 0) {
      onMessage("Sélectionnez au moins un invité dans ce groupe");
      return;
    }
    setConfirmAction({ type: "remove-from-ceremony", groupId, guestIds });
  }

  async function executeRemoveSelectedInGroup(
    groupId: string,
    guestIds: string[],
  ) {
    let okCount = 0;
    let failCount = 0;

    try {
      for (let index = 0; index < guestIds.length; index += 1) {
        const guestId = guestIds[index];
        const name = guestLabel(guestId);
        setBusyState({
          title: "Retrait groupé",
          detail: `Retrait de ${name}…`,
          current: index + 1,
          total: guestIds.length,
          sent: okCount,
          failed: failCount,
        });

        try {
          const response = await fetch("/api/admin/ceremonies/assignments", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              guestId,
              ceremonyId: activeCeremonyId,
            }),
          });
          const data = await response.json();
          if (data.success) okCount += 1;
          else failCount += 1;
        } catch {
          failCount += 1;
        }
      }

      setBusyState({
        title: "Actualisation",
        detail: "Mise à jour des groupes…",
      });
      clearGroupSelection(groupId);
      onMessage(
        failCount > 0
          ? `Retirés: ${okCount} | Erreurs: ${failCount}`
          : `${okCount} invité(s) retiré(s) de la cérémonie`,
      );
      await loadBoard();
    } finally {
      setBusyState(null);
    }
  }

  function handleConfirmAction() {
    if (!confirmAction) return;
    const action = confirmAction;
    setConfirmAction(null);

    if (action.type === "delete-table") {
      void executeDeleteTable(action.tableId, action.tableName);
      return;
    }
    if (action.type === "delete-group") {
      void executeDeleteGroup(action.groupId, action.groupName);
      return;
    }
    void executeRemoveSelectedInGroup(action.groupId, action.guestIds);
  }

  async function sendCeremonyWhatsApp(guestId: string) {
    const assignment = activeCeremony
      ? getCeremonyAssignments(activeCeremony).find(
          (item) => item.guestId === guestId,
        )
      : null;

    setBusyState({
      title: "Envoi WhatsApp cérémonie",
      variant: "whatsapp",
      detail: assignment
        ? `Message pour ${assignment.guest.name}…`
        : "Envoi du message…",
    });
    try {
      const response = await fetch("/api/admin/whatsapp/ceremony", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ceremonyId: activeCeremonyId,
          guestId,
        }),
      });
      const data = await response.json();
      onMessage(data.success ? data.message : data.message);
    } finally {
      setBusyState(null);
    }
  }

  function requestCeremonyWhatsAppBulk(
    sendAll: boolean,
    guestIds?: string[],
  ) {
    if (!activeCeremony) return;

    const assignments = guestIds?.length
      ? getCeremonyAssignments(activeCeremony).filter((item) =>
          guestIds.includes(item.guestId),
        )
      : sendAll
        ? getCeremonyAssignments(activeCeremony)
        : getCeremonyAssignments(activeCeremony).filter((item) =>
            selectedAssignedGuestIds.has(item.guestId),
          );

    if (assignments.length === 0) {
      onMessage(
        guestIds?.length
          ? "Aucun invité dans ce groupe"
          : sendAll
            ? "Aucun invité affecté à cette cérémonie"
            : "Sélectionnez au moins un invité affecté",
      );
      return;
    }

    setBulkWhatsAppConfirm({
      sendAll: sendAll && !guestIds?.length,
      count: assignments.length,
      guestIds: guestIds?.length
        ? assignments.map((item) => item.guestId)
        : undefined,
    });
  }

  async function executeCeremonyWhatsAppBulk(payload: {
    sendAll: boolean;
    guestIds?: string[];
  }) {
    if (!activeCeremony) return;

    const assignments = payload.guestIds?.length
      ? getCeremonyAssignments(activeCeremony).filter((item) =>
          payload.guestIds!.includes(item.guestId),
        )
      : payload.sendAll
        ? getCeremonyAssignments(activeCeremony)
        : getCeremonyAssignments(activeCeremony).filter((item) =>
            selectedAssignedGuestIds.has(item.guestId),
          );

    if (assignments.length === 0) return;

    setBusyState({
      title: "Envoi WhatsApp cérémonie",
      variant: "whatsapp",
      current: 0,
      total: assignments.length,
      sent: 0,
      failed: 0,
      detail: "Préparation de l'envoi…",
    });
    let sentCount = 0;
    let failCount = 0;

    try {
      for (let index = 0; index < assignments.length; index += 1) {
        const assignment = assignments[index];
        setBusyState({
          title: "Envoi WhatsApp cérémonie",
          variant: "whatsapp",
          detail: `Message pour ${assignment.guest.name}…`,
          current: index + 1,
          total: assignments.length,
          sent: sentCount,
          failed: failCount,
        });

        try {
          const response = await fetch("/api/admin/whatsapp/ceremony", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ceremonyId: activeCeremonyId,
              guestId: assignment.guestId,
            }),
          });
          const data = await response.json();
          if (data.success) sentCount += 1;
          else failCount += 1;
        } catch {
          failCount += 1;
        }

        setBusyState({
          title: "Envoi WhatsApp cérémonie",
          variant: "whatsapp",
          detail: `Message pour ${assignment.guest.name}…`,
          current: index + 1,
          total: assignments.length,
          sent: sentCount,
          failed: failCount,
        });
      }

      onMessage(`Envoyés: ${sentCount} | Erreurs: ${failCount}`);
      setSelectedAssignedGuestIds(new Set());
    } finally {
      setBusyState(null);
      setBulkWhatsAppConfirm(null);
    }
  }

  function toggleGuestSelection(guestId: string, checked: boolean) {
    const next = new Set(selectedGuestIds);
    if (checked) next.add(guestId);
    else next.delete(guestId);
    setSelectedGuestIds(next);
  }

  function toggleSelectAvailablePage(checked: boolean) {
    const next = new Set(selectedGuestIds);
    for (const guestId of availableIdsOnPage) {
      if (checked) next.add(guestId);
      else next.delete(guestId);
    }
    setSelectedGuestIds(next);
  }

  function selectAllAvailableFiltered() {
    const next = new Set(selectedGuestIds);
    for (const guest of availableGuests) {
      next.add(guest.id);
    }
    setSelectedGuestIds(next);
  }

  function clearAvailableSelection() {
    const availableIds = new Set(availableGuests.map((guest) => guest.id));
    const next = new Set(
      [...selectedGuestIds].filter((id) => !availableIds.has(id)),
    );
    setSelectedGuestIds(next);
  }

  if (loading) {
    return <p className="admin-empty">Chargement des cérémonies…</p>;
  }

  if (!board || !activeCeremony) {
    return <p className="admin-empty">Aucune cérémonie disponible.</p>;
  }

  return (
    <div className="admin-ceremonies">
      <div className="admin-panel admin-ceremony-filter">
        <label className="admin-modal__field">
          <span>Filtre cérémonie</span>
          <select
            className="admin-select"
            value={activeCeremonyId}
            onChange={(e) => onCeremonyChange(e.target.value as CeremonyId)}
          >
            {board.ceremonies.map((ceremony) => (
              <option key={ceremony.id} value={ceremony.id}>
                {ceremony.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="admin-panel admin-ceremony-rsvp">
        <h2 className="admin-panel__title">Réponses pour cette cérémonie</h2>
        <div className="admin-stats admin-stats--inline">
          <article className="admin-stat">
            <div className="admin-stat__label">Confirmés</div>
            <div className="admin-stat__value">{activeCeremonyRsvp.yes}</div>
          </article>
          <article className="admin-stat">
            <div className="admin-stat__label">Refus</div>
            <div className="admin-stat__value">{activeCeremonyRsvp.no}</div>
          </article>
          <article className="admin-stat">
            <div className="admin-stat__label">En attente</div>
            <div className="admin-stat__value">{activeCeremonyRsvp.pending}</div>
          </article>
          <article className="admin-stat">
            <div className="admin-stat__label">Invités affectés</div>
            <div className="admin-stat__value">{activeCeremonyRsvp.total}</div>
          </article>
        </div>
        <div className="admin-ceremony-actions">
          <button
            type="button"
            disabled={busy || activeCeremonyRsvp.total === 0}
            onClick={() => requestCeremonyWhatsAppBulk(true)}
            className="admin-btn admin-btn--primary"
          >
            WhatsApp — tous ({activeCeremonyRsvp.total})
          </button>
          <button
            type="button"
            disabled={busy || selectedAssignedGuestIds.size === 0}
            onClick={() => requestCeremonyWhatsAppBulk(false)}
            className="admin-btn admin-btn--secondary"
          >
            WhatsApp — sélection ({selectedAssignedGuestIds.size})
          </button>
        </div>
      </section>

      {showViewTabs ? (
      <div className="admin-ceremony-views" role="tablist" aria-label="Gestion cérémonie">
        <button
          type="button"
          role="tab"
          aria-selected={ceremonyView === "guests"}
          className={`admin-ceremony-view${ceremonyView === "guests" ? " admin-ceremony-view--active" : ""}`}
          onClick={() => setCeremonyView("guests")}
        >
          Invités
          <span className="admin-ceremony-view__count">
            {activeCeremonyRsvp.total}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={ceremonyView === "tables"}
          className={`admin-ceremony-view${ceremonyView === "tables" ? " admin-ceremony-view--active" : ""}`}
          onClick={() => setCeremonyView("tables")}
        >
          Tables
          <span className="admin-ceremony-view__count">
            {tableStats.tableCount}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={ceremonyView === "groups"}
          className={`admin-ceremony-view${ceremonyView === "groups" ? " admin-ceremony-view--active" : ""}`}
          onClick={() => setCeremonyView("groups")}
        >
          Groupes
          <span className="admin-ceremony-view__count">
            {groupStats.groupCount}
          </span>
        </button>
      </div>
      ) : null}

      {ceremonyView === "guests" ? (
        <div className="admin-ceremony-layout admin-ceremony-layout--guests">
          <section className="admin-panel admin-available-panel">
            <div className="admin-ceremony-panel__head">
              <div>
                <h2 className="admin-panel__title">Invités disponibles</h2>
                <p className="admin-ceremony-table-meta">
                  {availableGuests.length} hors cérémonie
                  {guestSearch.trim()
                    ? ` (recherche)`
                    : ""}{" "}
                  · {activeCeremonyRsvp.total} déjà affecté
                  {activeCeremonyRsvp.total > 1 ? "s" : ""}
                </p>
              </div>
              <span className="admin-badge admin-badge--muted">
                {selectedAvailableCount > 0
                  ? `${selectedAvailableCount} sélectionné(s)`
                  : availableGuests.length}
              </span>
            </div>
            <p className="admin-ceremony-hint">
              Sélectionnez plusieurs invités pour les affecter à la cérémonie ou directement à un groupe.
            </p>
            <input
              type="search"
              value={guestSearch}
              onChange={(e) => setGuestSearch(e.target.value)}
              placeholder="Rechercher par nom ou téléphone…"
              className="admin-field"
              aria-label="Rechercher un invité disponible"
            />

            {availableGuests.length > 0 ? (
              <>
                <div className="admin-unassigned-toolbar">
                  <label className="admin-unassigned-toolbar__select-all">
                    <input
                      type="checkbox"
                      checked={allAvailableOnPageSelected}
                      disabled={busy || pagedAvailableGuests.length === 0}
                      onChange={(e) => toggleSelectAvailablePage(e.target.checked)}
                    />
                    <span>
                      Tout sélectionner (page {availableCurrentPage})
                    </span>
                  </label>

                  <div className="admin-unassigned-toolbar__actions">
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost"
                      disabled={busy || availableGuests.length === 0}
                      onClick={selectAllAvailableFiltered}
                    >
                      Tout ({availableGuests.length})
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost"
                      disabled={busy || selectedAvailableCount === 0}
                      onClick={clearAvailableSelection}
                    >
                      Effacer
                    </button>
                  </div>
                </div>

                {selectedAvailableCount > 0 ? (
                  <div className="admin-unassigned-bulk">
                    <p className="admin-unassigned-bulk__label">
                      Action sur {selectedAvailableCount} sélectionné
                      {selectedAvailableCount > 1 ? "s" : ""}
                    </p>
                    <div className="admin-unassigned-bulk__controls">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => assignSelected({ tableId: null })}
                        className="admin-btn admin-btn--primary"
                      >
                        Affecter à la cérémonie
                      </button>

                      {(activeCeremony.groups ?? []).length > 0 ? (
                        <select
                          className="admin-select"
                          defaultValue=""
                          disabled={busy}
                          onChange={(e) => {
                            if (!e.target.value) return;
                            void assignSelected({
                              tableId: null,
                              groupId: e.target.value,
                            });
                            e.target.value = "";
                          }}
                        >
                          <option value="">Affecter à un groupe…</option>
                          {(activeCeremony.groups ?? []).map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="admin-ceremony-hint">
                          Créez un groupe dans l&apos;onglet Groupes pour y affecter directement.
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}

                <ul className="admin-guest-picker">
                  {pagedAvailableGuests.map((guest) => (
                    <li key={guest.id} className="admin-guest-picker__item">
                      <label className="admin-guest-picker__label">
                        <input
                          type="checkbox"
                          checked={selectedGuestIds.has(guest.id)}
                          onChange={(e) =>
                            toggleGuestSelection(guest.id, e.target.checked)
                          }
                        />
                        <span>
                          <strong>{guest.name}</strong>
                          <small>
                            {guest.phone} · {guest.numGuests} convive
                            {guest.numGuests > 1 ? "s" : ""}
                          </small>
                        </span>
                      </label>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => assignGuest(guest.id, { tableId: null })}
                        className="admin-btn admin-btn--ghost"
                        aria-label={`Affecter ${guest.name}`}
                      >
                        Affecter
                      </button>
                    </li>
                  ))}
                </ul>

                {availableTotalPages > 1 ? (
                  <div className="admin-unassigned-pagination">
                    <button
                      type="button"
                      className="admin-btn admin-btn--secondary"
                      disabled={busy || availableCurrentPage <= 1}
                      onClick={() =>
                        setAvailablePage((page) => Math.max(1, page - 1))
                      }
                    >
                      Précédent
                    </button>
                    <span>
                      Page {availableCurrentPage} / {availableTotalPages}
                      <small>
                        {" "}
                        · {(availableCurrentPage - 1) * LIST_PAGE_SIZE + 1}
                        –
                        {Math.min(
                          availableCurrentPage * LIST_PAGE_SIZE,
                          availableGuests.length,
                        )}{" "}
                        sur {availableGuests.length}
                      </small>
                    </span>
                    <button
                      type="button"
                      className="admin-btn admin-btn--secondary"
                      disabled={
                        busy || availableCurrentPage >= availableTotalPages
                      }
                      onClick={() =>
                        setAvailablePage((page) =>
                          Math.min(availableTotalPages, page + 1),
                        )
                      }
                    >
                      Suivant
                    </button>
                  </div>
                ) : (
                  <p className="admin-ceremony-hint">
                    {availableGuests.length} invité
                    {availableGuests.length > 1 ? "s" : ""} affiché
                    {availableGuests.length > 1 ? "s" : ""}
                  </p>
                )}
              </>
            ) : (
              <p className="admin-empty">
                {guestSearch.trim()
                  ? `Aucun invité ne correspond à « ${guestSearch.trim()} ».`
                  : "Tous les invités sont déjà affectés à cette cérémonie."}
              </p>
            )}
          </section>
        </div>
      ) : ceremonyView === "tables" ? (
        <>
          <section className="admin-panel admin-ceremony-rsvp admin-ceremony-table-stats">
            <div className="admin-ceremony-panel__head">
              <div>
                <h2 className="admin-panel__title">Vue d&apos;ensemble des tables</h2>
                <p className="admin-ceremony-hint">
                  Onglet dédié aux tables et à leurs membres affectés.
                </p>
              </div>
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                disabled={busy}
                onClick={() => setCreateTableOpen(true)}
              >
                Créer une table
              </button>
            </div>
            <div className="admin-stats admin-stats--inline">
              <article className="admin-stat">
                <div className="admin-stat__label">Tables</div>
                <div className="admin-stat__value">{tableStats.tableCount}</div>
              </article>
              <article className="admin-stat">
                <div className="admin-stat__label">À une table</div>
                <div className="admin-stat__value">{tableStats.seated}</div>
              </article>
              <article className="admin-stat">
                <div className="admin-stat__label">Sans table</div>
                <div className="admin-stat__value">{tableStats.unassigned}</div>
              </article>
              <article className="admin-stat">
                <div className="admin-stat__label">Places</div>
                <div className="admin-stat__value">{tableStats.seatsUsed}</div>
              </article>
            </div>
          </section>

          <section className="admin-ceremony-board admin-ceremony-board--tables">
            <div className="admin-ceremony-board__search">
              <input
                type="search"
                value={assignedSearch}
                onChange={(e) => setAssignedSearch(e.target.value)}
                placeholder="Rechercher un invité (nom ou téléphone)…"
                className="admin-field"
                aria-label="Rechercher un invité déjà affecté"
              />
              {assignedQuery ? (
                <p className="admin-ceremony-hint">
                  {assignedMatchCount} résultat{assignedMatchCount > 1 ? "s" : ""} parmi les
                  invités des tables
                </p>
              ) : null}
            </div>

              <AssignablePoolPanel
                title="Sans table"
                hint="Sélectionnez des invités déjà affectés à la cérémonie, puis assignez-les à une table."
                open={tablesPoolOpen}
                onToggle={() => setTablesPoolOpen((value) => !value)}
                busy={busy}
                assignments={filteredUnassignedGuests}
                totalCount={activeCeremony.unassignedGuests.length}
                pageAssignments={pagedUnassignedGuests}
                currentPage={unassignedCurrentPage}
                totalPages={unassignedTotalPages}
                selectedIds={selectedAssignedGuestIds}
                selectedCount={selectedUnassignedCount}
                allPageSelected={allUnassignedOnPageSelected}
                onToggleSelect={toggleAssignedGuestSelection}
                onTogglePage={toggleSelectUnassignedPage}
                onSelectAll={selectAllUnassignedFiltered}
                onClearSelection={clearUnassignedSelection}
                onPageChange={setUnassignedPage}
                assignSelect={
                  activeCeremony.tables.length > 0 ? (
                    <select
                      className="admin-select"
                      defaultValue=""
                      disabled={busy || selectedUnassignedCount === 0}
                      onChange={(e) => {
                        if (!e.target.value) return;
                        void assignSelectedUnassigned({
                          tableId: e.target.value,
                        });
                        e.target.value = "";
                      }}
                    >
                      <option value="">
                        Assigner à une table ({selectedUnassignedCount})…
                      </option>
                      {activeCeremony.tables.map((table) => (
                        <option key={table.id} value={table.id}>
                          {table.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="admin-ceremony-hint">
                      Créez d&apos;abord une table pour y placer des invités.
                    </p>
                  )
                }
              />

              {filteredTables.map((table) => (
                <CeremonyTableCard
                  key={table.id}
                  table={table}
                  allTables={activeCeremony.tables}
                  allGroups={activeCeremony.groups ?? []}
                  busy={busy}
                  selectedAssignedGuestIds={selectedAssignedGuestIds}
                  onToggleAssigned={toggleAssignedGuestSelection}
                  onWhatsApp={sendCeremonyWhatsApp}
                  onAssignTable={(guestId, tableId) =>
                    assignGuest(guestId, { tableId })
                  }
                  onAssignGroup={(guestId, groupId) =>
                    assignGuest(guestId, { groupId })
                  }
                  onNumGuestsChange={(guestId, numGuests) =>
                    void assignGuest(guestId, { numGuests })
                  }
                  onRemove={(guestId) => removeGuest(guestId)}
                  onDelete={() => requestDeleteTable(table.id, table.name)}
                  candidates={activeCeremony.unassignedGuests}
                  onAddGuests={async (guestIds) => {
                    try {
                      const { okCount, failCount } =
                        await assignGuestsWithProgress(
                          guestIds,
                          { tableId: table.id },
                          "Ajout à la table",
                        );
                      onMessage(
                        failCount > 0
                          ? `Ajoutés: ${okCount} | Erreurs: ${failCount}`
                          : `${okCount} invité(s) ajouté(s) à « ${table.name} »`,
                      );
                      await loadBoard();
                    } finally {
                      setBusyState(null);
                    }
                  }}
                />
              ))}

              {assignedQuery && assignedMatchCount === 0 ? (
                <p className="admin-empty">
                  Aucun invité affecté ne correspond à « {assignedSearch.trim()} ».
                </p>
              ) : null}

              {!assignedQuery &&
              activeCeremony.tables.length === 0 &&
              activeCeremony.unassignedGuests.length === 0 ? (
                <p className="admin-empty">
                  Aucune table ni invité pour cette cérémonie. Affectez des invités dans l&apos;onglet Invités, puis créez des tables.
                </p>
              ) : null}

              {!assignedQuery &&
              activeCeremony.tables.length === 0 &&
              activeCeremony.unassignedGuests.length > 0 ? (
                <p className="admin-ceremony-hint">
                  {activeCeremony.unassignedGuests.length} invité(s) sans table.
                  Utilisez le panneau « Sans table » ou le bouton Ajouter sur une table.
                </p>
              ) : null}
            </section>
        </>
      ) : (
        <>
          <section className="admin-panel admin-ceremony-rsvp admin-ceremony-group-stats">
            <div className="admin-ceremony-panel__head">
              <div>
                <h2 className="admin-panel__title">Vue d&apos;ensemble des groupes</h2>
                <p className="admin-ceremony-hint">
                  Onglet dédié aux groupes et à leurs membres.
                </p>
              </div>
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                disabled={busy}
                onClick={() => setCreateGroupOpen(true)}
              >
                Créer un groupe
              </button>
            </div>
            <div className="admin-stats admin-stats--inline">
              <article className="admin-stat">
                <div className="admin-stat__label">Groupes</div>
                <div className="admin-stat__value">{groupStats.groupCount}</div>
              </article>
              <article className="admin-stat">
                <div className="admin-stat__label">Dans un groupe</div>
                <div className="admin-stat__value">{groupStats.inGroups}</div>
              </article>
              <article className="admin-stat">
                <div className="admin-stat__label">Sans groupe</div>
                <div className="admin-stat__value">{groupStats.ungrouped}</div>
              </article>
            </div>
          </section>

          <section className="admin-ceremony-board admin-ceremony-board--groups">
            <div className="admin-ceremony-board__search">
              <input
                type="search"
                value={assignedSearch}
                onChange={(e) => setAssignedSearch(e.target.value)}
                placeholder="Rechercher dans les groupes (nom ou téléphone)…"
                className="admin-field"
                aria-label="Rechercher un invité dans les groupes"
              />
              {assignedQuery ? (
                <p className="admin-ceremony-hint">
                  {assignedMatchCount} résultat{assignedMatchCount > 1 ? "s" : ""}
                </p>
              ) : null}
            </div>

            <AssignablePoolPanel
              title="Sans groupe"
              hint="Sélectionnez des invités déjà affectés à la cérémonie, puis ajoutez-les à un groupe."
              open={groupsPoolOpen}
              onToggle={() => setGroupsPoolOpen((value) => !value)}
              busy={busy}
              assignments={filteredUngroupedGuests}
              totalCount={groupStats.ungrouped}
              pageAssignments={pagedUngroupedGuests}
              currentPage={ungroupedCurrentPage}
              totalPages={ungroupedTotalPages}
              selectedIds={selectedAssignedGuestIds}
              selectedCount={selectedUngroupedCount}
              allPageSelected={allUngroupedOnPageSelected}
              onToggleSelect={toggleAssignedGuestSelection}
              onTogglePage={toggleSelectUngroupedPage}
              onSelectAll={selectAllUngroupedFiltered}
              onClearSelection={clearUngroupedSelection}
              onPageChange={setUngroupedPage}
              assignSelect={
                (activeCeremony.groups ?? []).length > 0 ? (
                  <select
                    className="admin-select"
                    defaultValue=""
                    disabled={busy || selectedUngroupedCount === 0}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      void assignSelectedUngrouped({
                        groupId: e.target.value,
                      });
                      e.target.value = "";
                    }}
                  >
                    <option value="">
                      Ajouter à un groupe ({selectedUngroupedCount})…
                    </option>
                    {(activeCeremony.groups ?? []).map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="admin-ceremony-hint">
                    Créez d&apos;abord un groupe pour y classer des invités.
                  </p>
                )
              }
            />

            {filteredGroups.map((group) => (
              <CeremonyGroupCard
                key={group.id}
                group={group}
                allGroups={activeCeremony.groups ?? []}
                busy={busy}
                selectedAssignedGuestIds={selectedAssignedGuestIds}
                onToggleAssigned={toggleAssignedGuestSelection}
                onTogglePage={(pageGuestIds, checked) =>
                  toggleSelectGroupPage(pageGuestIds, checked)
                }
                onSelectAll={() => selectAllInGroup(group.id)}
                onClearSelection={() => clearGroupSelection(group.id)}
                onWhatsApp={sendCeremonyWhatsApp}
                onWhatsAppGroup={() =>
                  requestCeremonyWhatsAppBulk(
                    false,
                    group.assignments.map((item) => item.guestId),
                  )
                }
                onAssignGroup={(guestId, groupId) =>
                  assignGuest(guestId, { groupId })
                }
                onBulkUngroup={() =>
                  void assignSelectedInGroup(group.id, { groupId: null })
                }
                onBulkMove={(targetGroupId) =>
                  void assignSelectedInGroup(group.id, {
                    groupId: targetGroupId,
                  })
                }
                onBulkRemove={() => requestRemoveSelectedInGroup(group.id)}
                onNumGuestsChange={(guestId, numGuests) =>
                  void assignGuest(guestId, { numGuests })
                }
                onRemove={(guestId) => removeGuest(guestId)}
                onDelete={() =>
                  requestDeleteGroup(
                    group.id,
                    group.name,
                    group.assignments.length,
                  )
                }
                candidates={activeCeremony.ungroupedGuests ?? []}
                onAddGuests={async (guestIds) => {
                  try {
                    const { okCount, failCount } =
                      await assignGuestsWithProgress(
                        guestIds,
                        { groupId: group.id },
                        "Ajout au groupe",
                      );
                    onMessage(
                      failCount > 0
                        ? `Ajoutés: ${okCount} | Erreurs: ${failCount}`
                        : `${okCount} invité(s) ajouté(s) à « ${group.name} »`,
                    );
                    await loadBoard();
                  } finally {
                    setBusyState(null);
                  }
                }}
              />
            ))}

            {assignedQuery && assignedMatchCount === 0 ? (
              <p className="admin-empty">
                Aucun invité ne correspond à « {assignedSearch.trim()} » dans les groupes.
              </p>
            ) : null}

            {!assignedQuery && groupStats.groupCount === 0 && groupStats.ungrouped === 0 ? (
              <p className="admin-empty">
                Aucun groupe pour cette cérémonie. Créez un groupe, puis classez les invités déjà affectés.
              </p>
            ) : null}

            {!assignedQuery &&
            groupStats.groupCount === 0 &&
            groupStats.ungrouped > 0 ? (
              <p className="admin-ceremony-hint">
                {groupStats.ungrouped} invité(s) affecté(s) à la cérémonie n&apos;ont pas encore de groupe.
                Utilisez le panneau « Sans groupe » ou le bouton Ajouter sur un groupe.
              </p>
            ) : null}
          </section>
        </>
      )}

      <CreateTableModal
        open={createTableOpen}
        busy={busy}
        ceremonyName={activeCeremony.name}
        onClose={() => {
          if (!busy) setCreateTableOpen(false);
        }}
        onCreate={createTable}
      />

      <CreateGroupModal
        open={createGroupOpen}
        busy={busy}
        ceremonyName={activeCeremony.name}
        onClose={() => {
          if (!busy) setCreateGroupOpen(false);
        }}
        onCreate={createGroup}
      />

      <WhatsAppBulkConfirmModal
        open={bulkWhatsAppConfirm !== null}
        busy={busy}
        count={bulkWhatsAppConfirm?.count ?? 0}
        mode={bulkWhatsAppConfirm?.sendAll ? "all" : "selection"}
        ceremonyName={activeCeremony.name}
        onClose={() => {
          if (!busy) setBulkWhatsAppConfirm(null);
        }}
        onConfirm={() => {
          if (!bulkWhatsAppConfirm) return;
          void executeCeremonyWhatsAppBulk(bulkWhatsAppConfirm);
        }}
      />

      <AdminConfirmModal
        open={confirmAction !== null}
        busy={busy}
        eyebrow="Cérémonies"
        title={
          confirmAction?.type === "delete-table"
            ? "Supprimer la table ?"
            : confirmAction?.type === "delete-group"
              ? "Supprimer le groupe ?"
              : "Retirer les invités ?"
        }
        description={
          confirmAction?.type === "delete-table" ? (
            <>
              Supprimer la table <strong>« {confirmAction.tableName} »</strong> ?
              Les invités resteront affectés à la cérémonie, sans table.
            </>
          ) : confirmAction?.type === "delete-group" ? (
            <>
              Supprimer le groupe <strong>« {confirmAction.groupName} »</strong> ?
            </>
          ) : confirmAction?.type === "remove-from-ceremony" ? (
            <>
              Retirer{" "}
              <strong>
                {confirmAction.guestIds.length} invité
                {confirmAction.guestIds.length > 1 ? "s" : ""}
              </strong>{" "}
              de cette cérémonie ?
            </>
          ) : null
        }
        confirmLabel={
          confirmAction?.type === "remove-from-ceremony"
            ? "Retirer"
            : "Supprimer"
        }
        tone="danger"
        onClose={() => {
          if (!busy) setConfirmAction(null);
        }}
        onConfirm={handleConfirmAction}
      />
    </div>
  );
}

function CeremonyAssignmentRow({
  assignment,
  busy,
  selected,
  onToggleSelect,
  onWhatsApp,
  tableSelect,
  onNumGuestsChange,
  onRemove,
  removeLabel = "Retirer",
  removeVariant = "danger",
}: {
  assignment: CeremonyAssignment;
  busy: boolean;
  selected: boolean;
  onToggleSelect: (checked: boolean) => void;
  onWhatsApp: () => void;
  tableSelect?: ReactNode;
  onNumGuestsChange: (numGuests: number) => void;
  onRemove: () => void;
  removeLabel?: string;
  removeVariant?: "danger" | "ghost";
}) {
  const [seats, setSeats] = useState(() =>
    normalizePositiveInt(assignment.numGuests, 1),
  );

  useEffect(() => {
    setSeats(normalizePositiveInt(assignment.numGuests, 1));
  }, [assignment.numGuests]);

  function commitSeats() {
    const next = Math.max(1, Math.min(50, Math.floor(Number(seats) || 1)));
    setSeats(next);
    if (next !== assignment.numGuests) onNumGuestsChange(next);
  }

  return (
    <li className="admin-assignment-list__item">
      <label className="admin-assignment-list__select">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onToggleSelect(e.target.checked)}
          aria-label={`Sélectionner ${assignment.guest.name}`}
        />
      </label>
      <div className="admin-assignment-list__content">
        <strong>{assignment.guest.name}</strong>
        <small>{assignment.guest.phone}</small>
        <div className="admin-assignment-list__meta">{ceremonyRsvpBadge(assignment)}</div>
      </div>
      <label className="admin-assignment-list__seats">
        <span>Convives</span>
        <input
          type="number"
          className="admin-field admin-assignment-list__seats-input"
          min={1}
          max={50}
          value={seats}
          disabled={busy}
          onChange={(e) => setSeats(Number(e.target.value))}
          onBlur={() => commitSeats()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          aria-label={`Convives pour ${assignment.guest.name}`}
        />
      </label>
      <div className="admin-assignment-list__actions">
        {tableSelect}
        <button
          type="button"
          disabled={busy}
          onClick={onWhatsApp}
          className="admin-btn admin-btn--ghost"
        >
          WhatsApp
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onRemove}
          className={`admin-btn admin-btn--${removeVariant}`}
        >
          {removeLabel}
        </button>
      </div>
    </li>
  );
}

function CeremonyTableCard({
  table,
  allTables,
  allGroups,
  busy,
  selectedAssignedGuestIds,
  onToggleAssigned,
  onWhatsApp,
  onAssignTable,
  onAssignGroup,
  onNumGuestsChange,
  onRemove,
  onDelete,
  candidates,
  onAddGuests,
}: {
  table: AdminCeremony["tables"][number];
  allTables: AdminCeremony["tables"];
  allGroups: AdminCeremony["groups"];
  busy: boolean;
  selectedAssignedGuestIds: Set<string>;
  onToggleAssigned: (guestId: string, checked: boolean) => void;
  onWhatsApp: (guestId: string) => void;
  onAssignTable: (guestId: string, tableId: string | null) => void;
  onAssignGroup: (guestId: string, groupId: string | null) => void;
  onNumGuestsChange: (guestId: string, numGuests: number) => void;
  onRemove: (guestId: string) => void;
  onDelete: () => void;
  candidates: CeremonyAssignment[];
  onAddGuests: (guestIds: string[]) => Promise<void> | void;
}) {
  const seatsUsed = table.assignments.reduce(
    (total, assignment) => total + assignment.numGuests,
    0,
  );
  const [membersOpen, setMembersOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <article className="admin-panel admin-table-card">
      <div className="admin-ceremony-panel__head">
        <div>
          <h2 className="admin-panel__title">{table.name}</h2>
          <p className="admin-ceremony-table-meta">
            {table.assignments.length} invité(s)
            {table.capacity ? ` · ${seatsUsed}/${table.capacity} places` : ` · ${seatsUsed} place(s)`}
          </p>
        </div>
        <div className="admin-ceremony-actions">
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            disabled={busy || candidates.length === 0}
            onClick={() => setAddOpen((open) => !open)}
            title={
              candidates.length === 0
                ? "Aucun invité sans table à ajouter"
                : undefined
            }
          >
            {addOpen ? "Fermer l'ajout" : `Ajouter (${candidates.length})`}
          </button>
          {table.assignments.length > 0 ? (
            <button
              type="button"
              className="admin-btn admin-btn--ghost"
              onClick={() => setMembersOpen((open) => !open)}
            >
              {membersOpen
                ? `Masquer membres (${table.assignments.length})`
                : `Afficher membres (${table.assignments.length})`}
            </button>
          ) : null}
          <button type="button" disabled={busy} onClick={onDelete} className="admin-btn admin-btn--danger">
            Supprimer
          </button>
        </div>
      </div>

      {addOpen ? (
        <AddCandidatesPanel
          busy={busy}
          candidates={candidates}
          confirmLabel={`Ajouter à « ${table.name} »`}
          emptyHint="Tous les invités de cette cérémonie ont déjà une table."
          onCancel={() => setAddOpen(false)}
          onConfirm={async (guestIds) => {
            await onAddGuests(guestIds);
            setAddOpen(false);
            setMembersOpen(true);
          }}
        />
      ) : null}

      {table.assignments.length === 0 ? (
        <p className="admin-ceremony-hint">
          Aucun invité assigné à cette table.
          {candidates.length > 0
            ? " Utilisez « Ajouter » pour y placer des invités sans table."
            : ""}
        </p>
      ) : !membersOpen ? (
        <p className="admin-ceremony-hint">
          Membres masqués. Cliquez sur « Afficher membres » pour voir les invités.
        </p>
      ) : (
        <ul className="admin-assignment-list">
          {table.assignments.map((assignment) => (
            <CeremonyAssignmentRow
              key={assignment.id}
              assignment={assignment}
              busy={busy}
              selected={selectedAssignedGuestIds.has(assignment.guestId)}
              onToggleSelect={(checked) => onToggleAssigned(assignment.guestId, checked)}
              onWhatsApp={() => onWhatsApp(assignment.guestId)}
              tableSelect={
                <>
                  <select
                    className="admin-select"
                    value={table.id}
                    onChange={(e) =>
                      onAssignTable(assignment.guestId, e.target.value || null)
                    }
                  >
                    {allTables.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                    <option value="">Sans table</option>
                  </select>
                  {allGroups.length > 0 ? (
                    <select
                      className="admin-select"
                      value={assignment.groupId ?? ""}
                      onChange={(e) =>
                        onAssignGroup(assignment.guestId, e.target.value || null)
                      }
                    >
                      <option value="">Sans groupe</option>
                      {allGroups.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </>
              }
              onNumGuestsChange={(numGuests) =>
                onNumGuestsChange(assignment.guestId, numGuests)
              }
              onRemove={() => onRemove(assignment.guestId)}
              removeLabel="Retirer"
              removeVariant="ghost"
            />
          ))}
        </ul>
      )}
    </article>
  );
}

function CeremonyGroupCard({
  group,
  allGroups,
  busy,
  selectedAssignedGuestIds,
  onToggleAssigned,
  onTogglePage,
  onSelectAll,
  onClearSelection,
  onWhatsApp,
  onWhatsAppGroup,
  onAssignGroup,
  onBulkUngroup,
  onBulkMove,
  onBulkRemove,
  onNumGuestsChange,
  onRemove,
  onDelete,
  candidates,
  onAddGuests,
}: {
  group: AdminCeremony["groups"][number];
  allGroups: AdminCeremony["groups"];
  busy: boolean;
  selectedAssignedGuestIds: Set<string>;
  onToggleAssigned: (guestId: string, checked: boolean) => void;
  onTogglePage: (pageGuestIds: string[], checked: boolean) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onWhatsApp: (guestId: string) => void;
  onWhatsAppGroup: () => void;
  onAssignGroup: (guestId: string, groupId: string | null) => void;
  onBulkUngroup: () => void;
  onBulkMove: (groupId: string) => void;
  onBulkRemove: () => void;
  onNumGuestsChange: (guestId: string, numGuests: number) => void;
  onRemove: (guestId: string) => void;
  onDelete: () => void;
  candidates: CeremonyAssignment[];
  onAddGuests: (guestIds: string[]) => Promise<void> | void;
}) {
  const [page, setPage] = useState(1);
  const [membersOpen, setMembersOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [group.id]);

  useEffect(() => {
    const totalPages = Math.max(
      1,
      Math.ceil(group.assignments.length / LIST_PAGE_SIZE),
    );
    setPage((current) => Math.min(current, totalPages));
  }, [group.assignments.length]);

  const guestSeats = group.assignments.reduce(
    (total, assignment) => total + assignment.numGuests,
    0,
  );

  const totalPages = Math.max(
    1,
    Math.ceil(group.assignments.length / LIST_PAGE_SIZE),
  );
  const currentPage = Math.min(page, totalPages);
  const pagedAssignments = group.assignments.slice(
    (currentPage - 1) * LIST_PAGE_SIZE,
    currentPage * LIST_PAGE_SIZE,
  );
  const pageIds = pagedAssignments.map((item) => item.guestId);
  const selectedInGroupCount = group.assignments.filter((item) =>
    selectedAssignedGuestIds.has(item.guestId),
  ).length;
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedAssignedGuestIds.has(id));

  const otherGroups = allGroups.filter((item) => item.id !== group.id);

  return (
    <article className="admin-panel admin-table-card admin-group-card">
      <div className="admin-ceremony-panel__head">
        <div>
          <h2 className="admin-panel__title">Groupe · {group.name}</h2>
          <p className="admin-ceremony-table-meta">
            {group.assignments.length} invité(s) · {guestSeats} convive(s)
          </p>
        </div>
        <div className="admin-ceremony-actions">
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            disabled={busy || candidates.length === 0}
            onClick={() => setAddOpen((open) => !open)}
            title={
              candidates.length === 0
                ? "Aucun invité sans groupe à ajouter"
                : undefined
            }
          >
            {addOpen ? "Fermer l'ajout" : `Ajouter (${candidates.length})`}
          </button>
          {group.assignments.length > 0 ? (
            <button
              type="button"
              className="admin-btn admin-btn--ghost"
              onClick={() => setMembersOpen((open) => !open)}
            >
              {membersOpen
                ? `Masquer membres (${group.assignments.length})`
                : `Afficher membres (${group.assignments.length})`}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy || group.assignments.length === 0}
            onClick={onWhatsAppGroup}
            className="admin-btn admin-btn--primary"
          >
            WhatsApp groupe ({group.assignments.length})
          </button>
          <button
            type="button"
            disabled={busy || group.assignments.length > 0}
            onClick={onDelete}
            className="admin-btn admin-btn--danger"
            title={
              group.assignments.length > 0
                ? "Retirez d'abord les invités du groupe"
                : undefined
            }
          >
            Supprimer
          </button>
        </div>
      </div>

      {addOpen ? (
        <AddCandidatesPanel
          busy={busy}
          candidates={candidates}
          confirmLabel={`Ajouter à « ${group.name} »`}
          emptyHint="Tous les invités de cette cérémonie sont déjà dans un groupe."
          onCancel={() => setAddOpen(false)}
          onConfirm={async (guestIds) => {
            await onAddGuests(guestIds);
            setAddOpen(false);
            setMembersOpen(true);
          }}
        />
      ) : null}

      {group.assignments.length === 0 ? (
        <p className="admin-ceremony-hint">
          Aucun invité dans ce groupe.
          {candidates.length > 0
            ? " Utilisez « Ajouter » ou le panneau « Sans groupe »."
            : " Affectez d'abord des invités à la cérémonie depuis l'onglet Invités."}
        </p>
      ) : !membersOpen ? (
        <p className="admin-ceremony-hint">
          Membres masqués. Cliquez sur « Afficher membres » pour voir les invités.
        </p>
      ) : (
        <>
          <div className="admin-unassigned-toolbar">
            <label className="admin-unassigned-toolbar__select-all">
              <input
                type="checkbox"
                checked={allPageSelected}
                disabled={busy || pageIds.length === 0}
                onChange={(e) => onTogglePage(pageIds, e.target.checked)}
              />
              Page ({pageIds.length})
            </label>
            <div className="admin-unassigned-toolbar__actions">
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                disabled={busy}
                onClick={onSelectAll}
              >
                Tout ({group.assignments.length})
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                disabled={busy || selectedInGroupCount === 0}
                onClick={onClearSelection}
              >
                Effacer
              </button>
            </div>
          </div>

          {selectedInGroupCount > 0 ? (
            <div className="admin-unassigned-bulk">
              <p className="admin-unassigned-bulk__label">
                Action sur {selectedInGroupCount} sélectionné
                {selectedInGroupCount > 1 ? "s" : ""}
              </p>
              <div className="admin-unassigned-bulk__controls">
                <button
                  type="button"
                  className="admin-btn admin-btn--secondary"
                  disabled={busy}
                  onClick={onBulkUngroup}
                >
                  Retirer du groupe
                </button>

                {otherGroups.length > 0 ? (
                  <select
                    className="admin-select"
                    defaultValue=""
                    disabled={busy}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      onBulkMove(e.target.value);
                      e.target.value = "";
                    }}
                  >
                    <option value="">Déplacer vers…</option>
                    {otherGroups.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                ) : null}

                <button
                  type="button"
                  className="admin-btn admin-btn--danger"
                  disabled={busy}
                  onClick={onBulkRemove}
                >
                  Retirer de la cérémonie
                </button>
              </div>
            </div>
          ) : null}

          <ul className="admin-assignment-list">
            {pagedAssignments.map((assignment) => (
              <CeremonyAssignmentRow
                key={assignment.id}
                assignment={assignment}
                busy={busy}
                selected={selectedAssignedGuestIds.has(assignment.guestId)}
                onToggleSelect={(checked) => onToggleAssigned(assignment.guestId, checked)}
                onWhatsApp={() => onWhatsApp(assignment.guestId)}
                tableSelect={
                  <select
                    className="admin-select"
                    value={group.id}
                    onChange={(e) =>
                      onAssignGroup(assignment.guestId, e.target.value || null)
                    }
                  >
                    {allGroups.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                    <option value="">Sans groupe</option>
                  </select>
                }
                onNumGuestsChange={(numGuests) =>
                  onNumGuestsChange(assignment.guestId, numGuests)
                }
                onRemove={() => onRemove(assignment.guestId)}
                removeLabel="Retirer"
                removeVariant="ghost"
              />
            ))}
          </ul>

          {totalPages > 1 ? (
            <div className="admin-unassigned-pagination">
              <button
                type="button"
                className="admin-btn admin-btn--secondary"
                disabled={busy || currentPage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Précédent
              </button>
              <span>
                Page {currentPage} / {totalPages}
                <small>
                  {" "}
                  · {(currentPage - 1) * LIST_PAGE_SIZE + 1}
                  –
                  {Math.min(currentPage * LIST_PAGE_SIZE, group.assignments.length)}{" "}
                  sur {group.assignments.length}
                </small>
              </span>
              <button
                type="button"
                className="admin-btn admin-btn--secondary"
                disabled={busy || currentPage >= totalPages}
                onClick={() =>
                  setPage((value) => Math.min(totalPages, value + 1))
                }
              >
                Suivant
              </button>
            </div>
          ) : null}
        </>
      )}
    </article>
  );
}

function AssignablePoolPanel({
  title,
  hint,
  open,
  onToggle,
  busy,
  assignments,
  totalCount,
  pageAssignments,
  currentPage,
  totalPages,
  selectedIds,
  selectedCount,
  allPageSelected,
  onToggleSelect,
  onTogglePage,
  onSelectAll,
  onClearSelection,
  onPageChange,
  assignSelect,
}: {
  title: string;
  hint: string;
  open: boolean;
  onToggle: () => void;
  busy: boolean;
  assignments: CeremonyAssignment[];
  totalCount: number;
  pageAssignments: CeremonyAssignment[];
  currentPage: number;
  totalPages: number;
  selectedIds: Set<string>;
  selectedCount: number;
  allPageSelected: boolean;
  onToggleSelect: (guestId: string, checked: boolean) => void;
  onTogglePage: (checked: boolean) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onPageChange: (page: number | ((value: number) => number)) => void;
  assignSelect: ReactNode;
}) {
  if (totalCount === 0 && assignments.length === 0) {
    return (
      <article className="admin-panel admin-table-card">
        <div className="admin-ceremony-panel__head">
          <div>
            <h2 className="admin-panel__title">{title}</h2>
            <p className="admin-ceremony-table-meta">0 invité</p>
          </div>
        </div>
        <p className="admin-ceremony-hint">Rien à placer pour le moment.</p>
      </article>
    );
  }

  return (
    <article className="admin-panel admin-table-card">
      <div className="admin-ceremony-panel__head">
        <div>
          <h2 className="admin-panel__title">{title}</h2>
          <p className="admin-ceremony-table-meta">
            {assignments.length} invité{assignments.length > 1 ? "s" : ""}
            {assignments.length !== totalCount
              ? ` (filtrés sur ${totalCount})`
              : ""}
          </p>
        </div>
        <div className="admin-ceremony-actions">
          <span className="admin-badge admin-badge--warning">
            {selectedCount > 0
              ? `${selectedCount} sélectionné(s)`
              : assignments.length}
          </span>
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            onClick={onToggle}
          >
            {open ? "Masquer" : "Afficher"}
          </button>
        </div>
      </div>

      {!open ? (
        <p className="admin-ceremony-hint">{hint}</p>
      ) : assignments.length === 0 ? (
        <p className="admin-ceremony-hint">Aucun résultat pour cette recherche.</p>
      ) : (
        <>
          <p className="admin-ceremony-hint">{hint}</p>
          <div className="admin-unassigned-toolbar">
            <label className="admin-unassigned-toolbar__select-all">
              <input
                type="checkbox"
                checked={allPageSelected}
                disabled={busy || pageAssignments.length === 0}
                onChange={(e) => onTogglePage(e.target.checked)}
              />
              <span>Tout sélectionner (page {currentPage})</span>
            </label>
            <div className="admin-unassigned-toolbar__actions">
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                disabled={busy || assignments.length === 0}
                onClick={onSelectAll}
              >
                Tout ({assignments.length})
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                disabled={busy || selectedCount === 0}
                onClick={onClearSelection}
              >
                Effacer
              </button>
            </div>
          </div>

          {selectedCount > 0 ? (
            <div className="admin-unassigned-bulk">
              <p className="admin-unassigned-bulk__label">
                Action sur {selectedCount} sélectionné
                {selectedCount > 1 ? "s" : ""}
              </p>
              <div className="admin-unassigned-bulk__controls">{assignSelect}</div>
            </div>
          ) : null}

          <ul className="admin-assignment-list">
            {pageAssignments.map((assignment) => (
              <li key={assignment.id} className="admin-assignment-list__item">
                <label className="admin-assignment-list__select">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(assignment.guestId)}
                    onChange={(e) =>
                      onToggleSelect(assignment.guestId, e.target.checked)
                    }
                    aria-label={`Sélectionner ${assignment.guest.name}`}
                  />
                </label>
                <div className="admin-assignment-list__content">
                  <strong>{assignment.guest.name}</strong>
                  <small>{assignment.guest.phone}</small>
                  <div className="admin-assignment-list__meta">
                    {ceremonyRsvpBadge(assignment)}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {totalPages > 1 ? (
            <div className="admin-unassigned-pagination">
              <button
                type="button"
                className="admin-btn admin-btn--secondary"
                disabled={busy || currentPage <= 1}
                onClick={() => onPageChange((page) => Math.max(1, page - 1))}
              >
                Précédent
              </button>
              <span>
                Page {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                className="admin-btn admin-btn--secondary"
                disabled={busy || currentPage >= totalPages}
                onClick={() =>
                  onPageChange((page) => Math.min(totalPages, page + 1))
                }
              >
                Suivant
              </button>
            </div>
          ) : null}
        </>
      )}
    </article>
  );
}

function AddCandidatesPanel({
  busy,
  candidates,
  confirmLabel,
  emptyHint,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  candidates: CeremonyAssignment[];
  confirmLabel: string;
  emptyHint: string;
  onCancel: () => void;
  onConfirm: (guestIds: string[]) => Promise<void> | void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((item) =>
      `${item.guest.name} ${item.guest.phone}`.toLowerCase().includes(q),
    );
  }, [candidates, query]);

  function toggle(guestId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(guestId);
      else next.delete(guestId);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelected((current) => {
      const next = new Set(current);
      for (const item of filtered) next.add(item.guestId);
      return next;
    });
  }

  const selectedCount = [...selected].filter((id) =>
    candidates.some((item) => item.guestId === id),
  ).length;

  return (
    <div className="admin-add-candidates">
      <div className="admin-add-candidates__toolbar">
        <input
          type="search"
          className="admin-field"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un invité à ajouter…"
        />
        <button
          type="button"
          className="admin-btn admin-btn--ghost"
          disabled={busy || filtered.length === 0}
          onClick={selectAllFiltered}
        >
          Tout ({filtered.length})
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--ghost"
          disabled={busy}
          onClick={onCancel}
        >
          Annuler
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--primary"
          disabled={busy || selectedCount === 0}
          onClick={() => void onConfirm([...selected])}
        >
          {confirmLabel} ({selectedCount})
        </button>
      </div>

      {candidates.length === 0 ? (
        <p className="admin-ceremony-hint">{emptyHint}</p>
      ) : filtered.length === 0 ? (
        <p className="admin-ceremony-hint">Aucun résultat.</p>
      ) : (
        <ul className="admin-assignment-list admin-add-candidates__list">
          {filtered.slice(0, 40).map((assignment) => (
            <li key={assignment.id} className="admin-assignment-list__item">
              <label className="admin-assignment-list__select">
                <input
                  type="checkbox"
                  checked={selected.has(assignment.guestId)}
                  disabled={busy}
                  onChange={(e) => toggle(assignment.guestId, e.target.checked)}
                />
              </label>
              <div className="admin-assignment-list__content">
                <strong>{assignment.guest.name}</strong>
                <small>{assignment.guest.phone}</small>
              </div>
            </li>
          ))}
        </ul>
      )}
      {filtered.length > 40 ? (
        <p className="admin-ceremony-hint">
          Affichage limité à 40 résultats — affinez la recherche.
        </p>
      ) : null}
    </div>
  );
}
