import type { FactCheck } from "@/lib/types";

/**
 * Cap the model "relevance" score when fact statuses contradict a high rating.
 * Field name stays `relevance` in JSON for API compatibility; UI shows X/100.
 */
export function clampFactcheckArgumentScore(fc: FactCheck): FactCheck {
  const { facts } = fc;
  if (facts.length === 0) return fc;

  const n = facts.length;
  const falseCount = facts.filter((f) => f.status === "false").length;
  const verifiedCount = facts.filter((f) => f.status === "verified").length;

  let cap = 100;
  if (falseCount === n) cap = 22;
  else if (falseCount > 0) cap = 45;
  else if (verifiedCount === 0) cap = 40;
  else if (verifiedCount < n) cap = 72;

  const next = Math.min(fc.relevance, cap);
  if (next === fc.relevance) return fc;
  return { ...fc, relevance: next };
}
