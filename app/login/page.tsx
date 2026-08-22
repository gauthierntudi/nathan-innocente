import type { Metadata } from "next";

import { LoginApp } from "@/components/save-the-date/login-app";
import {
  isCocktailLoginParam,
  isPassAccessLoginParam,
} from "@/lib/pass-access-urls";

export const metadata: Metadata = {
  title: "Invitation - Nathan & Innocente",
  description: "Accédez à votre invitation personnelle.",
  openGraph: {
    title: "Invitation - Nathan & Innocente",
    description: "Accédez à votre invitation personnelle.",
    type: "website",
    images: [{ url: "/img/profil01.png" }],
  },
};

type LoginPageProps = {
  searchParams: Promise<{ params?: string; passaccess?: string; cocktail?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { params: urlToken, passaccess, cocktail } = await searchParams;
  return (
    <LoginApp
      urlToken={urlToken ?? ""}
      passAccess={isPassAccessLoginParam(passaccess)}
      cocktail={isCocktailLoginParam(cocktail)}
    />
  );
}
