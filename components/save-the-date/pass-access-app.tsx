"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PassAccessPanel } from "@/components/save-the-date/pass-access-panel";
import "@/components/save-the-date/pass-access.css";

type PassAccessAppProps = {
  loginPath?: string;
};

export function PassAccessApp({ loginPath = "/login?passaccess=1" }: PassAccessAppProps) {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data: { authenticated?: boolean }) => {
        if (!data.authenticated) {
          router.replace(loginPath);
          return;
        }
        setAuthenticated(true);
      })
      .catch(() => {
        router.replace(loginPath);
      })
      .finally(() => setAuthChecked(true));
  }, [loginPath, router]);

  if (!authChecked) {
    return (
      <div className="pass-access-screen pass-access-screen--loading">
        <div className="pass-access-screen__spinner" aria-hidden />
        <p className="pass-access-screen__loading-text">Chargement du pass…</p>
      </div>
    );
  }

  if (!authenticated) return null;

  return <PassAccessPanel variant="standalone" />;
}
