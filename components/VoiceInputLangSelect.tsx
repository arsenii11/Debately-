"use client";

import { useLayoutEffect, useState } from "react";
import {
  loadTranscribeBackend,
  loadVoiceInputLang,
  saveTranscribeBackend,
  saveVoiceInputLang,
  TRANSCRIBE_BACKEND_OPTIONS,
  type TranscribeBackend,
  VOICE_INPUT_LANG_OPTIONS,
  VOICE_LANG_AUTO,
} from "@/lib/voiceInputLocale";

type Props = {
  idPrefix?: string;
  className?: string;
};

export function VoiceInputLangSelect({
  idPrefix = "voice-settings",
  className,
}: Props) {
  const [backend, setBackend] = useState<TranscribeBackend>("gemini");
  const [lang, setLang] = useState<string>(VOICE_LANG_AUTO);

  useLayoutEffect(() => {
    setBackend(loadTranscribeBackend());
    setLang(loadVoiceInputLang());
  }, []);

  return (
    <div className={`flex flex-col gap-5 ${className ?? ""}`}>
      <div>
        <label
          htmlFor={`${idPrefix}-transcribe`}
          className="mb-1.5 block text-sm font-semibold text-zinc-200"
        >
          Voice transcription
        </label>
        <p className="mb-2 text-xs leading-relaxed text-zinc-500">
          <span className="text-zinc-400">
            Cloud uses Gemini on our servers (costs API usage). Browser mode is
            local only and depends on your browser languages.
          </span>
        </p>
        <select
          id={`${idPrefix}-transcribe`}
          value={backend}
          onChange={(e) => {
            const v = e.target.value as TranscribeBackend;
            setBackend(v);
            saveTranscribeBackend(v);
          }}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-base text-zinc-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {TRANSCRIBE_BACKEND_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-lang`}
          className="mb-1.5 block text-sm font-semibold text-zinc-200"
        >
          {backend === "gemini"
            ? "Language hint (optional)"
            : "Voice input language"}
        </label>
        <p className="mb-2 text-xs leading-relaxed text-zinc-500">
          {backend === "gemini" ? (
            <>
              Gemini infers the spoken language automatically. Use Auto or pick
              a locale if mixed-language clips are misheard.
            </>
          ) : (
            <>
              Uses the browser speech engine. Auto follows the UI language; pick
              a language if recognition is wrong.
            </>
          )}
        </p>
        <select
          id={`${idPrefix}-lang`}
          value={lang}
          onChange={(e) => {
            const v = e.target.value;
            setLang(v);
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
    </div>
  );
}
