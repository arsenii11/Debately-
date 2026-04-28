"use client";

import { useLayoutEffect, useState } from "react";
import {
  loadVoiceInputLang,
  saveVoiceInputLang,
  VOICE_INPUT_LANG_OPTIONS,
  VOICE_LANG_AUTO,
} from "@/lib/voiceInputLocale";

type Props = {
  id?: string;
  className?: string;
};

export function VoiceInputLangSelect({ id = "voice-input-lang", className }: Props) {
  const [value, setValue] = useState<string>(VOICE_LANG_AUTO);

  useLayoutEffect(() => {
    setValue(loadVoiceInputLang());
  }, []);

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-semibold text-zinc-200"
      >
        Voice input language
      </label>
      <p className="mb-2 text-xs leading-relaxed text-zinc-500">
        Uses your browser&apos;s speech recognition.{" "}
        <span className="text-zinc-400">
          Auto follows the browser UI language; pick a language if recognition is wrong.
        </span>
      </p>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          saveVoiceInputLang(v);
        }}
        className="w-full rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-base text-zinc-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        {VOICE_INPUT_LANG_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
