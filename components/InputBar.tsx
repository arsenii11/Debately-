"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadVoiceInputLang,
  resolveSpeechRecognitionLang,
} from "@/lib/voiceInputLocale";

const MAX = 1500;

type SpeechRecognitionResultItem = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: SpeechRecognitionResultItem;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};

type SpeechRecognitionErrorEventLike = {
  error: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

type WritingHint = {
  label: string;
  insert: string;
};

function MicrophoneIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="-3 0 19 19"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M11.665 7.915v1.31a5.257 5.257 0 0 1-1.514 3.694 5.174 5.174 0 0 1-1.641 1.126 5.04 5.04 0 0 1-1.456.384v1.899h2.312a.554.554 0 0 1 0 1.108H3.634a.554.554 0 0 1 0-1.108h2.312v-1.899a5.045 5.045 0 0 1-1.456-.384 5.174 5.174 0 0 1-1.641-1.126 5.257 5.257 0 0 1-1.514-3.695v-1.31a.554.554 0 1 1 1.109 0v1.31a4.131 4.131 0 0 0 1.195 2.917 3.989 3.989 0 0 0 5.722 0 4.133 4.133 0 0 0 1.195-2.917v-1.31a.554.554 0 1 1 1.109 0zM3.77 10.37a2.875 2.875 0 0 1-.233-1.146V4.738A2.905 2.905 0 0 1 3.77 3.58a3 3 0 0 1 1.59-1.59 2.902 2.902 0 0 1 1.158-.233 2.865 2.865 0 0 1 1.152.233 2.977 2.977 0 0 1 1.793 2.748l-.012 4.487a2.958 2.958 0 0 1-.856 2.09 3.025 3.025 0 0 1-.937.634 2.865 2.865 0 0 1-1.152.233 2.905 2.905 0 0 1-1.158-.233A2.957 2.957 0 0 1 3.77 10.37z" />
    </svg>
  );
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function appendTranscript(base: string, transcript: string): string {
  const trimmedTranscript = transcript.trim();
  if (!trimmedTranscript) return base.slice(0, MAX);
  const separator = base.trim().length > 0 && !/\s$/.test(base) ? " " : "";
  return `${base}${separator}${trimmedTranscript}`.slice(0, MAX);
}

function appendHint(base: string, hint: string): string {
  const separator = base.trim().length > 0 && !/\s$/.test(base) ? " " : "";
  return `${base}${separator}${hint}`.slice(0, MAX);
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getWritingHints(text: string): WritingHint[] {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const hints: WritingHint[] = [];

  if (!trimmed) {
    return [
      { label: "State your position", insert: "I argue that " },
      { label: "Add a reason", insert: "because " },
      { label: "Give an example", insert: "For example, " },
    ];
  }

  if (countWords(trimmed) < 25) {
    hints.push({ label: "Make it fuller", insert: "because " });
  }
  if (!/\b(because|since|therefore|so|потому|поэтому|так как)\b/i.test(lower)) {
    hints.push({ label: "Explain why", insert: "because " });
  }
  if (!/\b(for example|example|evidence|data|study|например|пример|данн)\b/i.test(lower)) {
    hints.push({ label: "Add evidence", insert: "For example, " });
  }
  if (!/\b(however|but|although|tradeoff|risk|но|однако|зато|риск)\b/i.test(lower)) {
    hints.push({ label: "Mention tradeoff", insert: "However, " });
  }

  return hints.slice(0, 3);
}

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  onFocus?: () => void;
  /** End debate early; judge verdict with player conceding. */
  onSurrender?: () => void;
  /** Multiplayer-only: request a one-shot AI hint for this turn. */
  onRequestAIHint?: () => Promise<string | null> | string | null;
  aiHintDisabled?: boolean;
  aiHintBusy?: boolean;
};

