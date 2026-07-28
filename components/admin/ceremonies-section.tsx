"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import type { AdminGuest } from "@/lib/admin/types";
import type { AdminCeremony, CeremonyAssignment, CeremonyBoard, CeremonyId } from "@/lib/admin/ceremony-types";
import { getGuestsNotInCeremony } from "@/lib/admin/ceremony-types";
import type { AdminBusyState } from "@/components/admin/admin-busy-overlay";
import { CreateGroupModal } from "@/components/admin/create-group-modal";
import { CreateTableModal } from "@/components/admin/create-table-modal";
import { WhatsAppBulkConfirmModal } from "@/components/admin/whatsapp-bulk-confirm-modal";

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
  onCeremonyChange: (ceremonyId: CeremonyId) => void;
};

export function CeremoniesSection({
  guests,
  onMessage,
  busy,
  setBusyState,
  active,
  activeCeremonyId,
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

  async function deleteTable(tableId: string, tableName: string) {
    if (!confirm(`Supprimer la table « ${tableName} » ?`)) return;

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

  async function deleteGroup(
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

    if (!confirm(`Supprimer le groupe « ${groupName} » ?`)) return;

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

  async function removeSelectedInGroup(groupId: string) {
    const guestIds = selectedGuestIdsInGroup(groupId);
    if (guestIds.length === 0) {
      onMessage("Sélectionnez au moins un invité dans ce groupe");
      return;
    }

    if (
      !confirm(
        `Retirer ${guestIds.length} invité(s) de cette cérémonie ?`,
      )
    ) {
      return;
    }

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
      <div className="admin-ceremony-tabs" role="tablist" aria-label="Cérémonies">
        {board.ceremonies.map((ceremony) => (
          <button
            key={ceremony.id}
            type="button"
            role="tab"
            aria-selected={ceremony.id === activeCeremonyId}
            className={`admin-ceremony-tab${ceremony.id === activeCeremonyId ? " admin-ceremony-tab--active" : ""}`}
            onClick={() => onCeremonyChange(ceremony.id)}
          >
            {ceremony.name}
          </button>
        ))}
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

              {filteredUnassignedGuests.length > 0 ? (
                <article className="admin-panel admin-table-card">
                  <div className="admin-ceremony-panel__head">
                    <div>
                      <h2 className="admin-panel__title">Sans table</h2>
                      <p className="admin-ceremony-table-meta">
                        {filteredUnassignedGuests.length} invité
                        {filteredUnassignedGuests.length > 1 ? "s" : ""}
                        {assignedQuery
                          ? ` (filtrés sur ${activeCeremony.unassignedGuests.length})`
                          : ""}
                      </p>
                    </div>
                    <span className="admin-badge admin-badge--warning">
                      {selectedUnassignedCount > 0
                        ? `${selectedUnassignedCount} sélectionné(s)`
                        : filteredUnassignedGuests.length}
                    </span>
                  </div>

                  <div className="admin-unassigned-toolbar">
                    <label className="admin-unassigned-toolbar__select-all">
                      <input
                        type="checkbox"
                        checked={allUnassignedOnPageSelected}
                        disabled={busy || pagedUnassignedGuests.length === 0}
                        onChange={(e) => toggleSelectUnassignedPage(e.target.checked)}
                      />
                      <span>
                        Tout sélectionner (page {unassignedCurrentPage})
                      </span>
                    </label>

                    <div className="admin-unassigned-toolbar__actions">
                      <button
                        type="button"
                        className="admin-btn admin-btn--ghost"
                        disabled={busy || filteredUnassignedGuests.length === 0}
                        onClick={selectAllUnassignedFiltered}
                      >
                        Tout ({filteredUnassignedGuests.length})
                      </button>
                      <button
                        type="button"
                        className="admin-btn admin-btn--ghost"
                        disabled={busy || selectedUnassignedCount === 0}
                        onClick={clearUnassignedSelection}
                      >
                        Effacer
                      </button>
                    </div>
                  </div>

                  {selectedUnassignedCount > 0 ? (
                    <div className="admin-unassigned-bulk">
                      <p className="admin-unassigned-bulk__label">
                        Action sur {selectedUnassignedCount} sélectionné
                        {selectedUnassignedCount > 1 ? "s" : ""}
                      </p>
                      <div className="admin-unassigned-bulk__controls">
                        {(activeCeremony.groups ?? []).length > 0 ? (
                          <select
                            className="admin-select"
                            defaultValue=""
                            disabled={busy}
                            onChange={(e) => {
                              if (!e.target.value) return;
                              void assignSelectedUnassigned({
                                groupId:
                                  e.target.value === "__none__"
                                    ? null
                                    : e.target.value,
                              });
                              e.target.value = "";
                            }}
                          >
                            <option value="">Ajouter à un groupe…</option>
                            {(activeCeremony.groups ?? []).map((group) => (
                              <option key={group.id} value={group.id}>
                                {group.name}
                              </option>
                            ))}
                            <option value="__none__">Retirer du groupe</option>
                          </select>
                        ) : (
                          <p className="admin-ceremony-hint">
                            Créez un groupe dans l&apos;onglet Groupes pour y affecter la sélection.
                          </p>
                        )}

                        {activeCeremony.tables.length > 0 ? (
                          <select
                            className="admin-select"
                            defaultValue=""
                            disabled={busy}
                            onChange={(e) => {
                              if (!e.target.value) return;
                              void assignSelectedUnassigned({
                                tableId: e.target.value,
                              });
                              e.target.value = "";
                            }}
                          >
                            <option value="">Assigner à une table…</option>
                            {activeCeremony.tables.map((table) => (
                              <option key={table.id} value={table.id}>
                                {table.name}
                              </option>
                            ))}
                          </select>
                        ) : null}

                        <button
                          type="button"
                          className="admin-btn admin-btn--secondary"
                          disabled={busy}
                          onClick={() =>
                            requestCeremonyWhatsAppBulk(
                              false,
                              [...selectedAssignedGuestIds].filter((id) =>
                                filteredUnassignedGuests.some(
                                  (item) => item.guestId === id,
                                ),
                              ),
                            )
                          }
                        >
                          WhatsApp sélection
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <ul className="admin-assignment-list">
                    {pagedUnassignedGuests.map((assignment) => (
                      <CeremonyAssignmentRow
                        key={assignment.id}
                        assignment={assignment}
                        busy={busy}
                        selected={selectedAssignedGuestIds.has(assignment.guestId)}
                        onToggleSelect={(checked) =>
                          toggleAssignedGuestSelection(assignment.guestId, checked)
                        }
                        onWhatsApp={() => sendCeremonyWhatsApp(assignment.guestId)}
                        tableSelect={
                          <>
                            <select
                              className="admin-select"
                              defaultValue=""
                              onChange={(e) => {
                                if (!e.target.value) return;
                                void assignGuest(assignment.guestId, {
                                  tableId: e.target.value,
                                });
                                e.target.value = "";
                              }}
                            >
                              <option value="">Assigner à une table…</option>
                              {activeCeremony.tables.map((table) => (
                                <option key={table.id} value={table.id}>
                                  {table.name}
                                </option>
                              ))}
                            </select>
                            {(activeCeremony.groups ?? []).length > 0 ? (
                              <select
                                className="admin-select"
                                defaultValue=""
                                onChange={(e) => {
                                  if (!e.target.value) return;
                                  void assignGuest(assignment.guestId, {
                                    groupId:
                                      e.target.value === "__none__"
                                        ? null
                                        : e.target.value,
                                  });
                                  e.target.value = "";
                                }}
                              >
                                <option value="">Assigner à un groupe…</option>
                                {(activeCeremony.groups ?? []).map((group) => (
                                  <option key={group.id} value={group.id}>
                                    {group.name}
                                  </option>
                                ))}
                                <option value="__none__">Sans groupe</option>
                              </select>
                            ) : null}
                          </>
                        }
                        onRemove={() => removeGuest(assignment.guestId)}
                        onNumGuestsChange={(numGuests) =>
                          void assignGuest(assignment.guestId, { numGuests })
                        }
                      />
                    ))}
                  </ul>

                  {unassignedTotalPages > 1 ? (
                    <div className="admin-unassigned-pagination">
                      <button
                        type="button"
                        className="admin-btn admin-btn--secondary"
                        disabled={busy || unassignedCurrentPage <= 1}
                        onClick={() =>
                          setUnassignedPage((page) => Math.max(1, page - 1))
                        }
                      >
                        Précédent
                      </button>
                      <span>
                        Page {unassignedCurrentPage} / {unassignedTotalPages}
                        <small>
                          {" "}
                          · {(unassignedCurrentPage - 1) * LIST_PAGE_SIZE + 1}
                          –
                          {Math.min(
                            unassignedCurrentPage * LIST_PAGE_SIZE,
                            filteredUnassignedGuests.length,
                          )}{" "}
                          sur {filteredUnassignedGuests.length}
                        </small>
                      </span>
                      <button
                        type="button"
                        className="admin-btn admin-btn--secondary"
                        disabled={
                          busy || unassignedCurrentPage >= unassignedTotalPages
                        }
                        onClick={() =>
                          setUnassignedPage((page) =>
                            Math.min(unassignedTotalPages, page + 1),
                          )
                        }
                      >
                        Suivant
                      </button>
                    </div>
                  ) : null}
                </article>
              ) : null}

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
                  onDelete={() => deleteTable(table.id, table.name)}
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
                  Créez une table pour commencer le plan de placement.
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

            {filteredUngroupedGuests.length > 0 || (!assignedQuery && groupStats.ungrouped > 0) ? (
              <article className="admin-panel admin-table-card">
                <div className="admin-ceremony-panel__head">
                  <div>
                    <h2 className="admin-panel__title">Sans groupe</h2>
                    <p className="admin-ceremony-table-meta">
                      {filteredUngroupedGuests.length} invité
                      {filteredUngroupedGuests.length > 1 ? "s" : ""} à classer
                      {assignedQuery
                        ? ` (filtrés sur ${groupStats.ungrouped})`
                        : ""}
                    </p>
                  </div>
                  <span className="admin-badge admin-badge--warning">
                    {selectedUngroupedCount > 0
                      ? `${selectedUngroupedCount} sélectionné(s)`
                      : filteredUngroupedGuests.length}
                  </span>
                </div>

                {filteredUngroupedGuests.length === 0 ? (
                  <p className="admin-ceremony-hint">
                    Aucun résultat « sans groupe » pour cette recherche.
                  </p>
                ) : (
                  <>
                    <div className="admin-unassigned-toolbar">
                      <label className="admin-unassigned-toolbar__select-all">
                        <input
                          type="checkbox"
                          checked={allUngroupedOnPageSelected}
                          disabled={busy || pagedUngroupedGuests.length === 0}
                          onChange={(e) => toggleSelectUngroupedPage(e.target.checked)}
                        />
                        <span>
                          Tout sélectionner (page {ungroupedCurrentPage})
                        </span>
                      </label>

                      <div className="admin-unassigned-toolbar__actions">
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost"
                          disabled={busy || filteredUngroupedGuests.length === 0}
                          onClick={selectAllUngroupedFiltered}
                        >
                          Tout ({filteredUngroupedGuests.length})
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost"
                          disabled={busy || selectedUngroupedCount === 0}
                          onClick={clearUngroupedSelection}
                        >
                          Effacer
                        </button>
                      </div>
                    </div>

                    {selectedUngroupedCount > 0 ? (
                      <div className="admin-unassigned-bulk">
                        <p className="admin-unassigned-bulk__label">
                          Action sur {selectedUngroupedCount} sélectionné
                          {selectedUngroupedCount > 1 ? "s" : ""}
                        </p>
                        <div className="admin-unassigned-bulk__controls">
                          {(activeCeremony.groups ?? []).length > 0 ? (
                            <select
                              className="admin-select"
                              defaultValue=""
                              disabled={busy}
                              onChange={(e) => {
                                if (!e.target.value) return;
                                void assignSelectedUngrouped({
                                  groupId: e.target.value,
                                });
                                e.target.value = "";
                              }}
                            >
                              <option value="">Ajouter à un groupe…</option>
                              {(activeCeremony.groups ?? []).map((group) => (
                                <option key={group.id} value={group.id}>
                                  {group.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <p className="admin-ceremony-hint">
                              Créez d&apos;abord un groupe ci-dessus.
                            </p>
                          )}

                          <button
                            type="button"
                            className="admin-btn admin-btn--secondary"
                            disabled={busy}
                            onClick={() =>
                              requestCeremonyWhatsAppBulk(
                                false,
                                [...selectedAssignedGuestIds].filter((id) =>
                                  filteredUngroupedGuests.some(
                                    (item) => item.guestId === id,
                                  ),
                                ),
                              )
                            }
                          >
                            WhatsApp sélection
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <ul className="admin-assignment-list">
                      {pagedUngroupedGuests.map((assignment) => (
                        <CeremonyAssignmentRow
                          key={assignment.id}
                          assignment={assignment}
                          busy={busy}
                          selected={selectedAssignedGuestIds.has(assignment.guestId)}
                          onToggleSelect={(checked) =>
                            toggleAssignedGuestSelection(assignment.guestId, checked)
                          }
                          onWhatsApp={() => sendCeremonyWhatsApp(assignment.guestId)}
                          tableSelect={
                            (activeCeremony.groups ?? []).length > 0 ? (
                              <select
                                className="admin-select"
                                defaultValue=""
                                onChange={(e) => {
                                  if (!e.target.value) return;
                                  void assignGuest(assignment.guestId, {
                                    groupId: e.target.value,
                                  });
                                  e.target.value = "";
                                }}
                              >
                                <option value="">Assigner à un groupe…</option>
                                {(activeCeremony.groups ?? []).map((group) => (
                                  <option key={group.id} value={group.id}>
                                    {group.name}
                                  </option>
                                ))}
                              </select>
                            ) : undefined
                          }
                          onRemove={() => removeGuest(assignment.guestId)}
                          onNumGuestsChange={(numGuests) =>
                            void assignGuest(assignment.guestId, { numGuests })
                          }
                        />
                      ))}
                    </ul>

                    {ungroupedTotalPages > 1 ? (
                      <div className="admin-unassigned-pagination">
                        <button
                          type="button"
                          className="admin-btn admin-btn--secondary"
                          disabled={busy || ungroupedCurrentPage <= 1}
                          onClick={() =>
                            setUngroupedPage((page) => Math.max(1, page - 1))
                          }
                        >
                          Précédent
                        </button>
                        <span>
                          Page {ungroupedCurrentPage} / {ungroupedTotalPages}
                          <small>
                            {" "}
                            · {(ungroupedCurrentPage - 1) * LIST_PAGE_SIZE + 1}
                            –
                            {Math.min(
                              ungroupedCurrentPage * LIST_PAGE_SIZE,
                              filteredUngroupedGuests.length,
                            )}{" "}
                            sur {filteredUngroupedGuests.length}
                          </small>
                        </span>
                        <button
                          type="button"
                          className="admin-btn admin-btn--secondary"
                          disabled={
                            busy || ungroupedCurrentPage >= ungroupedTotalPages
                          }
                          onClick={() =>
                            setUngroupedPage((page) =>
                              Math.min(ungroupedTotalPages, page + 1),
                            )
                          }
                        >
                          Suivant
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </article>
            ) : null}

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
                onBulkRemove={() => void removeSelectedInGroup(group.id)}
                onNumGuestsChange={(guestId, numGuests) =>
                  void assignGuest(guestId, { numGuests })
                }
                onRemove={(guestId) => removeGuest(guestId)}
                onDelete={() =>
                  deleteGroup(group.id, group.name, group.assignments.length)
                }
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
                Créez un groupe pour les organiser.
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
  const [seats, setSeats] = useState(assignment.numGuests);

  useEffect(() => {
    setSeats(assignment.numGuests);
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
}) {
  const seatsUsed = table.assignments.reduce(
    (total, assignment) => total + assignment.numGuests,
    0,
  );

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
        <button type="button" disabled={busy} onClick={onDelete} className="admin-btn admin-btn--danger">
          Supprimer
        </button>
      </div>

      {table.assignments.length === 0 ? (
        <p className="admin-ceremony-hint">Aucun invité assigné à cette table.</p>
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
}) {
  const [page, setPage] = useState(1);

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

      {group.assignments.length === 0 ? (
        <p className="admin-ceremony-hint">
          Aucun invité dans ce groupe. Ajoutez-en depuis la liste « Sans groupe » ci-dessus.
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
