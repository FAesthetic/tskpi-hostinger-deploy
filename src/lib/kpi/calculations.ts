import type { StatusTone } from "@/components/ui/StatusBadge";

export type KpiMetric = {
  actual: number;
  target: number;
  achievementPercent: number | null;
  currentDailyAverage: number | null;
  requiredDailyAverage: number | null;
  runrateForecast: number | null;
  differenceToTarget: number;
  status: StatusTone;
};

export function safePercent(actual: number, target: number) {
  if (target <= 0) {
    return null;
  }

  return (actual / target) * 100;
}

export function calculateKpiMetric({
  actual,
  target,
  elapsedWorkdays,
  remainingWorkdays,
  totalWorkdays
}: {
  actual: number;
  target: number;
  elapsedWorkdays: number;
  remainingWorkdays: number;
  totalWorkdays: number;
}): KpiMetric {
  const achievementPercent = safePercent(actual, target);
  const currentDailyAverage = elapsedWorkdays > 0 ? actual / elapsedWorkdays : null;
  const runrateForecast =
    currentDailyAverage === null ? null : currentDailyAverage * totalWorkdays;
  const remainingValue = Math.max(target - actual, 0);
  const requiredDailyAverage =
    remainingWorkdays > 0 ? remainingValue / remainingWorkdays : remainingValue > 0 ? null : 0;
  const differenceToTarget = actual - target;

  return {
    actual,
    target,
    achievementPercent,
    currentDailyAverage,
    requiredDailyAverage,
    runrateForecast,
    differenceToTarget,
    status: getTrafficLightStatus({ target, runrateForecast, achievementPercent })
  };
}

export function getTrafficLightStatus({
  target,
  runrateForecast,
  achievementPercent
}: {
  target: number;
  runrateForecast: number | null;
  achievementPercent: number | null;
}): StatusTone {
  if (target <= 0) {
    return "neutral";
  }

  if (achievementPercent !== null && achievementPercent >= 100) {
    return "green";
  }

  if (runrateForecast === null) {
    return "neutral";
  }

  if (runrateForecast >= target) {
    return "green";
  }

  if (runrateForecast >= target * 0.9) {
    return "yellow";
  }

  return "red";
}
