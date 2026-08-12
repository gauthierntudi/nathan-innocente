"use client";

import { useMemo } from "react";

import { computeCeremonyConvivesStats } from "@/lib/admin/ceremony-convives";
import type { AdminGuest } from "@/lib/admin/types";

type ConvivesSectionProps = {
  guests: AdminGuest[];
};

export function ConvivesSection({ guests }: ConvivesSectionProps) {
  const rows = useMemo(() => computeCeremonyConvivesStats(guests), [guests]);
  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          invitations: acc.invitations + row.invitations,
          convives: acc.convives + row.convives,
          confirmedSeats: acc.confirmedSeats + row.confirmedSeats,
          yes: acc.yes + row.yes,
          no: acc.no + row.no,
          pending: acc.pending + row.pending,
        }),
        {
          invitations: 0,
          convives: 0,
          confirmedSeats: 0,
          yes: 0,
          no: 0,
          pending: 0,
        },
      ),
    [rows],
  );

  return (
    <div className="admin-convives">
      <section className="admin-stats" aria-label="Totaux convives">
        <article className="admin-stat">
          <div className="admin-stat__label">Convives (toutes cérémonies)</div>
          <div className="admin-stat__value">
            {totals.convives.toLocaleString("fr-FR")}
          </div>
        </article>
        <article className="admin-stat">
          <div className="admin-stat__label">Invitations</div>
          <div className="admin-stat__value">
            {totals.invitations.toLocaleString("fr-FR")}
          </div>
        </article>
        <article className="admin-stat">
          <div className="admin-stat__label">Places confirmées</div>
          <div className="admin-stat__value">
            {totals.confirmedSeats.toLocaleString("fr-FR")}
          </div>
        </article>
      </section>

      <section className="admin-convives__grid" aria-label="Convives par cérémonie">
        {rows.map((row) => (
          <article key={row.ceremonyId} className="admin-panel admin-convives__card">
            <h2 className="admin-panel__title">{row.name}</h2>
            <p className="admin-convives__hero">
              <strong>{row.convives.toLocaleString("fr-FR")}</strong>
              <span>convive{row.convives > 1 ? "s" : ""}</span>
            </p>
            <dl className="admin-convives__meta">
              <div>
                <dt>Invitations</dt>
                <dd>{row.invitations.toLocaleString("fr-FR")}</dd>
              </div>
              <div>
                <dt>Confirmés (oui)</dt>
                <dd>{row.yes.toLocaleString("fr-FR")}</dd>
              </div>
              <div>
                <dt>Places confirmées</dt>
                <dd>{row.confirmedSeats.toLocaleString("fr-FR")}</dd>
              </div>
              <div>
                <dt>Refus</dt>
                <dd>{row.no.toLocaleString("fr-FR")}</dd>
              </div>
              <div>
                <dt>En attente</dt>
                <dd>{row.pending.toLocaleString("fr-FR")}</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>

      <section className="admin-table-card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Cérémonie</th>
                <th>Invitations</th>
                <th>Convives</th>
                <th>Places confirmées</th>
                <th>Oui</th>
                <th>Non</th>
                <th>En attente</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.ceremonyId}>
                  <td className="admin-table__name">{row.name}</td>
                  <td>{row.invitations.toLocaleString("fr-FR")}</td>
                  <td>
                    <strong>{row.convives.toLocaleString("fr-FR")}</strong>
                  </td>
                  <td>{row.confirmedSeats.toLocaleString("fr-FR")}</td>
                  <td>{row.yes.toLocaleString("fr-FR")}</td>
                  <td>{row.no.toLocaleString("fr-FR")}</td>
                  <td>{row.pending.toLocaleString("fr-FR")}</td>
                </tr>
              ))}
              <tr>
                <td className="admin-table__name">Total</td>
                <td>{totals.invitations.toLocaleString("fr-FR")}</td>
                <td>
                  <strong>{totals.convives.toLocaleString("fr-FR")}</strong>
                </td>
                <td>{totals.confirmedSeats.toLocaleString("fr-FR")}</td>
                <td>{totals.yes.toLocaleString("fr-FR")}</td>
                <td>{totals.no.toLocaleString("fr-FR")}</td>
                <td>{totals.pending.toLocaleString("fr-FR")}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
