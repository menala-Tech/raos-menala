# Setup GitHub & Vercel — RAOS

## STEP 1: Buat Repo GitHub
1. Buka https://github.com/new
2. Repository name: `raos-menala`
3. Private ✓
4. Jangan centang README (sudah ada)
5. Klik **Create repository**

## STEP 2: Push ke GitHub
Jalankan di terminal dari folder `RAOS/`:
```bash
cd "C:\Users\ADMIN\Downloads\Menala soeta PWA\RAOS"
git remote add origin https://github.com/[USERNAME]/raos-menala.git
git branch -M main
git push -u origin main
```
Ganti `[USERNAME]` dengan username GitHub kamu.

## STEP 3: Deploy ke Vercel
### Cara A — Via Website (Mudah)
1. Buka https://vercel.com/new
2. Import GitHub repo `raos-menala`
3. Framework Preset: **Next.js**
4. Root Directory: `apps/pwa`
5. Environment Variables — tambahkan:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://vlievtojpmrbsmzlqswl.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (salin dari apps/pwa/.env.local)
6. Klik **Deploy**

### Cara B — Via CLI
```bash
npm install -g vercel
cd "C:\Users\ADMIN\Downloads\Menala soeta PWA\RAOS\apps\pwa"
vercel
# Ikuti wizard, pilih "apps/pwa" sebagai root
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel --prod
```

## STEP 4: Setelah Deploy — Buat User Pertama
1. Buka https://supabase.com/dashboard/project/vlievtojpmrbsmzlqswl/auth/users
2. Klik **Add User** → masukkan email & password admin
3. Salin **User UID** yang terbentuk
4. Buka **SQL Editor** di Supabase, jalankan:
```sql
INSERT INTO user_profiles (id, staff_id, full_name, role, branch_id)
VALUES (
  '[USER_UID_DARI_AUTH]',
  'ADMIN-001',
  'Administrator RAOS',
  'admin',
  (SELECT id FROM branches WHERE code = 'T1')
);
```
5. Login ke PWA dengan email & password yang dibuat tadi ✓

## STEP 5: GitHub Secrets (untuk CI/CD otomatis)
Di repo GitHub → Settings → Secrets → Actions:
- `VERCEL_TOKEN` → dari https://vercel.com/account/tokens
- `VERCEL_ORG_ID` → dari `.vercel/project.json` setelah `vercel` init
- `VERCEL_PROJECT_ID` → dari `.vercel/project.json`
