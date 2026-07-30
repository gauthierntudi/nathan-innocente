import { redirect } from "next/navigation";

import { notreUniversPath } from "@/lib/home/content";

export default function HomeAliasPage() {
  redirect(notreUniversPath);
}
