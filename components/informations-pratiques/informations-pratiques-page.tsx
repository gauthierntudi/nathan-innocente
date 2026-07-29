"use client";

import Link from "next/link";

import { HomeUiProvider } from "@/components/home/home-ui-context";
import { OffcanvasMenu } from "@/components/home/offcanvas-menu";
import { SiteHeader } from "@/components/home/site-header";
import { invitationPath, notreUniversPath } from "@/lib/home/content";
import "@/components/informations-pratiques/informations-pratiques.css";

const FAQ_ITEMS = [
  {
    question: "Les enfants sont-ils invités ?",
    answer:
      "Comme indiqué sur votre invitation, certaines célébrations sont réservées aux adultes.",
  },
  {
    question: "Quel type de chaussures est conseillé ?",
    answer:
      "Une partie des festivités se déroulera sur de la pelouse. Nous invitons les dames à privilégier des chaussures adaptées.",
  },
  {
    question: "Les téléphones sont-ils autorisés ?",
    answer:
      "Certaines cérémonies seront « unplugged » afin de permettre à chacun de vivre pleinement l’instant. Les consignes seront précisées selon les événements.",
  },
] as const;

function InformationsPratiquesContent() {
  return (
    <div id="body" className="home-theme infos-page">
      <OffcanvasMenu />
      <SiteHeader tone="light" />

      <main className="infos-page__main">
        <header className="infos-page__hero">
          <p className="infos-page__eyebrow">Nathan & Innocente · 2026</p>
          <h1 className="infos-page__title">Informations pratiques / Q&amp;A</h1>
          <p className="infos-page__lead">
            Toutes les informations utiles pour préparer votre venue sont
            regroupées ici.
          </p>
        </header>

        <section
          className="infos-page__block"
          aria-labelledby="infos-etrangers-title"
        >
          <p className="infos-page__block-eyebrow">Voyageurs</p>
          <h2 id="infos-etrangers-title" className="infos-page__block-title">
            Infos pratiques pour les étrangers
          </h2>
          <p className="infos-page__block-body">
            Un document PDF dédié a été envoyé avec le Save the Date. Il regroupe
            les informations utiles pour préparer votre venue depuis
            l’étranger.
          </p>
          <a
            href="/docs/infos-pratiques.pdf"
            className="infos-page__download"
            download="infos-pratiques.pdf"
          >
            Télécharger le PDF
          </a>
        </section>

        <section
          className="infos-page__block"
          aria-labelledby="infos-tenues-title"
        >
          <p className="infos-page__block-eyebrow">Dress code</p>
          <h2 id="infos-tenues-title" className="infos-page__block-title">
            Tenues recommandées
          </h2>
          <p className="infos-page__block-body">
            Retrouvez les tenues recommandées pour chaque célébration dans votre
            espace invitation, après confirmation de votre présence.
          </p>
          <Link href={invitationPath} className="infos-page__link">
            Accéder à l’invitation
          </Link>
        </section>

        <section
          className="infos-page__faq"
          aria-labelledby="infos-faq-title"
        >
          <p className="infos-page__block-eyebrow">FAQ</p>
          <h2 id="infos-faq-title" className="infos-page__block-title">
            Questions fréquentes
          </h2>

          <div className="infos-page__faq-list">
            {FAQ_ITEMS.map((item) => (
              <article key={item.question} className="infos-page__faq-item">
                <h3 className="infos-page__faq-question">{item.question}</h3>
                <p className="infos-page__faq-answer">{item.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="infos-page__block infos-page__block--gifts"
          aria-labelledby="infos-cadeaux-title"
        >
          <p className="infos-page__block-eyebrow">Avec gratitude</p>
          <h2 id="infos-cadeaux-title" className="infos-page__block-title">
            Les cadeaux
          </h2>
          <p className="infos-page__block-body">
            Votre présence à nos côtés constitue déjà le plus beau des cadeaux.
          </p>
          <p className="infos-page__block-body">
            Pour ceux qui souhaitent nous témoigner leur affection autrement,
            une participation en espèces à notre future vie commune sera
            accueillie avec une immense gratitude.
          </p>
        </section>

        <Link href={notreUniversPath} className="infos-page__home">
          Retour à l’accueil
        </Link>
      </main>
    </div>
  );
}

export function InformationsPratiquesPage() {
  return (
    <HomeUiProvider>
      <InformationsPratiquesContent />
    </HomeUiProvider>
  );
}
