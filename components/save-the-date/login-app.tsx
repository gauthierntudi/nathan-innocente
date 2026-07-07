"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LoginView, isValidPhoneNumber } from "@/components/save-the-date/login-view";
import "@/components/save-the-date/invitation.css";

type LoginPayload = {
  success: boolean;
  authenticated?: boolean;
  message?: string;
};

type LoginAppProps = {
  urlToken?: string;
};

export function LoginApp({ urlToken = "" }: LoginAppProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data: { authenticated?: boolean }) => {
        if (data.authenticated) {
          router.replace("/wedding");
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

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

      router.replace("/wedding");
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
