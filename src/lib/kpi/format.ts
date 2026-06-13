export function formatNumber(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  }).format(value);
}

export function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return new Intl.NumberFormat("de-DE", {
    currency: "EUR",
    maximumFractionDigits: 0,
    style: "currency"
  }).format(value);
}

export function formatKpiValue(
  value: number | null | undefined,
  valueType: "money" | "count" | "score"
) {
  if (valueType === "money") {
    return formatCurrency(value);
  }

  return formatNumber(value, valueType === "score" ? 1 : 0);
}
