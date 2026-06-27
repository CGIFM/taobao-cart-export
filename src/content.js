/*!
 * content.js — 淘宝购物车导出助手 · 内容脚本（隔离世界）
 * 职责：接收主世界拦截到的购物车数据 + DOM 兜底；注入"导出"按钮；点击→过滤勾选→调导出引擎。
 * Phase A 探针版：全程打 [购物车导出] 日志，方便用户复制 F12 日志发作者精准化。
 * 全原创代码。
 */
;(function () {
  'use strict';
  const TAG = '__TCE_CART__';
  const captured = []; // 所有命中的购物车响应：{ url, items[], debug }

  // ---- 接收主世界拦截数据 ----
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.tag !== TAG) return;
    let parsed = { items: [], debug: '' };
    try { parsed = globalThis.TCE_cartParse.parseCaptured(d.body, d.url); } catch (err) { parsed.debug = '解析异常 ' + err; }
    console.log('%c[购物车导出·捕获] ' + d.kind, 'color:#9c27b0;font-weight:bold', d.url, '\n  → 解出商品 ' + parsed.items.length + (parsed.from ? '（来自 ' + parsed.from + '）' : ''));
    if (parsed.debug) console.log('  结构摘要:', parsed.debug.slice(0, 800));
    captured.push({ url: d.url, items: parsed.items, debug: parsed.debug, from: parsed.from });
    // 只留最近 20 条
    if (captured.length > 20) captured.shift();
  });

  // ---- 取当前最佳商品快照 ----
  function gatherItems() {
    // 优先用"解出商品最多"的快照
    let best = null;
    for (const c of captured) if (c.items.length && (!best || c.items.length > best.items.length)) best = c;
    if (best) return { items: best.items, via: 'api(' + best.url.slice(0, 60) + ')' };
    // DOM 兜底
    const r = globalThis.TCE_cartParse.scrapeDom();
    console.log('%c[购物车导出·DOM 兜底]', 'color:#e67e22', JSON.stringify(r.debug));
    return { items: r.items, via: 'dom' };
  }

  // ---- 导出按钮点击 ----
  async function onExport() {
    const { items, via } = gatherItems();
    const selected = items.filter((it) => it._selected);
    console.group('%c[购物车导出] 导出', 'color:#1a73e8;font-weight:bold');
    console.log('来源:', via, '| 总商品', items.length, '| 勾选', selected.length);
    if (selected.length && selected[0]) console.log('样例商品:', selected[0]);
    console.groupEnd();
    if (!selected.length) {
      console.error('%c[购物车导出] 没抓到勾选商品。捕获到的购物车响应如下（请把这块日志复制发给作者）：', 'color:red;font-weight:bold');
      if (!captured.length) console.error('（一条购物车 API 都没拦截到——可能淘宝用了 JSONP/其它通道，需看 DOM 兜底）');
      captured.forEach((c, i) => console.error('[' + i + '] ', c.url, '→ 商品' + c.items.length, c.debug ? '\n摘要:' + c.debug.slice(0, 600) : ''));
      alert('还没抓到勾选的商品。\n\n请：1) 在购物车页上下滚动一下让数据加载；2) 再点导出。\n若仍失败：按 F12 把控制台里 [购物车导出] 的红字日志复制发给作者（探针版需据此精准化）。');
      return;
    }
    try {
      await globalThis.__tceExport(selected, 'taobao');
    } catch (err) {
      console.error('[购物车导出] 导出抛错', err);
      alert('导出失败：' + err);
    }
  }

  // ---- 注入浮动按钮（SPA 防丢，轮询补） ----
  function injectButton() {
    if (document.getElementById('__tce_export_btn')) return;
    if (!document.body) return;
    const btn = document.createElement('button');
    btn.id = '__tce_export_btn';
    btn.innerHTML = '📥 导出购物车';
    btn.title = '淘宝购物车导出助手（勾选的商品）';
    btn.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483646;padding:12px 18px;border:none;border-radius:24px;background:linear-gradient(135deg,#ff7a00,#ff4400);color:#fff;font-size:14px;font-weight:700;box-shadow:0 4px 14px rgba(255,68,0,.45);cursor:pointer;font-family:-apple-system,"Microsoft YaHei",system-ui,sans-serif;';
    btn.addEventListener('mouseenter', () => { btn.style.transform = 'translateY(-1px)'; });
    btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
    btn.addEventListener('click', onExport);
    document.body.appendChild(btn);
  }

  if (document.body) injectButton();
  document.addEventListener('DOMContentLoaded', injectButton);
  // SPA 可能后挂 DOM，轮询补
  setInterval(injectButton, 2000);

  console.log('%c[购物车导出·内容] 已加载（探针版）。去购物车勾选商品 → 点右下角"导出购物车"', 'color:#34a853;font-weight:bold');
})();
