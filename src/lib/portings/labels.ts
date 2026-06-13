export function portingTypeLabel(value: string) {
  const labels: Record<string, string> = {
    mobile_pk: "Mobilfunk PK",
    mobile_gk: "Mobilfunk GK"
  };

  return labels[value] ?? value;
}

export function portingStatusLabel(value: string) {
  const labels: Record<string, string> = {
    open: "Offen",
    planned: "Geplant",
    effective: "Wirksam",
    archived: "Archiviert"
  };

  return labels[value] ?? value;
}
