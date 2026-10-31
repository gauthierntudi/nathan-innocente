"use client";

import { useCallback, useEffect, useState } from "react";

import { AdminConfirmModal } from "@/components/admin/admin-confirm-modal";
import type { ReindexStatus } from "@/lib/galerie/reindex";

type ReindexResponse = {
  success?: boolean;
  status?: ReindexStatus | null;
  message?: string;
};

const POLL_MS = 4000;

async function callReindex(action?: "start" | "step") {
  const response = await fetch(
    "/api/admin/galerie/reindex",
    action
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      : undefined,
  );
  const data = (await response.json()) as ReindexResponse;
  if (!response.ok || !data.success) {
    throw new Error(data.message || "La réindexation a échoué.");
  }
  return data.status ?? null;
}

function describe(status: ReindexStatus) {
  if (status.phase === "done") {
    return `Terminé : ${status.done} photos traitées, ${status.facesAdded} visages ajoutés, ${status.failed} échecs, ${status.orphansRemoved} entrées orphelines retirées.`;
  }
  if (status.phase === "vip") {
    return `Mise à jour du filtre VIP : ${status.vipRemaining} visages restants.`;
  }
  return `${status.done} / ${status.total} photos — ${status.facesAdded} visages ajoutés, ${status.failed} échecs.`;
}

export function GalerieReindexPanel() {
  const [status, setStatus] = useState<ReindexStatus | null>(null);
  const [launching, setLaunching] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  const active = status?.active ?? false;

  const refresh = useCallback(() => {
    void callReindex()
      .then(setStatus)
      .catch((reason: Error) => setError(reason.message));
  }, []);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, refresh]);

  const launch = useCallback(async (action: "start" | "step") => {
    setLaunching(true);
    setError("");
    try {
      setStatus(await callReindex(action));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "La réindexation a échoué.");
    }
    setLaunching(false);
  }, []);

  const unfinished = status != null && status.phase !== "done";
  const busy = launching || active;

  return (
    <section className="admin-panel" style={{ marginTop: "1rem" }}>
      <h2 className="admin-panel__title">Réindexation galerie</h2>
      <p className="admin-settings-danger__text">
        Relit depuis R2 les photos de groupe limitées à 15 visages, retire les
        entrées sans fichier et met à jour le filtre VIP. Le traitement tourne
        sur le serveur : vous pouvez fermer cette page.
      </p>
      {status ? <p className="admin-settings-danger__text">{describe(status)}</p> : null}
      {unfinished && !active ? (
        <p className="admin-settings-danger__text">
          À l’arrêt : cliquez sur Reprendre pour repartir du dernier lot.
        </p>
      ) : null}
      {status?.failedSample.map((line) => (
        <p key={line} className="admin-settings-danger__text">
          {line}
        </p>
      ))}
      {error ? <p className="admin-settings-danger__text">{error}</p> : null}
      <button
        type="button"
        className="admin-btn admin-btn--primary"
        disabled={busy}
        onClick={() => (unfinished ? void launch("step") : setConfirming(true))}
      >
        {busy ? "Réindexation en cours…" : unfinished ? "Reprendre" : "Lancer la réindexation"}
      </button>
      <AdminConfirmModal
        open={confirming}
        title="Lancer la réindexation ?"
        description="Les photos concernées seront réanalysées par AWS Rekognition. Le scan reste disponible pendant l’opération."
        confirmLabel="Lancer"
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void launch("start");
        }}
      />
    </section>
  );
}
