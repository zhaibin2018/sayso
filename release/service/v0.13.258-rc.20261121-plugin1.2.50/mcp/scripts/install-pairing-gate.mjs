/** Called by the release installer with Site-scoped capabilities. No stdout,
 * token return value, random replacement gate, filesystem or secret logging.
 * The gate must be issued by Sites dispatch, not generated as an arbitrary key.
 */
export async function installPairingGate({assertOwnerOnly,readGate,issueGate,storeGate}) {
  let owned,existing;
  try {owned=await assertOwnerOnly();}catch {throw Error('PAIR_INSTALL_GATE_FAILED');}
  if(owned!==true)throw Error('PAIR_INSTALL_OWNER_ONLY_REQUIRED');
  try {existing=await readGate();}catch {throw Error('PAIR_INSTALL_GATE_FAILED');}
  if(typeof existing==='string'&&/^[A-Za-z0-9._~+\/-]{16,4096}={0,2}$/.test(existing))return {configured:true,created:false};
  if(existing!==undefined&&existing!==null&&existing!=='')throw Error('PAIR_INSTALL_GATE_FAILED');
  let gate;
  try {
    gate=await issueGate();
    if(typeof gate!=='string'||!/^[A-Za-z0-9._~+\/-]{16,4096}={0,2}$/.test(gate))throw Error();
    await storeGate('SAYSO_SITE_GATE_TOKEN',gate);
    if(await readGate()!==gate)throw Error();
  }catch {throw Error('PAIR_INSTALL_GATE_FAILED');}
  finally {gate=undefined;}
  return {configured:true,created:true};
}
