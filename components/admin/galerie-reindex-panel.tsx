"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AdminConfirmModal } from "@/components/admin/admin-confirm-modal";
import type { ReindexStatus } from "@/lib/galerie/reindex";

type ReindexResponse = {
  success?: boolean;
  status?: ReindexStatus | null;
  message?: string;
};

const MAX_CONSECUTIVE_ERRORS = 3;

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
  const [running, setRunning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    void callReindex()
      .then(setStatus)
      .catch((reason: Error) => setError(reason.message));
    return () => {
      stopped.current = true;
    };
  }, []);

  const run = useCallback(async (start: boolean) => {
    setRunning(true);
    setError("");
    let errors = 0;
    let shouldStart = start;

    while (!stopped.current) {
      try {
        const next = await callReindex(shouldStart ? "start" : "step");
        shouldStart = false;
        errors = 0;
        setStatus(next);
        if (!next || next.phase === "done") break;
      } catch (reason) {
        errors += 1;
        if (shouldStart || errors >= MAX_CONSECUTIVE_ERRORS) {
          setError(reason instanceof Error ? reason.message : "La réindexation a échoué.");
          break;
        }
      }
    }

    setRunning(false);
  }, []);

  const unfinished = status != null && status.phase !== "done";

  return (
    <section className="admin-panel" style={{ marginTop: "1rem" }}>
      <h2 className="admin-panel__title">Réindexation galerie</h2>
      <p className="admin-settings-danger__text">
        Relit depuis R2 les photos de groupe limitées à 15 visages, retire les
        entrées sans fichier et met à jour le filtre VIP. Gardez cette page
        ouverte : si elle se ferme, le bouton Reprendre repart du dernier lot.
      </p>
      {status ? <p className="admin-settings-danger__text">{describe(status)}</p> : null}
      {status?.failedSample.map((line) => (
        <p key={line} className="admin-settings-danger__text">
          {line}
        </p>
      ))}
      {error ? <p className="admin-settings-danger__text">{error}</p> : null}
      <button
        type="button"
        className="admin-btn admin-btn--primary"
        disabled={running}
        onClick={() => (unfinished ? void run(false) : setConfirming(true))}
      >
        {running ? "Réindexation en cours…" : unfinished ? "Reprendre" : "Lancer la réindexation"}
      </button>
      <AdminConfirmModal
        open={confirming}
        title="Lancer la réindexation ?"
        description="Les photos concernées seront réanalysées par AWS Rekognition. Le scan reste disponible pendant l’opération."
        confirmLabel="Lancer"
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void run(true);
        }}
      />
    </section>
  );
}
