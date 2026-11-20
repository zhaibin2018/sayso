# SaySo 服务发行包本地准备记录

日期：2026-11-20。状态：**本地准备完成；未推送、未部署；等待 Claude 评审和另行发布指令**。

## 已公开源码与指定版本

公开仓库是 `https://github.com/zhaibin2018/sayso`，本次起点为 `26638a60c9b0fe97af3078cc6b41728390b74750`。旧服务在 `mcp/`，运行版本 **0.13.252**；旧插件在 `plugins/sayso/`，技能版本 **1.2.42**。两者由本地公开仓库的实际源码、清单和 Git 历史确认，最近相关源码发布提交为 `d815125`。旧发布说明有更早版本的历史段落，以源码和 SOURCE_MANIFEST.json 为准。本次未联网核对远端状态。

任务指定的 Site 242 源码为 Worker 精确提交 `f654165f7fae443ce219bfa21e1177913744bb15`，实际运行版本 **0.13.256**；技能来自精确提交 `6347afc3535caed18366b343e2919290d96dcfa7`，版本 **1.2.45**。没有访问该私人 Site，也没有使用 Worker 或插件工作区草稿。

与旧公开快照相比，最终发行模板中的服务文件为 268 个相同、38 个变化、33 个新增、3 个移除；这里包含导出和发行元数据差异，不等同于业务变更数量。17 个技能文件中 10 个相同、7 个变化，另有 1 个中性的插件展示清单变化。完整路径和比较口径保存在包内 `SOURCE_DIFF.json`。

## 发行包与出处

本地固定目录：`release/service/v0.13.256/`。固定发行提交：`82b723d06072cd15e1cc2cdbe8541573d30e1f52`。索引和安装指令后续提交在包外，不改变这个发行提交。

```text
release/service/
  README.md                       中英文一句话安装指令，指向固定发行提交
  v0.13.256.manifest.sha256        manifest 自身的 SHA-256
  v0.13.256/
    mcp/                          服务源码、锁文件、测试、29 个 SQL 迁移
    plugins/sayso/skills/          七个技能、17 个原始文件
    plugins/sayso/plugin.json      不含 App 依赖的中性展示元数据，仅供联合测试
    README.md / INSTALL.md / RESOURCES.md
    PROVENANCE.json / SOURCE_DIFF.json / VALIDATION.json
    manifest.json / verify.py
    LICENSE.md / LICENSE_DETAILS.md / THIRD_PARTY.md
    TRADEMARK.md / CONTRIBUTING.md
```

包内共 **370 个文件**，manifest 列出其余 **369 个文件**的 SHA-256 和字节数；manifest 自身由包外校验文件和固定 Git 树覆盖，避免自哈希循环。清单严格比较完整文件集合，不只比较已列出文件。

全部来源通过 Git tree/cat-file 读取原始 blob，不检出/修改源仓库。共 357 个上游文件，其中 **352 个原样保留**，5 个发行变换逐一记入 PROVENANCE.json：

1. 服务 hosting 清单移除开发者 project_id。
2. 服务 README 脱敏开发者身份/地址。
3. bridge-runtime 的开发者 origin 换为安装者占位符。
4. 发行副本 .gitattributes 改为保留字节，避免上游部分 CRLF blob 被 Git 过滤器自动归一化、破坏清单。
5. 插件展示清单名称中性化并移除开发者 App 依赖，保留精确提交的版本、作者和双语说明，沿用旧公开导出的做法。它不能替换安装者的原插件身份清单。

原生 Swift 实现片段及开发者 .app.json/.codex-plugin 清单已排除。保留的 TypeScript 协议夹具和合成 firmware-info JSON 是服务离线测试数据，不包含原生 App/固件实现。许可沿用原公开源的 FSL-1.1-ALv2 和 `Copyright 2026 ZHAI BIN`，保留两个相邻 MIT 第三方声明，不改成 OSI 开源许可。

## 安装契约

安装说明要求 Site 名固定为 `sayso`，使用安装者自己的 D1 `DB`、私有 R2 `BUCKET`、MCP `/mcp` 和平台原生插件。生成/签发门禁卡并经受保护工具直接保存；独立生成三个 32 字节随机十六进制运行密钥用于帧签名、维护和计时读取，不显示任何值。平台门禁卡与 Worker 环境变量明确区分，不编造平台 API 或新环境变量。

29 个 SQL 文件从 0000 依次到 0028；上游 Drizzle journal 只到 0025，安装者必须用显式 SQL 清单和私人迁移记录覆盖最后三个迁移。已有 Site 原地更新，保留资源、身份、有效密钥和设备注册；只应用缺失迁移，不清库、不重新配对、不自动轮换有效帧密钥。维护需要另外配置受保护的五分钟调度；普通生产构建的计时导出接口关闭，不能为了安装而打开诊断构建。

