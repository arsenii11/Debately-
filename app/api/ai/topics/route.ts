import { NextResponse } from "next/server";
import { generateGeminiText } from "@/lib/gemini";
import { extractBalancedJsonObject } from "@/lib/extractJson";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let cachedTopics: string[] | null = null;
let cachedAt = 0;

const TOPICS_SYSTEM = `You generate a JSON list of 10 debate topic suggestions. Output only a valid JSON object with key "topics" containing an array of 10 strings. No markdown, no extra text.`;

function buildTopicsPrompt(): string {
  const date = new Date().toISOString().slice(0, 10);
  return `Today is ${date}.

Generate exactly 10 debate topics as single-sentence statements (assertive claims, not questions).
Topics must be:
- Easy to understand in under a second for a casual first-time user
- Short, concrete, and low-jargon
- Fun to argue even without deep prior knowledge
- Diverse: mix everyday life, internet culture, work, technology, society, and a few current-events topics
- Avoid overly niche policy language, obscure geopolitics, or topics that require expert context
- Debatable: a reasonable person could argue FOR or AGAINST

Output format (JSON only, no markdown fencing):
{"topics": ["...", "...", ...]}`;
}

function parseTopics(raw: string): string[] | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const candidates = [extractBalancedJsonObject(cleaned), cleaned].filter(Boolean) as string[];

  for (const text of candidates) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        "topics" in parsed &&
        Array.isArray((parsed as { topics: unknown }).topics)
      ) {
        const topics = (parsed as { topics: unknown[] }).topics
          .map((t) => (typeof t === "string" ? t.trim() : ""))
          .filter((t) => t.length > 5);
        if (topics.length >= 5) return topics.slice(0, 10);
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function GET() {
  const now = Date.now();

  if (cachedTopics && now - cachedAt < CACHE_TTL_MS) {
    return NextResponse.json({ topics: cachedTopics, cached: true });
  }

  try {
    const raw = await generateGeminiText({
      systemInstruction: TOPICS_SYSTEM,
      userPrompt: buildTopicsPrompt(),
      maxOutputTokens: 600,
      responseMimeType: "application/json",
      temperature: 0.9,
      enableSearch: true,
    });

    const topics = parseTopics(raw);
    if (topics) {
      cachedTopics = topics;
      cachedAt = now;
      return NextResponse.json({ topics, cached: false });
    }
  } catch {
    /* fall through to fallback */
  }

  const fallback = [
    "Remote work is better than working from the office",
    "AI tools make students learn less",
    "Social media does more harm than good",
    "Streaming has made movies worse",
    "Universal basic income would improve society",
    "Video games should be treated like sports",
    "Online anonymity should be protected",
    "Nuclear energy is essential for the future",
    "Influencers should label edited photos",
    "Four-day workweeks should become the norm",
  ];

  return NextResponse.json({ topics: fallback, cached: false });
}
