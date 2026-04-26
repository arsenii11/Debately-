import {
  expireDeadlineIfDue,
  getSession,
  publicView,
  resolveSlotByToken,
  subscribeToSession,
  touchSession,
  hashPlayerToken,
} from "@/lib/multiplayer/store";
import { runVerdictForSession } from "@/lib/multiplayer/aiOrchestrator";
import type { MultiplayerSession } from "@/lib/multiplayer/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;
const DEADLINE_CHECK_MS = 1_000;

type Params = { params: Promise<{ id: string }> };

function serializeForToken(
  session: MultiplayerSession,
  tokenHash: string | null,
): string {
  return JSON.stringify(publicView(session, tokenHash));
}

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const session = getSession(id);
  if (!session) {
    return new Response("Session not found.", { status: 404 });
  }

  const url = new URL(request.url);
  const tokenFromQuery = url.searchParams.get("token");
  const headerToken = request.headers.get("x-player-token");
  const playerToken = (tokenFromQuery ?? headerToken ?? "").trim() || null;
  const tokenHash = playerToken ? hashPlayerToken(playerToken) : null;

  const slot = playerToken ? resolveSlotByToken(session, playerToken) : null;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const writeEvent = (event: string | null, data: string) => {
        if (closed) return;
        const lines: string[] = [];
        if (event) lines.push(`event: ${event}`);
        for (const line of data.split("\n")) lines.push(`data: ${line}`);
        lines.push("");
        lines.push("");
        try {
          controller.enqueue(encoder.encode(lines.join("\n")));
        } catch {
          closed = true;
        }
      };

      const writeComment = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ${text}\n\n`));
        } catch {
          closed = true;
        }
      };

      writeComment("connected");

      // Mark presence on connect.
      let latestSnapshot = session;
      if (slot) {
        const refreshed = touchSession({ sessionId: id, slot });
        if (refreshed) latestSnapshot = refreshed;
      }
      writeEvent("snapshot", serializeForToken(latestSnapshot, tokenHash));

      const unsubscribe = subscribeToSession(id, (next) => {
        latestSnapshot = next;
        writeEvent("snapshot", serializeForToken(next, tokenHash));
      });

      const heartbeat = setInterval(() => {
        writeComment("ping");
        if (slot) {
          touchSession({ sessionId: id, slot });
        }
      }, HEARTBEAT_MS);

      const deadlineTimer = setInterval(() => {
        const result = expireDeadlineIfDue(id);
        if (
          result.expired &&
          result.session &&
          result.session.state === "finished" &&
          !result.session.verdict
        ) {
          void runVerdictForSession({ sessionId: id });
        }
      }, DEADLINE_CHECK_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearInterval(deadlineTimer);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const signal = request.signal;
      if (signal.aborted) cleanup();
      else signal.addEventListener("abort", cleanup, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
