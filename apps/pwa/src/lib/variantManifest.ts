import { InstallVariant, manifestNameForVariant, VARIANT_LABEL } from './roleGuard'
export function buildVariantManifest(variant:InstallVariant){
 const {name,short}=manifestNameForVariant(variant), label=VARIANT_LABEL[variant], iconVariant=variant==='admin'?'mgmt':variant, base=`/icons/${iconVariant}`
 return {
  name,short_name:short,description:`MENALA RAOS ${label} — Airport Operation System`,
  start_url:'/',display:'standalone',background_color:'#1A1A2E',theme_color:'#F5A623',orientation:'portrait',
  icons:[
   {src:`${base}/icon-72x72.png`,sizes:'72x72',type:'image/png',purpose:'any'},
   {src:`${base}/icon-96x96.png`,sizes:'96x96',type:'image/png',purpose:'any'},
   {src:`${base}/icon-128x128.png`,sizes:'128x128',type:'image/png',purpose:'any'},
   {src:`${base}/icon-144x144.png`,sizes:'144x144',type:'image/png',purpose:'any'},
   {src:`${base}/icon-152x152.png`,sizes:'152x152',type:'image/png',purpose:'any'},
   {src:`${base}/icon-192x192.png`,sizes:'192x192',type:'image/png',purpose:'any'},
   {src:`${base}/icon-384x384.png`,sizes:'384x384',type:'image/png',purpose:'any'},
   {src:`${base}/icon-512x512.png`,sizes:'512x512',type:'image/png',purpose:'any'},
   {src:`${base}/maskable-192x192.png`,sizes:'192x192',type:'image/png',purpose:'maskable'},
   {src:`${base}/maskable-512x512.png`,sizes:'512x512',type:'image/png',purpose:'maskable'},
  ]
 }
}
