# dsh-restart

给 **DSH（DeepSeek Harness）** 的对话框工具栏加一个「**重启**」按钮 —— 就在「完全权限」所在那一行的右侧。
点一下，DSH 自己重启完毕；装完插件再也不用自己关掉窗口、再手动打开。

```
┌─────────────────────────────── composer ───────────────────────────────┐
│  [完全权限 ▾]  [模型 ▾]  …                      [↻ 重启]  [ 发送 ]      │
└────────────────────────────────────────────────────────────────────────┘
```

MIT 开源。

---

## 它解决什么

在 DSH 里装/改插件、改 profile patch、换 MCP 之后，宿主都要重启一次才生效。
以前必须：关掉 DSH Desktop → 重新打开 → 找回刚才那个会话。

现在：点「重启」→ 等几秒 → 页面自己回来，接着干活。

## 工作原理（两条通道，按顺序尝试）

1. **桌面端原生桥（首选）**
   DSH Desktop 的 preload 已经暴露了原生重启：
   `globalThis.dshDesktop.restartHarness()` → `ipcRenderer.invoke('harness:restart')`。
   按钮直接调它，重启过程由 Desktop 主进程负责，最干净。

2. **Host 兜底（浏览器打开 DSH Web 时走这条）**
   `POST /dsh-restart/restart`（只接受回环地址），Host half 写一个一次性 `.cmd` 到临时目录，
   用 **detached** 的 `cmd.exe` 执行：
   `等 1s → taskkill /IM "DSH Desktop.exe" /T /F → 等 1s → start "" "<同一个 exe>"`。
   必须 detached，否则脚本会跟着它要杀的应用一起死。

3. **两条都不通**：按钮只上报错误（红色），不做任何破坏性动作。

安全阀：Host 兜底只有在 `process.execPath` 确实是 DSH 桌面应用（`DSH Desktop.exe`）时才动手；
node/electron 开发运行时下直接返回 `501 not-a-dsh-desktop-runtime`，绝不误杀别的进程。

## 安装

### 方式 A：本地插件目录（DSH Desktop，推荐）

```powershell
$plugins = "$env:APPDATA\dsh-desktop\harness\plugins"
$profile = "$env:APPDATA\dsh-desktop\harness\profiles\web"

# 1) 放包（这里用 junction 指到源码仓库，改完即生效）
New-Item -ItemType Directory -Force -Path "$plugins\dsh-restart" | Out-Null
Copy-Item -Recurse -Force .\* "$plugins\dsh-restart\"

# 2) 接到 profile 的 node_modules
New-Item -ItemType Junction -Force -Path "$profile\node_modules\dsh-restart" `
  -Target "$plugins\dsh-restart" | Out-Null
```

3) 在 `$profile\cordis.patch.yml` 末尾加：

```yaml
# dsh-restart: 一键重启
- insert:
    - id: dsh-restart
      name: 'dsh-restart'
```

4) 重启一次 DSH（这次还没按钮，手动重启；之后就一直有按钮了）。

### 方式 B：从 GitHub

```powershell
git clone https://github.com/IDKURLOVE/dsh-restart.git
cd dsh-restart
# 然后照方式 A 的第 1~4 步；或把它作为 bundle 装进 profile
```

## 卸载

```powershell
# 1) 从 cordis.patch.yml 里删掉 dsh-restart 的 insert 段
# 2) 断开连接并删包
Remove-Item "$profile\node_modules\dsh-restart" -Force
Remove-Item "$plugins\dsh-restart" -Recurse -Force
# 3) 重启 DSH
```

## 配置

无需配置。想挪位置就改 `client.js` 里的两个常量：

| 常量 | 默认 | 含义 |
|---|---|---|
| `SLOT` | `conversation.input.right` | 挂载槽位（工具栏右侧、发送按钮前的紧凑控件区） |
| `order` | `10` | 同槽位内的排序（`dsh-purge` 的 rewind 是 `20`，所以本按钮排在它左边） |

想放到别的槽位（例如 `conversation.input.left`、`conversation.dock`、`sidebar.footer.action`）只需改 `SLOT`。

## 自测

```bash
node selftest.mjs      # 校验 package.json / client.js / lib/index.js 的结构契约
```

## 兼容性

| 项 | 要求 |
|---|---|
| DSH Desktop | 任意近期版本（`dshDesktop.restartHarness` 为 Desktop 内建桥） |
| Node | ≥ 18 |
| 平台 | Windows 用原生桥 + Host 兜底；macOS / Linux 走原生桥（Host 兜底不适用，会返回 `unsupported`） |

## License

MIT © 2026 IDKURLOVE