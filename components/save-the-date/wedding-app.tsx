"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { GuestInvitationView } from "@/components/save-the-date/guest-invitation-view";
import "@/components/save-the-date/invitation.css";
import type { GuestCeremonyView } from "@/lib/guest-ceremonies";

type SessionPayload = {
  authenticated: boolean;
  alreadySubmitted?: boolean;
  endReason?: "confirmed" | "declined" | null;
  dressCodeDownloaded?: boolean;
  numGuests?: number;
  ceremonies?: GuestCeremonyView[];
};

export function WeddingApp() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionPayload | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data: SessionPayload) => {
        if (!data.authenticated) {
          router.replace("/login");
          return;
        }

        setSession(data);
      })
      .catch(() => {
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="invitation-loading">
        <img src="/img/logo-white.png" alt="" width={48} height={48} className="opacity-90" />
        <div className="invitation-loading__spinner" aria-hidden />
        <p className="text-sm text-white/60">Chargement de votre invitation...</p>
      </div>
    );
  }

  if (!session?.authenticated) {
    return null;
  }

  return (
    <GuestInvitationView
      alreadySubmitted={Boolean(session.alreadySubmitted)}
      endReason={session.endReason ?? null}
      dressCodeDownloaded={Boolean(session.dressCodeDownloaded)}
      numGuests={session.numGuests ?? 1}
      ceremonies={session.ceremonies ?? []}
    />
  );
}
