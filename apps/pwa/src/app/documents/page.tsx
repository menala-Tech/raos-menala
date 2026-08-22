'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DocumentRequestTab from '@/components/DocumentRequestTab'

export default function DocumentsPage() {
  const [employeeId, setEmployeeId] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    (async () => {
      const { data: { user: u } } = await supabase.auth.getUser()
      if (!u) { setErr('Session tidak tersedia'); return }
      const { data: p } = await supabase
        .from('user_profiles')
        .select('staff_id, role')
        .eq('id', u.id)
        .maybeSingle()
      if (!p || String(p.role || '').toLowerCase() !== 'staff') {
        setErr('Pengajuan dokumen tersedia untuk Staff.')
        return
      }
      setEmployeeId(String(p.staff_id || ''))
    })().catch(e => setErr(e.message))
  }, [])

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      {err ? (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{err}</div>
      ) : (
        <DocumentRequestTab employeeId={employeeId} />
      )}
    </main>
  )
}
