export const RENDERER_PROBE_URI = "ui://sayso/renderer-probe/v1.html";

// Intentionally has no images, external assets, API requests or device tools.
// It distinguishes host template loading from our image/context logic.
export const rendererProbeHtml = String.raw`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>SaySo renderer probe</title></head>
<body><main><h1>SaySo 组件加载诊断</h1>
<p>本页没有手机、ESP32、图片、麦克风或模型调用。</p>
<p id="stage" role="status">PROBE_HTML_RENDERED</p><pre id="details"></pre></main>
<script>
(function(){
 var stage=document.getElementById("stage"), details=document.getElementById("details");
 stage.textContent="PROBE_SCRIPT_EXECUTED";
 if(window.parent===window){stage.textContent="PROBE_NO_HOST";return;}
 var timer=setTimeout(function(){stage.textContent="PROBE_INITIALIZE_TIMEOUT";},10000);
 window.addEventListener("message",function(event){
  if(event.source!==window.parent||!event.data||event.data.jsonrpc!=="2.0")return;
  var message=event.data;
  if(message.method==="ui/resource-teardown"){
   clearTimeout(timer);window.parent.postMessage({jsonrpc:"2.0",id:message.id,result:{}},"*");return;
  }
  if(message.id!=="sb-renderer-probe-init"||message.method)return;
  clearTimeout(timer);
  if(message.error){stage.textContent="PROBE_INITIALIZE_REJECTED";details.textContent=String(message.error.code)+" "+String(message.error.message);return;}
  var result=message.result||{};
  details.textContent=JSON.stringify({protocolVersion:result.protocolVersion,capabilities:Object.keys(result.hostCapabilities||{}),host:result.hostInfo},null,2);
  window.parent.postMessage({jsonrpc:"2.0",method:"ui/notifications/initialized",params:{}},"*");
  stage.textContent="PROBE_INITIALIZED";
 });
 window.parent.postMessage({jsonrpc:"2.0",id:"sb-renderer-probe-init",method:"ui/initialize",params:{appInfo:{name:"sayso-renderer-probe",version:"1.0.0"},appCapabilities:{availableDisplayModes:["inline","fullscreen"]},protocolVersion:"2026-01-26"}},"*");
})();
</script></body></html>`;
