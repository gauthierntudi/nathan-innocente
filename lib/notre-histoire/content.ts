import { getDemandeMariageImages } from "@/lib/demande-mariage-urls";
import { getEterniteVideoUrl } from "@/lib/videos-urls";

export const notreHistoirePath = "/notre-histoire" as const;

export type StoryMoment = {
  label: string;
  body: string;
  step?: string;
};

export type StorySlide =
  | {
      id: string;
      kind: "intro";
      title: string;
      kicker?: string;
      paragraphs: readonly string[];
      masonryImages: readonly string[];
    }
  | {
      id: string;
      kind: "scene";
      chapter: string;
      step: string;
      title: string;
      body: string;
      image: string;
      imageSecondary?: string;
      place?: string;
      tone?: "greyscale" | "color";
    }
  | {
      id: string;
      kind: "reflection";
      chapter: string;
      title: string;
      highlight?: string;
      image: string;
      paragraphs: readonly string[];
    }
  | {
      id: string;
      kind: "text";
      title: string;
      kicker?: string;
      paragraphs: readonly string[];
    }
  | {
      id: string;
      kind: "moments";
      title: string;
      moments: readonly StoryMoment[];
    }
  | {
      id: string;
      kind: "gallery";
      chapter?: string;
      title: string;
      lead: string;
      images: readonly { src: string; alt: string }[];
    }
  | {
      id: string;
      kind: "closing";
      title: string;
      paragraphs: readonly string[];
      thanks: string;
      videoUrl: string;
    };

export const storySlides: readonly StorySlide[] = [
  {
    id: "introduction",
    kind: "intro",
    kicker: "The Samunas To Eternity",
    title: "Introduction",
    paragraphs: [
      "Avant d’être un mariage, cette célébration est l’histoire de deux vies que Dieu a délicatement conduites l’une vers l’autre.",
      "Cette page est une invitation à découvrir notre parcours, les moments qui nous ont construits et les valeurs qui nous unissent aujourd’hui.",
    ],
    masonryImages: [
      "/img/0T8A5173.jpg",
      "/img/5.jpg",
      "/img/LUK_0750.jpg",
      "/img/1001.jpg",
      "/img/0T8A5252.jpg",
      "/img/3.jpg",
      "/img/02.jpg",
      "/img/4.jpg",
      "/img/06.jpg",
      "/img/2.jpg",
      "/img/08.jpg",
      "/img/03.jpg",
    ],
  },
  {
    id: "rencontre-avant",
    kind: "scene",
    chapter: "Notre rencontre",
    step: "01",
    title: "Avant même de nous connaître…",
    body: "Nous avons grandi dans le même univers, entourés des mêmes amis, sans jamais imaginer que nos chemins se rejoindraient un jour.",
    image: "/img/LAB3-A-26--30.jpg",
    place: "Le même cercle",
    tone: "greyscale",
  },
  {
    id: "rencontre-continents",
    kind: "scene",
    chapter: "Notre rencontre",
    step: "02",
    title: "Deux continents, deux parcours",
    body: "L’un en Afrique du Sud, l’autre à Londres. Pendant plusieurs années, la vie nous a façonnés chacun de notre côté.",
    image: "/img/LAB3-A-26--27.jpg",
    imageSecondary: "/img/08.jpg",
    place: "Afrique du Sud  ·  Londres",
  },
  {
    id: "rencontre-retrouvailles",
    kind: "scene",
    chapter: "Notre rencontre",
    step: "03",
    title: "Les retrouvailles",
    body: "À notre retour à Kinshasa, une simple soirée entre amis d’enfance a tout changé. Ce jour-là, une belle amitié est née… et notre histoire a commencé.",
    image: "/img/0T8A5174.jpg",
    place: "Kinshasa",
  },
  {
    id: "amour-amis",
    kind: "scene",
    chapter: "Notre histoire d’amour",
    step: "01",
    title: "D’abord amis",
    body: "Avant de tomber amoureux, nous avons appris à nous connaître, à nous faire confiance et à nous choisir.",
    image: "/img/0T8A5185.jpg",
    place: "L’amitié d’abord",
  },
  {
    id: "amour-grandir",
    kind: "scene",
    chapter: "Notre histoire d’amour",
    step: "02",
    title: "Grandir ensemble",
    body: "Notre histoire s’est construite à travers les joies, les défis, les différences et les conversations qui nous ont rendus plus forts.",
    image: "/img/0T8A5252.jpg",
    place: "Au fil des saisons",
  },
  {
    id: "amour-choix",
    kind: "scene",
    chapter: "Notre histoire d’amour",
    step: "03",
    title: "Le choix d’une vie",
    body: "Avec le temps, notre amour est devenu une décision : avancer ensemble, bâtir un foyer et marcher côte à côte vers l’avenir.",
    image: "/img/LAB3-A-26--23.jpg",
    place: "Une promesse",
  },
  {
    id: "foi",
    kind: "reflection",
    chapter: "Notre fondement",
    title: "Une histoire fondée sur la foi",
    image: "/img/LUK_0750.jpg",
    paragraphs: [
      "Au cœur de notre histoire se trouve une certitude : Dieu est l’auteur de notre rencontre et le fondement de notre union. Notre amour, nourri par la foi, l’amitié, la confiance et le pardon, grandit chaque jour avec Dieu au centre de notre vie. C’est avec joie et reconnaissance que nous avançons vers le sacrement du mariage, convaincus qu’il marque le début d’une vie à deux, guidée par Dieu et tournée vers l’éternité.",
    ],
  },
  {
    id: "demande",
    kind: "gallery",
    chapter: "Le grand oui",
    title: "La demande en mariage",
    lead: "Quelques images de ce moment où tout a basculé vers l’éternité.",
    images: getDemandeMariageImages(),
  },
  {
    id: "eternite",
    kind: "closing",
    title: "Vers l’éternité",
    paragraphs: [
      "Le mariage n’est pas l’aboutissement de notre histoire, mais le commencement d’une nouvelle aventure.",
      "Nous sommes infiniment reconnaissants de pouvoir vivre ce moment entourés de ceux qui ont contribué, de près ou de loin, à notre chemin.",
    ],
    thanks: "Merci d’en faire partie.",
    videoUrl: getEterniteVideoUrl(),
  },
];
