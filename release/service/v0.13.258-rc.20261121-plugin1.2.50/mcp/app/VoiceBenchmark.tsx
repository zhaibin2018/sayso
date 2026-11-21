"use client";
import { useEffect, useRef, useState } from "react";
const prompts = [
  { id: "current_screen", text: "你现在能看到我的手机上是什么？" },
  { id: "screen_change", text: "我已经切换页面了，现在看到什么？" },
  { id: "icon_location", text: "请说出屏幕上 ChatGPT 图标的位置。" },
];
export default function VoiceBenchmark() {
  const [scenario, setScenario] = useState(prompts[0].id), [phase, setPhase] = useState("idle");
  const [elapsed, setElapsed] = useState(0), [first, setFirst] = useState<number | null>(null), [message, setMessage] = useState("");
  const begun = useRef(0), run = useRef("");
  useEffect(() => { if (phase !== "running") return; const timer = setInterval(() => setElapsed(performance.now() - begun.current), 100); return () => clearInterval(timer); }, [phase]);
  async function send(body: unknown) {
    const response = await fetch("/v1/voice-benchmark", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json() as { error?: { code?: string } }; if (!response.ok) throw new Error(result.error?.code ?? "保存失败"); return result;
  }
  async function start() {
    setPhase("preparing"); setMessage(""); setFirst(null); setElapsed(0); run.current = crypto.randomUUID();
    try { await send({ action: "start", run_id: run.current, scenario }); begun.current = performance.now(); setPhase("running"); }
    catch (error) { setPhase("idle"); setMessage(String(error)); }
  }
  async function finish() {
    const total = performance.now() - begun.current; setElapsed(total); setPhase("saving");
    try { await send({ action: "finish", run_id: run.current, total_ms: total, first_response_ms: first }); setMessage("已保存本次人工标记的语音总耗时。"); setPhase("done"); }
    catch (error) { setMessage(String(error)); setPhase("done"); }
  }
  const button = { border: "1px solid #8ba69b", borderRadius: 9, padding: "12px 16px", cursor: "pointer", background: "white" };
  return <section style={{ border: "1px solid #c9d9cf", borderRadius: 14, padding: 22, marginTop: 28 }}>
    <h2>语音总耗时实测</h2>
    <p>在电脑上打开此计时器，iPhone 保持 ChatGPT 语音与 SaySo 共享。计时开始后立即提问，听到第一句有效回答时标记一次，完整回答结束时再标记一次。不录制声音。</p>
    <select aria-label="测试问题" value={scenario} disabled={phase === "running" || phase === "preparing" || phase === "saving"} onChange={event => setScenario(event.target.value)} style={{ padding: 10, maxWidth: "100%" }}>
      {prompts.map(prompt => <option key={prompt.id} value={prompt.id}>{prompt.text}</option>)}
    </select>
    <p style={{ fontSize: 40, fontVariantNumeric: "tabular-nums", margin: "16px 0" }}>{(elapsed / 1000).toFixed(1)} 秒</p>
    <p role="status">{phase === "running" ? "计时中，现在开始提问" : phase === "preparing" ? "正在准备计时…" : phase === "saving" ? "保存中…" : message || "准备好后开始；手机画面切换应在计时前完成。"}</p>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <button style={button} disabled={["running", "preparing", "saving"].includes(phase)} onClick={start}>开始计时</button>
      <button style={button} disabled={phase !== "running" || first != null} onClick={() => setFirst(performance.now() - begun.current)}>听到首句有效回答</button>
      <button style={button} disabled={phase !== "running"} onClick={finish}>完整回答结束</button>
    </div>
    {first != null && <p>首句：{(first / 1000).toFixed(1)} 秒</p>}
    <p style={{ color: "#607369", fontSize: 13 }}>包含提问时间与人工标记误差；不等于后台任务时长或单次取图耗时。</p>
  </section>;
}
