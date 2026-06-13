import { formatKpiValue, formatNumber } from "@/lib/kpi/format";

type AiKpiInput = {
  actual: number;
  category: string;
  kpi: string;
  requiredPerWorkday100: number | null;
  runratePercent: number | null;
  status: string;
  target: number;
  valueType: "money" | "count" | "score";
};

type TodayImportantInput = {
  critical: AiKpiInput | null;
  portingsWithoutDate: number;
  remainingWorkdays: number;
  runnerUp?: AiKpiInput | null;
  shopName: string;
  topPerformer?: AiKpiInput | null;
};

type MorningBriefingInput = {
  dataCare: string;
  dslTvRatio: string | null;
  mobileRatio: string | null;
  rows: AiKpiInput[];
  shopName: string;
  todayLabel: string;
  workdays: {
    elapsedWorkdays: number;
    remainingWorkdays: number;
    totalWorkdays: number;
  };
};

export type DivaChatMessage = {
  content: string;
  role: "assistant" | "user";
};

type DivaResponseInput = {
  context: Record<string, unknown>;
  history?: DivaChatMessage[];
  question: string;
};

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4.1-mini";

export async function generateTodayImportantInsight(input: TodayImportantInput) {
  if (!shouldUseOpenAi()) {
    return null;
  }

  const prompt = [
    `Shop: ${input.shopName}`,
    `Rest-Arbeitstage: ${input.remainingWorkdays}`,
    `Portierungen ohne Datum: ${input.portingsWithoutDate}`,
    `Kritischster KPI: ${input.critical ? formatKpiForPrompt(input.critical) : "keiner"}`,
    `Zweiter KPI: ${input.runnerUp ? formatKpiForPrompt(input.runnerUp) : "keiner"}`,
    `Top Performer: ${input.topPerformer ? formatKpiForPrompt(input.topPerformer) : "keiner"}`,
    "",
    "Schreibe genau einen kurzen Management-Hinweis fuer den Dashboard-Bereich 'Heute wichtig'.",
    "Maximal 3 Saetze. Konkrete Handlung, kein BlaBla. Deutsch. Telekom-Shop-Kontext."
  ].join("\n");

  return callOpenAiText({
    input: prompt,
    instructions: TODAY_IMPORTANT_SYSTEM_PROMPT,
    maxOutputTokens: 220,
    timeoutMs: 3500
  });
}

export async function generateMorningBriefing(input: MorningBriefingInput) {
  if (!shouldUseOpenAi()) {
    return null;
  }

  const prompt = [
    `Shop: ${input.shopName}`,
    `Stand: ${input.todayLabel}`,
    `Arbeitstage: ${input.workdays.elapsedWorkdays}/${input.workdays.totalWorkdays}, Rest: ${input.workdays.remainingWorkdays}`,
    `DSL/TV Relation: ${input.dslTvRatio ?? "nicht belastbar"}`,
    `Mobilfunk-Mix: ${input.mobileRatio ?? "nicht belastbar"}`,
    `Datenpflege: ${input.dataCare}`,
    "",
    "KPI-Daten:",
    JSON.stringify(
      input.rows.map((row) => ({
        ist: formatKpiValue(row.actual, row.valueType),
        kategorie: row.category,
        kpi: row.kpi,
        proArbeitstagBis100: formatKpiValue(row.requiredPerWorkday100, row.valueType),
        runrateProzent: row.runratePercent === null ? null : `${formatNumber(row.runratePercent, 1)}%`,
        status: row.status,
        ziel: formatKpiValue(row.target, row.valueType)
      }))
    ),
    "",
    "Erstelle ein Morgenbriefing mit Tagesfokus, Risiken, positiven Signalen und konkreten Massnahmen."
  ].join("\n");

  return callOpenAiText({
    input: prompt,
    instructions: MORNING_BRIEFING_SYSTEM_PROMPT,
    maxOutputTokens: 520,
    timeoutMs: 6000
  });
}

export async function generateDivaResponse(input: DivaResponseInput) {
  if (!shouldUseOpenAi()) {
    return null;
  }

  const prompt = [
    "Aktueller Shop-/Quartalskontext als JSON:",
    JSON.stringify(input.context),
    "",
    input.history?.length
      ? `Bisheriger Chat:\n${input.history.slice(-8).map((message) => `${message.role}: ${message.content}`).join("\n")}`
      : "Bisheriger Chat: keiner",
    "",
    `Frage des Nutzers: ${input.question}`
  ].join("\n");

  return callOpenAiText({
    input: prompt,
    instructions: DIVA_SYSTEM_PROMPT,
    maxOutputTokens: 900,
    timeoutMs: 9000
  });
}

