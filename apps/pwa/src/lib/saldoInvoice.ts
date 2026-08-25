const INVOICE_NOMINAL: Record<number, number> = {
  45000: 50000,
  95000: 100000,
  140000: 150000,
  145000: 150000,
  190000: 200000,
  195000: 200000,
}

export function saldoInvoiceNominal(_branchCode: string | null | undefined, nominal: number): number {
  const raw = Number(nominal) || 0
  return INVOICE_NOMINAL[raw] ?? raw
}

export function isInvoiceRounded(branchCode: string | null | undefined, nominal: number): boolean {
  return saldoInvoiceNominal(branchCode, nominal) !== (Number(nominal) || 0)
}
