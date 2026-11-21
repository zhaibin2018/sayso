/** Site-scoped installer adapter. fetchSite is the owner's authenticated,
 * same-origin browser fetch capability, never a gate-only/admin-header forgery.
 * This module creates no Site, changes no policy, sets no owner and logs nothing.
 */
async function checked({origin,assertOwnerOnly,fetchSite},method,body) {
  if(new URL(origin).origin!==origin||!origin.startsWith('https://'))throw Error('PAIR_INSTALL_ORIGIN');
  if(await assertOwnerOnly()!==true)throw Error('PAIR_INSTALL_OWNER_ONLY_REQUIRED');
  const response=await fetchSite(new URL('/api/pairing/install',origin).href,{
    method,credentials:'same-origin',cache:'no-store',redirect:'error',
    ...(method==='POST'?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),
  });
  if(!response.ok) {
    // Fixed failure; never include a response body, cookies or upstream exception.
    throw Error('PAIR_INSTALL_REQUEST_FAILED');
  }
  return response.json();
}
export async function readInstallPairingOwner(capabilities) {
  try {
    const value=await checked(capabilities,'GET');
    if(typeof value.id!=='string'||!value.id.trim()||value.id.length>256)throw Error();
    return {id:value.id};
  }catch {throw Error('PAIR_INSTALL_OWNER_LOOKUP_FAILED');}
}
export async function installPairingRequest(capabilities,request) {
  try {
    const value=await checked(capabilities,'POST',request),link=new URL(value.pairing_url);
    if(link.origin!==capabilities.origin||link.pathname!=='/pair'||link.searchParams.get('req')!==request.request_id||
      link.searchParams.size!==1||link.hash||!Number.isSafeInteger(value.expires_at))throw Error();
    return {pairing_url:link.href,expires_at:value.expires_at};
  }catch {throw Error('PAIR_INSTALL_REQUEST_FAILED');}
}
