import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// POST /api/admin/staff — buat akun staff baru (auth user + user_profiles).
// Perlu service role key karena membuat auth.users tidak bisa lewat anon key.
// Endpoint ini WAJIB verifikasi caller adalah admin/direksi sebelum lanjut,
// karena supabaseAdmin bypass semua RLS.
export async function POST(req: NextRequest) {
  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) {
    return NextResponse.json({ error: 'Tidak ada token otorisasi' }, { status: 401 })
  }

  const { data: { user: caller }, error: callerErr } = await admin.auth.getUser(token)
  if (callerErr || !caller) {
    return NextResponse.json({ error: 'Token tidak valid' }, { status: 401 })
  }

  const { data: callerProfile } = await admin
    .from('user_profiles')
    .select('role')
    .eq('id', caller.id)
    .single()

  if (!callerProfile || !['admin', 'direksi'].includes(callerProfile.role)) {
    return NextResponse.json({ error: 'Hanya admin/direksi yang boleh menambah staff' }, { status: 403 })
  }

  const body = await req.json()
  const { email, staff_id, full_name, role, branch_id, phone } = body as {
    email: string; staff_id: string; full_name: string; role: string; branch_id?: string; phone?: string
  }

  if (!email || !staff_id || !full_name || !role) {
    return NextResponse.json({ error: 'Email, ID Staff, Nama, dan Role wajib diisi' }, { status: 400 })
  }
  if (!['direksi', 'admin', 'koordinator', 'staff'].includes(role)) {
    return NextResponse.json({ error: 'Role tidak valid' }, { status: 400 })
  }

  // Password acak sementara - staff set password sendiri via email reset
  // (reuse flow "Lupa Kata Sandi" yang sudah teruji, SMTP Gmail sudah aktif).
  const tempPassword = crypto.randomUUID()

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name },
  })

  if (createErr || !created.user) {
    const msg = createErr?.message?.includes('already been registered')
      ? 'Email sudah terdaftar.'
      : (createErr?.message ?? 'Gagal membuat akun.')
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const { error: profileErr } = await admin.from('user_profiles').insert({
    id: created.user.id,
    staff_id,
    full_name,
    role,
    branch_id: branch_id || null,
    phone: phone || null,
  })

  if (profileErr) {
    // Rollback auth user supaya tidak jadi akun yatim tanpa profil
    await admin.auth.admin.deleteUser(created.user.id)
    const msg = profileErr.message.includes('duplicate')
      ? 'ID Staff sudah dipakai.'
      : 'Gagal menyimpan profil staff.'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const { error: resetErr } = await admin.auth.resetPasswordForEmail(email)
  if (resetErr) {
    // Akun & profil sudah jadi, tapi email set-password gagal terkirim -
    // bukan kegagalan fatal, admin bisa kirim ulang manual lewat "Lupa Kata Sandi"
    return NextResponse.json({
      warning: `Staff berhasil dibuat, tapi email set password gagal terkirim: ${resetErr.message}. Minta staff pakai "Lupa Kata Sandi" di halaman login.`,
    }, { status: 201 })
  }

  return NextResponse.json({ success: true }, { status: 201 })
}
