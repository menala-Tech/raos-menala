export type RuntimeFailure={code:string; message:string; cause?:unknown}

function rawMessage(value:unknown){
  if(value instanceof Error)return value.message.trim()
  if(value&&typeof value==='object'&&'message'in value)return String((value as {message?:unknown}).message??'').trim()
  const text=String(value??'').trim()
  return text==='[object Object]'?'':text
}

/** Technical detail is for console/audit logs only; never render directly. */
export function runtimeTechnicalMessage(value:unknown,fallback='unknown_runtime_error'){
  return rawMessage(value)||fallback
}

const SAFE_RULES:Array<[RegExp,string]>=[
  [/failed to fetch|network|load failed|fetch failed|network_error/i,'Koneksi ke server terputus. Periksa internet lalu coba lagi.'],
  [/timeout|timed out/i,'Server membutuhkan waktu terlalu lama. Silakan coba lagi.'],
  [/jwt|token|session|unauthenticated|not authenticated/i,'Sesi login tidak valid atau sudah berakhir. Silakan masuk kembali.'],
  [/permission denied|row-level security|rls|not allowed|role_not_allowed|forbidden/i,'Anda tidak memiliki izin untuk melakukan tindakan ini.'],
  [/branch_not_allowed|cabang di luar scope/i,'Data cabang berada di luar akses Anda.'],
  [/driver_not_found/i,'Driver tidak ditemukan atau sudah tidak aktif.'],
  [/saldo_room_not_found/i,'Room Pengisian Saldo untuk cabang ini belum tersedia. Hubungi Admin.'],
  [/invalid_input/i,'Data yang dikirim belum lengkap atau tidak valid.'],
  [/duplicate|unique|already exists|already_exists/i,'Data tersebut sudah tercatat. Muat ulang untuk melihat status terbaru.'],
  [/rate.?limit|too many/i,'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.'],
  [/not_found/i,'Data yang diminta tidak ditemukan.'],
]

export function runtimeMessage(value:unknown,fallback='Terjadi kesalahan. Silakan coba lagi.') {
  const raw=rawMessage(value)
  if(!raw)return fallback
  for(const [pattern,message] of SAFE_RULES)if(pattern.test(raw))return message
  return fallback
}

export function runtimeFailure(code:string,cause:unknown,fallback?:string):RuntimeFailure{
  return {code,message:runtimeMessage(cause,fallback),cause}
}

export function assertNoSupabaseError(error:unknown,code='supabase_error'):void{
  if(error){
    const e=Object.assign(new Error(runtimeMessage(error)),{code,cause:error})
    throw e
  }
}
