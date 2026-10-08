import { LAB_INSIGHTS_AI_SECTIONS } from "./labInsightsPrompt";

export type LabInsightCard = { title: typeof LAB_INSIGHTS_AI_SECTIONS[number]; items: string[] };
export type LabInsightsResult = { mainFocus: string; cards: LabInsightCard[] };

export const labInsightsJsonSchema = {
  type: "object", additionalProperties: false, required: ["mainFocus", "cards"],
  properties: {
    mainFocus: { type: "string", description: "One short, evidence-supported priority, or the specific observation needed when evidence is too thin. Maximum 140 characters." },
    cards: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "items"], properties: {
      title: { type: "string", enum: [...LAB_INSIGHTS_AI_SECTIONS] },
      items: { type: "array", items: { type: "string" } },
    } } },
  },
};

function boundedString(value: unknown, limit: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > limit) throw new Error("Invalid insight text");
  return value.trim();
}

export function validateLabInsightsResult(value: unknown): LabInsightsResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid insight result");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["mainFocus", "cards"].includes(key))) throw new Error("Unexpected insight fields");
  const mainFocus = boundedString(input.mainFocus, 140);
  if (!Array.isArray(input.cards) || input.cards.length !== LAB_INSIGHTS_AI_SECTIONS.length) throw new Error("Incomplete insight result");
  const seen = new Set<string>();
  const cards: LabInsightCard[] = input.cards.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid insight card");
    const card = value as Record<string, unknown>;
    if (Object.keys(card).some((key) => !["title", "items"].includes(key))) throw new Error("Unexpected card fields");
    if (typeof card.title !== "string" || !LAB_INSIGHTS_AI_SECTIONS.includes(card.title as LabInsightCard["title"]) || seen.has(card.title)) throw new Error("Invalid or duplicate insight heading");
    if (!Array.isArray(card.items) || !card.items.length || card.items.length > 6) throw new Error("Invalid insight items");
    seen.add(card.title);
    return { title: card.title as LabInsightCard["title"], items: card.items.map((item) => boundedString(item, 1600)) };
  });
  cards.sort((a, b) => LAB_INSIGHTS_AI_SECTIONS.indexOf(a.title) - LAB_INSIGHTS_AI_SECTIONS.indexOf(b.title));
  if (JSON.stringify({ mainFocus, cards }).length > 12_000) throw new Error("Insight result too long");
  return { mainFocus, cards };
}

export function labInsightsPlainText(result: LabInsightsResult) {
  return [`Your next focus\n${result.mainFocus}`, ...result.cards.map((card) => `${card.title}\n${card.items.map((item) => `- ${item}`).join("\n")}`)].join("\n\n");
}
