import { NextResponse } from "next/server";
import { generateGeminiText } from "@/lib/gemini";
import { extractBalancedJsonObject } from "@/lib/extractJson";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type TopicCategory = {
  id: string;
  label: string;
  topics: string[];
};

let cachedCategories: TopicCategory[] | null = null;
let cachedAt = 0;

const CATEGORY_DEFS = [
  { id: "easy", label: "Easy" },
  { id: "fun", label: "Fun" },
  { id: "life", label: "Life" },
  { id: "tech", label: "Tech" },
  { id: "politics", label: "Politics" },
] as const;

const TOPICS_SYSTEM = `You generate debate topic suggestions grouped by category. Output only a valid JSON object. No markdown, no extra text.`;

function buildTopicsPrompt(): string {
  const date = new Date().toISOString().slice(0, 10);
  return `Today is ${date}. Use web search to find what is happening in the world right now.

Generate 4 debate topics for each of the following 5 categories. Every topic must be:
- A single assertive statement (not a question)
- Debatable: a reasonable person can argue FOR or AGAINST
- Short and concrete, no jargon

Category guidelines:
- Easy: everyday life topics anyone can argue without prior knowledge (remote work, social media, university, city vs country, etc.)
- Fun: light-hearted hot takes (animals, food, entertainment, sports, etc.)
- Life: society, work, habits, relationships, values (4-day week, phone use, friendships, success, etc.)
- Tech: technology, AI, internet, social platforms — include something relevant to today's headlines
- Politics: current geopolitics, governance, international affairs — use today's news to pick specific relevant topics

Output format (JSON only, no markdown):
{"categories":[
  {"id":"easy","label":"Easy","topics":["...","...","...","..."]},
  {"id":"fun","label":"Fun","topics":["...","...","...","..."]},
  {"id":"life","label":"Life","topics":["...","...","...","..."]},
  {"id":"tech","label":"Tech","topics":["...","...","...","..."]},
  {"id":"politics","label":"Politics","topics":["...","...","...","..."]}
]}`;
}

function parseCategories(raw: string): TopicCategory[] | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const candidates = [extractBalancedJsonObject(cleaned), cleaned].filter(Boolean) as string[];

  for (const text of candidates) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("categories" in parsed) ||
        !Array.isArray((parsed as { categories: unknown }).categories)
      ) continue;

      const raw = (parsed as { categories: unknown[] }).categories;
      const categories: TopicCategory[] = [];

      for (const item of raw) {
        if (!item || typeof item !== "object") continue;
        const o = item as Record<string, unknown>;
        const id = typeof o.id === "string" ? o.id.trim() : "";
        const label = typeof o.label === "string" ? o.label.trim() : "";
        if (!id || !label || !Array.isArray(o.topics)) continue;

        const topics = (o.topics as unknown[])
          .map((t) => (typeof t === "string" ? t.trim() : ""))
          .filter((t) => t.length > 5);

        if (topics.length >= 2) categories.push({ id, label, topics: topics.slice(0, 4) });
      }

      if (categories.length >= 3) return categories;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

const FALLBACK_CATEGORIES: TopicCategory[] = [
  {
    id: "easy",
    label: "Easy",
    topics: [
      "Remote work is better than working from the office",
      "Social media does more harm than good",
      "University is worth the cost",
      "Living in a big city is better than in a small town",
    ],
  },
  {
    id: "fun",
    label: "Fun",
    topics: [
      "Cats are better pets than dogs",
      "Pineapple belongs on pizza",
      "Video games are a better hobby than watching TV",
      "Spoilers ruin movies completely",
    ],
  },
  {
    id: "life",
    label: "Life",
    topics: [
      "A four-day workweek should become the norm",
      "Online friendships can be as real as offline ones",
      "Success depends more on discipline than talent",
      "People should be allowed to use phones less at school",
    ],
  },
  {
    id: "tech",
    label: "Tech",
    topics: [
      "AI tools make students learn less",
      "Online anonymity should be protected",
      "Influencers should label AI-generated content",
      "Streaming has made movies worse",
    ],
  },
  {
    id: "politics",
    label: "Politics",
    topics: [
      "NATO should extend membership to Ukraine",
      "The UN Security Council veto power should be abolished",
      "Sanctions are an effective tool of foreign policy",
      "Social media platforms bear legal responsibility for political radicalization",
    ],
  },
];

export async function GET() {
  const now = Date.now();

  if (cachedCategories && now - cachedAt < CACHE_TTL_MS) {
    return NextResponse.json({ categories: cachedCategories, cached: true });
  }

  try {
    const raw = await generateGeminiText({
      systemInstruction: TOPICS_SYSTEM,
      userPrompt: buildTopicsPrompt(),
      maxOutputTokens: 900,
      responseMimeType: "application/json",
      temperature: 0.85,
      enableSearch: true,
    });

    const categories = parseCategories(raw);
    if (categories) {
      cachedCategories = categories;
      cachedAt = now;
      return NextResponse.json({ categories, cached: false });
    }
  } catch {
    /* fall through to fallback */
  }

  return NextResponse.json({ categories: FALLBACK_CATEGORIES, cached: false });
}
