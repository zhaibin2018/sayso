/** Called by the release installer with Site-scoped capabilities. No stdout,
 * token return value, random replacement gate, filesystem or secret logging.
 * The gate must be issued by Sites dispatch, not generated as an arbitrary key.
 * gateIssuanceApproved is true only after a plain-language explanation and the
 * user's explicit consent to a NEW issuance. Installation alone is not consent.
 */
/** @param {{assertOwnerOnly: () => Promise<boolean>, readGate: () => Promise<string | undefined | null>, readPlatformGate?: () => Promise<string | undefined | null>, issueGate: () => Promise<string>, storeGate: (name: string, value: string) => Promise<void>, gateIssuanceApproved?: unknown}} capabilities */
export async function installPairingGate({assertOwnerOnly,readGate,readPlatformGate,issueGate,storeGate,gateIssuanceApproved=false}) {
  let owned,existing;
  try {owned=await assertOwnerOnly();}catch {throw Error('PAIR_INSTALL_GATE_FAILED');}
  if(owned!==true)throw Error('PAIR_INSTALL_OWNER_ONLY_REQUIRED');
  try {existing=await readGate();}catch {throw Error('PAIR_INSTALL_GATE_FAILED');}
  if(typeof existing==='string'&&/^[A-Za-z0-9._~+\/-]{16,4096}={0,2}$/.test(existing))return {configured:true,created:false};
  if(existing!==undefined&&existing!==null&&existing!=='')throw Error('PAIR_INSTALL_GATE_FAILED');
  // Reuse a valid gate already returned by Sites; lookup errors never rotate it.
  let returned;
  try {
    returned=typeof readPlatformGate==='function'?await readPlatformGate():undefined;
    if(returned!==undefined&&returned!==null&&returned!=='') {
      if(typeof returned!=='string'||!/^[A-Za-z0-9._~+\/-]{16,4096}={0,2}$/.test(returned))throw Error();
      await storeGate('SAYSO_SITE_GATE_TOKEN',returned);
      if(await readGate()!==returned)throw Error();
      return {configured:true,created:false};
    }
  }catch {throw Error('PAIR_INSTALL_GATE_FAILED');}
  finally {returned=undefined;}
  if(gateIssuanceApproved!==true)throw Error('PAIR_INSTALL_GATE_CONSENT_REQUIRED');
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
