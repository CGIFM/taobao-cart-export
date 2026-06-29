/*!
 * content.js — 淘宝导出助手 · 内容脚本（隔离世界）
 * 职责：接收主世界 Fiber 扫描出的商品 → 注入"导出"按钮
 *       购物车页：只导勾选的；订单页：支持多页自动翻页采集合并。
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
    ? { label: '订单', platform: 'orders', btn: '📥 导出订单', tip: '支持多页自动采集' }
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

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ============ 购物车页：照旧 ============
  async function onExportCart() {
    const items = gatherItems();
    const selected = items.filter((it) => it._selected);
    if (!items.length) { alert('没扫到商品。\n请在购物车页上下滚动一下、等 2-3 秒再点导出。'); return; }
    if (!selected.length) { alert('扫到 ' + items.length + ' 个商品，但没检测到勾选的。\n请勾选要导出的商品（点商品前的复选框✔），再点导出。'); return; }
    try { await globalThis.__tceExport(selected, PAGE.platform); }
    catch (err) { console.error('[淘宝导出] 导出失败', err); alert('导出失败：' + err); }
  }

  // ============ 订单页：多页采集 ============
  function getCurrentPage() {
    var el = document.querySelector('.ant-pagination-item-active');
    if (el) return parseInt(el.textContent.trim()) || 1;
    return 1;
  }

  function clickNextPage() {
    var next = document.querySelector('.ant-pagination-next:not(.ant-pagination-disabled)');
    if (!next) next = document.querySelector('.ant-pagination-next:not([aria-disabled="true"])');
    if (!next) {
      // 兜底：找 title 含"下一页"或 class 含 next 的可点击元素
      var all = document.querySelectorAll('[class*="pagination"] [class*="next"], [class*="page-next"]');
      for (var i = 0; i < all.length; i++) {
        if (all[i].offsetParent !== null && !all[i].disabled && !/disabled/i.test(all[i].className)) { next = all[i]; break; }
      }
    }
    if (next) { next.click(); return true; }
    return false;
  }

  async function waitForPageChange(targetPage, maxWait) {
    var waited = 0;
    while (waited < (maxWait || 5000)) {
      await sleep(300);
      waited += 300;
      if (getCurrentPage() === targetPage) { await sleep(2000); return true; }
    }
    return false;
  }

  async function onExportOrders() {
    // 弹出多页采集面板
    var result = await showMultiPagePanel();
    if (!result) return; // 取消

    var allItems = [];
    var seen = new Set();
    var startPage = result.start;
    var endPage = result.end;
    var panel = result.panelObj;

    // 如果不在起始页，先导航到起始页
    var curPage = getCurrentPage();
    if (curPage !== startPage) {
      // 直接点页码
      var pageLink = document.querySelector('.ant-pagination-item-' + startPage);
      if (pageLink) { pageLink.click(); await sleep(2500); }
    }

    for (var p = startPage; p <= endPage; p++) {
      // 更新进度
      panel.update('正在采集第 ' + p + ' 页…（已采集 ' + allItems.length + ' 件）');

      // 等 fiberItems 有数据（最多 6 秒）
      var waited = 0;
      while (fiberItems.length === 0 && waited < 6000) { await sleep(300); waited += 300; }
      // 再等 1 秒让扫描稳定
      await sleep(1000);

      // 收集当前页的商品
      var pageItems = gatherItems();
      for (var i = 0; i < pageItems.length; i++) {
        var it = pageItems[i];
        if (!seen.has(it._raw_id)) { seen.add(it._raw_id); allItems.push(it); }
      }
      panel.update('第 ' + p + ' 页采集 ' + pageItems.length + ' 件（累计 ' + allItems.length + ' 件）');

      // 翻到下一页
      if (p < endPage) {
        var nextPage = p + 1;
        var clicked = clickNextPage();
        if (!clicked) { panel.update('未找到下一页按钮，停止。'); break; }
        panel.update('翻到第 ' + nextPage + ' 页…');
        var ok = await waitForPageChange(nextPage, 8000);
        if (!ok) { panel.update('翻页超时，已采集到第 ' + p + ' 页。'); break; }
        // 不清空 fiberItems！发 rescan 指令让 main-world 重新扫描新页面
        fiberItems = [];
        window.postMessage({ tag: TAG, kind: 'rescan' }, '*');
        await sleep(500); // 等 main-world 处理 rescan
      }
    }

    panel.update('采集完成！共 ' + allItems.length + ' 件（' + (endPage - startPage + 1) + ' 页）');

    // 日期范围过滤
    if (result.dateFrom || result.dateTo) {
      var before = allItems.length;
      allItems = allItems.filter(function (it) {
        if (!it.orderDate) return true; // 无日期的保留
        var d = it.orderDate.replace(/[/\-]/g, '-').trim();
        if (result.dateFrom && d < result.dateFrom) return false;
        if (result.dateTo && d > result.dateTo) return false;
        return true;
      });
      panel.update('日期过滤：' + before + ' → ' + allItems.length + ' 件');
    }

    if (!allItems.length) {
      panel.close();
      alert('没采集到商品。'); return;
    }

    await sleep(500);
    panel.close();

    // 导出合并后的商品
    try { await globalThis.__tceExport(allItems, PAGE.platform); }
    catch (err) { console.error('[淘宝导出] 导出失败', err); alert('导出失败：' + err); }
  }

  // 多页采集面板
  function showMultiPagePanel() {
    return new Promise(function (resolve) {
      var curPage = getCurrentPage();
      // 尝试获取总页数
      var totalPage = curPage;
      var pageEls = document.querySelectorAll('.ant-pagination-item');
      if (pageEls.length) {
        var max = 0;
        pageEls.forEach(function (el) { var n = parseInt(el.textContent.trim()); if (n > max) max = n; });
        if (max > 0) totalPage = max;
      }

      var backdrop = document.createElement('div');
      backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:2147483646;display:flex;align-items:center;justify-content:center;font-family:-apple-system,"Microsoft YaHei",system-ui,sans-serif;';

      var card = document.createElement('div');
      card.style.cssText = 'background:#fff;border-radius:14px;padding:24px;width:400px;max-width:92vw;box-shadow:0 12px 40px rgba(0,0,0,.3);';

      var title = document.createElement('div');
      title.style.cssText = 'font-size:16px;font-weight:700;margin-bottom:14px;color:#222;';
      title.textContent = '📋 订单多页采集';
      card.appendChild(title);

      var info = document.createElement('div');
      info.style.cssText = 'font-size:12px;color:#888;margin-bottom:14px;';
      info.textContent = '当前第 ' + curPage + ' 页' + (totalPage > curPage ? '（共 ' + totalPage + ' 页）' : '');
      card.appendChild(info);

      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:12px;align-items:center;margin-bottom:14px;';
      var lbl1 = document.createElement('span'); lbl1.textContent = '从第'; lbl1.style.fontSize = '14px';
      var inp1 = document.createElement('input'); inp1.type = 'number'; inp1.min = '1'; inp1.value = curPage;
      inp1.style.cssText = 'width:60px;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:14px;text-align:center';
      var lbl2 = document.createElement('span'); lbl2.textContent = '页 到第'; lbl2.style.fontSize = '14px';
      var inp2 = document.createElement('input'); inp2.type = 'number'; inp2.min = '1'; inp2.value = curPage;
      inp2.style.cssText = 'width:60px;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:14px;text-align:center';
      var lbl3 = document.createElement('span'); lbl3.textContent = '页'; lbl3.style.fontSize = '14px';
      row.appendChild(lbl1); row.appendChild(inp1); row.appendChild(lbl2); row.appendChild(inp2); row.appendChild(lbl3);
      card.appendChild(row);

      // 快捷按钮
      var quickRow = document.createElement('div');
      quickRow.style.cssText = 'display:flex;gap:8px;margin-bottom:16px;';
      function quickBtn(text, fn) {
        var b = document.createElement('button');
        b.textContent = text;
        b.style.cssText = 'padding:5px 10px;border:1px solid #ddd;border-radius:6px;background:#f8f8f8;color:#555;font-size:12px;cursor:pointer';
        b.onclick = function () { fn(); };
        return b;
      }
      quickRow.appendChild(quickBtn('仅本页', function () { inp1.value = curPage; inp2.value = curPage; }));
      quickRow.appendChild(quickBtn('前5页', function () { inp1.value = 1; inp2.value = Math.min(5, totalPage); }));
      quickRow.appendChild(quickBtn('前10页', function () { inp1.value = 1; inp2.value = Math.min(10, totalPage); }));
      quickRow.appendChild(quickBtn('全部', function () { inp1.value = 1; inp2.value = totalPage; }));
      card.appendChild(quickRow);

      // 日期范围
      var dateRow = document.createElement('div');
      dateRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap';
      var dlbl = document.createElement('span'); dlbl.textContent = '日期'; dlbl.style.cssText = 'font-size:13px;font-weight:600;color:#555';
      var dFrom = document.createElement('input'); dFrom.type = 'date'; dFrom.placeholder = '开始';
      dFrom.style.cssText = 'padding:5px 8px;border:1px solid #ddd;border-radius:6px;font-size:13px;flex:1;min-width:100px';
      var dDash = document.createElement('span'); dDash.textContent = '—'; dDash.style.color = '#999';
      var dTo = document.createElement('input'); dTo.type = 'date'; dTo.placeholder = '结束';
      dTo.style.cssText = 'padding:5px 8px;border:1px solid #ddd;border-radius:6px;font-size:13px;flex:1;min-width:100px';
      var dHint = document.createElement('span'); dHint.style.cssText = 'font-size:11px;color:#aaa;width:100%'; dHint.textContent = '（可选）填了只导这个日期范围的订单';
      dateRow.appendChild(dlbl); dateRow.appendChild(dFrom); dateRow.appendChild(dDash); dateRow.appendChild(dTo); dateRow.appendChild(dHint);
      card.appendChild(dateRow);

      var status = document.createElement('div');
      status.style.cssText = 'font-size:13px;color:#666;margin-bottom:14px;min-height:20px';
      card.appendChild(status);

      var btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:10px';
      var startBtn = document.createElement('button');
      startBtn.textContent = '🚀 开始采集';
      startBtn.style.cssText = 'flex:1;padding:10px;border:none;border-radius:8px;background:linear-gradient(135deg,#ff7a00,#ff4400);color:#fff;font-size:14px;font-weight:700;cursor:pointer';
      var cancelBtn = document.createElement('button');
      cancelBtn.textContent = '取消';
      cancelBtn.style.cssText = 'padding:10px 16px;border:1px solid #ddd;border-radius:8px;background:#fff;color:#555;font-size:14px;cursor:pointer';
      btnRow.appendChild(startBtn); btnRow.appendChild(cancelBtn);
      card.appendChild(btnRow);

      backdrop.appendChild(card);
      document.body.appendChild(backdrop);

      var resolved = false;
      function done(val) { if (resolved) return; resolved = true; }
      cancelBtn.onclick = function () { backdrop.remove(); resolve(null); };
      startBtn.onclick = function () {
        var s = parseInt(inp1.value) || 1;
        var e = parseInt(inp2.value) || s;
        if (e < s) e = s;
        startBtn.disabled = true; startBtn.textContent = '采集中…'; cancelBtn.disabled = true;
        backdrop.remove();
        resolve({
          start: s, end: e,
          dateFrom: dFrom.value || '',
          dateTo: dTo.value || '',
          panelObj: {
            update: function (txt) { console.log('[多页采集] ' + txt); },
            close: function () {}
          }
        });
      };
    });
  }

  // ============ 按钮注入 ============
  function onExport() {
    if (isOrderPage) { onExportOrders(); } else { onExportCart(); }
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
  console.log('%c[淘宝导出] 内容脚本已加载 v1.2.0 (' + PAGE.label + '页)', 'color:#ff4400;font-weight:bold');
})();
