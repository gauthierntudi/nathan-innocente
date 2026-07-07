import type { Metadata } from "next";

import { LoginApp } from "@/components/save-the-date/login-app";

export const metadata: Metadata = {
  title: "Invitation - Nathan & Innocente",
  description:
    "Accédez à votre invitation personnelle et téléchargez le dress code.",
  openGraph: {
    title: "Invitation - Nathan & Innocente",
    description:
      "Accédez à votre invitation personnelle et téléchargez le dress code.",
    type: "website",
  },
};

type LoginPageProps = {
  searchParams: Promise<{ params?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { params: urlToken } = await searchParams;
  return <LoginApp urlToken={urlToken ?? ""} />;
}
