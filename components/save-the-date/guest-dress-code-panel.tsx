import {
  CircleX,
  Download,
  INVITATION_ICON_PROPS,
  Shirt,
} from "@/components/save-the-date/invitation-icons";

type GuestDressCodePanelProps = {
  busy: boolean;
  downloadingDressCode: boolean;
  message?: string;
  onDownloadDressCode: () => void;
  onDecline: () => void;
};

export function GuestDressCodePanel({
  busy,
  downloadingDressCode,
  message,
  onDownloadDressCode,
  onDecline,
}: GuestDressCodePanelProps) {
  return (
    <section className="invitation-panel invitation-panel--dresscode">
      <div className="invitation-panel__head">
        <p className="invitation-panel__label">
          <Shirt {...INVITATION_ICON_PROPS} />
          Dress code
        </p>
        <h2 className="invitation-panel__title">Tenue recommandée</h2>
      </div>

      <div className="invitation-rsvp">
        <button
          type="button"
          disabled={downloadingDressCode || busy}
          onClick={onDownloadDressCode}
          className="invitation-rsvp__btn invitation-rsvp__btn--confirm"
        >
          {downloadingDressCode ? "Un instant..." : "Je prépare déjà ma tenue !"}
          {!downloadingDressCode ? <Download {...INVITATION_ICON_PROPS} /> : null}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={onDecline}
          className="invitation-rsvp__btn invitation-rsvp__btn--decline"
        >
          <CircleX {...INVITATION_ICON_PROPS} />
          Je ne serai pas disponible
        </button>
      </div>

      {message ? <p className="invitation-error">{message}</p> : null}
    </section>
  );
}
