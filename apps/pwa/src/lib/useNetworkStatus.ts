'use client'
import { useEffect, useState } from 'react'
export function useNetworkStatus() {
  const [online,setOnline]=useState(true)
  useEffect(()=>{
    const sync=()=>setOnline(navigator.onLine)
    sync()
    addEventListener('online',sync); addEventListener('offline',sync)
    return ()=>{removeEventListener('online',sync);removeEventListener('offline',sync)}
  },[])
  return online
}
