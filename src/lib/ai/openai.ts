import { formatKpiValue, formatNumber } from "@/lib/kpi/format";

export type AiKpiInput = {
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

type TeamMailDraftInput = {
  dataCare: string;
  dslTvRatio: string | null;
  focusRows: AiKpiInput[];
  mobileRatio: string | null;
  qualityRows: AiKpiInput[];
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
    "Maximal 3 Saetze. Konkrete Handlung, kein BlaBla. Deutsch. Telekom-Shop-Kontext.",
    "Wichtig: Verwende nie 'Mehrumsatz', 'Umsatz' oder 'Erloes'. Geldwerte sind Provisionen, Count-Werte sind Stueckzahlen oder Abschluesse, Score-Werte sind Qualitaet."
  ].join("\n");

  return callOpenAiText({
    input: prompt,
    instructions: TODAY_IMPORTANT_SYSTEM_PROMPT,
    maxOutputTokens: 140,
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
    maxOutputTokens: 320,
    timeoutMs: 6000
  });
}

export async function generateTeamMailDraft(input: TeamMailDraftInput) {
  if (!shouldUseOpenAi()) {
    return null;
  }

  const prompt = [
    `Shop: ${input.shopName}`,
    `Stand: ${input.todayLabel}`,
    `Arbeitstage: ${input.workdays.elapsedWorkdays}/${input.workdays.totalWorkdays}, Rest: ${input.workdays.remainingWorkdays}`,
    `DSL/TV Relation: ${input.dslTvRatio ?? "nicht belastbar"}`,
    `Mobilfunk-Mix: ${input.mobileRatio ?? "nicht belastbar"}`,
    `Datenpflege/Fleiss: ${input.dataCare}`,
    "",
    "Fokus-KPIs:",
    JSON.stringify(input.focusRows.map(formatMailKpiForPrompt)),
    "",
    "Qualitaets- und Fleissthemen:",
    JSON.stringify(input.qualityRows.map(formatMailKpiForPrompt)),
    "",
    "Schreibe daraus eine vorbereitete Morgenmail an das Team."
  ].join("\n");

  return callOpenAiText({
    input: prompt,
    instructions: TEAM_MAIL_SYSTEM_PROMPT,
    maxOutputTokens: 420,
    timeoutMs: 7000
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
    maxOutputTokens: 360,
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
    `Wertart ${valueTypeLabel(row.valueType)}`,
    `Status ${row.status}`,
    `Ist ${formatKpiValue(row.actual, row.valueType)}`,
    `Ziel ${formatKpiValue(row.target, row.valueType)}`,
    `Runrate ${row.runratePercent === null ? "-" : `${formatNumber(row.runratePercent, 1)}%`}`,
    `Bedarf/Tag ${formatKpiValue(row.requiredPerWorkday100, row.valueType)}`
  ].join(" | ");
}

function formatMailKpiForPrompt(row: AiKpiInput) {
  return {
    bedarfProArbeitstagBis100: formatKpiValue(row.requiredPerWorkday100, row.valueType),
    ist: formatKpiValue(row.actual, row.valueType),
    kategorie: row.category,
    kpi: row.kpi,
    runrateProzent: row.runratePercent === null ? null : `${formatNumber(row.runratePercent, 1)}%`,
    status: row.status,
    wertart: valueTypeLabel(row.valueType),
    ziel: formatKpiValue(row.target, row.valueType)
  };
}

function valueTypeLabel(valueType: "money" | "count" | "score") {
  if (valueType === "money") {
    return "Provision in EUR";
  }

  if (valueType === "count") {
    return "Stueckzahl/Abschluss";
  }

  return "Qualitaetswert/Score";
}

const TODAY_IMPORTANT_SYSTEM_PROMPT = [
  "Du bist DiVA, ein freundlicher, klarer Shop-Coach fuer einen Telekom-Shop.",
  "Schreibe locker, motivierend und alltagstauglich fuer Shopleitung und Morgenrunde.",
  "Fokus: Was ist heute wichtig, warum, und was ist die naechste konkrete Aktion?",
  "Maximal 2 kurze Saetze. Keine langen Erklaerungen. Keine erfundenen Daten.",
  "Verwende nie die Begriffe Mehrumsatz, Umsatz oder Erloes. Geldwerte heissen Provisionen, Count-Werte heissen Stueckzahlen oder Abschluesse.",
  "Wenn Daten fehlen, erinnere kurz und freundlich an Pflege."
].join(" ");

const MORNING_BRIEFING_SYSTEM_PROMPT = [
  "Du bist DiVA, ein freundlicher, pointierter Shop-Coach fuer einen Telekom-Shop.",
  "Sprich knapp, positiv und handlungsorientiert wie fuer eine echte Morgenrunde.",
  "Nutze MyProv, DWH, Qualitaet, tNPS, Runrate, Rest-Arbeitstage und Zielpfad.",
  "Erkenne nur die wichtigsten Auffaelligkeiten: Fokus-KPI, DSL/TV, MF-Mix, Qualitaet, Datenpflege.",
  "Gib maximal 5 kurze Bulletpoints: Fokus, Lage, Auffaelligkeit, Aktion, Pflegehinweis.",
  "Verwende nie die Begriffe Mehrumsatz, Umsatz oder Erloes. MyProv und EUR-Werte sind Provisionen, DWH/Count-Werte sind Stueckzahlen.",
  "Kein Roman, kein Consulting-Sprech, keine erfundenen Ursachen."
].join(" ");

const TEAM_MAIL_SYSTEM_PROMPT = [
  "Du schreibst eine vorbereitete Morgenmail fuer das Team eines Telekom-Shops.",
  "Ton: Team soll sich angesprochen fuehlen. Warm, motivierend und klar, aber nicht hart oder persoenlich vorwurfsvoll.",
  "Formatiere exakt so: erste Zeile 'Betreff: ...', dann eine Leerzeile, dann der Mailtext.",
  "Beginne den Mailtext mit 'Guten Morgen zusammen,'.",
  "Schreibe 5 bis 8 kurze Zeilen oder kurze Absaetze. Kein langer Bericht.",
  "Nenne den wichtigsten Fokus, ein klares Tagesziel oder Tagesverhalten und einen zweiten Blick.",
  "Packe Qualitaets- und Fleissthemen hinein: Datenpflege, aktuelle Wochenwerte, Portierungen ohne Datum, tNPS oder Qualitaets-KPIs, wenn sie in den Daten stehen.",
  "Wichtig: Verwende nie die Begriffe Mehrumsatz, Umsatz oder Erloes. Geldwerte sind Provisionen in EUR. Count-Werte sind Stueckzahlen oder Abschluesse. Score-Werte sind Qualitaet.",
  "Nutze nur die bereitgestellten Daten. Erfinde keine Aktionen, Personen, Kundentermine oder Ursachen.",
  "Ende mit einem kurzen gemeinsamen Abschluss, nicht mit einer Floskel aus dem Konzernsprech."
].join(" ");

const DIVA_SYSTEM_PROMPT = [
  "Du bist DiVA, der Digitale Vertriebsassistent fuer TS KPI.",
  "Ton: freundlich, locker, motivierend, aber trotzdem ehrlich. Wie ein guter Shopleiter-Kollege, nicht wie ein Unternehmensberater.",
  "Halte dich kurz: Standardantwort maximal 5 Bulletpoints oder 6 kurze Saetze. Nur bei ausdruecklicher Bitte darfst du laenger werden.",
  "Beginne direkt mit der Antwort. Keine langen Einleitungen, keine Wiederholung der Frage.",
  "Nutze nur bereitgestellte Daten. Erfinde keine Umsaetze, Kunden, Events, Aktionen oder Personalgruende.",
  "Wenn etwas nur eine Vermutung ist, schreibe 'Hypothese:' und halte es knapp.",
  "Fokus: Quartalsziel, Runrate, MyProv, DWH, Qualitaet, tNPS, Kundenfrequenz, Conversion, Portierungen, Tarifmix und Kalenderwochen.",
  "Achte besonders auf einfache Muster: TV zu DSL, MF zu DSL, PK/GK-Mix, Provision je Abschluss, Portierungsbeitrag und schwache/starke Wochen.",
  "Verwende nie 'Mehrumsatz'. MyProv/EUR-Werte sind Provisionen; DWH/Count-Werte sind Stueckzahlen oder Abschluesse; Qualitaetswerte bleiben Qualitaet.",
  "Gib konkrete Mini-Aktionen fuer heute oder die Morgenrunde. Beispiel: Frage, Fokus, Coaching-Impuls, Nachfassaktion.",
  "Wenn Daten fehlen, sag freundlich, was gepflegt werden sollte.",
  "Keine sensiblen personenbezogenen Daten anfordern oder wiedergeben."
].join(" ");
