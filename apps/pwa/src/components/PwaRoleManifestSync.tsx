'use client'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

function variant(role?:string|null){
  const r=String(role||'').toLowerCase()
  if(r==='koordinator') return 'koord'
  if(r==='management') return 'mgmt'
  if(r==='direksi'||r==='direktur') return 'direksi'
  if(r==='driver') return 'driver'
  if(r==='driver_manager') return 'dm'
  if(r==='admin') return 'admin'
  return 'staff'
}
export default function PwaRoleManifestSync(){
  useEffect(()=>{
    let alive=true
    async function sync(){
      const {data:{session}}=await supabase.auth.getSession()
      let v='staff'
      if(session){
        const {data:p}=await supabase.from('user_profiles').select('role').eq('id',session.user.id).single()
        v=variant(p?.role)
      }
      if(!alive) return
      let link=document.querySelector<HTMLLinkElement>('link[data-raos-role-manifest]')
      if(!link){link=document.createElement('link');link.rel='manifest';link.dataset.raosRoleManifest='1';document.head.appendChild(link)}
      link.href=`/manifest-${v}`
      localStorage.setItem('raos_install_variant',v)
    }
    void sync()
    const {data:{subscription}}=supabase.auth.onAuthStateChange(()=>void sync())
    return()=>{alive=false;subscription.unsubscribe()}
  },[])
  return null
}
