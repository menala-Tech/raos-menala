'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { saldoInvoiceNominal } from '@/lib/saldoInvoice'
import clsx from 'clsx'

interface Row {
  id: string
  request_id: string
  driver_login_id: string
  driver_name: string | null
  nominal: number
  requested_at: string
  status: string
  aist_reference: string | null
}

interface RequestSnapshot {
  status: string
  is_processed: boolean
  is_archived: boolean
  branch_id: string | null
}

function primaryStatusBadge(req: RequestSnapshot | undefined) {
  if (!req) return { label: 'MENUNGGU', cls: 'bg-yellow-100 text-yellow-700' }
  if (req.is_archived) return { label: 'DIARSIPKAN', cls: 'bg-gray-100 text-gray-700' }
  if (req.is_processed) return { label: 'SUDAH DIISI', cls: 'bg-green-100 text-green-700' }
  if (req.status === 'cancelled') return { label: 'DIBATALKAN', cls: 'bg-slate-100 text-slate-700' }
  if (req.status === 'rejected') return { label: 'DITOLAK', cls: 'bg-red-100 text-red-700' }
  return { label: 'MENUNGGU', cls: 'bg-yellow-100 text-yellow-700' }
}

function aistAuditLabel(status: string) {
  if (status === 'success') return 'Audit AIST: success'
  if (status === 'queued') return 'Audit AIST: queued'
  if (status === 'timeout') return 'Audit AIST: timeout'
  if (status === 'mismatch') return 'Audit AIST: mismatch'
  return `Audit AIST: ${status}`
}

export default function CoordinatorSaldoHistory() {
  const [rows, setRows] = useState<Row[]>([])
  const [requestMap, setRequestMap] = useState<Map<string, RequestSnapshot>>(new Map())
  const [branchCodeMap, setBranchCodeMap] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('aist_jobs')
      .select('id,request_id,driver_login_id,driver_name,nominal,requested_at,status,aist_reference')
      .order('requested_at', { ascending:false })
      .limit(200)
      .then(async ({ data }) => {
        if (cancelled) return
        const jobRows = (data ?? []) as Row[]
        setRows(jobRows)

        const requestIds = Array.from(new Set(jobRows.map(r => r.request_id).filter(Boolean)))
        if (requestIds.length > 0) {
          const { data: reqData } = await supabase
            .from('raos_saldo_requests')
            .select('id, status, is_processed, is_archived, branch_id')
            .in('id', requestIds)
          if (!cancelled && reqData) {
            const snapshots = reqData.map((r: any) => [r.id, { status: r.status, is_processed: r.is_processed, is_archived: !!r.is_archived, branch_id: r.branch_id }] as const)
            setRequestMap(new Map(snapshots))

            const branchIds = Array.from(new Set(reqData.map((r: any) => r.branch_id).filter(Boolean))) as string[]
            if (branchIds.length > 0) {
              const { data: branches } = await supabase.from('branches').select('id, code').in('id', branchIds)
              if (!cancelled && branches) setBranchCodeMap(new Map(branches.map((b: any) => [b.id, b.code])))
            }
          }
        }
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  if (loading) return <div className="card text-sm text-gray-400">Memuat riwayat cabang...</div>

  return (
    <section className="card">
      <h2 className="text-sm font-bold text-gray-800 mb-3">Riwayat Isi Saldo Cabang</h2>
      <div className="space-y-2">
        {rows.map(row => {
          const request = requestMap.get(row.request_id)
          const badge = primaryStatusBadge(request)
          const branchCode = request?.branch_id ? branchCodeMap.get(request.branch_id) : null
          const invoiceNominal = saldoInvoiceNominal(branchCode, Number(row.nominal))
          return (
            <div key={row.id} className="rounded-xl border border-gray-100 p-3">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-gray-800">{row.driver_name || row.driver_login_id}</p>
                  <p className="text-[10px] text-gray-400">ID {row.driver_login_id}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-bold uppercase text-gray-400">Invoice</p>
                  <p className="text-sm font-black">Rp{invoiceNominal.toLocaleString('id-ID')}</p>
                  {invoiceNominal !== Number(row.nominal) && (
                    <p className="text-[9px] text-gray-400">Saldo Rp{Number(row.nominal).toLocaleString('id-ID')}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-gray-500">{new Date(row.requested_at).toLocaleString('id-ID')}</span>
                <span className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded-full', badge.cls)}>{badge.label}</span>
              </div>
              <p className="text-[9px] text-gray-400 mt-1">{aistAuditLabel(row.status)}</p>
              {row.aist_reference && (
                <p className="text-[10px] text-gray-400 mt-0.5">Ref AIST: {row.aist_reference}</p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
