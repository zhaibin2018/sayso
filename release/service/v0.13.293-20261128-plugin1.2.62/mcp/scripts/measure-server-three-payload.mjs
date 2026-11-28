import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {compactMcpSummary} from '../lib/mcp-performance.ts';
import {conciseToolText} from '../lib/model-tool-text.ts';
import {FrameUploadPermits} from '../lib/frame-upload-permit.ts';
import {imageHandoff} from '../lib/image-handoff.ts';
import {publicEventResult} from '../lib/event-clock.ts';
import {modelResultProjection} from '../lib/model-result-projection.ts';
const size=v=>Buffer.byteLength(JSON.stringify(v));
const ids=new Map();const id=n=>{if(!ids.has(n))ids.set(n,crypto.randomUUID());return ids.get(n);},now=1795255200000;
const source={origin:'visual_read',command:'visual_read',device:id(1),session:id(2),broadcast:id(3),worker:id(4),frame:id(5),hardware:id(6),boot:id(7),lease:1,control:1,frameSeq:123,sourceSeq:456,captureMono:123456,captureLower:now-500,issued:now,expires:now+86400000,sha256:createHash('sha256').update('synthetic').digest('hex'),geometry:[443,960,886,1920,'portrait',1,0,0,443,960,'1']};
const event={version:'broadcast_elapsed_ms.v1',device_id:source.device,bridge_session_id:source.session,broadcast_id:source.broadcast,worker_id:source.worker,clock_domain_id:id(11)};
source.event_clock=event;
// Synthetic test key only; no hosted credential or live proof is read.
const signer=new FrameUploadPermits('a1'.repeat(32));
const proof=await signer.issueVisualReadPointProof('synthetic-owner',source);if(!proof)throw Error('fixture signing failed');
const metadata={device_id:source.device,bridge_session_id:source.session,broadcast_id:source.broadcast,worker_id:source.worker,worker_id_at_read:source.worker,lease_epoch:1,control_epoch_at_read:1,frame_id:source.frame,frame_seq:123,source_seq:456,capture_clock_verified:true,capture_lower_phone_mono_ms:123456,phone_clock:'iphone_system_uptime_ms',capture_lower_server_utc_ms:now-500,width:443,height:960,native_width_px:886,native_height_px:1920,orientation:'portrait',orientation_epoch:1,age_ms:500,stale:false};
const transport={request_id:id(8),timing_point:'before_tool_result_serialization',handler_elapsed_ms_at_result:200,d1_calls:2,d1_sum_ms:22};
const read={state:'available',metadata,source_point_proof:proof,runtime_version:'fixture',image_blocks:1,pre_age_server_ms_lower:9,pixel_source:'d1_inline',private_pixel_probe_ms:0,d1_jpeg_chars:50240,recovery:{lookups:1,retry_count:0,retry_trigger:null,failure:null,retry_wait_ms:0,budget_exhausted:false,timeout_ms:15000,wait_elapsed_ms:0,termination:'available'},mcp_request_id:id(8),trace:{native_transport:transport}};
const order={command_id:id(10),command_state:'board_acked',relation:'capture_after_phone_board_ack',scope_matches_at_snapshot:true,phone_clock:'iphone_system_uptime_ms',phone_ack_mono_ms:123000,capture_lower_phone_mono_ms:123456,lower_gap_ms:456,minimum_gap_ms:300,app_effect_observed:false};
const click={state:'board_acked',command_id:id(10),click_command_id:id(10),move_command_id:id(9),device_id:source.device,bridge_session_id:source.session,kind:'pointer.click',click_submitted:true,input_not_submitted:false,verification:'signed_board_receipt',source_age_ms:700,screen_changed_since_source:false,source_observed_at_server_utc_ms:now-200,workflow:'phone_move_click_observe.v1',point_protocol:'mouse_point.v1',settle_ms:300,intermediate_landing_verified:false,payload:{button:'left'},precondition:null,board_receipt:{state:'executed',command_id:id(10),signature:'f'.repeat(128),board_boot_id:source.boot,elapsed_ms:31},move_result:{state:'board_acked',command_id:id(9),board_receipt:{state:'executed',signature:'e'.repeat(128)}},after_screen:{state:'available',metadata,after_command:order,source_point_proof:proof},trace:{native_transport:{...transport,d1_calls:4,d1_sum_ms:46}},mcp_request_id:id(8)};
for(const [tool,raw] of [['read_screen',read],['click_at',click]]){raw.image_handoff=imageHandoff(raw,[{type:'image',data:'fixture',mimeType:'image/jpeg'}]);raw.interaction_policy_version='fixture';if(tool==='click_at')raw.after_image_instruction='Fixture original after-image instruction';}
metadata.event_clock=event;

const measurements=[];
for(const [tool,original] of [['read_screen',read],['click_at',click]]){
 const raw=publicEventResult(original);
 const compact=compactMcpSummary(raw,tool==='read_screen',tool==='click_at',tool==='click_at',tool==='read_screen',false,false,undefined,tool==='click_at'?'command':undefined);
 const text=conciseToolText(tool,raw,JSON.stringify(raw),compact);
 const next=modelResultProjection(tool,raw,true,text);
 const before=size({content:[{type:'text',text}],structuredContent:raw});
 const after=size({content:[{type:'text',text:next.text}],structuredContent:next.summary});
 for(const key of ['state','command_id','source_point_proof','metadata','after_screen','input_not_submitted','click_submitted','image_handoff','verification','event_clock'])if(Object.hasOwn(raw,key)&&JSON.stringify(raw[key])!==JSON.stringify(next.summary[key]))throw Error('Safety field changed: '+key);
 measurements.push({tool,fixture:'MODEL_TIME_synthetic_success_not_live',before_nonimage_bytes:before,after_nonimage_bytes:after,reduction_percent:Number((100*(1-after/before)).toFixed(2))});
}
writeFileSync('contracts/server-three-payload-measurements.json',JSON.stringify({baseline:'6a364e554c377494c32e4c09f6d27ff1fd256514',format:'explicit_compact_v1',measurements},null,2)+'\n');
console.log(JSON.stringify(measurements));
