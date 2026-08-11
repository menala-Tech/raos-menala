import { supabase } from './supabase'

export async function loginWithRaosCredential(loginId:string,raosPin:string){
 const id=loginId.trim(),pin=raosPin.trim()
 if(/^\d{6,}$/.test(id)){
  if(!pin){
   return {data:{user:null,session:null},error:new Error('PIN Driver wajib diisi')}
  }
  return supabase.auth.signInWithPassword({email:`${id}@driver.rifim.local`,password:pin})
 }
 const {data:exchange,error:exchangeError}=await supabase.functions.invoke('raos-login-exchange',{body:{login_id:id,raos_pin:pin}})
 if(exchangeError||!exchange?.ok||!exchange?.token_hash){
  return {data:{user:null,session:null},error:new Error(exchange?.message||exchangeError?.message||'Login RAOS gagal')}
 }
 return supabase.auth.verifyOtp({token_hash:exchange.token_hash,type:'email'})
}
