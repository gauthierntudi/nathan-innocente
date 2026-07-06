"use client";

import Link from "next/link";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import "react-phone-number-input/style.css";

import { InvitationHearts } from "@/components/save-the-date/invitation-hearts";
import { ArrowRight, INVITATION_ICON_PROPS } from "@/components/save-the-date/invitation-icons";
import "@/components/save-the-date/invitation.css";

type LoginViewProps = {
  phone: string;
  onPhoneChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  submitting: boolean;
  error: string;
};

export function LoginView({
  phone,
  onPhoneChange,
  onSubmit,
  submitting,
  error,
}: LoginViewProps) {
  return (
    <div className="invitation-page">
      <div className="invitation-page__bg" aria-hidden />
      <div className="invitation-page__overlay" aria-hidden />

      <div className="invitation-page__content">
        <div className="invitation-brand">
          <img
            className="invitation-brand__logo"
            src="/img/logo-white.png"
            alt="Nathan & Innocente"
          />
          <InvitationHearts />
          <p className="invitation-brand__eyebrow">Nathan & Innocente · 2026</p>
          <h1 className="invitation-brand__title">Invitation</h1>
          <p className="invitation-brand__subtitle">
            Entrez le numéro WhatsApp associé à votre invitation pour accéder à vos informations.
          </p>
        </div>

        <div className="invitation-card">
          <form onSubmit={onSubmit}>
            <label className="invitation-field-label" htmlFor="invitation-phone">
              Numéro WhatsApp
            </label>
            <PhoneInput
              international
              defaultCountry="FR"
              countryCallingCodeEditable
              placeholder="06 12 34 56 78"
              value={phone}
              onChange={(value) => onPhoneChange(value ?? "")}
              className="std-phone-input"
              numberInputProps={{ id: "invitation-phone", "aria-label": "Numéro WhatsApp" }}
            />

            <button type="submit" disabled={submitting} className="invitation-submit">
              {submitting ? "Chargement..." : "Continuer"}
              {!submitting ? <ArrowRight {...INVITATION_ICON_PROPS} /> : null}
            </button>

            {error ? <p className="invitation-error">{error}</p> : null}
          </form>
        </div>

        <div className="invitation-footer">
          <p className="invitation-footer__names">Nathan & Innocente</p>
          <Link href="/" className="invitation-footer__link">
            Découvrir le site du mariage
          </Link>
        </div>
      </div>
    </div>
  );
}

export { isValidPhoneNumber };
