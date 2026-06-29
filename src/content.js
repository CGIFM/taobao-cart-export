/*!
 * content.js — 淘宝导出助手 · 内容脚本（隔离世界）
 * 职责：接收主世界 Fiber 扫描出的商品（带勾选状态）→ 注入"导出"按钮
 *       → 点击只导出"勾选的"商品 → 调导出引擎。
 * 自动识别购物车页 / 订单页。
 * 全原创代码。
 */
;(function () {
  'use strict';
  const TAG = '__TCE_CART__';
  let fiberItems = [];
  let rawDiag = null;

  // 页面识别
  const isOrderPage = location.hostname === 'buyertrade.taobao.com';
  const PAGE = isOrderPage
    ? { label: '订单', platform: 'orders', btn: '📥 导出订单', tip: '导出当前页的订单商品' }
    : { label: '购物车', platform: 'taobao', btn: '📥 导出购物车', tip: '只导出勾选的商品' };

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.tag !== TAG || d.kind !== 'items' || !Array.isArray(d.items)) return;
    fiberItems = d.items;
    if (d.diag) rawDiag = d.diag;
  });

  function gatherItems() {
    if (fiberItems.length) return fiberItems;
    try { return globalThis.TCE_cartParse.scrapeDom().items; } catch (e) { return []; }
  }

  async function onExport() {
    const items = gatherItems();
    let selected;
    if (isOrderPage) {
      selected = items;
    } else {
      selected = items.filter((it) => it._selected);
    }
    if (!items.length) {
      alert('没扫到商品。\n请在页面上下滚动一下、等 2-3 秒再点导出。');
      return;
    }
    if (!selected.length) {
      alert('扫到 ' + items.length + ' 个商品，但没检测到勾选的。\n请勾选要导出的商品（点商品前的复选框✔），再点导出。');
      return;
    }
    try {
      await globalThis.__tceExport(selected, PAGE.platform);
    } catch (err) {
      console.error('[淘宝导出] 导出失败', err);
      alert('导出失败：' + err);
    }
  }

  function injectButton() {
    if (document.getElementById('__tce_export_btn')) return;
    if (!document.body) return;
    const btn = document.createElement('button');
    btn.id = '__tce_export_btn';
    btn.innerHTML = PAGE.btn;
    btn.title = PAGE.tip;
    btn.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483646;padding:12px 18px;border:none;border-radius:24px;background:linear-gradient(135deg,#ff7a00,#ff4400);color:#fff;font-size:14px;font-weight:700;box-shadow:0 4px 14px rgba(255,68,0,.45);cursor:pointer;font-family:-apple-system,"Microsoft YaHei",system-ui,sans-serif;';
    btn.addEventListener('mouseenter', () => { btn.style.transform = 'translateY(-1px)'; });
    btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
    btn.addEventListener('click', onExport);
    document.body.appendChild(btn);
  }

  if (document.body) injectButton();
  document.addEventListener('DOMContentLoaded', injectButton);
  setInterval(injectButton, 2000);
  console.log('%c[淘宝导出] 内容脚本已加载 v1.1.0 (' + PAGE.label + '页)', 'color:#ff4400;font-weight:bold');
})();
