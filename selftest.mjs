/**
 * dsh-restart selftest — 结构契约校验（不需要跑起 DSH）。
 *
 *   node selftest.mjs
 *
 * 检查项：
 *   1. package.json 的 dsh.bundle.patch / dsh.client.platform / exports 是否齐
 *   2. client.js 是否用 window.__ModuleLoader__.load 注册，且导出了 name/inject/apply
 *   3. client.js 挂的槽位是不是 conversation.input.right，id 是否唯一
 *   4. client.js 是否优先走原生桥、并有 host 兜底
 *   5. lib/index.js 是否注册 restart / status 两个回环路由，且带安全阀
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(here, p), 'utf8')

let failures = 0
function check(label, condition, detail = '') {
  const ok = Boolean(condition)
  if (!ok) failures += 1
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
}

const pkg = JSON.parse(read('package.json'))
const client = read('client.js')
const host = read('lib/index.js')

console.log('package.json')
check('name', pkg.name === 'dsh-restart', pkg.name)
check('main -> lib/index.js', pkg.main === 'lib/index.js', pkg.main)
check('exports ./client', pkg.exports && pkg.exports['./client'] === './client.js')
check('dsh.bundle.patch', pkg.dsh?.bundle?.patch === './cordis.patch.yml')
check('dsh.client.platform = web', pkg.dsh?.client?.platform === 'web')
check('dsh.client.inject 非空', Array.isArray(pkg.dsh?.client?.inject) && pkg.dsh.client.inject.length > 0)
check('license = MIT', pkg.license === 'MIT', pkg.license)

console.log('client.js')
check('走 __ModuleLoader__.load', client.includes('window.__ModuleLoader__.load'))
check('id = dsh-restart', /id:\s*"dsh-restart"/.test(client))
check('exports.name / inject / apply', /exports\.name\s*=/.test(client) && /exports\.inject\s*=/.test(client) && /exports\.apply\s*=/.test(client))
check('inject 含 slots 与 locale', /const inject = \["slots", "locale"\]/.test(client))
check('槽位 = conversation.input.right', /const SLOT = "conversation\.input\.right"/.test(client))
check('优先原生桥 dshDesktop.restartHarness', client.includes('restartHarness'))
check('有 host 兜底路由', client.includes('/dsh-restart/restart'))
check('注册进 slots.inject + slots.register', client.includes('ctx.slots.inject') && client.includes('ctx.slots.register'))
check('不改动全局样式表重复注入', client.includes('document.getElementById(STYLE_ID)'))
check('用主题变量而非硬编码颜色', client.includes('--dsw-alias-'))

console.log('lib/index.js')
check('inject = [webServer]', /export const inject = \['webServer'\]/.test(host))
check('注册 restart 路由', host.includes("'/dsh-restart/restart'"))
check('注册 status 路由', host.includes("'/dsh-restart/status'"))
check('只接受回环地址', host.includes('isLoopback'))
check('detached 重启脚本', host.includes('detached: true') && host.includes('taskkill'))
check('安全阀：必须是 DSH 桌面应用', host.includes('not-a-dsh-desktop-runtime'))
check('清理一次性脚本', host.includes('del "%~f0"'))

console.log('')
if (failures === 0) {
  console.log('selftest: 全部通过 ✅')
} else {
  console.log(`selftest: ${failures} 项失败 ❌`)
  process.exitCode = 1
}