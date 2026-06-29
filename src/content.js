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

  // 页面识别
  const isOrderPage = location.hostname === 'buyertrade.taobao.com';
  const PAGE = isOrderPage
    ? { label: '订单', platform: 'orders', btn: '📥 导出订单', tip: '导出当前页的订单商品' }
    : { label: '购物车', platform: 'taobao', btn: '📥 导出购物车', tip: '只导出勾选的商品' };

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.tag !== TAG || d.kind !== 'items' || !Array.isArray(d.items)) return;
    fiberItems = d.items;
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
    // 诊断弹窗 + 一键复制按钮
    var s0 = selected[0] || {};
    var diagText = '页面：' + (isOrderPage ? '订单页' : '购物车') + ' | 共 ' + selected.length + ' 件\n'
      + '首件：' + (s0.title || '?') + '\n'
      + '规格：' + JSON.stringify(s0.specs) + '\n'
      + '图片：' + (s0.images && s0.images.length ? s0.images[0].slice(0,60) : '(空)') + '\n'
      + '优惠前：' + (s0.price || '(空)') + ' | 优惠后：' + (s0.priceAfter || '(空)') + '\n'
      + '店铺：' + (s0.shop || '(空)') + ' | 商品ID：' + (s0.itemId || '(空)');
    console.log('[淘宝导出] ' + diagText);
    if (!window.__tceDiagShown) {
      window.__tceDiagShown = true;
      var dlg = document.createElement('div');
      dlg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:14px;padding:24px;box-shadow:0 12px 40px rgba(0,0,0,.3);z-index:2147483647;max-width:500px;font-family:-apple-system,"Microsoft YaHei",system-ui,sans-serif;';
      var pre = document.createElement('pre');
      pre.textContent = diagText;
      pre.style.cssText = 'font-size:13px;color:#333;white-space:pre-wrap;margin:0 0 14px;line-height:1.7';
      var btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:10px';
      var copyBtn = document.createElement('button');
      copyBtn.textContent = '📋 一键复制';
      copyBtn.style.cssText = 'flex:1;padding:10px;border:none;border-radius:8px;background:#1a73e8;color:#fff;font-size:13px;font-weight:700;cursor:pointer';
      copyBtn.onclick = function() {
        navigator.clipboard.writeText(diagText).then(function() {
          copyBtn.textContent = '✅ 已复制！';
          setTimeout(function() { dlg.remove(); }, 1000);
        });
      };
      var closeBtn = document.createElement('button');
      closeBtn.textContent = '继续导出';
      closeBtn.style.cssText = 'flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;background:#fff;color:#555;font-size:13px;font-weight:600;cursor:pointer';
      closeBtn.onclick = function() { dlg.remove(); };
      btnRow.appendChild(copyBtn); btnRow.appendChild(closeBtn);
      dlg.appendChild(pre); dlg.appendChild(btnRow);
      var backdrop = document.createElement('div');
      backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:2147483646';
      backdrop.onclick = function() { backdrop.remove(); dlg.remove(); };
      document.body.appendChild(backdrop); document.body.appendChild(dlg);
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
