import { redirect } from "next/navigation";

import { galleryPath } from "@/lib/galerie/content";

export default function IndexPage() {
  redirect(galleryPath);
}
