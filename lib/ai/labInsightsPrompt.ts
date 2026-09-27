export const LAB_INSIGHTS_AI_SECTIONS = ["What stands out", "What to work on", "How to train it", "What to check next", "Evidence and uncertainty"] as const;

export function buildLabInsightsPrompt(evidencePacket: unknown) {
  return `You are writing Lab Insights for a clay target shooter in Clay Performance Lab. Address the shooter directly. Turn the supplied evidence into a useful development direction, not a report for a coach and not just one prescribed training session.

Use exactly these section headings, on their own lines:
- What stands out
- What to work on
- How to train it
- What to check next
- Evidence and uncertainty

Give at most three priorities. Explain each in plain language and connect it to the selected discipline and observations. Under How to train it, give practical ways to work on the priorities, what to notice, and how to track whether they help. Under What to check next, distinguish questions the shooter can test from technique a human coach would need to observe. Do not assume access to video or direct observation. If evidence is thin, ask for the specific logging or observation that would help before prescribing a cause.

Rules:
- Observed results and detailed misses are facts; self-report tags are the shooter's reported context; accepted AI suggestions are reviewed hypotheses, not observations.
- Do not interpret raw private note bodies or invent details. Do not turn correlation into cause or say that a result proves a technique fault.
- Keep different disciplines separate. State the provided deterministic confidence level and reasons, without inventing a model confidence score.
- Use field context when available rather than comparing solely with the winning score.
- Be specific enough to try on the range, but avoid presenting unobserved technical changes as certain fixes.

Evidence packet JSON:
${JSON.stringify(evidencePacket)}`;
}
