import {test} from "node:test";
import assert from "node:assert/strict";
import {failure} from "../lib/http-utils.ts";
import {BridgeError} from "../lib/bridge-engine.ts";
test("unexpected database failures are classified without disclosing messages or changing public errors",async t=>{
  const logs:string[]=[];t.mock.method(console,"error",(message:string)=>logs.push(message));
  for(const [message,category] of [["D1_ERROR: Expression tree is too large (maximum depth 100): SECRET_SQL","database_expression_depth"],
    ["D1_ERROR: SECRET_SQL","database_other"],["SECRET_TOKEN","unclassified"]]){
    const reply=failure(new Error(message));assert.equal(reply.status,500);
    assert.deepEqual(await reply.json(),{error:{code:"INTERNAL_ERROR",message:"请求未完成"}});
    assert.deepEqual(JSON.parse(logs.at(-1)!),{event:"unexpected_request_failure",category});
  }
  const count=logs.length;assert.equal(failure(new BridgeError("UNAUTHENTICATED",401)).status,401);
  assert.equal(logs.length,count);assert.ok(!JSON.stringify(logs).includes("SECRET"));
});
