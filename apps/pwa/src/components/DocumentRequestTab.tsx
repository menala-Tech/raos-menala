'use client'
import { useState } from 'react'
import { createEmployeeDocumentRequest, submitEmployeeDocumentRequest } from '@/lib/smartOfficeApi'

type Props = { employeeId: string }

export default function DocumentRequestTab({ employeeId }: Props) {
  const [type, setType] = useState<'SIZ' | 'SKT' | 'ST' | 'PI'>('SIZ')
  const [subject, setSubject] = useState('')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function submit() {
    setBusy(true)
    setMsg('')
    try {
      const draft = await createEmployeeDocumentRequest({
        documentType: type,
        employeeId,
        subject: subject || 'Pengajuan Dokumen Karyawan',
        extra: { body: detail, reason: detail },
      })
      await submitEmployeeDocumentRequest(draft.documentId)
      setMsg('Pengajuan dikirim ke Direksi. Generate akan tersedia setelah disetujui.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Pengajuan gagal')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="font-bold text-gray-900">Pengajuan Dokumen</h2>
      <p className="mt-1 text-xs text-gray-500">Data identitas diambil otomatis dari sesi login (access_token).</p>
      <select className="input mt-4" value={type} onChange={e => setType(e.target.value as typeof type)}>
        <option value="SIZ">Surat Izin</option>
        <option value="SKT">Surat Keterangan</option>
        <option value="ST">Surat Tugas</option>
        <option value="PI">Pakta Integritas</option>
      </select>
      <input className="input mt-3" placeholder="Perihal" value={subject} onChange={e => setSubject(e.target.value)} />
      <textarea className="input mt-3 min-h-28" placeholder="Keterangan / alasan" value={detail} onChange={e => setDetail(e.target.value)} />
      <button className="btn-primary mt-4" disabled={busy || !employeeId} onClick={submit}>{busy ? 'Mengirim...' : 'Ajukan ke Direksi'}</button>
      {msg && <p className="mt-3 text-sm text-gray-600">{msg}</p>}
    </section>
  )
}
