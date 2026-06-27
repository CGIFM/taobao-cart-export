/*!
 * main-world.js — 在页面【主世界】运行（manifest world:"MAIN", document_start）
 * 仿 AiPrice 的做法：逐个购物车行读 React Fiber，取每个商品自带的数据对象
 * （标题/图/数量/勾选状态天然对齐），postMessage 给内容脚本。
 * 同时保留 fetch/XHR 拦截作为探针/兜底（把命中的购物车 API JSON 转发出去）。
 * 全原创代码（思路同类，代码自写）。
 */
(() => {
  const TAG = '__TCE_CART__';
  const MAX = 200000;

  // ---------- 工具：React Fiber 读取 ----------
  function fiberKey(el) {
    if (!el) return null;
    return Object.keys(el).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
  }

  // 在 props 树里深度找"像商品的对象"（同时含 标题 + id + 图）
  function deepFindItem(obj, depth, seen) {
    if (!obj || typeof obj !== 'object' || depth > 4) return null;
    if (seen.has(obj)) return null;
    seen.add(obj);
    let keys = '';
    try { keys = Array.isArray(obj) ? '' : Object.keys(obj).join('|'); } catch (e) { return null; }
    if (keys && /title|itemTitle|subject/i.test(keys) && /itemId|itemid|skuId|offerId|id\b/i.test(keys) && /pic|img|image/i.test(keys)) {
      return obj;
    }
    try {
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (v && typeof v === 'object') {
          const r = deepFindItem(v, depth + 1, seen);
          if (r) return r;
        }
      }
    } catch (e) {}
    return null;
  }

  // 从一个 DOM 节点沿 fiber.return 往上找商品对象
  function findItemInFiber(el) {
    const k = fiberKey(el);
    if (!k) return null;
    let fiber = el[k];
    let depth = 0;
    while (fiber && depth < 40) {
      const mp = fiber.memoizedProps;
      if (mp && typeof mp === 'object') {
        const found = deepFindItem(mp, 0, new Set());
        if (found) return found;
      }
      fiber = fiber.return;
      depth++;
    }
    return null;
  }

  function pick(o, keys) {
    if (!o || typeof o !== 'object') return undefined;
    for (const k of keys) {
      if (k.includes('.')) {
        const parts = k.split('.');
        let v = o;
        for (const p of parts) { if (v == null) break; v = v[p]; }
        if (v != null && v !== '') return v;
      } else if (o[k] != null && o[k] !== '') {
        return o[k];
      }
    }
    return undefined;
  }
  function asImgUrl(v) {
    if (!v) return '';
    if (Array.isArray(v)) v = v[0];
    if (typeof v === 'object') v = (v && (v.url || v.picUrl || v.imgUrl || v.fullPathImageURI || v.src)) || '';
    if (!v) return '';
    let s = String(v);
    if (s.startsWith('//')) s = 'https:' + s;
    return s;
  }
  function normItem(o, fallbackUrl) {
    if (!o || typeof o !== 'object') return null;
    const title = pick(o, ['title', 'itemTitle', 'subject', 'titleSimple', 'name', 'itemName']);
    const itemId = pick(o, ['itemId', 'itemid', 'item_id', 'offerId', 'id', 'skuId']);
    const url = pick(o, ['detailUrl', 'url', 'clickUrl', 'itemUrl', 'detail_url']);
    const detailsUrl = url || fallbackUrl || (itemId ? 'https://item.taobao.com/item.htm?id=' + itemId : '');
    const qty = pick(o, ['quantity', 'qty', 'buyAmount', 'count', 'num', 'amount', 'amountValue']);
    const img = pick(o, ['pic', 'picUrl', 'imgUrl', 'image', 'mainPic', 'mainImage', 'img', 'imageUrl']);
    const sku = pick(o, ['skuText', 'skuValues', 'skuDesc', 'attributes', 'specAttrs', 'skuInfo', 'props']);
    let specs = [];
    if (typeof sku === 'string') specs = sku.replace(/&gt;|>/g, ' ').split(/[;,]/).map((s) => s.trim()).filter(Boolean);
    else if (Array.isArray(sku)) specs = sku.map((x) => (typeof x === 'string' ? x : Array.isArray(x) ? x.flat().join(' ') : (x && (x.text || x.name || x.value)) || '')).filter(Boolean);
    const title2 = typeof title === 'string' ? title : (title && (title.text || title.name || title.subject)) || '';
    if (!title2 && !itemId) return null;
    return {
      title: title2,
      specs: specs,
      detailsUrl: String(detailsUrl || ''),
      quantity: Number(qty) >= 1 ? Number(qty) : 1,
      images: [asImgUrl(img)].filter(Boolean),
      _selected: false, // 由 readSelected 填
      _raw_id: itemId ? String(itemId) : (detailsUrl || title2),
    };
  }

  // 读勾选状态：DOM 复选框 / aria / 商品对象字段；默认 false（只导勾选的）
  function readSelected(rowEl, item) {
    if (rowEl) {
      const cb = rowEl.querySelector('input[type=checkbox]');
      if (cb) return !!cb.checked;
      const aria = rowEl.querySelector('[aria-checked]');
      if (aria) return aria.getAttribute('aria-checked') === 'true';
    }
    for (const k of ['selected', 'checked', 'isChecked', 'is_checked', 'checkedStatus', 'inCart']) {
      if (item && item[k] != null) return !!item[k];
    }
    return false;
  }

  // ---------- 扫描购物车行 ----------
  function itemLinkMatches() {
    return /item\.htm|taobao\.com\/i\.|detail\.tmall\.com|^https?:\/\/a\.m\.taobao/i;
  }
  function scanCartItems() {
    const links = [...document.querySelectorAll('a[href]')].filter((a) => itemLinkMatches().test(a.href));
    const items = [];
    const seen = new Set();
    for (const link of links) {
      let el = link, found = null, rowEl = null;
      for (let up = 0; up < 14 && el; up++, el = el.parentElement) {
        const it = findItemInFiber(el);
        if (it) { found = it; rowEl = el; break; }
      }
      if (!found) continue;
      const norm = normItem(found, link.href);
      if (!norm) continue;
      if (seen.has(norm._raw_id)) continue;
      seen.add(norm._raw_id);
      norm._selected = readSelected(rowEl, found);
      items.push(norm);
    }
    return items;
  }

  let lastSig = '';
  function scanAndRelay() {
    let items = [];
    try { items = scanCartItems(); } catch (e) { console.warn('[购物车导出·主世界] 扫描异常', e); }
    const sig = items.map((i) => i._raw_id + ':' + (i._selected ? 1 : 0)).join('|');
    if (sig === lastSig) return; // 没变化不重发
    lastSig = sig;
    console.log('%c[购物车导出·主世界] 扫描到 ' + items.length + ' 个商品（勾选 ' + items.filter((i) => i._selected).length + '）', 'color:#1a73e8;font-weight:bold');
    if (items[0]) console.log('  样例:', items[0]);
    try { window.postMessage({ tag: TAG, kind: 'items', items }, '*'); } catch (e) {}
  }

  // 周期 + DOM 变化触发扫描（SPA）
  let timer = null;
  function scheduleScan() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; scanAndRelay(); }, 800);
  }
  try {
    const mo = new MutationObserver(scheduleScan);
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
  setInterval(scanAndRelay, 2500);
  // 首次
  setTimeout(scanAndRelay, 600);

  // ---------- 兜底/探针：拦截 fetch/XHR，转发购物车 API JSON ----------
  const CART_URL = /cart\.taobao\.com|\/cart\b|mtop\.[\w.]*cart|trade\.[\w.]*cart|h5api\.m\.taobao\.com/i;
  function relay(kind, url, body) {
    try { window.postMessage({ tag: TAG, kind, url: String(url || ''), body: String(body || '').slice(0, MAX) }, '*'); } catch (e) {}
  }
  const _fetch = window.fetch;
  if (typeof _fetch === 'function' && !_fetch.__tce) {
    const wrapped = function (input) {
      const url = (typeof input === 'string') ? input : (input && input.url) || '';
      const p = _fetch.apply(this, arguments);
      try {
        if (url && CART_URL.test(url)) {
          p.then((resp) => { try { resp.clone().text().then((t) => { console.log('%c[购物车导出·命中] fetch', 'color:#9c27b0', url, 'len=' + t.length); relay('fetch', url, t); }).catch(() => {}); } catch (e) {} }).catch(() => {});
        }
      } catch (e) {}
      return p;
    };
    wrapped.__tce = true;
    window.fetch = wrapped;
  }
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  if (typeof _open === 'function' && !_open.__tce) {
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__tce_url = url; this.__tce_cart = !!url && CART_URL.test(String(url));
      return _open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      if (this.__tce_cart) {
        this.addEventListener('load', () => { try { const t = this.responseText || ''; console.log('%c[购物车导出·命中] XHR', 'color:#9c27b0', this.__tce_url, 'len=' + t.length); relay('xhr', this.__tce_url, t); } catch (e) {} });
      }
      return _send.apply(this, arguments);
    };
    _open.__tce = true;
  }

  console.log('%c[购物车导出·主世界] 已装：Fiber 逐行扫描 + fetch/XHR 兜底', 'color:#34a853;font-weight:bold');
})();
