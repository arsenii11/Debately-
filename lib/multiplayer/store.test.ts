import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpDir = mkdtempSync(join(tmpdir(), "debately-mp-"));
const snapshotPath = join(tmpDir, "sessions.json");
process.env.MULTIPLAYER_SNAPSHOT_PATH = snapshotPath;

// Import after env var is set so the store picks up the test snapshot path.
import {
  applyConcede,
  applyMove,
  applyLike,
  applyLobbyUpdate,
  applyRemoveLike,
  createSessionWithHost,
  expireDeadlineIfDue,
  getSession,
  getStoreInternalsForTests,
  joinExistingSession,
} from "@/lib/multiplayer/store";
import {
  SKIP_AUTO_CONCEDE_THRESHOLD,
  hashPlayerToken,
  recordMove,
  createEmptySession,
  joinSession,
  updateLobby,
  tryStartLive,
} from "@/lib/multiplayer/sessionLogic";
import type { MultiplayerSession } from "@/lib/multiplayer/types";

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  getStoreInternalsForTests().reset();
});

it("createSessionWithHost allows empty nickname (set later in lobby)", () => {
  const { session, slot } = createSessionWithHost({ nickname: "" });
  const p = session.players.find((x) => x.slot === slot);
  expect(p?.nickname).toBe("");
});

it("applyRemoveLike removes a spectator reaction", () => {
  const { sessionId } = startedSession();
  const add = applyLike({
    sessionId,
    name: "Spec",
    round: 1,
    side: "FOR",
    kind: "like",
  });
  expect(add.kind).toBe("ok");
  expect(getSession(sessionId)?.likes.length).toBe(1);
  const rem = applyRemoveLike({
    sessionId,
    name: "Spec",
    round: 1,
    side: "FOR",
    kind: "like",
  });
  expect(rem.kind).toBe("ok");
  expect(getSession(sessionId)?.likes.length).toBe(0);
});

function startedSession(): {
  sessionId: string;
  hostToken: string;
  guestToken: string;
} {
  const host = createSessionWithHost({ nickname: "Alice" });
  const join = joinExistingSession({
    sessionId: host.session.id,
    nickname: "Bob",
  });
  if (join.kind !== "ok") throw new Error("expected fresh join");

  // Both players agree on settings and mark ready.
  applyLobbyUpdate({
    sessionId: host.session.id,
    slot: "A",
    update: {
      topic: "AI will improve education.",
      side: "FOR",
      turnRounds: 3,
      turnTimerSeconds: 60,
    },
  });
  applyLobbyUpdate({
    sessionId: host.session.id,
    slot: "B",
    update: { side: "AGAINST" },
  });
  applyLobbyUpdate({
    sessionId: host.session.id,
    slot: "A",
    update: { ready: true },
  });
  const ready = applyLobbyUpdate({
    sessionId: host.session.id,
    slot: "B",
    update: { ready: true },
  });
  if (ready.kind !== "ok") throw new Error("ready failed");
  if (!ready.started) throw new Error("expected debate to start");
  return {
    sessionId: host.session.id,
    hostToken: host.playerToken,
    guestToken: join.playerToken,
  };
}

describe("multiplayer store lifecycle", () => {
  it("create → join → propose → ready×2 starts the debate", () => {
    const { sessionId } = startedSession();
    const session = getSession(sessionId);
    expect(session?.state).toBe("live");
    expect(session?.settings.topic).toBe("AI will improve education.");
    expect(session?.settings.turnRounds).toBe(3);
    expect(session?.players[0].side).toBe("FOR");
    expect(session?.players[1].side).toBe("AGAINST");
    expect(session?.history).toHaveLength(1);
    expect(session?.currentRound).toBe(1);
    expect(session?.currentSide).toBe("FOR");
  });

  it("alternates sides each turn and finishes after the final round", () => {
    const { sessionId } = startedSession();
    // Round 1 FOR
    let r = applyMove({ sessionId, slot: "A", text: "FOR opens." });
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.finished).toBe(false);
    let session = getSession(sessionId)!;
    expect(session.currentSide).toBe("AGAINST");
    expect(session.currentRound).toBe(1);

    // Round 1 AGAINST
    r = applyMove({ sessionId, slot: "B", text: "AGAINST rebuts." });
    expect(r.kind).toBe("ok");
    session = getSession(sessionId)!;
    expect(session.currentRound).toBe(2);
    expect(session.currentSide).toBe("FOR");

    // Round 2 FOR
    r = applyMove({ sessionId, slot: "A", text: "FOR closes." });
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.finished).toBe(false);

    // Round 2 AGAINST
    r = applyMove({ sessionId, slot: "B", text: "AGAINST closes." });
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.finished).toBe(false);
    session = getSession(sessionId)!;
    expect(session.currentRound).toBe(3);
    expect(session.currentSide).toBe("FOR");

    // Round 3 FOR
    r = applyMove({ sessionId, slot: "A", text: "FOR final push." });
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.finished).toBe(false);

    // Round 3 AGAINST → final
    r = applyMove({ sessionId, slot: "B", text: "AGAINST final answer." });
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.finished).toBe(true);
    session = getSession(sessionId)!;
    expect(session.state).toBe("finished");
    expect(session.currentDeadlineAt).toBeNull();
  });

  it("rejects moves out of turn", () => {
    const { sessionId } = startedSession();
    const wrong = applyMove({ sessionId, slot: "B", text: "early!" });
    expect(wrong.kind).toBe("error");
  });

  it("concede mid-game finishes the debate", () => {
    const { sessionId } = startedSession();
    applyMove({ sessionId, slot: "A", text: "FOR opens." });
    const result = applyConcede({ sessionId, slot: "B" });
    expect(result.kind).toBe("ok");
    const session = getSession(sessionId)!;
    expect(session.state).toBe("finished");
    expect(session.concededBy).toBe("B");
    expect(session.currentDeadlineAt).toBeNull();
  });

  it("revision is strictly monotonic for any visible state change", () => {
    const host = createSessionWithHost({ nickname: "Alice" });
    let prev = host.session.revision;
    const join = joinExistingSession({
      sessionId: host.session.id,
      nickname: "Bob",
    });
    if (join.kind !== "ok") throw new Error("expected join");
    expect(join.session.revision).toBeGreaterThan(prev);
    prev = join.session.revision;

    const u1 = applyLobbyUpdate({
      sessionId: host.session.id,
      slot: "A",
      update: { topic: "Cats > dogs" },
    });
    if (u1.kind !== "ok") throw new Error("expected ok");
    expect(u1.session.revision).toBeGreaterThan(prev);
  });
});

