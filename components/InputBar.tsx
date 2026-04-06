"use client";

import { useCallback } from "react";

const MAX = 1500;

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  onFocus?: () => void;
};

export function InputBar({ value, onChange, onSubmit, disabled, onFocus }: Props) {
  const pct = (value.length / MAX) * 100;
  const nearLimit = pct > 90;

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!disabled && value.trim()) onSubmit();
      }
    },
    [disabled, onSubmit, value],
  );

  return (
    <div
      className="border-t border-zinc-800 bg-zinc-950/95 px-3 py-3 backdrop-blur sm:px-4"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        <textarea
          rows={3}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.slice(0, MAX))}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          placeholder="Make your argument… (Enter to send, Shift+Enter for newline)"
          className="resize-none rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-base leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
        />
        <div className="flex items-center justify-between gap-3">
          <span
            className={`text-xs font-mono tabular-nums ${
              nearLimit ? "text-red-400" : "text-zinc-500"
            }`}
          >
            {value.length}/{MAX}
          </span>
          <button
            type="button"
            disabled={disabled || !value.trim()}
            onClick={onSubmit}
            className="cursor-pointer rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-900/20 transition-all hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none disabled:hover:scale-100"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
