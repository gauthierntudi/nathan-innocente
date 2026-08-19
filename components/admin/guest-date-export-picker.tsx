"use client";

import { useEffect, useMemo, useState } from "react";

type GuestDateExportPickerProps = {
  open: boolean;
  onClose: () => void;
};

function toYmd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function localIso(ymd: string, edge: "start" | "end") {
  const [year, month, day] = ymd.split("-").map(Number);
  const date =
    edge === "start"
      ? new Date(year, month - 1, day, 0, 0, 0, 0)
      : new Date(year, month - 1, day, 23, 59, 59, 999);
  return date.toISOString();
}

export function GuestDateExportPicker({
  open,
  onClose,
}: GuestDateExportPickerProps) {
  const today = useMemo(() => toYmd(new Date()), []);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const now = toYmd(new Date());
    setFrom(now);
    setTo(now);
    setError("");
  }, [open]);

  function applyRange(start: Date, end: Date) {
    setFrom(toYmd(start));
    setTo(toYmd(end));
    setError("");
  }

  const periodHref = useMemo(() => {
    if (!from || !to) return "";
    if (from > to) return "";
    const params = new URLSearchParams({
      from: localIso(from, "start"),
      to: localIso(to, "end"),
      fromDay: from,
      toDay: to,
    });
    return `/api/admin/export/excel?${params.toString()}`;
  }, [from, to]);

  function onDownloadPeriod() {
    if (!from || !to) {
      setError("Choisissez une date de début et une date de fin.");
      return;
    }
    if (from > to) {
      setError("La date de début doit précéder la date de fin.");
      return;
    }
    setError("");
    onClose();
  }

  if (!open) return null;

  const now = new Date();

  return (
    <div className="admin-modal admin-confirm-modal" role="presentation">
      <button
        type="button"
        className="admin-modal__backdrop"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div
        className="admin-modal__panel admin-confirm-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-date-export-title"
      >
        <div className="admin-modal__head">
          <div>
            <p className="admin-modal__eyebrow">Export Excel</p>
            <h2 id="guest-date-export-title" className="admin-modal__title">
              Invités par date d&apos;ajout
            </h2>
          </div>
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            onClick={onClose}
          >
            Fermer
          </button>
        </div>

        <p className="admin-confirm-modal__text">
          Choisissez une période : seuls les invités enregistrés entre ces dates
          seront exportés.
        </p>

        <div className="admin-date-export__presets" role="group" aria-label="Périodes rapides">
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            onClick={() => applyRange(now, now)}
          >
            Aujourd&apos;hui
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            onClick={() => {
              const yesterday = addDays(now, -1);
              applyRange(yesterday, yesterday);
            }}
          >
            Hier
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            onClick={() => applyRange(addDays(now, -6), now)}
          >
            7 derniers jours
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            onClick={() => applyRange(addDays(now, -29), now)}
          >
            30 derniers jours
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            onClick={() =>
              applyRange(new Date(now.getFullYear(), now.getMonth(), 1), now)
            }
          >
            Ce mois
          </button>
        </div>

        <div className="admin-date-export__fields">
          <label className="admin-modal__field">
            <span>Ajoutés à partir du</span>
            <input
              type="date"
              className="admin-field"
              value={from}
              max={to || undefined}
              onChange={(event) => {
                setFrom(event.target.value);
                setError("");
              }}
            />
          </label>
          <label className="admin-modal__field">
            <span>Jusqu&apos;au</span>
            <input
              type="date"
              className="admin-field"
              value={to}
              min={from || undefined}
              onChange={(event) => {
                setTo(event.target.value);
                setError("");
              }}
            />
          </label>
        </div>

        {error ? <p className="admin-empty">{error}</p> : null}

        <div className="admin-modal__actions">
          <a
            href="/api/admin/export/excel"
            className="admin-btn admin-btn--secondary"
            onClick={onClose}
          >
            Tous les invités
          </a>
          <a
            href={periodHref || undefined}
            aria-disabled={!periodHref}
            className="admin-btn admin-btn--success"
            onClick={(event) => {
              if (!periodHref) {
                event.preventDefault();
                onDownloadPeriod();
                return;
              }
              onDownloadPeriod();
            }}
          >
            Télécharger la période
          </a>
        </div>
      </div>
    </div>
  );
}
