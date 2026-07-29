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
    id: "rencontre",
    kind: "scene",
    chapter: "2009 – 2014",
    step: "01",
    title: "Nos commencements",
    body: "Nous avons grandi dans le même univers, sans imaginer que nos chemins se rejoindraient un jour.",
    image: "/img/LAB3-A-26--30.jpg",
    place: "Nos débuts",
    tone: "greyscale",
  },
  {
    id: "destin",
    kind: "scene",
    chapter: "2015 – 2020",
    step: "02",
    title: "Deux chemins, un destin",
    body: "L’un en Afrique du Sud, l’autre à Londres. La vie nous préparait, chacun de notre côté.",
    image: "/img/LAB3-A-26--27.jpg",
    imageSecondary: "/img/LAB3-A-26--28%202.jpg",
    place: "Afrique du Sud  ·  Londres",
  },
  {
    id: "retrouvailles",
    kind: "scene",
    chapter: "2021 – 2023",
    step: "03",
    title: "Les retrouvailles",
    body: "Une soirée entre amis d’enfance. Une belle amitié est née, et tout a commencé.",
    image: "/img/0T8A5174.jpg",
    place: "Kinshasa",
  },
  {
    id: "amour",
    kind: "reflection",
    chapter: "2023 – 2026",
    title: "Une évidence",
    image: "/img/LAB3-A-26--23.jpg",
    paragraphs: [
      "Notre amitié est devenue un amour fondé sur la confiance, le respect et l’engagement.",
    ],
  },
  // Masqué pour l’instant — décommenter pour réactiver le slide « Demande en mariage »
  // {
  //   id: "demande",
  //   kind: "gallery",
  //   chapter: "Le grand oui",
  //   title: "La demande en mariage",
  //   lead: "Quelques images de ce moment où tout a basculé vers l’éternité.",
  //   images: getDemandeMariageImages(),
  // },
  {
    id: "eternite",
    kind: "closing",
    title: "Vers l’éternité",
    paragraphs: [
      "Le début de notre plus belle aventure, guidée par la foi, l’amour et la promesse d’une vie à deux.",
    ],
    thanks: "",
    videoUrl: getEterniteVideoUrl(),
  },
];

export const storyProgressDates: Record<string, string> = {
  rencontre: "2009–14",
  destin: "2015–20",
  retrouvailles: "2021–23",
  amour: "2023–26",
  eternite: "2026–∞",
};
