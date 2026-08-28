export function shortClientName(name: string | null | undefined) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length <= 2) return parts.join(" ");
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

export function loanContractName(
  clientName: string | null | undefined,
  contractNumber: number
) {
  const name = shortClientName(clientName);
  return name
    ? `${name} · Contrato #${contractNumber}`
    : `Contrato #${contractNumber}`;
}
