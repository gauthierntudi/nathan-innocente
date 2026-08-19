"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const unreachable = error.message.includes("Can't reach database server");

  return (
    <div className="admin-theme" style={{ padding: "2rem 1.25rem" }}>
      <section className="admin-panel" style={{ maxWidth: "36rem", margin: "3rem auto" }}>
        <h1 className="admin-panel__title">
          {unreachable ? "Base de données indisponible" : "Erreur d'administration"}
        </h1>
        <p className="admin-confirm-modal__text">
          {unreachable
            ? "Neon n'a pas répondu à temps (souvent au réveil du serveur). Patientez quelques secondes puis réessayez."
            : "Une erreur a empêché le chargement de l'administration."}
        </p>
        <div className="admin-modal__actions" style={{ borderTop: "none", paddingTop: 0 }}>
          <button type="button" className="admin-btn admin-btn--primary" onClick={reset}>
            Réessayer
          </button>
        </div>
      </section>
    </div>
  );
}
