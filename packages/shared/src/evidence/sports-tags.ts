import type { EvidenceItemInput, SportsEvidenceTag } from "../types";

const SPORTS_EVIDENCE_TAG_SET: ReadonlySet<SportsEvidenceTag> = new Set([
  "form_stats",
  "injury_lineup",
  "fixture_context",
  "head_to_head",
  "standings",
  "tactical_news",
  "market_odds",
]);

function metadataTags(item: EvidenceItemInput): unknown {
  const metadata = item.metadata || {};
  return metadata.evidenceTags ?? metadata.sportsEvidenceTags ?? metadata.evidenceTag ?? metadata.sportsEvidenceTag;
}

export function normalizeSportsEvidenceTags(value: unknown): SportsEvidenceTag[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  const tags = raw
    .map((tag) => String(tag).trim().toLowerCase())
    .filter((tag): tag is SportsEvidenceTag => SPORTS_EVIDENCE_TAG_SET.has(tag as SportsEvidenceTag));
  return [...new Set(tags)];
}

export function explicitSportsEvidenceTagsForItem(item: EvidenceItemInput): SportsEvidenceTag[] {
  return normalizeSportsEvidenceTags(metadataTags(item));
}

export function inferSportsEvidenceTagsFromText(text: string): SportsEvidenceTag[] {
  const lower = text.toLowerCase();
  const tags: SportsEvidenceTag[] = [];

  if (/\b(stats?|form|xg|expected goals?|shots?|shooting|wins?|losses|draws?|goals? for|goals? against|record|recent results?)\b/.test(lower)) tags.push("form_stats");
  if (/\b(h2h|head[- ]to[- ]head|meetings?|previous matches|history)\b/.test(lower)) tags.push("head_to_head");
  if (/\b(injur(?:y|ies|ed)|suspension|suspended|lineups?|starters?|roster|bench|active|available|unavailable|fitness|fatigue|rotation)\b/.test(lower)) tags.push("injury_lineup");
  if (/\b(fixtures?|kickoff|kick-off|venue|stadium|home|away|league|round|tournament|match date|event date)\b/.test(lower)) tags.push("fixture_context");
  if (/\b(standings?|table|rank|points|goal difference|goals difference|position)\b/.test(lower)) tags.push("standings");
  if (/\b(tactic|formation|manager|coach|pressing|low block|high line|playstyle|weather|pitch|referee|style|transition|possession|news)\b/.test(lower)) tags.push("tactical_news");
  if (/\b(odds|price|spread|volume|liquidity|moneyline|bookmaker|book|polymarket|market-implied|implied probability|bps)\b/.test(lower)) tags.push("market_odds");

  return [...new Set(tags)];
}

export function sportsEvidenceTagsForItem(item: EvidenceItemInput): SportsEvidenceTag[] {
  const explicit = explicitSportsEvidenceTagsForItem(item);
  if (explicit.length > 0) return explicit;
  return inferSportsEvidenceTagsFromText(`${item.title} ${item.excerpt}`);
}

export function hasSportsEvidenceTag(item: EvidenceItemInput, allowedTags: readonly SportsEvidenceTag[]): boolean {
  const tags = sportsEvidenceTagsForItem(item);
  return tags.some((tag) => allowedTags.includes(tag));
}

export function mergeSportsEvidenceTags(...tagGroups: Array<readonly SportsEvidenceTag[] | undefined>): SportsEvidenceTag[] {
  return [...new Set(tagGroups.flatMap((tags) => tags || []))];
}
