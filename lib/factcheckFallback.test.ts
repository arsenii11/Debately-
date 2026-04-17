import { describe, expect, it } from "vitest";
import {
  isFactcheckFallback,
  parseFactcheckJson,
} from "@/lib/factcheckFallback";

describe("parseFactcheckJson", () => {
  it("salvages duplicated/truncated fenced JSON from judge output", () => {
    const raw = `\`\`\`json
{
 "facts": [
  {
   "claim": "Эти системы вредят путешественникам, отсекают экономных, не снижают уровень реальных рисков.",
   "status": "disputed",
   "\`\`\`json
{
 "facts": [
  {
   "claim": "Эти системы вредят путешественникам, отсекают экономных, не снижают уровень реальных рисков.",
   "status": "disputed",
   "
`;

    const parsed = parseFactcheckJson(raw);
    expect(isFactcheckFallback(parsed)).toBe(false);
    expect(parsed.facts.length).toBeGreaterThan(0);
    expect(parsed.facts[0]?.claim).toContain("Эти системы вредят путешественникам");
    expect(parsed.facts[0]?.status).toBe("disputed");
  });

  it("recovers claim+status even when comment is missing", () => {
    const raw = `{
      "facts":[
        {"claim":"Claim A","status":"verified"},
        {"claim":"Claim B","status":"false"}
      ],
      "relevance": 77
    }`;

    const parsed = parseFactcheckJson(raw);
    expect(isFactcheckFallback(parsed)).toBe(false);
    expect(parsed.facts).toEqual([
      { claim: "Claim A", status: "verified", comment: "" },
      { claim: "Claim B", status: "false", comment: "" },
    ]);
    expect(parsed.relevance).toBe(77);
  });

  it("keeps parsing normal fenced JSON with cite markers", () => {
    const raw = `\`\`\`json
{
  "facts": [
    {
      "claim": "A [cite: 1, 2]",
      "status": "verified",
      "comment": "B [cite: 9]"
    }
  ],
  "relevance": 85,
  "flags": [],
  "flag_details": []
}
\`\`\``;

    const parsed = parseFactcheckJson(raw);
    expect(isFactcheckFallback(parsed)).toBe(false);
    expect(parsed.facts[0]?.claim).toBe("A");
    expect(parsed.facts[0]?.comment).toBe("B");
  });

  it("strips injected fenced-json tail from comment text", () => {
    const raw = `\`\`\`json
{
  "facts": [
    {
      "claim": "Стоимость ESTA и ETIAS составляет 21-40 долларов.",
      "status": "verified",
      "comment": "Стоимость ESTA в настоящее время\`\`\`json\\n{"
    }
  ],
  "relevance": 50,
  "flags": [],
  "flag_details": []
}
\`\`\``;

    const parsed = parseFactcheckJson(raw);
    expect(isFactcheckFallback(parsed)).toBe(false);
    expect(parsed.facts[0]?.comment).toBe("Стоимость ESTA в настоящее время");
  });
});
