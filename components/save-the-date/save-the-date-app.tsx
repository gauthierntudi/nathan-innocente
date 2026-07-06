"use client";

import { useEffect, useState } from "react";

import { GuestInvitationView } from "@/components/save-the-date/guest-invitation-view";
import { LoginView, isValidPhoneNumber } from "@/components/save-the-date/login-view";
import "@/components/save-the-date/invitation.css";
import type { GuestCeremonyView } from "@/lib/guest-ceremonies";

type SessionPayload = {
  authenticated: boolean;
  alreadySubmitted?: boolean;
  numGuests?: number;
  ceremonies?: GuestCeremonyView[];
};

type LoginPayload = SessionPayload & {
  success: boolean;
  message?: string;
};

type SaveTheDateAppProps = {
  urlToken?: string;
};

export function SaveTheDateApp({ urlToken = "" }: SaveTheDateAppProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [session, setSession] = useState<SessionPayload | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data: SessionPayload) => {
        if (data.authenticated) {
          setSession(data);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (!phone || !isValidPhoneNumber(phone)) {
      setError("Numéro invalide. Vérifiez le format.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, urlToken: urlToken || undefined }),
      });

      const data = (await response.json()) as LoginPayload;

      if (!data.success || !data.authenticated) {
        setError(data.message ?? "Une erreur est survenue.");
        return;
      }

      setSession({
        authenticated: true,
        alreadySubmitted: data.alreadySubmitted,
        numGuests: data.numGuests,
        ceremonies: data.ceremonies ?? [],
      });
    } catch {
      setError("Une erreur technique est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="invitation-loading">
        <img src="/img/logo-white.png" alt="" width={48} height={48} className="opacity-90" />
        <div className="invitation-loading__spinner" aria-hidden />
        <p className="text-sm text-white/60">Chargement de votre invitation...</p>
      </div>
    );
  }

  if (session?.authenticated) {
    return (
      <GuestInvitationView
        alreadySubmitted={Boolean(session.alreadySubmitted)}
        numGuests={session.numGuests ?? 1}
        ceremonies={session.ceremonies ?? []}
      />
    );
  }

  return (
    <LoginView
      phone={phone}
      onPhoneChange={setPhone}
      onSubmit={handleLogin}
      submitting={submitting}
      error={error}
    />
  );
}
