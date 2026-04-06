"use client";

export type DebateCountdownStep = 3 | 2 | 1 | "go";

type Props = {
  step: DebateCountdownStep;
};

export function DebateLaunchOverlay({ step }: Props) {
  const label = step === "go" ? "GO" : String(step);

  return (
    <div
      className="debately-launch-overlay fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 backdrop-blur-md"
      aria-hidden
    >
      <div
        key={label}
        className="debately-count-pop text-center font-black tracking-tighter text-fuchsia-400 tabular-nums drop-shadow-[0_0_40px_rgba(232,121,249,0.35)]"
        style={{ fontSize: "clamp(4.5rem, 20vw, 10rem)" }}
      >
        {label}
      </div>
    </div>
  );
}
