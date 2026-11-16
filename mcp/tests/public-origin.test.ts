import test from "node:test";
import assert from "node:assert/strict";
import {resolvePublicOrigin,unconfiguredOrigin} from "../lib/public-origin.ts";
test("public source has no developer instance fallback",()=>{
  assert.equal(resolvePublicOrigin(undefined),unconfiguredOrigin);
  assert.equal(resolvePublicOrigin("https://my-site.example/"),"https://my-site.example");
  assert.equal(resolvePublicOrigin("http://127.0.0.1:5173"),"http://127.0.0.1:5173");
  for(const value of ["http://example.com","https://user:secret@example.com","https://example.com/mcp","https://example.com/?token=secret","https://example.com/#x"])assert.throws(()=>resolvePublicOrigin(value));
});
