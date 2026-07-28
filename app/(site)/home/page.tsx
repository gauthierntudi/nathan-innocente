import { redirect } from "next/navigation";

import { homePath } from "@/lib/home/content";

export default function HomeAliasPage() {
  redirect(homePath);
}
