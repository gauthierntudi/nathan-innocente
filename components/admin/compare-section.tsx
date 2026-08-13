"use client";

import { useMemo, useState, type FormEvent } from "react";

import type { AdminBusyState } from "@/components/admin/admin-busy-overlay";
import {
  CEREMONY_DEFINITIONS,
  type CeremonyId,
} from "@/lib/admin/ceremony-types";
import {
  DB_GUESTS_MODE_LABELS,
  FILE_GUESTS_MODE_LABELS,
  type DbGuestsMode,
  type FileGuestsMode,
  type GuestCompareReport,
} from "@/lib/admin/guest-compare";

type CeremonyFilter = "all" | CeremonyId;

type CompareSectionProps = {
  busy: boolean;
  setBusyState: (state: AdminBusyState) => void;
};

export function CompareSection({ busy, setBusyState }: CompareSectionProps) {
  const [file, setFile] = useState<File | null>(null);
  const [ceremonyFilter, setCeremonyFilter] = useState<CeremonyFilter>("all");
  const [fileGuestsMode, setFileGuestsMode] = useState<FileGuestsMode>("sum");
  const [dbGuestsMode, setDbGuestsMode] = useState<DbGuestsMode>("sum");
  const [report, setReport] = useState<GuestCompareReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ceremonyLabel = useMemo(() => {
    if (!report?.ceremonyId) return "Toutes les cérémonies";
    return (
      CEREMONY_DEFINITIONS.find((item) => item.id === report.ceremonyId)?.name ??
      report.ceremonyId
    );
  }, [report]);

  const fileConvivesHeader = report
    ? `Convives fichier (${FILE_GUESTS_MODE_LABELS[report.fileGuestsMode]})`
    : "Convives fichier";

  const dbConvivesHeader = report
    ? `Convives DB (${DB_GUESTS_MODE_LABELS[report.dbGuestsMode]})`
    : "Convives DB";

  const summaryCards = useMemo(() => {
    if (!report) return [];
    const s = report.summary;
    return [
      { label: "Lignes fichier", value: s.fileRows },
      { label: "Invités DB", value: s.dbGuests },
      { label: "Identiques", value: s.identical },
      { label: "Différences", value: s.differing },
      { label: "Conflits tél./nom", value: s.phoneNameConflicts },
      { label: "Dans le fichier seulement", value: s.onlyInFile },
      { label: "Dans la DB seulement", value: s.onlyInDb },
      { label: "Ambiguës", value: s.ambiguous },
    ];
  }, [report]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!file) {
      setError("Choisissez un fichier Excel (.xlsx) ou CSV.");
      return;
    }

    if (
      (fileGuestsMode === "ceremony" || dbGuestsMode === "ceremony") &&
      ceremonyFilter === "all"
    ) {
      setError(
        "Choisissez une cérémonie pour le mode « Cérémonie sélectionnée ».",
      );
      return;
    }

    setBusyState({
      title: "Comparaison…",
      detail:
        ceremonyFilter === "all"
          ? "Toutes les cérémonies"
          : `Cérémonie : ${
              CEREMONY_DEFINITIONS.find((item) => item.id === ceremonyFilter)
                ?.name ?? ceremonyFilter
            }`,
    });

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("ceremonyId", ceremonyFilter);
      form.append("fileGuestsMode", fileGuestsMode);
      form.append("dbGuestsMode", dbGuestsMode);
      const response = await fetch("/api/admin/guests/compare", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        message?: string;
        report?: GuestCompareReport;
      } | null;

      if (!response.ok || !payload?.success || !payload.report) {
        setReport(null);
        setError(payload?.message ?? "Échec de la comparaison");
        return;
      }

      setReport(payload.report);
    } catch {
      setReport(null);
      setError("Impossible de comparer le fichier");
    } finally {
      setBusyState(null);
    }
  }

  return (
    <>
      <section className="admin-panel">
        <h2 className="admin-panel__title">Comparer avec un fichier</h2>
        <p className="admin-settings-danger__text">
          Rapport lecture seule. Choisissez la cérémonie et comment compter les
          convives côté fichier et côté base.
        </p>
        <form className="admin-toolbar" onSubmit={onSubmit}>
          <div
            className="admin-toolbar__group"
            style={{ flex: 1, gap: "0.75rem", display: "flex", flexWrap: "wrap" }}
          >
            <label className="admin-modal__field" style={{ minWidth: "14rem" }}>
              <span>Cérémonie</span>
              <select
                className="admin-select"
                value={ceremonyFilter}
                disabled={busy}
                onChange={(event) => {
                  setCeremonyFilter(event.target.value as CeremonyFilter);
                  setReport(null);
                }}
              >
                <option value="all">Toutes les cérémonies</option>
                {CEREMONY_DEFINITIONS.map((ceremony) => (
                  <option key={ceremony.id} value={ceremony.id}>
                    {ceremony.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-modal__field" style={{ minWidth: "14rem" }}>
              <span>Convives fichier</span>
              <select
                className="admin-select"
                value={fileGuestsMode}
                disabled={busy}
                onChange={(event) => {
                  setFileGuestsMode(event.target.value as FileGuestsMode);
                  setReport(null);
                }}
              >
                <option value="sum">{FILE_GUESTS_MODE_LABELS.sum}</option>
                <option value="max">{FILE_GUESTS_MODE_LABELS.max}</option>
                <option value="ceremony">
                  {FILE_GUESTS_MODE_LABELS.ceremony}
                </option>
              </select>
            </label>
            <label className="admin-modal__field" style={{ minWidth: "14rem" }}>
              <span>Convives DB</span>
              <select
                className="admin-select"
                value={dbGuestsMode}
                disabled={busy}
                onChange={(event) => {
                  setDbGuestsMode(event.target.value as DbGuestsMode);
                  setReport(null);
                }}
              >
                <option value="sum">{DB_GUESTS_MODE_LABELS.sum}</option>
                <option value="global">{DB_GUESTS_MODE_LABELS.global}</option>
                <option value="ceremony">{DB_GUESTS_MODE_LABELS.ceremony}</option>
              </select>
            </label>
            <label className="admin-modal__field" style={{ flex: 1, minWidth: "16rem" }}>
              <span>Fichier Excel / CSV</span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="admin-input"
                disabled={busy}
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setReport(null);
                  setError(null);
                }}
              />
            </label>
          </div>
          <button
            type="submit"
            className="admin-btn admin-btn--primary"
            disabled={busy || !file}
          >
            {busy ? "Comparaison…" : "Générer le rapport"}
          </button>
        </form>
        {error ? (
          <p
            className="admin-settings-danger__text"
            style={{ color: "#b42318", marginTop: "0.75rem" }}
          >
            {error}
          </p>
        ) : null}
      </section>

      {report ? (
        <>
          <p className="admin-settings-danger__text" style={{ marginTop: "1rem" }}>
            Périmètre : <strong>{ceremonyLabel}</strong>
            {" · "}
            Fichier : <strong>{FILE_GUESTS_MODE_LABELS[report.fileGuestsMode]}</strong>
            {" · "}
            DB : <strong>{DB_GUESTS_MODE_LABELS[report.dbGuestsMode]}</strong>
          </p>
          <section className="admin-stats" style={{ marginTop: "0.5rem" }}>
            {summaryCards.map((card) => (
              <article key={card.label} className="admin-stat-card">
                <p className="admin-stat-card__label">{card.label}</p>
                <p className="admin-stat-card__value">
                  {card.value.toLocaleString("fr-FR")}
                </p>
              </article>
            ))}
          </section>

          {report.parseErrors.length > 0 ? (
            <section className="admin-panel" style={{ marginTop: "1rem" }}>
              <h2 className="admin-panel__title">Avertissements parsing</h2>
              <ul>
                {report.parseErrors.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {report.phoneNameConflicts.length > 0 ? (
            <section className="admin-table-card" style={{ marginTop: "1rem" }}>
              <h2 className="admin-panel__title">
                Conflits téléphone / nom
              </h2>
              <p className="admin-settings-danger__text">
                Même numéro, mais noms incompatibles — non fusionnés
                automatiquement.
              </p>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Ligne</th>
                      <th>Fichier</th>
                      <th>{fileConvivesHeader}</th>
                      <th>Base</th>
                      <th>{dbConvivesHeader}</th>
                      <th>Téléphone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.phoneNameConflicts.map((row) => (
                      <tr key={`conflict-${row.lineNumber}-${row.phone}`}>
                        <td>{row.lineNumber}</td>
                        <td>{row.name}</td>
                        <td>{row.numGuests ?? "—"}</td>
                        <td>{row.dbName ?? "—"}</td>
                        <td>{row.dbNumGuests ?? "—"}</td>
                        <td>{row.phone}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {report.differing.length > 0 ? (
            <section className="admin-table-card" style={{ marginTop: "1rem" }}>
              <h2 className="admin-panel__title">Champs différents</h2>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Ligne</th>
                      <th>Correspondance</th>
                      <th>Fichier</th>
                      <th>{fileConvivesHeader}</th>
                      <th>Base</th>
                      <th>{dbConvivesHeader}</th>
                      <th>Écarts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.differing.map((row) => (
                      <tr key={`${row.lineNumber}-${row.name}-${row.phone}`}>
                        <td>{row.lineNumber}</td>
                        <td>
                          {row.matchBy === "phone+name"
                            ? "Tél. + nom"
                            : row.matchBy === "phone"
                              ? "Téléphone"
                              : "Nom"}
                        </td>
                        <td>
                          {row.name}
                          <br />
                          <small>{row.phone}</small>
                        </td>
                        <td>{row.numGuests}</td>
                        <td>
                          {row.dbName}
                          <br />
                          <small>{row.dbPhone}</small>
                        </td>
                        <td>{row.dbNumGuests}</td>
                        <td>
                          <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                            {row.diffs.map((diff) => (
                              <li key={diff.field}>
                                <strong>{diff.field}</strong> : fichier «{" "}
                                {diff.file} » → DB « {diff.db} »
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {report.onlyInFile.length > 0 ? (
            <section className="admin-table-card" style={{ marginTop: "1rem" }}>
              <h2 className="admin-panel__title">Dans le fichier seulement</h2>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Ligne</th>
                      <th>Nom</th>
                      <th>Téléphone</th>
                      <th>Convives</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.onlyInFile.map((row) => (
                      <tr key={`file-${row.lineNumber}-${row.name}`}>
                        <td>{row.lineNumber}</td>
                        <td>{row.name}</td>
                        <td>{row.phone}</td>
                        <td>{row.numGuests ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {report.onlyInDb.length > 0 ? (
            <section className="admin-table-card" style={{ marginTop: "1rem" }}>
              <h2 className="admin-panel__title">Dans la base seulement</h2>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Nom</th>
                      <th>Téléphone</th>
                      <th>Convives</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.onlyInDb.map((row) => (
                      <tr key={`db-${row.id ?? row.name}-${row.phone}`}>
                        <td>{row.name}</td>
                        <td>{row.phone}</td>
                        <td>{row.numGuests ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {report.ambiguous.length > 0 ? (
            <section className="admin-table-card" style={{ marginTop: "1rem" }}>
              <h2 className="admin-panel__title">Correspondances ambiguës</h2>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Ligne</th>
                      <th>Nom</th>
                      <th>Téléphone</th>
                      <th>Convives</th>
                      <th>Détail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.ambiguous.map((row) => (
                      <tr key={`amb-${row.lineNumber}-${row.name}`}>
                        <td>{row.lineNumber}</td>
                        <td>{row.name}</td>
                        <td>{row.phone}</td>
                        <td>{row.numGuests ?? "—"}</td>
                        <td>{row.detail ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </>
  );
}
