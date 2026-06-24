export type ChokeStandardDesignation = {
  value: string;
  name: string;
  abbreviation?: string;
  alternateAbbreviation?: string;
  fraction?: string;
};

export const OTHER_CUSTOM = "Other / Custom";

export const SHOTGUN_MODELS_BY_MANUFACTURER: Record<string, string[]> = {
  Beretta: ["686 Silver Pigeon", "687 Silver Pigeon", "690", "691", "692", "693", "694", "DT10", "DT11", "A300", "A400 Xcel", "A400 Xtreme", "AL391"],
  Browning: ["B525", "B725", "Ultra XS", "Cynergy", "Maxus", "Maxus 2", "A5"],
  Blaser: ["F3", "F16", "FBX"],
  Benelli: ["828U", "828U Sport", "SuperSport", "M2", "Ethos", "Raffaello", "Montefeltro"],
  Perazzi: ["MX8", "MX2000", "High Tech", "High Tech S", "HTS", "SC3"],
  Krieghoff: ["K-80", "K-20", "KX-6"],
  Miroku: ["MK38", "MK60", "MK70", "3800"],
  "Caesar Guerini": ["Invictus", "Summit", "Magnus", "Tempio"],
  Zoli: ["Z-Sport", "Z-Trap", "Columbus"],
  Fabarm: ["Axis RS 12", "Elos N2", "XLR5"],
  Rizzini: ["BR460", "BR110"],
  Kolar: ["Max"],
  Kemen: ["KM4"],
  Winchester: ["Select", "SX4", "SXP"],
  Remington: ["1100", "11-87", "870", "V3", "Versa Max"],
  Franchi: ["Affinity", "Instinct"],
  Stoeger: ["M3000", "M3500", "Condor"],
  Mossberg: ["500", "930", "940"],
  "ATA Arms": ["SP", "Venza"],
  Yildiz: ["Pro", "SPZ"],
  Fausti: [],
  Breda: [],
  Marocchi: [],
  Merkel: [],
  Chapuis: [],
  "Renato Gamba": [],
  Longthorne: [],
  Kofs: [],
};

export const SHOTGUN_MANUFACTURERS = [...Object.keys(SHOTGUN_MODELS_BY_MANUFACTURER), OTHER_CUSTOM];

export const CHOKE_MANUFACTURERS = [
  "Beretta", "Browning", "Blaser", "Benelli", "Perazzi", "Krieghoff", "Miroku", "Caesar Guerini", "Zoli", "Fabarm",
  "Briley", "Teague", "Muller", "Gemini", "Carlson’s", "Comp-N-Choke", "Kick’s", "Patternmaster", "Trulock", "Rhino", OTHER_CUSTOM,
];

export const CHOKE_SYSTEMS_BY_MANUFACTURER: Record<string, string[]> = {
  Beretta: ["Mobilchoke", "Optima-Choke", "Optima-Choke Plus", "Optima-Choke HP"],
  Browning: ["Invector", "Invector Plus", "Invector DS"],
  Miroku: ["Invector", "Invector Plus"],
  Benelli: ["Mobil", "Crio", "Crio Plus"],
  Winchester: ["Win-Choke", "Invector Plus"],
};

export const GAUGE_OPTIONS = ["12 gauge", "16 gauge", "20 gauge", "28 gauge", ".410 bore", OTHER_CUSTOM];

export const STANDARD_CHOKE_DESIGNATIONS: ChokeStandardDesignation[] = [
  { value: "cylinder", name: "Cylinder", abbreviation: "C", alternateAbbreviation: "CYL", fraction: "0" },
  { value: "skeet", name: "Skeet", abbreviation: "SK", fraction: "1/8" },
  { value: "improved_cylinder", name: "Improved Cylinder", abbreviation: "IC", fraction: "1/4" },
  { value: "light_modified", name: "Light Modified", abbreviation: "LM", fraction: "3/8" },
  { value: "modified", name: "Modified", abbreviation: "M", fraction: "1/2" },
  { value: "intermediate", name: "Intermediate", fraction: "5/8" },
  { value: "improved_modified", name: "Improved Modified", abbreviation: "IM", fraction: "3/4" },
  { value: "light_full", name: "Light Full", abbreviation: "LF", fraction: "7/8" },
  { value: "full", name: "Full", abbreviation: "F", fraction: "1/1" },
  { value: "extra_full", name: "Extra Full", abbreviation: "XF" },
  { value: "spreader_diffusion", name: "Spreader / Diffusion" },
  { value: "other_custom", name: OTHER_CUSTOM },
];

export function normalizeGauge(value: string | null | undefined) {
  const raw = (value || "").trim();
  const compact = raw.toLowerCase().replace(/[\s.-]/g, "");
  if (["12", "12g", "12ga", "12gauge"].includes(compact)) return "12 gauge";
  if (["16", "16g", "16ga", "16gauge"].includes(compact)) return "16 gauge";
  if (["20", "20g", "20ga", "20gauge"].includes(compact)) return "20 gauge";
  if (["28", "28g", "28ga", "28gauge"].includes(compact)) return "28 gauge";
  if (["410", "410bore", "410ga", "410gauge"].includes(compact)) return ".410 bore";
  return raw;
}

export function chokeDesignationByValue(value: string | null | undefined) {
  return STANDARD_CHOKE_DESIGNATIONS.find((item) => item.value === value) || null;
}

export function chokeDesignationLabel(value: string | null | undefined, fallback?: string | null) {
  const designation = chokeDesignationByValue(value);
  if (!designation) return fallback || "Custom";
  return designation.fraction ? `${designation.name} · ${designation.fraction}` : designation.name;
}

export function chokeValueFromLegacyLabel(label: string | null | undefined) {
  const normalized = (label || "").trim().toLowerCase().replace(/\s+/g, " ");
  const aliases: Record<string, string> = {
    c: "cylinder", cyl: "cylinder", cylinder: "cylinder", "0": "cylinder",
    sk: "skeet", skeet: "skeet", "1/8": "skeet",
    ic: "improved_cylinder", "improved cylinder": "improved_cylinder", "1/4": "improved_cylinder", quarter: "improved_cylinder",
    lm: "light_modified", "light modified": "light_modified", "3/8": "light_modified",
    m: "modified", mod: "modified", modified: "modified", "1/2": "modified", half: "modified",
    intermediate: "intermediate", "5/8": "intermediate",
    im: "improved_modified", "improved modified": "improved_modified", "3/4": "improved_modified",
    lf: "light_full", "light full": "light_full", "7/8": "light_full",
    f: "full", full: "full", "1/1": "full",
    xf: "extra_full", "extra full": "extra_full",
    spreader: "spreader_diffusion", diffusion: "spreader_diffusion", "spreader / diffusion": "spreader_diffusion",
  };
  return aliases[normalized] || null;
}
