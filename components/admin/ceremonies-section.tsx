"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import type { AdminGuest } from "@/lib/admin/types";
import type { AdminCeremony, CeremonyAssignment, CeremonyBoard, CeremonyId } from "@/lib/admin/ceremony-types";
import { getGuestsNotInCeremony } from "@/lib/admin/ceremony-types";

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
  return [
    ...ceremony.unassignedGuests,
    ...ceremony.tables.flatMap((table) => table.assignments),
  ];
}

type CeremoniesSectionProps = {
  guests: AdminGuest[];
  onMessage: (message: string) => void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  activeCeremonyId: CeremonyId;
  onCeremonyChange: (ceremonyId: CeremonyId) => void;
};

export function CeremoniesSection({
  guests,
  onMessage,
  busy,
  setBusy,
  activeCeremonyId,
  onCeremonyChange,
}: CeremoniesSectionProps) {
  const [board, setBoard] = useState<CeremonyBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [guestSearch, setGuestSearch] = useState("");
  const [newTableName, setNewTableName] = useState("");
  const [newTableCapacity, setNewTableCapacity] = useState("");
  const [selectedGuestIds, setSelectedGuestIds] = useState<Set<string>>(new Set());
  const [selectedAssignedGuestIds, setSelectedAssignedGuestIds] = useState<Set<string>>(new Set());

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
    void loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    setSelectedGuestIds(new Set());
    setSelectedAssignedGuestIds(new Set());
    setGuestSearch("");
  }, [activeCeremonyId]);

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

  async function createTable() {
    if (!newTableName.trim()) {
      onMessage("Indiquez un nom de table");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/admin/ceremonies/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ceremonyId: activeCeremonyId,
          name: newTableName,
          capacity: newTableCapacity ? Number(newTableCapacity) : null,
        }),
      });
      const data = await response.json();
      if (!data.success) {
        onMessage(data.message ?? "Création impossible");
        return;
      }
      setNewTableName("");
      setNewTableCapacity("");
      onMessage(`Table « ${data.table.name} » créée`);
      await loadBoard();
    } finally {
      setBusy(false);
    }
  }

  async function deleteTable(tableId: string, tableName: string) {
    if (!confirm(`Supprimer la table « ${tableName} » ?`)) return;

    setBusy(true);
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
      setBusy(false);
    }
  }

  async function assignGuest(guestId: string, tableId: string | null = null) {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/ceremonies/assignments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestId,
          ceremonyId: activeCeremonyId,
          tableId,
        }),
      });
      const data = await response.json();
      if (!data.success) {
        onMessage(data.message ?? "Affectation impossible");
        return;
      }
      await loadBoard();
    } finally {
      setBusy(false);
    }
  }

  async function assignSelected(tableId: string | null = null) {
    if (selectedGuestIds.size === 0) {
      onMessage("Sélectionnez au moins un invité");
      return;
    }

    setBusy(true);
    try {
      const count = selectedGuestIds.size;
      const response = await fetch("/api/admin/ceremonies/assignments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestIds: [...selectedGuestIds],
          ceremonyId: activeCeremonyId,
          tableId,
        }),
      });
      const data = await response.json();
      if (!data.success) {
        onMessage(data.message ?? "Affectation impossible");
        return;
      }
      setSelectedGuestIds(new Set());
      onMessage(`${count} invité(s) affecté(s)`);
      await loadBoard();
    } finally {
      setBusy(false);
    }
  }

  async function removeGuest(guestId: string) {
    setBusy(true);
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
      setBusy(false);
    }
  }

  function toggleAssignedGuestSelection(guestId: string, checked: boolean) {
    const next = new Set(selectedAssignedGuestIds);
    if (checked) next.add(guestId);
    else next.delete(guestId);
    setSelectedAssignedGuestIds(next);
  }

  async function sendCeremonyWhatsApp(guestId: string) {
    setBusy(true);
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
      setBusy(false);
    }
  }

  async function sendCeremonyWhatsAppBulk(sendAll: boolean) {
    const count = sendAll ? activeCeremonyRsvp.total : selectedAssignedGuestIds.size;

    if (count === 0) {
      onMessage(sendAll ? "Aucun invité affecté à cette cérémonie" : "Sélectionnez au moins un invité affecté");
      return;
    }

    if (
      !confirm(
        sendAll
          ? `Envoyer le message WhatsApp à tous les invités affectés (${count}) ?`
          : `Envoyer le message WhatsApp à ${count} invité(s) sélectionné(s) ?`,
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/admin/whatsapp/ceremony", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ceremonyId: activeCeremonyId,
          ...(sendAll
            ? { sendAll: true }
            : { guestIds: [...selectedAssignedGuestIds] }),
        }),
      });
      const data = await response.json();
      if (data.success) {
        onMessage(`Envoyés: ${data.sentCount} | Erreurs: ${data.failCount}`);
        setSelectedAssignedGuestIds(new Set());
      } else {
        onMessage(data.message);
      }
    } finally {
      setBusy(false);
    }
  }

  function toggleGuestSelection(guestId: string, checked: boolean) {
    const next = new Set(selectedGuestIds);
    if (checked) next.add(guestId);
    else next.delete(guestId);
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
            onClick={() => sendCeremonyWhatsAppBulk(true)}
            className="admin-btn admin-btn--primary"
          >
            WhatsApp — tous ({activeCeremonyRsvp.total})
          </button>
          <button
            type="button"
            disabled={busy || selectedAssignedGuestIds.size === 0}
            onClick={() => sendCeremonyWhatsAppBulk(false)}
            className="admin-btn admin-btn--secondary"
          >
            WhatsApp — sélection ({selectedAssignedGuestIds.size})
          </button>
        </div>
      </section>

      <section className="admin-panel admin-ceremony-create">
        <h2 className="admin-panel__title">Créer une table</h2>
        <div className="admin-ceremony-create__form">
          <input
            type="text"
            value={newTableName}
            onChange={(e) => setNewTableName(e.target.value)}
            placeholder="Nom de la table (ex. Table 1)"
            className="admin-field"
          />
          <input
            type="number"
            min={1}
            value={newTableCapacity}
            onChange={(e) => setNewTableCapacity(e.target.value)}
            placeholder="Capacité (optionnel)"
            className="admin-field"
          />
          <button type="button" disabled={busy} onClick={createTable} className="admin-btn admin-btn--primary">
            Ajouter
          </button>
        </div>
      </section>

      <div className="admin-ceremony-layout">
        <section className="admin-panel">
          <div className="admin-ceremony-panel__head">
            <h2 className="admin-panel__title">Invités disponibles</h2>
            <span className="admin-badge admin-badge--muted">{availableGuests.length}</span>
          </div>
          <input
            type="search"
            value={guestSearch}
            onChange={(e) => setGuestSearch(e.target.value)}
            placeholder="Rechercher un invité..."
            className="admin-field"
          />
          <div className="admin-ceremony-actions">
            <button
              type="button"
              disabled={busy || selectedGuestIds.size === 0}
              onClick={() => assignSelected(null)}
              className="admin-btn admin-btn--secondary"
            >
              Affecter à la cérémonie ({selectedGuestIds.size})
            </button>
          </div>
          <ul className="admin-guest-picker">
            {availableGuests.slice(0, 80).map((guest) => (
              <li key={guest.id} className="admin-guest-picker__item">
                <label className="admin-guest-picker__label">
                  <input
                    type="checkbox"
                    checked={selectedGuestIds.has(guest.id)}
                    onChange={(e) => toggleGuestSelection(guest.id, e.target.checked)}
                  />
                  <span>
                    <strong>{guest.name}</strong>
                    <small>{guest.phone} · {guest.numGuests} convive(s)</small>
                  </span>
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => assignGuest(guest.id, null)}
                  className="admin-btn admin-btn--ghost"
                >
                  +
                </button>
              </li>
            ))}
          </ul>
          {availableGuests.length > 80 ? (
            <p className="admin-ceremony-hint">Affichage limité à 80 invités — affinez la recherche.</p>
          ) : null}
        </section>

        <section className="admin-ceremony-board">
          {activeCeremony.unassignedGuests.length > 0 ? (
            <article className="admin-panel admin-table-card">
              <div className="admin-ceremony-panel__head">
                <h2 className="admin-panel__title">Sans table</h2>
                <span className="admin-badge admin-badge--warning">
                  {activeCeremony.unassignedGuests.length}
                </span>
              </div>
              <ul className="admin-assignment-list">
                {activeCeremony.unassignedGuests.map((assignment) => (
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
                      <select
                        className="admin-select"
                        defaultValue=""
                        onChange={(e) => {
                          if (!e.target.value) return;
                          void assignGuest(assignment.guestId, e.target.value);
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
                    }
                    onRemove={() => removeGuest(assignment.guestId)}
                  />
                ))}
              </ul>
            </article>
          ) : null}

          {activeCeremony.tables.map((table) => (
            <CeremonyTableCard
              key={table.id}
              table={table}
              allTables={activeCeremony.tables}
              busy={busy}
              selectedAssignedGuestIds={selectedAssignedGuestIds}
              onToggleAssigned={toggleAssignedGuestSelection}
              onWhatsApp={sendCeremonyWhatsApp}
              onAssign={(guestId, tableId) => assignGuest(guestId, tableId)}
              onRemove={(guestId) => removeGuest(guestId)}
              onDelete={() => deleteTable(table.id, table.name)}
            />
          ))}

          {activeCeremony.tables.length === 0 && activeCeremony.unassignedGuests.length === 0 ? (
            <p className="admin-empty">
              Aucune table ni invité pour cette cérémonie. Créez une table ou affectez des invités.
            </p>
          ) : null}
        </section>
      </div>
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
  onRemove: () => void;
  removeLabel?: string;
  removeVariant?: "danger" | "ghost";
}) {
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
        <small>{assignment.guest.phone} · {assignment.guest.numGuests} convive(s)</small>
        <div className="admin-assignment-list__meta">{ceremonyRsvpBadge(assignment)}</div>
      </div>
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
  busy,
  selectedAssignedGuestIds,
  onToggleAssigned,
  onWhatsApp,
  onAssign,
  onRemove,
  onDelete,
}: {
  table: AdminCeremony["tables"][number];
  allTables: AdminCeremony["tables"];
  busy: boolean;
  selectedAssignedGuestIds: Set<string>;
  onToggleAssigned: (guestId: string, checked: boolean) => void;
  onWhatsApp: (guestId: string) => void;
  onAssign: (guestId: string, tableId: string | null) => void;
  onRemove: (guestId: string) => void;
  onDelete: () => void;
}) {
  const seatsUsed = table.assignments.reduce(
    (total, assignment) => total + assignment.guest.numGuests,
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
                <select
                  className="admin-select"
                  value={table.id}
                  onChange={(e) => onAssign(assignment.guestId, e.target.value || null)}
                >
                  {allTables.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                  <option value="">Sans table</option>
                </select>
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
