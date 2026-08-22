"use client";

type PassAccessQrCodeProps = {
  value: string;
};

export function PassAccessQrCode({ value }: PassAccessQrCodeProps) {
  if (!value) return null;

  const src = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=14&data=${encodeURIComponent(value)}`;

  return (
    <div className="pass-access-ticket__qr-wrap">
      <img
        className="pass-access-ticket__qr"
        src={src}
        alt="QR code pass d'entrée"
        width={280}
        height={280}
        loading="eager"
        decoding="async"
      />
      <img
        src="/img/logo01.png"
        alt=""
        className="pass-access-ticket__qr-logo"
        width={44}
        height={44}
        aria-hidden
      />
    </div>
  );
}
