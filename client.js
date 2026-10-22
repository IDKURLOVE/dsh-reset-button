/**
 * dsh-restart — Client half.
 *
 * 在对话框工具栏（composer tool row）里、`conversation.input.right` 槽位上挂一个
 * 「重启」按钮 —— 也就是「完全权限」所在那一行的右侧。点击后：
 *
 *   1) 桌面端：走 preload 暴露的原生桥 `globalThis.dshDesktop.restartHarness()`
 *      （= `ipcRenderer.invoke('harness:restart')`），由 DSH Desktop 自己完成重启，
 *      这是最干净的一条路。
 *   2) 原生桥不可用时（例如用浏览器打开 DSH Web）：回退到本插件 Host half 的
 *      `POST /dsh-restart/restart`，由 Host 侧拉起 detached 脚本重启桌面应用。
 *   3) 两条路都不通：按钮上报错误，不做任何破坏性动作。
 *
 * 加载约定：DSH 的 web 插件表按包名扫描 `package.json` 的 `dsh.client` 字段，再把本文件
 * 作为 `window.__ModuleLoader__.load({ id, factory })` 的模块执行。所以这里不自带打包器，
 * 全部逻辑保持单文件、零运行时依赖（只 require 宿主提供的 react）。
 */
window.__ModuleLoader__.load({
  id: "dsh-restart",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const react = require("react");
    const h = react.createElement;

    const name = "dsh-restart";
    const inject = ["slots", "locale"];
    const NS = "dsh-restart";
    const SLOT = "conversation.input.right";
    const ENTRY_ID = "dsh-restart";
    const STYLE_ID = "dsh-restart-style";
    const HOST_ROUTE = "/dsh-restart/restart";

    const ZH = {
      label: "重启",
      title: "重启 DSH（装完插件后点这里即可生效）",
      busy: "正在重启",
      busyTitle: "正在重启 DSH，稍等几秒页面会自动回来",
      confirm: "现在重启 DSH？进行中的会话会被中断。",
      unsupported: "当前环境不支持自动重启，请在 DSH 桌面端使用这个按钮。",
      failed: "重启失败",
      failedHint: "原生桥和 Host 兜底都没成功，请手动重启 DSH Desktop。",
    };
    const EN = {
      label: "Restart",
      title: "Restart DSH (apply newly installed plugins without a manual relaunch)",
      busy: "Restarting",
      busyTitle: "Restarting DSH — the page comes back in a few seconds.",
      confirm: "Restart DSH now? Sessions in flight will be interrupted.",
      unsupported: "Automatic restart is not available here; use this button in DSH Desktop.",
      failed: "Restart failed",
      failedHint: "Neither the native bridge nor the host fallback worked. Please relaunch DSH Desktop manually.",
    };

    const CSS = [
      ".dshRestartButton{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 9px;",
      "border-radius:6px;border:1px solid var(--dsw-alias-border-l1);background:transparent;",
      "color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1;font-family:inherit;",
      "cursor:pointer;white-space:nowrap;transition:background .15s ease,color .15s ease,border-color .15s ease;}",
      ".dshRestartButton:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);",
      "color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2);}",
      ".dshRestartButton:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}",
      ".dshRestartButton:disabled{cursor:default;opacity:.62;}",
      ".dshRestartButton.isBusy{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);}",
      ".dshRestartButton.isError{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);}",
      ".dshRestartIcon{width:13px;height:13px;flex:0 0 auto;display:block;}",
      ".dshRestartButton.isBusy .dshRestartIcon{animation:dshRestartSpin .9s linear infinite;}",
      "@keyframes dshRestartSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}",
      "@media (max-width:560px){.dshRestartLabel{display:none}.dshRestartButton{padding:0 7px}}",
    ].join("");

    function ensureStyle() {
      if (typeof document === "undefined") return;
      if (document.getElementById(STYLE_ID)) return;
      const el = document.createElement("style");
      el.id = STYLE_ID;
      el.textContent = CSS;
      document.head.appendChild(el);
    }

    function RestartIcon(props) {
      return h(
        "svg",
        {
          className: "dshRestartIcon",
          viewBox: "0 0 16 16",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.6,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": "true",
          focusable: "false",
        },
        h("path", { d: "M13.4 7.2A5.6 5.6 0 1 0 13 10.6" }),
        h("path", { d: "M13.6 3.2v4h-4" }),
      );
    }

    /** 原生桥：DSH Desktop preload 暴露的 `dshDesktop.restartHarness()`。 */
    function nativeBridge() {
      try {
        const bridge = globalThis.dshDesktop;
        if (bridge && typeof bridge.restartHarness === "function") return bridge;
      } catch {
        /* ignore */
      }
      return null;
    }

    async function restartViaNative(bridge) {
      const result = await bridge.restartHarness();
      if (result && result.ok === false) {
        throw new Error(String(result.reason || "native-restart-failed"));
      }
      return "native";
    }

    async function restartViaHost() {
      const response = await fetch(HOST_ROUTE, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      const text = await response.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(response.status + " non-json: " + text.slice(0, 120));
      }
      if (!response.ok || !data || data.ok !== true) {
        throw new Error((data && (data.reason || data.error)) || "HTTP " + response.status);
      }
      return "host";
    }

    function RestartButton(props) {
      const t = (props && props.t) || ((key) => key);
      const [busy, setBusy] = react.useState(false);
      const [failed, setFailed] = react.useState("");

      const onClick = react.useCallback(async () => {
        if (busy) return;
        const bridge = nativeBridge();
        if (!bridge && typeof fetch !== "function") {
          setFailed(t("unsupported"));
          return;
        }
        setFailed("");
        setBusy(true);
        try {
          if (bridge) await restartViaNative(bridge);
          else await restartViaHost();
          // 成功即等待宿主重启：这里故意不 setBusy(false)，
          // 让按钮停在「正在重启」状态，直到渲染进程被替换或重连。
        } catch (error) {
          setBusy(false);
          setFailed(String((error && error.message) || error));
        }
      }, [busy, t]);

      const errorTitle = failed ? t("failed") + "：" + failed + " · " + t("failedHint") : "";
      return h(
        "button",
        {
          type: "button",
          className:
            "dshRestartButton" + (busy ? " isBusy" : "") + (failed && !busy ? " isError" : ""),
          title: busy ? t("busyTitle") : errorTitle || t("title"),
          "aria-label": t("label"),
          "data-testid": "dsh-restart-button",
          disabled: busy,
          onClick,
        },
        h(RestartIcon, null),
        h("span", { className: "dshRestartLabel" }, busy ? t("busy") : t("label")),
      );
    }

    function apply(ctx) {
      ensureStyle();
      ctx.effect(
        () => ctx.locale.register(NS, { zh: ZH, en: EN }),
        "dsh-restart: dictionaries",
      );
      const t = ctx.locale.bind(NS);
      ctx.slots.inject(SLOT, () =>
        ctx.slots.register(
          {
            name: SLOT,
            id: ENTRY_ID,
            // 10：排在 dsh-purge 的 rewind（order 20）之前，紧贴工具栏右侧控件。
            order: 10,
            locale: NS,
            inject: () => ({ t }),
          },
          RestartButton,
        ),
      );
    }

    exports.name = name;
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});