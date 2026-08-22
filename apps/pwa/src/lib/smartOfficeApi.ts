import { supabase } from '@/lib/supabase'

// Production should set NEXT_PUBLIC_GAS_WEB_APP_URL; the fallback is the active
// RIFIM OS Main Web App deployment referenced by CLAUDE.md / raos-gas-rules.
const GAS_URL = process.env.NEXT_PUBLIC_GAS_WEB_APP_URL || 'https://script.google.com/macros/s/AKfycbzzK75gxawaylaUZpoC1zp_hq5ktznlN7scIl24HkdEgR2l3cVmpUSLck0potcMZZtw/exec'

// Company code for Smart Office V2 document engine. RIFIM is the canonical
// default in the backend (soV2GetCompany_); MIG/MENALA is the legal brand for
// the RAOS operating entity. Do not hardcode MENALA as the document company
// code unless the companies sheet in RIFIM OS is proven to use it as code.
const COMPANY_CODE = process.env.NEXT_PUBLIC_SMART_OFFICE_COMPANY_CODE || 'RIFIM'

export async function smartOfficePost(action: string, payload: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Session tidak tersedia. Login ulang.')
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ ...payload, action, access_token: session.access_token }),
  })
  let data: any
  try { data = await res.json() } catch { data = null }
  if (!res.ok || data?.success === false || data?.ok === false) {
    throw new Error(data?.message || data?.error || `Smart Office request gagal (${res.status})`)
  }
  return data ?? {}
}

export async function createEmployeeDocumentRequest(args: { documentType: 'SIZ' | 'SKT' | 'ST' | 'PI', employeeId: string, subject: string, extra?: Record<string, unknown> }) {
  const data = await smartOfficePost('so_create_draft', {
    documentType: args.documentType,
    company_code: COMPANY_CODE,
    subject: args.subject,
    request_source: 'RAOS',
    extra: { ...(args.extra || {}), employee_id: args.employeeId },
  })
  if (!data?.documentId) {
    throw new Error('Smart Office tidak mengembalikan documentId. Pengajuan dibatalkan.')
  }
  return data
}

export async function submitEmployeeDocumentRequest(documentId: string) {
  if (!documentId) throw new Error('DocumentId wajib ada sebelum submit.')
  const data = await smartOfficePost('so_submit', { documentId, request_source: 'RAOS' })
  if (data?.status !== 'pending_approval' && data?.status !== 'approved') {
    throw new Error(data?.message || data?.error || 'Submit dokumen gagal atau status tidak dikenal.')
  }
  return data
}
