"use client";

import { useEffect, useState, type FormEvent } from "react";

import { CeremonyPicker } from "@/components/admin/ceremony-picker";
import type { AdminBusyState } from "@/components/admin/admin-busy-overlay";
import type { CeremonyId } from "@/lib/admin/ceremony-types";

type GuestAddModalProps = {
  open: boolean;
  busy: boolean;
  onBusyChange?: (state: AdminBusyState) => void;
  onClose: () => void;
  onCreated: (message: string) => Promise<void>;
};

const SAMPLE_CSV = `name,num_guests,phone
Dupont Marie,2,243970000001
Martin Jean,1,243970000002`;

export function GuestAddModal({
  open,
  busy,
  onBusyChange,
  onClose,
  onCreated,
}: GuestAddModalProps) {
  const [mode, setMode] = useState<"form" | "csv">("form");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [numGuests, setNumGuests] = useState(1);
  const [genre, setGenre] = useState("Cher(e)");
  const [ceremonyIds, setCeremonyIds] = useState<CeremonyId[]>([]);
  const [csvText, setCsvText] = useState("");
  const [defaultCeremonyIds, setDefaultCeremonyIds] = useState<CeremonyId[]>([]);
  const [localError, setLocalError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isBusy = busy || submitting;

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isBusy) onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, isBusy, onClose]);

  useEffect(() => {
    if (!open) {
      setMode("form");
      setName("");
      setPhone("");
      setNumGuests(1);
      setGenre("Cher(e)");
      setCeremonyIds([]);
      setCsvText("");
      setDefaultCeremonyIds([]);
      setLocalError("");
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  async function submitForm(event: FormEvent) {
    event.preventDefault();
    setLocalError("");
    setSubmitting(true);
    onBusyChange?.({
      title: "Ajout de l'invité",
      detail: name.trim()
        ? `Création de ${name.trim()}…`
        : "Enregistrement en cours…",
    });

    try {
      const response = await fetch("/api/admin/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          numGuests,
          genre,
          ceremonyIds,
        }),
      });
      const data = await response.json();

      if (!data.success) {
        setLocalError(data.message ?? "Création impossible");
        onBusyChange?.(null);
        return;
      }

      await onCreated(data.message ?? "Invité créé");
      onClose();
    } catch {
      setLocalError("Erreur réseau lors de la création.");
      onBusyChange?.(null);
    } finally {
      setSubmitting(false);
    }
  }

  function countCsvRows(csv: string) {
    return csv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(1).length;
  }

  async function submitCsv(event: FormEvent) {
    event.preventDefault();
    setLocalError("");
    setSubmitting(true);

    const rowCount = countCsvRows(csvText);
    onBusyChange?.({
      title: "Import CSV",
      detail:
        rowCount > 0
          ? `Import de ${rowCount} ligne(s)…`
          : "Import en cours…",
      ...(rowCount > 1
        ? { current: 0, total: rowCount, sent: 0, failed: 0 }
        : {}),
    });

    try {
      const response = await fetch("/api/admin/guests/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv: csvText,
          ceremonyIds: defaultCeremonyIds,
        }),
      });
      const data = await response.json();

      if (!data.success) {
        setLocalError(data.message ?? "Import impossible");
        onBusyChange?.(null);
        return;
      }

      if (rowCount > 1) {
        const done =
          (typeof data.createdCount === "number" ? data.createdCount : 0) +
          (typeof data.updatedCount === "number" ? data.updatedCount : 0);
        onBusyChange?.({
          title: "Import CSV",
          detail: "Finalisation de l'import…",
          current: rowCount,
          total: rowCount,
          sent: done || rowCount,
          failed: Array.isArray(data.errors) ? data.errors.length : 0,
        });
      }

      const detail =
        Array.isArray(data.errors) && data.errors.length > 0
          ? `${data.message} — ${data.errors.slice(0, 3).join(" · ")}`
          : data.message;

      await onCreated(detail);
      onClose();
    } catch {
      setLocalError("Erreur réseau lors de l'import.");
      onBusyChange?.(null);
    } finally {
      setSubmitting(false);
    }
  }

  async function onFileChange(file: File | null) {
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    setLocalError("");
  }

  return (
    <div className="admin-modal" role="presentation">
      <button
        type="button"
        className="admin-modal__backdrop"
        aria-label="Fermer"
        disabled={isBusy}
        onClick={onClose}
      />

      <div
        className="admin-modal__panel admin-modal__panel--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-guest-add-title"
      >
        <div className="admin-modal__head">
          <div>
            <p className="admin-modal__eyebrow">Invités</p>
            <h2 id="admin-guest-add-title" className="admin-modal__title">
              Ajouter des invités
            </h2>
          </div>
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            disabled={isBusy}
            onClick={onClose}
          >
            Fermer
          </button>
        </div>

        <div className="admin-modal__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "form"}
            className={`admin-modal__tab${mode === "form" ? " admin-modal__tab--active" : ""}`}
            onClick={() => setMode("form")}
          >
            Formulaire
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "csv"}
            className={`admin-modal__tab${mode === "csv" ? " admin-modal__tab--active" : ""}`}
            onClick={() => setMode("csv")}
          >
            Import CSV
          </button>
        </div>

        {mode === "form" ? (
          <form className="admin-modal__form" onSubmit={(e) => void submitForm(e)}>
            <label className="admin-modal__field">
              <span>Nom complet</span>
              <input
                type="text"
                className="admin-field"
                value={name}
                disabled={isBusy}
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
                disabled={isBusy}
                onChange={(e) => setPhone(e.target.value)}
                required
                placeholder="+243..."
              />
            </label>

            <div className="admin-modal__grid">
              <label className="admin-modal__field">
                <span>Convives</span>
                <input
                  type="number"
                  className="admin-field"
                  min={1}
                  max={50}
                  value={numGuests}
                  disabled={isBusy}
                  onChange={(e) => setNumGuests(Number(e.target.value))}
                  required
                />
              </label>

              <label className="admin-modal__field">
                <span>Civilité</span>
                <select
                  className="admin-select"
                  value={genre}
                  disabled={isBusy}
                  onChange={(e) => setGenre(e.target.value)}
                >
                  <option value="Cher(e)">Cher(e)</option>
                  <option value="Cher">Cher</option>
                  <option value="Chère">Chère</option>
                </select>
              </label>
            </div>

            <CeremonyPicker
              value={ceremonyIds}
              disabled={isBusy}
              onChange={setCeremonyIds}
            />

            {localError ? <p className="admin-modal__error">{localError}</p> : null}

            <div className="admin-modal__actions">
              <button
                type="button"
                className="admin-btn admin-btn--secondary"
                disabled={isBusy}
                onClick={onClose}
              >
                Annuler
              </button>
              <button type="submit" className="admin-btn admin-btn--primary" disabled={isBusy}>
                {isBusy ? "Ajout..." : "Ajouter l'invité"}
              </button>
            </div>
          </form>
        ) : (
          <form className="admin-modal__form" onSubmit={(e) => void submitCsv(e)}>
            <p className="admin-modal__hint">
              Colonnes : <code>name</code>, <code>num_guests</code>, <code>phone</code>.
              Pas de civilité — déduite automatiquement : <code>Cher(e)</code> si 1 convive,
              <code> Cher(e)(s)</code> si plusieurs. Optionnel : <code>ceremonies</code> (
              <code>coutumier|civile|religieux</code>) ou cérémonies par défaut ci-dessous.
            </p>

            <CeremonyPicker
              value={defaultCeremonyIds}
              disabled={isBusy}
              label="Cérémonies par défaut (si absentes du CSV)"
              onChange={setDefaultCeremonyIds}
            />

            <label className="admin-modal__field">
              <span>Fichier CSV</span>
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={isBusy}
                onChange={(e) => void onFileChange(e.target.files?.[0] ?? null)}
              />
            </label>

            <label className="admin-modal__field">
              <span>Contenu CSV</span>
              <textarea
                className="admin-field admin-field--textarea"
                rows={8}
                value={csvText}
                disabled={isBusy}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={SAMPLE_CSV}
              />
            </label>

            <button
              type="button"
              className="admin-btn admin-btn--ghost"
              disabled={isBusy}
              onClick={() => setCsvText(SAMPLE_CSV)}
            >
              Insérer un exemple
            </button>

            {localError ? <p className="admin-modal__error">{localError}</p> : null}

            <div className="admin-modal__actions">
              <button
                type="button"
                className="admin-btn admin-btn--secondary"
                disabled={isBusy}
                onClick={onClose}
              >
                Annuler
              </button>
              <button type="submit" className="admin-btn admin-btn--primary" disabled={isBusy}>
                {isBusy ? "Import..." : "Importer le CSV"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
