import { BridgeError } from "./bridge-engine.ts";
export function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }); }
export async function bounded(request: Request, maximum: number): Promise<Uint8Array> {
  const reader = request.body?.getReader(); if (!reader) return new Uint8Array();
  const pieces: Uint8Array[] = []; let count = 0;
  while (true) { const item = await reader.read(); if (item.done) break; count += item.value.byteLength;
    if (count > maximum) { await reader.cancel(); throw new BridgeError("BODY_TOO_LARGE", 413); } pieces.push(item.value); }
  const bytes = new Uint8Array(count); let offset = 0;
  for (const piece of pieces) { bytes.set(piece, offset); offset += piece.length; }
  return bytes;
}
export function failure(error: unknown) {
  if(error instanceof BridgeError)return json({error:{code:error.code,message:error.code}},error.status);
  const detail=error instanceof Error?error.message+String(error.cause??""):"";
  // Cloudflare correlates this bounded classification to the request trace.
  // Never log the SQL, parameters, exception message or device credentials.
  const category=detail.includes("Expression tree is too large")?"database_expression_depth":
    detail.includes("D1_ERROR")?"database_other":"unclassified";
  console.error(JSON.stringify({event:"unexpected_request_failure",category}));
  return json({error:{code:"INTERNAL_ERROR",message:"请求未完成"}},500);
}
