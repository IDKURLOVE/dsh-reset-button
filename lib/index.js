/**
 * dsh-reset-button — Host half.
 *
 * 只做两件事，且都只绑回环地址：
 *   POST /dsh-reset-button/restart   重启整个 DSH 桌面应用（Client half 的兜底通道）
 *   GET  /dsh-reset-button/status    报告本进程是否具备重启能力
 *
 * 为什么需要它：Client half 首选 preload 的原生桥 `dshDesktop.restartHarness()`；
 * 但用浏览器直接打开 DSH Web（没有 preload）时，那条路不存在，于是回退到这里。
 *
 * 重启方式：写一个一次性 .cmd 到临时目录，用 detached 的 cmd.exe 执行
 * 「等 1 秒 → 按镜像名结束 DSH 桌面进程树 → 等 1 秒 → 重新启动同一 exe」。
 * 之所以必须 detached：那个脚本要杀掉拉起它自己的应用，不脱离父进程的话会一起死。
 * 安全阀：只有 `process.execPath` 真的是 DSH 桌面应用（不是 node/electron 开发运行时）
 * 才动手，否则直接返回 unsupported —— 绝不误杀别人的进程。
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'

export const name = 'dsh-reset-button'
export const inject = ['webServer']

const RESTART_ROUTE = '/dsh-reset-button/restart'
const STATUS_ROUTE = '/dsh-reset-button/status'
const DESKTOP_EXE = /^DSH[ ._-]?Desktop(\.exe)?$/i

function capability() {
  const platform = process.platform
  const executable = process.execPath || ''
  const looksDesktop = platform === 'win32' && DESKTOP_EXE.test(basename(executable))
  return {
    platform,
    executablePath: executable,
    supported: looksDesktop,
    reason: looksDesktop ? null : 'not-a-dsh-desktop-runtime',
    electron: Boolean(process.versions && process.versions.electron),
  }
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

function isLoopback(req) {
  const remote = req.socket && req.socket.remoteAddress ? String(req.socket.remoteAddress) : ''
  return remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1'
}

function relaunchDesktop() {
  const cap = capability()
  if (!cap.supported) return { ok: false, reason: cap.reason, capability: cap }

  const exe = cap.executablePath
  const image = basename(exe)
  const script = join(tmpdir(), `dsh-reset-button-${Date.now()}.cmd`)
  const body = [
    '@echo off',
    'rem dsh-reset-button: relaunch DSH Desktop without asking the user to close and reopen it',
    'timeout /t 1 /nobreak >nul',
    `taskkill /IM "${image}" /T /F >nul 2>&1`,
    'timeout /t 1 /nobreak >nul',
    `start "" "${exe}"`,
    'del "%~f0" >nul 2>&1',
    '',
  ].join('\r\n')

  writeFileSync(script, body, 'utf8')
  const child = spawn('cmd.exe', ['/c', script], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
  return { ok: true, mode: 'relaunch-desktop', image, script, capability: cap }
}

export function apply(ctx) {
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: STATUS_ROUTE,
      handler: (req, res) => {
        if (!isLoopback(req)) {
          sendJson(res, 403, { ok: false, error: 'loopback only' })
          return
        }
        sendJson(res, 200, { ok: true, capability: capability() })
      },
    }),
    'dsh-reset-button: status route',
  )

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: RESTART_ROUTE,
      handler: (req, res) => {
        if (!isLoopback(req)) {
          sendJson(res, 403, { ok: false, reason: 'loopback only' })
          return
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, reason: 'POST only' })
          return
        }
        let result
        try {
          result = relaunchDesktop()
        } catch (error) {
          result = { ok: false, reason: String((error && error.message) || error) }
        }
        sendJson(res, result.ok ? 200 : 501, result)
      },
    }),
    'dsh-reset-button: restart route',
  )
}