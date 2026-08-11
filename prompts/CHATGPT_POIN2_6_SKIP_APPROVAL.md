# ChatGPT Prompt — Poin 2+6 Skip Approval Flow

**Untuk:** ChatGPT (regular, tanpa file access)
**Tugas:** Design + output diff/edit instructions untuk implement "skip approval flow" di RAOS + rifim-os
**Output yang diharapkan:** ChatGPT tulis edit instructions detail (file:line + old/new snippet). User paste output ke CC untuk diapply.

---

## Copy-paste prompt ini ke ChatGPT

````
Halo, aku butuh bantu design perubahan kode untuk skip approval flow di
sistem RAOS (PWA driver saldo). Kamu tulis edit instructions detail per
file (path + line range + old snippet + new snippet). Aku akan paste
hasilmu ke Claude Code untuk diapply.

═══════════════════════════════════════════════════════════
KONTEKS SISTEM
═══════════════════════════════════════════════════════════

RAOS = PWA operational vendor Maxim di 9 cabang airport. Flow existing
"Pengajuan Isi Saldo":

1. Staff submit /isisaldo <nominal> di chat room PWA RAOS
2. Chat bubble muncul type='saldo_request' dgn status='pending'
3. Koordinator/admin tekan tombol "Setujui" di card → status='approved'
4. Finance operator (admin/mgmt/direksi) buka Finance module, klik "Lunas"
   → status stays 'approved' tapi is_processed=true

REQUIREMENT BARU (user 2026-08-07):
- HAPUS step approval koordinator/admin (poin 2)
- Koord/mgmt/direksi cukup LIHAT di riwayat, tanpa tombol Approve/Reject (poin 6)
- Flow baru: Staff submit → status='pending' → Finance langsung mark_paid
  (skip approval)

═══════════════════════════════════════════════════════════
FILE YANG PERLU DIUBAH
═══════════════════════════════════════════════════════════

FILE 1: RAOS/apps/pwa/src/components/SaldoRequestCard.tsx (TypeScript React)
─────────────────────────────────────────────────────────

Lokasi kunci existing:
- Line 5: import approveSaldoRequest, rejectSaldoRequest
- Line 41-42: helper `canApprove` (return true untuk koord/admin/mgmt/direksi)
- Line 47-49: state busy, rejectMode, reason
- Line 97-105: statusChip logic — case 'approved': "Validasi ✓ — Menunggu Admin"
- Line 108: isPending = live.status === 'pending' && !live.is_processed
- Line 109: showApproveBtn = isPending && canApprove(currentUserRole)
- Line 111-126: handleApprove() + handleReject()
- Line 171-211: UI tombol Setujui/Tolak/rejectMode form

Yang harus dilakukan:
(a) Hapus import approveSaldoRequest, rejectSaldoRequest (line 5)
(b) Hapus helper canApprove (line 41-42)
(c) Hapus state rejectMode + reason (line 48-49) — busy tetap dipakai
(d) Hapus handleApprove + handleReject functions (line 111-126)
(e) Hapus UI tombol Setujui/Tolak + rejectMode form (line 171-211)
(f) Update statusChip case 'approved': label "Menunggu Admin Isi" (bukan
    "Validasi ✓ — Menunggu Admin") — semantic clean
(g) Update statusChip default (pending): label "Menunggu diproses" (bukan
    "Menunggu")

Full current content SaldoRequestCard.tsx: (line 1-215 total)
```tsx
'use client'

import { useEffect, useState } from 'react'
import { Wallet, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { approveSaldoRequest, rejectSaldoRequest } from '@/lib/saldoRequest'
import { supabase } from '@/lib/supabase'

interface SaldoContent {
  request_id: string
  request_no: string
  staff_name: string
  branch_slug?: string | null
  branch_name?: string | null
  branch_id?: string | null
  nominal: number
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  is_processed?: boolean
  driver_login_id?: string | null
  driver_name?: string | null
  driver_branch_name?: string | null
  requested_at?: string | null
  processed_at?: string | null
}

interface Props {
  raw: string
  messageId?: string
  currentUserId: string
  currentUserRole: string
  onUpdated?: () => void
}

// ... [omitted: parse function, canApprove helper, main component]
// Kalau perlu full source, minta ke user
```

FILE 2: RAOS/apps/pwa/src/lib/saldoRequest.ts (TypeScript)
─────────────────────────────────────────────────────────

