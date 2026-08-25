export const MAKASSAR_BRANCH_CODE = 'UPG'

const MAKASSAR_INVOICE_NOMINAL: Record<number, number> = {
  45000: 50000,
  95000: 100000,
  140000: 150000,
  190000: 200000,
}

export function saldoInvoiceNominal(branchCode: string | null | undefined, nominal: number): number {
  const raw = Number(nominal) || 0
  if (String(branchCode || '').trim().toUpperCase() !== MAKASSAR_BRANCH_CODE) return raw
  return MAKASSAR_INVOICE_NOMINAL[raw] ?? raw
}

export function isMakassarInvoiceRounded(branchCode: string | null | undefined, nominal: number): boolean {
  return saldoInvoiceNominal(branchCode, nominal) !== (Number(nominal) || 0)
}
