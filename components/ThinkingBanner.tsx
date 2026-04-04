"use client";

type Props = {
  label: string;
};

export function ThinkingBanner({ label }: Props) {
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