function shouldUseOpenAi() {
  return Boolean(process.env.OPENAI_API_KEY) && process.env.OPENAI_AI_DISABLED !== "true";
}

async function callOpenAiText({
  input,
  instructions,
  maxOutputTokens,
  timeoutMs
}: {
  input: string;
  instructions: string;
  maxOutputTokens: number;
  timeoutMs: number;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      body: JSON.stringify({
        input,
        instructions,
        max_output_tokens: maxOutputTokens,
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        store: false
      }),
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "content-type": "application/json"
      },
      method: "POST",
      signal: controller.signal
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return extractResponseText(data);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractResponseText(data: unknown) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const directText = "output_text" in data ? data.output_text : null;

  if (typeof directText === "string" && directText.trim()) {
    return directText.trim();
  }

  const output = "output" in data && Array.isArray(data.output) ? data.output : [];
  const parts: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object" || !("content" in item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (!content || typeof content !== "object") {
        continue;
      }

      if ("text" in content && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }

  const text = parts.join("\n").trim();
  return text || null;
}

function formatKpiForPrompt(row: AiKpiInput) {
  return [
    row.kpi,
    row.category,
    `Status ${row.status}`,
    `Ist ${formatKpiValue(row.actual, row.valueType)}`,
    `Ziel ${formatKpiValue(row.target, row.valueType)}`,
    `Runrate ${row.runratePercent === null ? "-" : `${formatNumber(row.runratePercent, 1)}%`}`,
    `Bedarf/Tag ${formatKpiValue(row.requiredPerWorkday100, row.valueType)}`
  ].join(" | ");
}

const TODAY_IMPORTANT_SYSTEM_PROMPT = [
  "Du bist ein knapper, analytischer Fuehrungsassistent fuer einen Telekom-Shop.",
  "Du schreibst fuer Shopleitung und Morgenrunde.",
  "Fokus: Quartalsziel erreichen, Runrate verstehen, konkrete Aktion fuer heute.",
  "Keine Floskeln. Keine langen Erklaerungen. Keine Kundendaten erfinden.",
  "Wenn Datenpflege unsicher ist, kurz daran erinnern."
].join(" ");

const MORNING_BRIEFING_SYSTEM_PROMPT = [
  "Du bist der analytische Fuehrungsassistent fuer einen Telekom-Shop.",
  "Sprich knapp, direkt und handlungsorientiert wie fuer eine Morgenrunde.",
  "Nutze MyProv, DWH, Qualitaet, tNPS, Runrate, Rest-Arbeitstage und Zielpfad.",
  "Erkenne auffaellige Mixe wie DSL zu TV, MF PK zu MF GK, Qualitaet zu Absatz oder starke Abweichungen zur Runrate.",
  "Gib konkrete Massnahmen: Fokus im Tagesbriefing, Verkaufsfrage, Training, Coaching oder Portierungs-/Nachfassaktion.",
  "Erinnere kurz an Datenpflege, wenn aktuelle Wochenwerte oder Staende fehlen koennten.",
  "Ausgabe: Tagesfokus, Lage, Auffaelligkeiten, Massnahmen, Datenpflege. Maximal 8 kurze Bulletpoints."
].join(" ");

const DIVA_SYSTEM_PROMPT = [
  "Du bist DiVA, der Digitale Vertriebsassistent fuer eine interne Telekom-Shop KPI-App.",
  "Du hilfst Shopleitung und Verkaeufern, Quartalsziele aktiv zu steuern.",
  "Analysiere nur die bereitgestellten Daten. Erfinde keine Umsaetze, Kunden, Aktionen, Events oder Personalgruende.",
  "Wenn eine Ursache nur eine Hypothese ist, markiere sie klar als Hypothese und nenne, welche Daten sie bestaetigen wuerden.",
  "Fokusbereiche: MyProv in Euro, DWH in Stueck, Qualitaet, tNPS, Kundenfrequenz, Conversion, Portierungen, Tarifmix, Zielerreichung, Runrate und Kalenderwochen.",
  "Achte besonders auf Verkaufsqualitaet: TV-zu-DSL-Verhaeltnis, MF- und GK-Mix, Provision je Abschluss, Portierungsbeitrag, DWH gegen Kundenfrequenz und starke Wochenabweichungen.",
  "Gib konkrete Handlungsempfehlungen fuer Morgenrunde, Coaching, Fokus-KPI, Nachfassaktionen und Datenpflege.",
  "Sprich direkt, knapp und professionell auf Deutsch. Keine langen Romane.",
  "Wenn die Daten lueckenhaft sind, sage das offen und schlage die sauberste Pflege vor.",
  "Keine sensiblen personenbezogenen Daten anfordern oder wiedergeben."
].join(" ");
