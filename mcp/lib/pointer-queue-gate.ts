type Options={predecessor:string|null;device:string;owner:string;session:string;control:number;now:number;scope:string;profile:string;generation:number;count:number;before:string};
/** The global five-step bound includes all active ancestors and pregranted
 * descendants. Completed receipts are validated separately before storage. */
export function pointerQueueGate(o:Options,clock:string) {
  const scope=[o.device,o.session,o.control];
  if(!o.predecessor)return {sql:"NOT EXISTS(SELECT 1 FROM sb_mouse_commands WHERE device_id=? AND session_id=? AND control_epoch=? AND state IN ('queued','claimed','executing','outcome_unknown','halted'))",values:scope};
  return {sql:`EXISTS(SELECT 1 FROM sb_mouse_commands p WHERE p.id=? AND p.owner_id=? AND p.device_id=? AND p.session_id=? AND p.control_epoch=? AND p.kind='pointer.local_plan' AND p.state IN ('queued','claimed','executing','succeeded') AND p.expires_at>?
      AND p.expires_at>${clock} AND json_extract(p.payload,'$.scope')=? AND json_extract(p.payload,'$.profile_id')=? AND json_extract(p.payload,'$.source_generation')=? AND json_extract(p.payload,'$.steps[#-1].after')=?)
    AND NOT EXISTS(SELECT 1 FROM sb_mouse_commands WHERE device_id=? AND session_id=? AND control_epoch=? AND state IN ('outcome_unknown','halted'))
    AND NOT EXISTS(SELECT 1 FROM sb_mouse_commands active WHERE active.device_id=? AND active.session_id=? AND active.control_epoch=? AND active.state IN ('queued','claimed','executing') AND active.id NOT IN (
      WITH RECURSIVE chain(id,parent,depth) AS (SELECT id,predecessor_id,0 FROM sb_mouse_commands WHERE id=? UNION ALL SELECT p.id,p.predecessor_id,chain.depth+1 FROM sb_mouse_commands p JOIN chain ON p.id=chain.parent WHERE chain.depth<32) SELECT id FROM chain))
    AND COALESCE((SELECT SUM(MAX(0,json_array_length(payload,'$.steps')-COALESCE(json_extract(receipt,'$.status.completed_steps'),0))) FROM sb_mouse_commands WHERE device_id=? AND session_id=? AND control_epoch=? AND kind='pointer.local_plan' AND state IN ('queued','claimed','executing')),0)+?<=5`,
    values:[o.predecessor,o.owner,o.device,o.session,o.control,o.now,o.scope,o.profile,o.generation,o.before,...scope,...scope,o.predecessor,...scope,o.count]};
}