export function InputBar({
  value,
  onChange,
  onSubmit,
  disabled,
  onFocus,
  onSurrender,
  onRequestAIHint,
  aiHintDisabled,
  aiHintBusy,
}: Props) {
  const pct = (value.length / MAX) * 100;
  const nearLimit = pct > 90;
  const writingHints = useMemo(() => getWritingHints(value), [value]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseTextRef = useRef("");
  const finalTranscriptRef = useRef("");
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [listeningLangTag, setListeningLangTag] = useState<string | null>(null);
  const [aiHint, setAiHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv || !shellRef.current) return;
    const apply = () => {
      const el = shellRef.current;
      if (!el) return;
      const overlap = Math.max(
        0,
        window.innerHeight - vv.height - vv.offsetTop,
      );
      el.style.paddingBottom = `calc(0.75rem + env(safe-area-inset-bottom) + ${overlap}px)`;
    };
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    apply();
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      if (shellRef.current) shellRef.current.style.paddingBottom = "";
    };
  }, []);

  useEffect(() => {
    setVoiceSupported(Boolean(getSpeechRecognitionCtor()));
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!disabled && value.trim()) onSubmit();
      }
    },
    [disabled, onSubmit, value],
  );

  const stopVoiceInput = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const startVoiceInput = useCallback(() => {
    const Recognition = getSpeechRecognitionCtor();
    if (!Recognition || disabled) return;

    recognitionRef.current?.abort();
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    baseTextRef.current = value;
    finalTranscriptRef.current = "";
    setVoiceError(null);

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    const lang = resolveSpeechRecognitionLang(loadVoiceInputLang());
    recognition.lang = lang;
    setListeningLangTag(lang);

    recognition.onresult = (event) => {
      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result?.[0]?.transcript ?? "";
        if (result?.isFinal) {
          finalTranscriptRef.current = `${finalTranscriptRef.current} ${transcript}`.trim();
        } else {
          interimTranscript += transcript;
        }
      }

      const transcript = `${finalTranscriptRef.current} ${interimTranscript}`.trim();
      onChange(appendTranscript(baseTextRef.current, transcript));
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setVoiceError("Microphone access is blocked.");
      } else if (event.error !== "no-speech") {
        setVoiceError("Could not transcribe voice input.");
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      setListeningLangTag(null);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
      setIsListening(true);
    } catch {
      recognitionRef.current = null;
      setIsListening(false);
      setListeningLangTag(null);
      setVoiceError("Could not start voice input.");
    }
  }, [disabled, onChange, value]);

  const toggleVoiceInput = useCallback(() => {
    if (isListening) {
      stopVoiceInput();
      return;
    }
    startVoiceInput();
  }, [isListening, startVoiceInput, stopVoiceInput]);

  const applyWritingHint = useCallback(
    (hint: WritingHint) => {
      onChange(appendHint(value, hint.insert));
    },
    [onChange, value],
  );

  const handleRequestHint = useCallback(async () => {
    if (!onRequestAIHint || hintLoading) return;
    setHintLoading(true);
    try {
      const result = await onRequestAIHint();
      if (typeof result === "string" && result.trim()) {
        setAiHint(result.trim());
      }
    } finally {
      setHintLoading(false);
    }
  }, [hintLoading, onRequestAIHint]);

  const dismissHint = useCallback(() => setAiHint(null), []);

  const handleTextareaFocus = useCallback(() => {
    onFocus?.();
    requestAnimationFrame(() => {
      textareaRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    });
  }, [onFocus]);

  return (
    <div
      ref={shellRef}
      className="min-w-0 max-w-full overflow-x-hidden border-t border-zinc-800 bg-zinc-950/95 px-3 py-3 backdrop-blur sm:px-4"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex min-w-0 max-w-3xl flex-col gap-2">
        <div className="relative">
          <textarea
            ref={textareaRef}
            rows={3}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value.slice(0, MAX))}
            onFocus={handleTextareaFocus}
            onKeyDown={onKeyDown}
            placeholder="Make your argument… (Enter to send, Shift+Enter for newline)"
            className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-3 pr-14 text-base leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
          />
          {voiceSupported ? (
            <button
              type="button"
              disabled={disabled}
              onClick={toggleVoiceInput}
              aria-pressed={isListening}
              aria-label={isListening ? "Stop voice input" : "Start voice input"}
              title={isListening ? "Stop voice input" : "Start voice input"}
              className={`absolute right-3 top-3 flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border transition-all active:scale-[0.96] disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-zinc-900/50 disabled:text-zinc-600 disabled:hover:scale-100 ${
                isListening
                  ? "border-rose-400/70 bg-rose-500/15 text-rose-100 shadow-md shadow-rose-950/30"
                  : "border-zinc-700 bg-zinc-950/70 text-zinc-300 hover:border-indigo-500/60 hover:bg-indigo-950/35 hover:text-indigo-100"
              }`}
            >
              <MicrophoneIcon className="h-5 w-5" />
            </button>
          ) : null}
        </div>
        {!disabled && writingHints.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-zinc-500">Try:</span>
            {writingHints.map((hint) => (
              <button
                key={hint.label}
                type="button"
                onClick={() => applyWritingHint(hint)}
                className="cursor-pointer rounded-full border border-zinc-700 bg-zinc-900/70 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-indigo-500/60 hover:bg-indigo-950/35 hover:text-indigo-100 active:scale-[0.98]"
              >
                {hint.label}
              </button>
            ))}
            {onRequestAIHint ? (
              <button
                type="button"
                onClick={handleRequestHint}
                disabled={
                  disabled ||
                  hintLoading ||
                  Boolean(aiHintBusy) ||
                  Boolean(aiHintDisabled)
                }
                className="cursor-pointer rounded-full border border-indigo-500/50 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition-colors hover:border-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {hintLoading ? "Thinking…" : "AI hint"}
              </button>
            ) : null}
          </div>
        ) : null}
        {aiHint ? (
          <div className="rounded-lg border border-indigo-500/40 bg-indigo-950/40 p-3 text-xs text-indigo-100">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-300">
                AI hint
              </span>
              <button
                type="button"
                onClick={dismissHint}
                className="cursor-pointer text-[10px] font-semibold text-indigo-300 hover:text-white"
              >
                Dismiss
              </button>
            </div>
            <pre className="mt-2 max-w-full whitespace-pre-wrap break-words font-sans text-xs leading-relaxed [overflow-wrap:anywhere]">
              {aiHint}
            </pre>
          </div>
        ) : null}
        {voiceError ? (
          <p className="text-xs text-amber-300">{voiceError}</p>
        ) : isListening ? (
          <p className="text-xs text-indigo-300">
            Listening
            {listeningLangTag ? (
              <span className="font-mono text-indigo-200/90">
                {" "}
                ({listeningLangTag})
              </span>
            ) : null}
            … speak now, then tap the mic again when done.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {onSurrender ? (
              <button
                type="button"
                disabled={disabled}
                onClick={onSurrender}
                className="cursor-pointer rounded-xl border border-rose-600/50 bg-rose-950/40 px-4 py-2 text-sm font-semibold text-rose-200/95 transition-colors hover:border-rose-500 hover:bg-rose-950/70 hover:text-rose-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-zinc-900/50 disabled:text-zinc-600 disabled:hover:scale-100"
              >
                Concede
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
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
    </div>
  );
}
