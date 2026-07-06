import { SaveTheDateApp } from "@/components/save-the-date/save-the-date-app";

type PageProps = {
  searchParams: Promise<{ params?: string }>;
};

export default async function SaveTheDatePage({ searchParams }: PageProps) {
  const { params: urlToken } = await searchParams;
  return <SaveTheDateApp urlToken={urlToken ?? ""} />;
}