Yang harus dilakukan:
(a) Tandai `approveSaldoRequest` dan `rejectSaldoRequest` sebagai DEPRECATED
    dgn JSDoc comment `@deprecated Sesi 2026-08-07: skip approval flow.`
    Jangan hapus function (backward compat kalau ada consumer lain), cukup
    add comment di atas function signature.
(b) Cari `postSaldoSystemMessage` yang di-invoke saat approval — pastikan
    tidak fire lagi setelah UI hapus tombol (karena caller sudah hilang).

FILE 3: RAOS/sql/raos_076_mark_paid_skip_approval.sql (BARU)
─────────────────────────────────────────────────────────

Buat migration baru untuk relax guard di RPC raos_saldo_mark_paid supaya
allow status IN ('pending', 'approved') → processed.

Current constraint (raos_074):
```sql
IF v_request.status <> 'approved' THEN
  RETURN jsonb_build_object(
    'status', 'not_approved',
    'current_status', v_request.status,
    'row', to_jsonb(v_request)
  );
END IF;
```

Change to:
```sql
IF v_request.status NOT IN ('pending', 'approved') THEN
  RETURN jsonb_build_object(
    'status', 'not_processable',
    'current_status', v_request.status,
    'row', to_jsonb(v_request)
  );
END IF;
```

Full RPC signature (raos_074):
- Function: public.raos_saldo_mark_paid(p_request_id uuid, p_processor_id uuid)
- Returns: jsonb
- LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
- Body includes:
  * input validation (request_id + processor_id required)
  * JWT role check (service_role bypass, else auth.uid()=processor_id)
  * user_profiles role check (admin/management/direksi/direktur only)
  * SELECT FOR UPDATE
  * transition guard (yang mau kita relax)
  * UPDATE + return

Tulis migration file lengkap yang bisa langsung di-apply via
mcp__supabase__apply_migration. Sertakan CREATE OR REPLACE FUNCTION full body.

FILE 4: rifim-os/modules/finance/index.html — Finance Isi Saldo tab
─────────────────────────────────────────────────────────

Cari tombol "Lunas" (mark_paid) di Finance module. Yang harus dilakukan:
(a) Update UI: tombol Lunas SEKARANG boleh dipencet untuk baris `pending`
    juga (bukan hanya `approved`). Update kondisi disabled/visibility.
(b) Update handler mark-paid: response `not_processable` (dari poin FILE 3)
    handle dgn error message user-friendly.

Aku belum kirim source code Finance module ini. Kalau kamu butuh, minta.

FILE 5 (opsional): docs/STATUS.md kedua repo
─────────────────────────────────────────────────────────

Append entry sesi 2026-08-07:
"feat(saldo): skip approval flow — chat submit langsung processable Finance,
hapus tombol Approve/Reject koord (poin 2+6 requirement)"

═══════════════════════════════════════════════════════════
DELIVERABLE YANG AKU HARAPKAN DARI KAMU
═══════════════════════════════════════════════════════════

Untuk tiap FILE di atas, kasih output format:

## FILE X: <path>

### Change 1: <deskripsi singkat>
**Location:** line X-Y
**Old:**
```<lang>
<old code exact>
```
**New:**
```<lang>
<new code exact>
```

### Change 2: ...

Kalau ada file baru (mis. migration SQL), tulis full content.

Kalau ada assumption yg tidak pasti (mis. kamu tidak yakin exact line
Finance module karena aku belum kirim source), tulis:
"ASSUMSI: <assumption>, verify sebelum apply"

Tolong output PLAIN TEXT (bukan diagram / bukan ringkasan filosofis).
Aku akan copy-paste output kamu ke Claude Code, jadi jaga format
konsisten supaya bisa langsung diapply via Edit tool.
````

---

## Setelah ChatGPT output

1. Copy jawaban ChatGPT balik ke CC (paste ke chat)
2. CC baca + validasi + apply via Edit tool
3. CC tambah migration via apply_migration MCP
4. CC commit + push + PR + merge
5. Vercel auto-deploy + user manual redeploy GAS (kalau ada change GAS)

## Yang CC skip (sudah tersedia untuk ChatGPT)

- Info sistem RAOS + 9 cabang + roles
- Migration raos_074 signature
- SaldoRequestCard.tsx locations + relevant code
- Tidak perlu tanya konfirmasi
