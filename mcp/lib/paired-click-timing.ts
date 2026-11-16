type AdmissionPath="fast"|"geometry"|"standard_fallback"|"saved_readback";
type WorkerRead={worker_dispatch_utc_ms:number;worker_return_utc_ms:number};
type ReceiptRead=WorkerRead&{d1_read_utc_ms:number|null;move_state:string;click_state:string};
const receiptStates=new Set(["queued","claimed","executing","embedded","board_acked","failed","expired","outcome_unknown"]);

/** Request-local timing. Retains only three receipt samples and no identities. */
export class PairedClickPhaseTiming {
  private readonly admissionStartedAt:number;
  private admission:{path:AdmissionPath;geometry_slot:number|null;reused:boolean}|null=null;
  private admissionReturnedAt:number|null=null;
  private calls=0;
  private elapsed=0;
  private pending=0;
  private firstPending:ReceiptRead|null=null;
  private latestPending:ReceiptRead|null=null;
  private firstTerminal:ReceiptRead|null=null;

  constructor(admissionStartedAt:number) { this.admissionStartedAt=admissionStartedAt; }

  admitted(path:AdmissionPath,geometrySlot:number|null,reused:boolean) {
    this.admission={path,geometry_slot:geometrySlot,reused};
  }

  admissionReturned(now:number) { this.admissionReturnedAt=now; }

  readReturned(dispatchedAt:number,returnedAt:number):WorkerRead {
    this.calls++;
    this.elapsed+=Math.max(0,returnedAt-dispatchedAt);
    return {worker_dispatch_utc_ms:dispatchedAt,worker_return_utc_ms:returnedAt};
  }

  paired(read:WorkerRead|undefined,d1ReadAt:unknown,moveState:string,clickState:string,terminal:boolean) {
    if(!read||!receiptStates.has(moveState)||!receiptStates.has(clickState))return;
    const sample={...read,d1_read_utc_ms:typeof d1ReadAt==="number"&&Number.isFinite(d1ReadAt)?d1ReadAt:null,
      move_state:moveState,click_state:clickState};
    if(terminal){this.firstTerminal??=sample;return;}
    this.pending++;
    this.firstPending??=sample;
    this.latestPending=sample;
  }

  output() {
    if(!this.admission||this.admissionReturnedAt===null)return undefined;
    return {admission:{...this.admission,enqueue_started_utc_ms:this.admissionStartedAt,enqueue_returned_utc_ms:this.admissionReturnedAt},
      receipt:{d1_calls:this.calls,d1_elapsed_ms:this.elapsed,pending_count:this.pending,
        first_pending:this.firstPending,latest_pending:this.latestPending,first_terminal:this.firstTerminal}};
  }
}

export type PairedClickTiming=NonNullable<ReturnType<PairedClickPhaseTiming["output"]>>;
export const pairedClickTiming=Symbol("paired_click_phase_timing");

/** Server-only. Callers project allowlisted fields from an authenticated click. */
export function logPairedClickDiagnostic(entry:Record<string,unknown>,log?:(entry:Record<string,unknown>)=>void) {
  try {
    if(log)log(entry);
    else console.info(JSON.stringify(entry));
  } catch { /* Diagnostic delivery cannot change the operation. */ }
}