装好后核对 MCP 初始化版本，再通过原生插件调用 `get_control_guide({"workflow":"overview"})`。该工具只返回说明，不看手机、不调用设备。D1/R2 与迁移另由平台资源检查验证。当前精确版本尚无正式 L06 create_pairing_link 和 /pair，不将本地发行包验证冒充真实手机完整安装或自动回 App 配对验收。

## 一句话安装指令

先在目标账号切到 **ChatGPT 工作模式**，再发送。以下地址在本次本地提交发布前尚不可用于远端安装，本次没有尝试联网安装。

中文：

```text
请按 https://github.com/zhaibin2018/sayso/blob/82b723d06072cd15e1cc2cdbe8541573d30e1f52/release/service/v0.13.256/INSTALL.md 安装或原地更新我的私人 Site sayso，自动配置密钥和配套技能，不显示凭证。
```

English:

```text
Install or update my private Site sayso using https://github.com/zhaibin2018/sayso/blob/82b723d06072cd15e1cc2cdbe8541573d30e1f52/release/service/v0.13.256/INSTALL.md, configuring secrets and its skills without displaying credentials.
```

## 本地验证结果

| 检查 | 结果 |
|---|---|
| 依赖、类型、契约、源码预算、生产构建 | 全部通过；从发行包复制到全新临时目录安装依赖、构建，未借用源 Worker 的 node_modules |
| 全量服务测试 | **828 passed，0 failed，0 skipped**，154575.4043 ms |
| 服务/技能联合测试 | 原封不动的测试读取包内七个技能和中性展示清单；仅在临时根目录复制一份 plugin/ 路径别名，启用上游原目录布局的可选联合测试，无测试或业务源码补丁 |
| 生产诊断边界 | 61 个 JS 产物通过诊断代码/图像排除检查 |
| 迁移独立审计 | 本地全新 SQLite 连续应用 29 个迁移，27 表、3 个隐私触发器；不等于线上 D1 验收 |
| 凭证扫描 | **0 个实际凭证发现**；覆盖私有 Site 地址、开发者身份绑定、私钥、常见提供商令牌/JWT、URL 认证、字面授权头/运行密钥、禁入路径；没有找到可额外比对的本地 .env/.dev.vars 文件 |
| 合成夹具 | 唯一命中是原公开源码里拒绝无效授权头的负向断言，按完整行 SHA-256 精确识别并单列；没有整个 tests 目录的豁免 |
| 扫描器/manifest 反向校验 | 临时篡改文件会被拒绝，临时注入合成提供商令牌也会被拒绝；测试值未输出 |
| manifest 和 Git 字节 | 全文件集合/大小/哈希通过；逐文件比较暂存区 blob；checkout-index 导出到全新目录后再次通过 |
| 官网工作源码 | build:integrated 通过，**58 项测试通过** |
| 官网公开导出 | build:integrated 通过，**58 项测试通过** |
| 原公开源清单 | 既有 340 个文件验证通过，未覆盖/更改旧 mcp 快照 |
| 全公开边界扫描 | 发行提交的 **815 个跟踪文件通过**；加入索引与本记录后再次检查 |

环境：Windows，Node 26.13.1、npm 11.20.0。详细安全结果及本地日志的字节数/SHA-256 保存在 `VALIDATION.json`；日志内容未放入发行包。公开官网综合检查中有 Vite 测试服务器关闭期间的依赖预扫描提示，最终全部测试及产物组装退出码为 0；未为此修改官网源代码。

初次服务联合测试发现缺失展示清单（826 passed、1 failed、1 skipped）；补入中性的上游展示元数据，并在临时验证树启用原插件路径后，重新全量执行得到上述 828/0/0。没有删除失败断言或修改固定版本业务代码来使测试通过。

## 推送前交给 Claude 确认

- 确认任务指定的两个精确提交、来源对比及 5 项发行变换；确认没有误带其他 Codex 的 L04 或 App 横屏草稿。
- 审查扫描边界、唯一精确合成夹具例外、原生源码排除和中性展示清单；确认所有身份/运行凭证继续留在发行包外。
- 审查门禁卡受保护签发/保存的能力边界、3 个密钥角色、迁移 0026–0028、维护调度与原地更新/不重放说明。
- 确认固定发行提交与中英文指令；本次尚未公开，不能声称链接已经可安装。
- 真实 SaySo 手机完整安装、后台凭证交接和 L06 正式配对仍需后续独立验收；本记录不授权新建 Site、部署、设备测试或推送。
- 评审通过后仍须用户另行明确发布指令；按 D77 仅发布官网公开仓库，不推主仓库、Worker 或 App 仓库。

此次没有推送、部署、新建或访问私人 Site，没有操作任何设备，没有修改源 Worker 主线或 App 仓库，也没有输出凭证。
