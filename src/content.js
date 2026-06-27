/*!
 * content.js — 淘宝购物车导出助手 · 内容脚本（隔离世界）
 * 职责：接收主世界 Fiber 扫描出的商品（带勾选状态）→ 注入"导出"按钮
 *       → 点击只导出"勾选的"商品 → 调导出引擎。
 * 兜底：若 Fiber 没扫到，回退用拦截到的购物车 API JSON / DOM 抓取。
 * 全原创代码。
 */
;(function () {
  'use strict';
  const TAG = '__TCE_CART__';
  let fiberItems = []; // 来自主世界 Fiber 扫描（已归一、带 _selected）
  const captured = []; // 兜底：购物车 API JSON

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.tag !== TAG) return;
    if (d.kind === 'items' && Array.isArray(d.items)) {
      fiberItems = d.items;
      const sel = fiberItems.filter((i) => i._selected).length;
      console.log('%c[购物车导出·内容] 收到 Fiber 商品 ' + fiberItems.length + ' 个（勾选 ' + sel + '）', 'color:#1a73e8;font-weight:bold');
    } else if (d.kind === 'fetch' || d.kind === 'xhr') {
      console.log('%c[购物车导出·兜底] 捕获 ' + d.kind, 'color:#9c27b0', d.url);
      let parsed = { items: [], debug: '' };
      try { parsed = globalThis.TCE_cartParse.parseCaptured(d.body, d.url); } catch (err) {}
      if (parsed.items.length) captured.push({ url: d.url, items: parsed.items });
    }
  });

  function gatherItems() {
    if (fiberItems.length) return { items: fiberItems, via: 'fiber(逐行)' };
    let best = null;
    for (const c of captured) if (c.items.length && (!best || c.items.length > best.items.length)) best = c;
    if (best) return { items: best.items, via: 'api(兜底)' };
    const r = globalThis.TCE_cartParse.scrapeDom();
    return { items: r.items, via: 'dom(兜底)' };
  }

  async function onExport() {
    const { items, via } = gatherItems();
    const selected = items.filter((it) => it._selected);
    console.group('%c[购物车导出] 导出', 'color:#1a73e8;font-weight:bold');
    console.log('来源:', via, '| 扫到', items.length, '| 勾选', selected.length);
    if (selected.length) console.log('第 1 个勾选商品:', selected[0]);
    console.groupEnd();

    if (!items.length) {
      console.error('%c[购物车导出] 没扫到商品。Fiber 商品数为 0。请滚动购物车让数据加载，等几秒再点导出。', 'color:red');
      alert('没扫到商品。\n\n请在购物车页上下滚动一下、等 2-3 秒，再点「导出购物车」。\n若仍失败：F12 把 [购物车导出] 日志复制发作者。');
      return;
    }
    if (!selected.length) {
      alert('扫到 ' + items.length + ' 个商品，但没检测到勾选的。\n\n请在购物车里勾选要导出的商品（点商品前的复选框✔），再点导出。\n（若明明勾选了却提示这个：F12 把 [购物车导出] 日志发作者——勾选状态读取需按淘宝真实结构调一下）');
      return;
    }
    try {
      await globalThis.__tceExport(selected, 'taobao');
    } catch (err) {
      console.error('[购物车导出] 导出抛错', err);
      alert('导出失败：' + err);
    }
  }

  function injectButton() {
    if (document.getElementById('__tce_export_btn')) return;
    if (!document.body) return;
    const btn = document.createElement('button');
    btn.id = '__tce_export_btn';
    btn.innerHTML = '📥 导出购物车';
    btn.title = '淘宝购物车导出助手（只导出勾选的商品）';
    btn.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483646;padding:12px 18px;border:none;border-radius:24px;background:linear-gradient(135deg,#ff7a00,#ff4400);color:#fff;font-size:14px;font-weight:700;box-shadow:0 4px 14px rgba(255,68,0,.45);cursor:pointer;font-family:-apple-system,"Microsoft YaHei",system-ui,sans-serif;';
    btn.addEventListener('mouseenter', () => { btn.style.transform = 'translateY(-1px)'; });
    btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
    btn.addEventListener('click', onExport);
    document.body.appendChild(btn);
  }

  if (document.body) injectButton();
  document.addEventListener('DOMContentLoaded', injectButton);
  setInterval(injectButton, 2000);

  console.log('%c[购物车导出·内容] 已加载（Fiber 逐行版）。勾选商品 → 点右下角"导出购物车"', 'color:#34a853;font-weight:bold');
})();
