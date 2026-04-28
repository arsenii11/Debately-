import { MultiplayerApp } from "@/components/multiplayer/MultiplayerApp";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export default async function PlayPage({ params }: Params) {
  const { id } = await params;
  return (
    <main className="flex h-dvh min-h-0 w-full min-w-0 max-w-full flex-col overflow-x-hidden bg-zinc-950 text-zinc-100">
      <MultiplayerApp sessionId={id} />
    </main>
  );
}
