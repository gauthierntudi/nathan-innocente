"use client";

export type AdminBusyState = {
  title: string;
  detail?: string;
  variant?: "default" | "whatsapp";
  current?: number;
  total?: number;
  sent?: number;
  failed?: number;
} | null;

/** @deprecated Prefer AdminBusyState — alias conservé pour WhatsApp. */
export type WhatsAppSendingState = AdminBusyState;

type AdminBusyOverlayProps = {
  state: AdminBusyState;
};

export function AdminBusyOverlay({ state }: AdminBusyOverlayProps) {
  if (!state) return null;

  const hasProgress =
    typeof state.total === "number" &&
    state.total > 0 &&
    typeof state.current === "number";

  const percent = hasProgress
    ? Math.min(100, Math.round((state.current! / state.total!) * 100))
    : null;

  const isWhatsApp = state.variant === "whatsapp";
  // Un seul indicateur : spinner dans l’icône (défaut),
  // ou spinner sous le logo WhatsApp quand il n’y a pas encore de barre.
  const showSpinnerBelowIcon = isWhatsApp && !hasProgress;

  return (
    <div
      className="admin-busy-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-labelledby="admin-busy-overlay-title"
      aria-describedby="admin-busy-overlay-detail"
    >
      <div className="admin-busy-overlay__card">
        <div
          className={`admin-busy-overlay__mark${isWhatsApp ? " admin-busy-overlay__mark--wa" : ""}`}
          aria-hidden="true"
        >
          <span className="admin-busy-overlay__pulse" />
          <span className="admin-busy-overlay__icon">
            {isWhatsApp ? (
              <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            ) : (
              <span className="admin-busy-overlay__spinner admin-busy-overlay__spinner--icon" />
            )}
          </span>
        </div>

        {showSpinnerBelowIcon ? (
          <div className="admin-busy-overlay__spinner" aria-hidden="true" />
        ) : null}

        <p id="admin-busy-overlay-title" className="admin-busy-overlay__title">
          {state.title}
        </p>

        {hasProgress ? (
          <div className="admin-busy-overlay__progress" aria-hidden="true">
            <div className="admin-busy-overlay__progress-meta">
              <strong>
                {state.current} / {state.total}
              </strong>
              <span>{percent}%</span>
            </div>
            <div className="admin-busy-overlay__bar">
              <div
                className={`admin-busy-overlay__bar-fill${isWhatsApp ? " admin-busy-overlay__bar-fill--wa" : ""}`}
                style={{ width: `${percent}%` }}
              />
            </div>
            {typeof state.sent === "number" || typeof state.failed === "number" ? (
              <div className="admin-busy-overlay__stats">
                <span className="admin-busy-overlay__stat admin-busy-overlay__stat--ok">
                  OK {state.sent ?? 0}
                </span>
                <span className="admin-busy-overlay__stat admin-busy-overlay__stat--fail">
                  Erreurs {state.failed ?? 0}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        <p id="admin-busy-overlay-detail" className="admin-busy-overlay__detail">
          {state.detail ?? "Traitement en cours, veuillez patienter…"}
        </p>
      </div>
    </div>
  );
}

/** Alias rétrocompat. */
export function WhatsAppSendingOverlay({ state }: AdminBusyOverlayProps) {
  return (
    <AdminBusyOverlay
      state={
        state
          ? { ...state, variant: state.variant ?? "whatsapp" }
          : null
      }
    />
  );
}
