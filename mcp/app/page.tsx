import { getChatGPTUser, chatGPTSignInPath } from "./chatgpt-auth";
import { engine } from "../lib/bridge-runtime";
import VoiceBenchmark from "./VoiceBenchmark";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await getChatGPTUser();
  if (!user) return <main style={{maxWidth:720,margin:"80px auto",padding:24}}><h1>SaySo</h1><p>iPhone 真实屏幕共享与 ChatGPT 看图测试。</p><a href={chatGPTSignInPath("/")} target="_top">使用 ChatGPT 登录</a></main>;
  let devices: Awaited<ReturnType<ReturnType<typeof engine>["listDevices"]>> = [];
  let unavailable = false;
  try { devices = await engine().listDevices({ id: user.userId, label: user.displayName }); } catch { unavailable = true; }
  return <main style={{maxWidth:760,margin:"64px auto",padding:24,fontFamily:"system-ui",lineHeight:1.7}}>
    <p style={{color:"#52615d",letterSpacing:2}}>SaySo · 屏幕共享与灯控测试</p>
    <h1 style={{fontSize:36,marginBottom:16}}>让当前 ChatGPT 看见手机画面</h1>
    <p>手机通过系统广播把真实画面上传到 Sites。插件返回图像内容，由当前 ChatGPT 会话分析；此服务不调用另一个模型 API。</p>
    <VoiceBenchmark />
    <section style={{borderTop:"1px solid #dce3df",marginTop:32,paddingTop:20}}>
      <h2>连接步骤</h2><ol><li>在已连接的 SaySo 插件中生成一次性配对码。</li><li>在 iPhone 的 SaySo App 连接此服务并兑换配对码。</li><li>亲自确认 iOS 系统的开始广播面板。</li><li>回到同一 ChatGPT 对话，请求最新画面。</li></ol>
    </section>
    <section style={{borderTop:"1px solid #dce3df",marginTop:28,paddingTop:20}}><h2>我的设备</h2>
      {unavailable ? <p>云端存储尚未就绪，请稍后重试。</p> : devices.length ? devices.map(device => <div key={device.device_id} style={{padding:"12px 0"}}><strong>{device.name}</strong><p>{device.online ? "有近期共享心跳" : "尚未共享或心跳已过期"} · {device.latest_frame ? "已有图像观测" : "尚无画面"}</p></div>) : <p>还没有配对设备。请先在插件中生成配对码。</p>}
    </section>
    <aside style={{background:"#f0f5f2",padding:20,marginTop:28,borderRadius:12}}>可选灯控：在手机上关闭“仅共享屏幕”，再到首页的“开发诊断”开启“前台云端点灯诊断”，保持 App 在前台，然后请 ChatGPT 开灯或关灯。鼠标控制须以当前手机许可与 USB 能力为准。图像只提供最新一张；停止后清理当前副本，聊天图片和云端备份可能继续保留。Live 语音模式的工具可用性将单独实测。</aside>
  </main>;
}
