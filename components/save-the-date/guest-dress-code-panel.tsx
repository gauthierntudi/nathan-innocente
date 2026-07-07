import {
  CircleX,
  Download,
  INVITATION_ICON_PROPS,
  Shirt,
} from "@/components/save-the-date/invitation-icons";

type GuestDressCodePanelProps = {
  confirming: boolean;
  declining: boolean;
  downloadingDressCode: boolean;
  hasPreparedTenue: boolean;
  message?: string;
  onPrepareTenue: () => void;
  onDownloadDressCode: () => void;
  onDecline: () => void;
};

export function GuestDressCodePanel({
  confirming,
  declining,
  downloadingDressCode,
  hasPreparedTenue,
  message,
  onPrepareTenue,
  onDownloadDressCode,
  onDecline,
}: GuestDressCodePanelProps) {
  const isBusy = confirming || declining || downloadingDressCode;

  return (
    <section className="invitation-panel invitation-panel--dresscode">
      <div className="invitation-panel__head">
        <p className="invitation-panel__label">
          <Shirt {...INVITATION_ICON_PROPS} />
          Dress code
        </p>
        <h2 className="invitation-panel__title invitation-panel__title--cta">
          Serez-vous des nôtres ?
        </h2>
      </div>

      <div className="invitation-rsvp">
        <button
          type="button"
          disabled={isBusy || hasPreparedTenue}
          onClick={onPrepareTenue}
          className="invitation-rsvp__btn invitation-rsvp__btn--confirm"
        >
          {confirming ? (
            <>
              <span className="invitation-rsvp__spinner" aria-hidden />
              Confirmation...
            </>
          ) : hasPreparedTenue ? (
            "Présence confirmée"
          ) : (
            "Je prépare déjà ma tenue !"
          )}
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={onDownloadDressCode}
          className="invitation-rsvp__btn invitation-rsvp__btn--download invitation-rsvp__btn--download-active"
        >
          {downloadingDressCode ? (
            <>
              <span className="invitation-rsvp__spinner invitation-rsvp__spinner--dark" aria-hidden />
              Téléchargement...
            </>
          ) : (
            <>
              Télécharger Dress Code
              <Download {...INVITATION_ICON_PROPS} />
            </>
          )}
        </button>

        <button
          type="button"
          disabled={isBusy || hasPreparedTenue}
          onClick={onDecline}
          className="invitation-rsvp__btn invitation-rsvp__btn--decline"
        >
          {declining ? (
            <>
              <span className="invitation-rsvp__spinner" aria-hidden />
              Envoi...
            </>
          ) : (
            <>
              <CircleX {...INVITATION_ICON_PROPS} />
              Je ne serai pas disponible
            </>
          )}
        </button>
      </div>

      {message ? <p className="invitation-error">{message}</p> : null}
    </section>
  );
}
