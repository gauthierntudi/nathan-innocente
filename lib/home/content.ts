export const invitationPath = "/login" as const;

export const footerNav = [
  { label: "Home", href: "/" },
  { label: "Coutumier", href: invitationPath },
  { label: "Civile", href: invitationPath },
  { label: "Réligieux", href: invitationPath },
] as const;

export const heroSlides = [
  {
    id: "home",
    label: "Home",
    title: "Nathan & Innocente",
    titleLines: ["Nathan &", "Innocente"],
    href: "/",
    image: "/img/5.jpg",
    thumb: "/img/s000.jpg",
  },
  {
    id: "coutumier",
    label: "Coutumier",
    title: "Cérémonie coutumière",
    titleLines: ["Cérémonie", "coutumière"],
    href: invitationPath,
    image: "/img/3.jpg",
    thumb: "/img/s002.jpg",
  },
  {
    id: "civile",
    label: "Civile",
    title: "Cérémonie Civile",
    titleLines: ["Cérémonie", "Civile"],
    href: invitationPath,
    image: "/img/1.jpg",
    thumb: "/img/s003.jpg",
  },
  {
    id: "religieux",
    label: "Réligieux",
    title: "Bénédiction Nuptiale",
    titleLines: ["Bénédiction", "Nuptiale"],
    href: invitationPath,
    image: "/img/2.jpg",
    thumb: "/img/s004.jpg",
  },
] as const;

export const dualCubeFaces = {
  left: {
    front: "/img/5.jpg",
    top: "/img/2.jpg",
    side: "/img/4.jpg",
    back: "/img/3.jpg",
    bottom: "/img/05.jpg",
  },
  right: {
    front: "/img/1.jpg",
    top: "/img/3.jpg",
    side: "/img/06.jpg",
    back: "/img/08.jpg",
    bottom: "/img/02.jpg",
  },
} as const;

export const footerSocial = [
  "Facebook",
  "Instagram",
  "Behance",
  "Dribbble",
] as const;

export const logos = {
  onLight: "/img/logo-black.png",
  onDark: "/img/logo-white.png",
} as const;

export const parallaxBanner = {
  phrase: "Retrouvez votre invitation et téléchargez le dress code.",
} as const;

export const weddingInfo = {
  date: "04 au 09 Septembre",
  quote:
    "Nous sommes impatients de passer le reste de nos vies ensemble. Main dans la main, nous ferons face à toutes les épreuves, célébrerons toutes les victoires, et profiterons de chaque instant.",
  email: "hello@nathan-innocente.com",
  phone: "+243 80 770 1007",
  address: "Avenue de Roma 158b, Lisboa\nKinshasa - Gobe",
};

export function padSlideNumber(index: number) {
  return String(index + 1).padStart(2, "0");
}