describe("multiplayer store: deadline auto-skip & no-show concede", () => {
  it("auto-skips the current side when the deadline passes", () => {
    const { sessionId } = startedSession();
    const before = getSession(sessionId)!;
    expect(before.currentDeadlineAt).not.toBeNull();
    // Force the deadline into the past.
    before.currentDeadlineAt = Date.now() - 1000;
    const r = expireDeadlineIfDue(sessionId);
    expect(r.expired).toBe(true);
    const after = getSession(sessionId)!;
    expect(after.history[0]?.forMove).toBe("[Turn skipped — time expired]");
    expect(after.skippedTurns.FOR).toBe(1);
    expect(after.currentSide).toBe("AGAINST");
  });

  it("auto-concedes after three consecutive skips on the same side", () => {
    expect(SKIP_AUTO_CONCEDE_THRESHOLD).toBe(3);
    // Build a session manually so we can craft a 3-round game.
    const empty = createEmptySession(Date.now());
    const j1 = joinSession(empty, {
      tokenHash: hashPlayerToken("a"),
      nickname: "A",
      now: Date.now(),
    });
    if ("error" in j1) throw new Error("join1 failed");
    const j2 = joinSession(j1.session, {
      tokenHash: hashPlayerToken("b"),
      nickname: "B",
      now: Date.now(),
    });
    if ("error" in j2) throw new Error("join2 failed");
    let session = updateLobby(
      j2.session,
      "A",
      {
        topic: "T",
        side: "FOR",
        turnRounds: 4,
        turnTimerSeconds: 30,
        ready: true,
      },
      Date.now(),
    );
    session = updateLobby(
      session,
      "B",
      { side: "AGAINST", ready: true },
      Date.now(),
    );
    session = tryStartLive(session, Date.now());
    expect(session.state).toBe("live");

    // Skip once for FOR.
    const r1 = recordMove(session, "A", "", { skipped: true, now: Date.now() });
    if (r1.kind !== "ok") throw new Error("r1");
    session = r1.session;
    // AGAINST plays normally.
    const r2 = recordMove(session, "B", "real argument", {
      skipped: false,
      now: Date.now(),
    });
    if (r2.kind !== "ok") throw new Error("r2");
    session = r2.session;
    // Skip again for FOR.
    const r3 = recordMove(session, "A", "", { skipped: true, now: Date.now() });
    if (r3.kind !== "ok") throw new Error("r3");
    session = r3.session;
    const r4 = recordMove(session, "B", "still arguing", {
      skipped: false,
      now: Date.now(),
    });
    if (r4.kind !== "ok") throw new Error("r4");
    session = r4.session;
    // Third skip in a row for FOR triggers auto-concede.
    const r5 = recordMove(session, "A", "", { skipped: true, now: Date.now() });
    if (r5.kind !== "ok") throw new Error("r5");
    expect(r5.finished).toBe(true);
    expect(r5.session.state).toBe("finished");
    expect(r5.session.concededBy).toBe("A");
  });
});

describe("multiplayer store: snapshot round-trip", () => {
  it("writes and reloads the in-memory map", async () => {
    const { sessionId } = startedSession();
    applyMove({ sessionId, slot: "A", text: "FOR opens." });

    await getStoreInternalsForTests().flush();

    const raw = readFileSync(snapshotPath, "utf8");
    const parsed = JSON.parse(raw) as {
      v: 1;
      sessions: MultiplayerSession[];
    };
    expect(parsed.v).toBe(1);
    expect(parsed.sessions).toHaveLength(1);
    const reloaded = parsed.sessions[0]!;
    expect(reloaded.id).toBe(sessionId);
    expect(reloaded.state).toBe("live");
    expect(reloaded.history[0]?.forMove).toBe("FOR opens.");
    expect(reloaded.players[0].nickname).toBe("Alice");
    expect(reloaded.players[1].nickname).toBe("Bob");
  });
});

