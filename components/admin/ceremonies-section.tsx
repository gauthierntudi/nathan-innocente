"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { AdminGuest } from "@/lib/admin/types";
import type { AdminCeremony, CeremonyBoard, CeremonyId } from "@/lib/admin/ceremony-types";
import { getGuestsNotInCeremony } from "@/lib/admin/ceremony-types";

type CeremoniesSectionProps = {
  guests: AdminGuest[];
  onMessage: (message: string) => void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
};

export function CeremoniesSection({
  guests,
  onMessage,
  busy,
  setBusy,
}: CeremoniesSectionProps) {
  const [board, setBoard] = useState<CeremonyBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCeremonyId, setActiveCeremonyId] = useState<CeremonyId>("coutumier");
  const [guestSearch, setGuestSearch] = useState("");
  const [newTableName, setNewTableName] = useState("");
  const [newTableCapacity, setNewTableCapacity] = useState("");
  const [selectedGuestIds, setSelectedGuestIds] = useState<Set<string>>(new Set());

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

  const activeCeremony = useMemo(
    () => board?.ceremonies.find((ceremony) => ceremony.id === activeCeremonyId) ?? null,
    [board, activeCeremonyId],
  );

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
            onClick={() => {
              setActiveCeremonyId(ceremony.id);
              setSelectedGuestIds(new Set());
              setGuestSearch("");
            }}
          >
            {ceremony.name}
          </button>
        ))}
      </div>

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
                  <li key={assignment.id} className="admin-assignment-list__item">
                    <div>
                      <strong>{assignment.guest.name}</strong>
                      <small>{assignment.guest.numGuests} convive(s)</small>
                    </div>
                    <div className="admin-assignment-list__actions">
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
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => removeGuest(assignment.guestId)}
                        className="admin-btn admin-btn--danger"
                      >
                        Retirer
                      </button>
                    </div>
                  </li>
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

function CeremonyTableCard({
  table,
  allTables,
  busy,
  onAssign,
  onRemove,
  onDelete,
}: {
  table: AdminCeremony["tables"][number];
  allTables: AdminCeremony["tables"];
  busy: boolean;
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
            <li key={assignment.id} className="admin-assignment-list__item">
              <div>
                <strong>{assignment.guest.name}</strong>
                <small>{assignment.guest.numGuests} convive(s)</small>
              </div>
              <div className="admin-assignment-list__actions">
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
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRemove(assignment.guestId)}
                  className="admin-btn admin-btn--ghost"
                >
                  Retirer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
