import { getTrafficLightStatus, type KpiMetric } from "@/lib/kpi/calculations";

type PipelineKpiCode = "provision_mobile" | "units_mobile_gk" | "units_mobile_pk";

export type FuturePortingInput = {
  date_unknown: boolean;
  porting_date: string | null;
  porting_type: "mobile_gk" | "mobile_pk";
  provision_amount: number | null;
  status: string;
};

export function buildFuturePortingPipeline({
  endDate,
  kpiIdByCode,
  portings,
  today
}: {
  endDate: string;
  kpiIdByCode: Map<string, string>;
  portings: FuturePortingInput[];
  today: string;
}) {
  const pipeline = new Map<string, number>();

  for (const porting of portings) {
    if (
      porting.date_unknown ||
      !porting.porting_date ||
      porting.porting_date <= today ||
      porting.porting_date > endDate ||
      porting.status === "archived"
    ) {
      continue;
    }

    addPipelineValue({
      code: porting.porting_type === "mobile_pk" ? "units_mobile_pk" : "units_mobile_gk",
      kpiIdByCode,
      pipeline,
      value: 1
    });

    addPipelineValue({
      code: "provision_mobile",
      kpiIdByCode,
      pipeline,
      value: Number(porting.provision_amount ?? 0)
    });
  }

  return pipeline;
}

export function buildFuturePortingImpactEntries({
  endDate,
  kpiIdByCode,
  portings,
  today
}: {
  endDate: string;
  kpiIdByCode: Map<string, string>;
  portings: FuturePortingInput[];
  today: string;
}) {
  const entries: Array<{ entry_date: string; kpi_definition_id: string; value: number }> = [];

  for (const porting of portings) {
    if (
      porting.date_unknown ||
      !porting.porting_date ||
      porting.porting_date <= today ||
      porting.porting_date > endDate ||
      porting.status === "archived"
    ) {
      continue;
    }

    const unitKpiId = kpiIdByCode.get(
      porting.porting_type === "mobile_pk" ? "units_mobile_pk" : "units_mobile_gk"
    );
    const provisionKpiId = kpiIdByCode.get("provision_mobile");

    if (unitKpiId) {
      entries.push({
        entry_date: porting.porting_date,
        kpi_definition_id: unitKpiId,
        value: 1
      });
    }

    if (provisionKpiId && Number(porting.provision_amount ?? 0) > 0) {
      entries.push({
        entry_date: porting.porting_date,
        kpi_definition_id: provisionKpiId,
        value: Number(porting.provision_amount ?? 0)
      });
    }
  }

  return entries;
}

export function applyPipelineToMetric({
  metric,
  pipelineValue,
  remainingWorkdays
}: {
  metric: KpiMetric;
  pipelineValue: number;
  remainingWorkdays: number;
}) {
  if (pipelineValue <= 0) {
    return metric;
  }

  const projectedActual = metric.actual + pipelineValue;
  const projectedRunrate =
    metric.runrateForecast === null ? pipelineValue : metric.runrateForecast + pipelineValue;
  const projectedRemainingValue = Math.max(metric.target - projectedActual, 0);
  const projectedRequiredDailyAverage =
    remainingWorkdays > 0
      ? projectedRemainingValue / remainingWorkdays
      : projectedRemainingValue > 0
        ? null
        : 0;

  return {
    ...metric,
    requiredDailyAverage: projectedRequiredDailyAverage,
    runrateForecast: projectedRunrate,
    status: getTrafficLightStatus({
      achievementPercent: metric.achievementPercent,
      runrateForecast: projectedRunrate,
      target: metric.target
    })
  };
}

function addPipelineValue({
  code,
  kpiIdByCode,
  pipeline,
  value
}: {
  code: PipelineKpiCode;
  kpiIdByCode: Map<string, string>;
  pipeline: Map<string, number>;
  value: number;
}) {
  const kpiId = kpiIdByCode.get(code);

  if (!kpiId || value <= 0) {
    return;
  }

  pipeline.set(kpiId, (pipeline.get(kpiId) ?? 0) + value);
}
