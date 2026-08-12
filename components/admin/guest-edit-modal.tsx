"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import { CeremonyPicker } from "@/components/admin/ceremony-picker";
import {
  collectGroupNames,
  GroupNameField,
} from "@/components/admin/group-name-field";
import {
  CEREMONY_DEFINITIONS,
  type AdminCeremony,
  type CeremonyId,
} from "@/lib/admin/ceremony-types";
import type { AdminGuest, AdminGuestCeremonyStatus } from "@/lib/admin/types";

type GuestEditModalProps = {
  guest: AdminGuest | null;
  busy: boolean;
  onClose: () => void;
  onSave: (payload: {
    guestId: string;
    name: string;
    phone: string;
    numGuests: number;
    guestType: "standard" | "honor";
    groupName: string;
    ceremonyIds: CeremonyId[];
    ceremonyNumGuests: Array<{ ceremonyId: CeremonyId; numGuests: number }>;
    resetCeremonyIds: CeremonyId[];
  }) => Promise<boolean>;
};

function ceremonyName(ceremonyId: CeremonyId) {
  return (
    CEREMONY_DEFINITIONS.find((item) => item.id === ceremonyId)?.name ??
    ceremonyId
  );
}

function statusLabel(status: AdminGuestCeremonyStatus) {
  if (status.availability === null) {
    return status.dressCodeDownloadedAt
      ? "En attente (dress code téléchargé)"
      : "En attente";
  }
  if (status.availability) {
    const dress = status.dressCodeDownloadedAt ? " · dress code OK" : "";
    return `Confirmé (${status.confirmedGuests})${dress}`;
  }
  return "Décliné";
}

function canResetStatus(status: AdminGuestCeremonyStatus) {
  return (
    status.availability !== null ||
    status.confirmedGuests > 0 ||
    status.dressCodeDownloadedAt !== null
  );
}

function resolveUniqueGroupName(statuses: AdminGuestCeremonyStatus[]) {
  if (statuses.length === 0) return "";
  const normalizedNames = statuses.map((status) => status.groupName?.trim() ?? "");
  if (normalizedNames.some((name) => name.length === 0)) return "";
  const uniqueNames = new Set(normalizedNames);
  if (uniqueNames.size !== 1) return "";
  return normalizedNames[0];
}

function normalizePositiveInt(value: unknown, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) return fallback;
  return Math.floor(numeric);
}

