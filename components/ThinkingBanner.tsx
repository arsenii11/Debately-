"use client";

type Props = {
  label: string;
  showProgress?: boolean;
  subtitle?: string;
};

export function ThinkingBanner({
  label,
  showProgress = false,
  subtitle,
}: Props) {
  if (showProgress) {
    return (
      <div className="mx-auto w-full max-w-md rounded-2xl border border-indigo-500/30 bg-zinc-900/85 px-4 py-4 shadow-lg shadow-black/20">
        <p className="text-center text-sm font-semibold text-zinc-100">{label}</p>
        {subtitle ? (
          <p className="mt-1 text-center text-xs text-zinc-400">{subtitle}</p>
        ) : null}
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-indigo-500/80" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md items-center justify-center gap-2 rounded-full border border-zinc-700/80 bg-zinc-900/80 px-4 py-2 text-xs text-zinc-400">
      <span className="flex gap-1">
        <span className="h-1 w-1 animate-pulse rounded-full bg-amber-400" />
        <span className="h-1 w-1 animate-pulse rounded-full bg-amber-400 [animation-delay:150ms]" />
        <span className="h-1 w-1 animate-pulse rounded-full bg-amber-400 [animation-delay:300ms]" />
      </span>
      {label}
    </div>
  );
}
