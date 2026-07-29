"use client";

import Link from "next/link";

import { HomeUiProvider } from "@/components/home/home-ui-context";
import { OffcanvasMenu } from "@/components/home/offcanvas-menu";
import { Preloader } from "@/components/home/preloader";
import { SiteHeader } from "@/components/home/site-header";
import { notreUniversPath } from "@/lib/home/content";
import "@/components/programme/programme.css";

const SECTIONS = [
  {
    id: "programme",
    eyebrow: "Avant le jour J",
    title: "Programme",
    body: "Les programmes seront envoyés aux invités 2 à 3 jours avant la cérémonie, accompagnés du QR code d’entrée.",
  },
  {
    id: "identification",
    eyebrow: "Le jour de la fête",
    title: "Identification des invités",
    body: "Chaque invité retrouve son QR code personnel. Celui-ci renvoie vers une page indiquant son nom — pour confirmer qu’il est bien entré dans la fête — ainsi que son numéro de table.",
  },
] as const;

function ProgrammeContent() {
  return (
    <div id="body" className="home-theme programme-page">
      <Preloader />
      <OffcanvasMenu />
      <SiteHeader tone="light" />

      <main className="programme-page__main">
        <header className="programme-page__hero">
          <p className="programme-page__eyebrow">Nathan & Innocente · 2026</p>
          <h1 className="programme-page__title">
            Programmes &amp; Pass d’entrée
          </h1>
          <p className="programme-page__lead">
            Tout ce qu’il faut savoir sur le programme des célébrations et le
            pass d’entrée personnel de chaque invité.
          </p>
        </header>

        <div className="programme-page__sections">
          {SECTIONS.map((section) => (
            <section
              key={section.id}
              className="programme-page__section"
              aria-labelledby={`programme-${section.id}`}
            >
              <p className="programme-page__section-eyebrow">{section.eyebrow}</p>
              <h2
                id={`programme-${section.id}`}
                className="programme-page__section-title"
              >
                {section.title}
              </h2>
              <p className="programme-page__section-body">{section.body}</p>
            </section>
          ))}
        </div>

        <p className="programme-page__note">
          Le détail du programme et votre pass d’entrée seront transmis
          personnellement à l’approche des célébrations.
        </p>

        <Link href={notreUniversPath} className="programme-page__home">
          Retour à l’accueil
        </Link>
      </main>
    </div>
  );
}

export function ProgrammePage() {
  return (
    <HomeUiProvider>
      <ProgrammeContent />
    </HomeUiProvider>
  );
}