export function GuestEditModal({
  guest,
  busy,
  onClose,
  onSave,
}: GuestEditModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [numGuests, setNumGuests] = useState(1);
  const [guestType, setGuestType] = useState<"standard" | "honor">("standard");
  const [groupName, setGroupName] = useState("");
  const [ceremonyIds, setCeremonyIds] = useState<CeremonyId[]>([]);
  const [ceremonyNumGuests, setCeremonyNumGuests] = useState<
    Partial<Record<CeremonyId, number>>
  >({});
  const [resetCeremonyIds, setResetCeremonyIds] = useState<CeremonyId[]>([]);
  const [ceremonies, setCeremonies] = useState<AdminCeremony[]>([]);

  useEffect(() => {
    if (!guest) {
      setCeremonies([]);
      return;
    }

    void (async () => {
      try {
        const response = await fetch("/api/admin/ceremonies");
        const data = await response.json();
        if (data.success) {
          setCeremonies(data.ceremonies ?? []);
        }
      } catch {
        setCeremonies([]);
      }
    })();
  }, [guest]);

  useEffect(() => {
    if (!guest) return;
    const safeNumGuests = normalizePositiveInt(guest.numGuests, 1);
    setName(guest.name);
    setPhone(guest.phone);
    setNumGuests(safeNumGuests);
    setGuestType(guest.guestType === "honor" ? "honor" : "standard");
    setGroupName(resolveUniqueGroupName(guest.ceremonyStatuses ?? []));
    setCeremonyIds(guest.ceremonyIds ?? []);
    const seats: Partial<Record<CeremonyId, number>> = {};
    for (const status of guest.ceremonyStatuses ?? []) {
      seats[status.ceremonyId] = normalizePositiveInt(
        status.numGuests,
        safeNumGuests,
      );
    }
    for (const ceremonyId of guest.ceremonyIds ?? []) {
      if (seats[ceremonyId] == null) seats[ceremonyId] = safeNumGuests;
    }
    setCeremonyNumGuests(seats);
    setResetCeremonyIds([]);
  }, [guest]);

  useEffect(() => {
    if (!guest) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [guest, busy, onClose]);

  const groupOptions = useMemo(
    () => collectGroupNames(ceremonies, ceremonyIds),
    [ceremonies, ceremonyIds],
  );

  const resettableStatuses = useMemo(() => {
    if (!guest) return [];
    return (guest.ceremonyStatuses ?? []).filter(
      (status) =>
        ceremonyIds.includes(status.ceremonyId) && canResetStatus(status),
    );
  }, [guest, ceremonyIds]);

  if (!guest) return null;

  function handleCeremonyIdsChange(ids: CeremonyId[]) {
    setCeremonyIds(ids);
    setCeremonyNumGuests((current) => {
      const next: Partial<Record<CeremonyId, number>> = {};
      for (const id of ids) {
        next[id] = current[id] ?? numGuests;
      }
      return next;
    });
    setResetCeremonyIds((current) =>
      current.filter((id) => ids.includes(id)),
    );
  }

  function setCeremonySeats(ceremonyId: CeremonyId, value: number) {
    setCeremonyNumGuests((current) => ({
      ...current,
      [ceremonyId]: value,
    }));
  }

  function toggleReset(ceremonyId: CeremonyId, checked: boolean) {
    if (checked) {
      setResetCeremonyIds((current) => [
        ...new Set([...current, ceremonyId]),
      ]);
      return;
    }
    setResetCeremonyIds((current) =>
      current.filter((id) => id !== ceremonyId),
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!guest) return;

    const seatsPayload = ceremonyIds.map((ceremonyId) => ({
      ceremonyId,
      numGuests: Math.max(1, ceremonyNumGuests[ceremonyId] ?? numGuests),
    }));

    const ok = await onSave({
      guestId: guest.id,
      name: name.trim(),
      phone: phone.trim(),
      numGuests,
      guestType,
      groupName: groupName.trim(),
      ceremonyIds,
      ceremonyNumGuests: seatsPayload,
      resetCeremonyIds: resetCeremonyIds.filter((id) =>
        ceremonyIds.includes(id),
      ),
    });
    if (ok) onClose();
  }

  const seatsInvalid = ceremonyIds.some((ceremonyId) => {
    const seats = ceremonyNumGuests[ceremonyId] ?? numGuests;
    return !Number.isFinite(seats) || seats < 1;
  });

  return (
    <div className="admin-modal" role="presentation">
      <button
        type="button"
        className="admin-modal__backdrop"
        aria-label="Fermer"
        disabled={busy}
        onClick={onClose}
      />

      <div
        className="admin-modal__panel admin-modal__panel--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-guest-edit-title"
      >
        <div className="admin-modal__head">
          <div>
            <p className="admin-modal__eyebrow">Modifier</p>
            <h2 id="admin-guest-edit-title" className="admin-modal__title">
              {guest.name}
            </h2>
          </div>
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            disabled={busy}
            onClick={onClose}
          >
            Fermer
          </button>
        </div>

        <form className="admin-modal__form" onSubmit={(e) => void handleSubmit(e)}>
          <div className="admin-modal__body">
          <label className="admin-modal__field">
            <span>Nom complet</span>
            <input
              type="text"
              className="admin-field"
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </label>

          <label className="admin-modal__field">
            <span>Téléphone</span>
            <input
              type="tel"
              className="admin-field"
              value={phone}
              disabled={busy}
              onChange={(e) => setPhone(e.target.value)}
              required
              placeholder="+243..."
            />
          </label>

          <label className="admin-modal__field">
            <span>Nombre de convives (défaut)</span>
            <input
              type="number"
              className="admin-field"
              min={1}
              max={50}
              value={numGuests}
              disabled={busy}
              onChange={(e) => setNumGuests(Number(e.target.value))}
              required
            />
            <small className="admin-modal__hint">
              Utilisé pour les nouvelles cérémonies et comme valeur de repli.
              Pour un couple, vous pouvez librement mettre 1 ou plus.
            </small>
          </label>

          <label className="admin-modal__field">
            <span>Type d&apos;invité</span>
            <select
              className="admin-select"
              value={guestType}
              disabled={busy}
              onChange={(e) =>
                setGuestType(e.target.value === "honor" ? "honor" : "standard")
              }
            >
              <option value="standard">Standard</option>
              <option value="honor">Invité d&apos;honneur</option>
            </select>
          </label>

          <GroupNameField
            label="Groupe (existant ou nouveau)"
            value={groupName}
            existingGroups={groupOptions}
            disabled={busy}
            hint={
              ceremonyIds.length > 0
                ? "Groupes des cérémonies cochées — ou saisissez un nouveau nom. Si renseigné, affecte ce groupe aux cérémonies cochées."
                : "Groupes de toutes les cérémonies — ou saisissez un nouveau nom."
            }
            onChange={setGroupName}
          />

          <CeremonyPicker
            value={ceremonyIds}
            disabled={busy}
            onChange={handleCeremonyIdsChange}
          />

          {ceremonyIds.length > 0 ? (
            <fieldset className="admin-ceremony-seats">
              <legend>Convives par cérémonie</legend>
              <p className="admin-ceremony-seats__hint">
                Ajustez le nombre de places pour chaque cérémonie de cet invité.
              </p>
              <div className="admin-ceremony-seats__list">
                {ceremonyIds.map((ceremonyId) => (
                  <label
                    key={ceremonyId}
                    className="admin-ceremony-seats__item"
                  >
                    <span className="admin-ceremony-seats__label">
                      {ceremonyName(ceremonyId)}
                    </span>
                    <input
                      type="number"
                      className="admin-field"
                      min={1}
                      max={50}
                      value={ceremonyNumGuests[ceremonyId] ?? numGuests}
                      disabled={busy}
                      onChange={(e) =>
                        setCeremonySeats(ceremonyId, Number(e.target.value))
                      }
                      required
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {resettableStatuses.length > 0 ? (
            <fieldset className="admin-ceremony-reset">
              <legend>Réinitialiser les confirmations</legend>
              <p className="admin-ceremony-reset__hint">
                Remet la réponse RSVP et le téléchargement dress code à zéro
                pour les cérémonies cochées.
              </p>
              <div className="admin-ceremony-reset__list">
                {resettableStatuses.map((status) => (
                  <label
                    key={status.ceremonyId}
                    className="admin-ceremony-reset__item"
                  >
                    <input
                      type="checkbox"
                      checked={resetCeremonyIds.includes(status.ceremonyId)}
                      disabled={busy}
                      onChange={(e) =>
                        toggleReset(status.ceremonyId, e.target.checked)
                      }
                    />
                    <span className="admin-ceremony-reset__copy">
                      <strong>{ceremonyName(status.ceremonyId)}</strong>
                      <em>{statusLabel(status)}</em>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          </div>

          <div className="admin-modal__actions">
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              disabled={busy}
              onClick={onClose}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={
                busy ||
                !name.trim() ||
                !phone.trim() ||
                numGuests < 1 ||
                seatsInvalid
              }
            >
              {busy ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
