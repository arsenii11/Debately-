import type { Metadata } from "next";
import { ResultPageClient } from "./ResultPageClient";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Debate Result · ${id} — Debately`,
    description: "Multiplayer debate result with scores, breakdown, and best arguments.",
  };
}

export default async function ResultPage({ params }: Params) {
  const { id } = await params;
  return <ResultPageClient sessionId={id} />;
}
