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
- Current and relevant to real events happening in the world right now
- Diverse: mix geopolitics, technology, economics, science, society
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
    "US tariffs on Chinese imports do more harm than good to American consumers",
    "AI-generated content should require mandatory disclosure labels",
    "NATO should extend membership to Ukraine before the conflict ends",
    "Social media platforms bear legal responsibility for radicalization on their sites",
    "Central banks should adopt digital currencies to replace physical cash",
    "Space colonization is a moral imperative for humanity's survival",
    "Universal basic income would reduce poverty without harming work incentives",
    "Nuclear energy is essential for achieving net-zero carbon emissions by 2050",
    "The UN Security Council veto power should be abolished",
    "Autonomous weapons should be banned under international law",
  ];

  return NextResponse.json({ topics: fallback, cached: false });
}
