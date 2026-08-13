import Link from "next/link";

import {
  dataDeletionPath,
  legalContactEmail,
  legalLastUpdated,
  legalSiteName,
  privacyPolicyPath,
  termsOfServicePath,
} from "@/lib/legal/content";

type LegalSection = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

type LegalDocumentProps = {
  title: string;
  intro: string;
  sections: LegalSection[];
};

export function LegalDocument({ title, intro, sections }: LegalDocumentProps) {
  return (
    <main className="legal-page">
      <div className="legal-page__inner">
        <p className="legal-page__eyebrow">{legalSiteName}</p>
        <h1 className="legal-page__title">{title}</h1>
        <p className="legal-page__updated">Dernière mise à jour : {legalLastUpdated}</p>
        <p className="legal-page__intro">{intro}</p>

        {sections.map((section) => (
          <section key={section.title} className="legal-page__section">
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.bullets?.length ? (
              <ul>
                {section.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}

        <p className="legal-page__contact">
          Contact :{" "}
          <a href={`mailto:${legalContactEmail}`}>{legalContactEmail}</a>
        </p>

        <nav className="legal-page__nav" aria-label="Documents légaux">
          <Link href={privacyPolicyPath}>Politique de confidentialité</Link>
          <Link href={termsOfServicePath}>Conditions d&apos;utilisation</Link>
          <Link href={dataDeletionPath}>Suppression des données</Link>
        </nav>
      </div>
    </main>
  );
}
