/*!
 * cart-parse.js — 把捕获的购物车 JSON / DOM 规整为统一商品对象
 * 统一结构：{ title, specs[], detailsUrl, quantity, images[], _selected }
 *
 * Phase A（探针版）：用宽松启发式尽可能解出商品 + 把结构摘要打到控制台，
 * 供作者据真实日志在 Phase B 精准化字段映射。
 * 全原创代码。
 */
;(function () {
  'use strict';
  globalThis.TCE_cartParse = {
    inspect,
    parseCaptured,
    scrapeDom,
  };

  // 安全取值（支持 a.b.c 路径与多候选键）
  function pick(obj, keys) {
    if (!obj || typeof obj !== 'object') return undefined;
    for (const k of keys) {
      if (k.includes('.')) {
        const parts = k.split('.');
        let v = obj;
        for (const p of parts) { if (v == null) break; v = v[p]; }
        if (v != null && v !== '') return v;
      } else if (obj[k] != null && obj[k] !== '') {
        return obj[k];
      }
    }
    return undefined;
  }
  function asImgUrl(v) {
    if (!v) return '';
    if (Array.isArray(v)) v = v[0];
    if (typeof v === 'object') v = v.url || v.picUrl || v.imgUrl || v.src || '';
    if (!v) return '';
    let s = String(v);
    if (s.startsWith('//')) s = 'https:' + s;
    return s;
  }
  function normItem(o) {
    if (!o || typeof o !== 'object') return null;
    const title = pick(o, ['title', 'itemTitle', 'titleSimple', 'name', 'itemName']);
    const itemId = pick(o, ['itemId', 'itemid', 'id', 'skuId', 'item_id']);
    const url = pick(o, ['detailUrl', 'url', 'clickUrl', 'detail_url', 'itemUrl']);
    const detailsUrl = url || (itemId ? 'https://item.taobao.com/item.htm?id=' + itemId : '');
    const qty = pick(o, ['quantity', 'qty', 'buyAmount', 'count', 'num']);
    const img = pick(o, ['pic', 'picUrl', 'imgUrl', 'image', 'mainPic', 'picUrlSmall', 'img']);
    const selected = pick(o, ['selected', 'checked', 'isChecked', 'is_checked', 'cartAttribute']);
    const sku = pick(o, ['skuText', 'skuValues', 'skuDesc', 'attributes', 'skuTexts', 'skuInfo']);
    let specs = [];
    if (typeof sku === 'string') specs = [sku];
    else if (Array.isArray(sku)) specs = sku.map((x) => (typeof x === 'string' ? x : (x && (x.text || x.name || x.value)) || '')).filter(Boolean);
    const title2 = typeof title === 'string' ? title : (title && (title.text || title.name)) || '';
    if (!title2 && !itemId) return null;
    return {
      title: title2,
      specs: specs,
      detailsUrl: String(detailsUrl || ''),
      quantity: Number(qty) >= 1 ? Number(qty) : 1,
      images: [asImgUrl(img)].filter(Boolean),
      _selected: selected == null ? true : !!selected, // 选不中默认 true（探针阶段）
      _raw_id: itemId ? String(itemId) : '',
    };
  }

  // 递归找"像商品数组"的节点
  function findItemArrays(obj, path, out, depth) {
    if (depth > 12 || !obj) return;
    if (Array.isArray(obj)) {
      if (obj.length >= 1 && obj.length < 2000 && obj.every((o) => o && typeof o === 'object' && !Array.isArray(o))) {
        const keys = Object.keys(obj[0]).join('|');
        if (/title|itemId|itemid|skuId|quantity|item_id|picUrl|img/i.test(keys)) {
          out.push({ path, len: obj.length, keys });
        }
      }
      for (let i = 0; i < Math.min(obj.length, 50); i++) findItemArrays(obj[i], path + '[' + i + ']', out, depth + 1);
    } else if (typeof obj === 'object') {
      for (const k of Object.keys(obj)) findItemArrays(obj[k], path + '.' + k, out, depth + 1);
    }
  }

  // 把捕获的响应文本解析成商品数组（best-effort）
  function parseCaptured(text, url) {
    let obj = null;
    try { obj = JSON.parse(text); } catch (e) { return { items: [], debug: '非 JSON' }; }
    // mtop 风格：有时是 jsonp/callback 包裹
    const info = inspect(obj);
    const arrs = [];
    findItemArrays(obj, '$', arrs, 0);
    info.itemArrays = arrs.map((a) => ({ path: a.path, len: a.len, keys: a.keys }));
    if (!arrs.length) return { items: [], debug: JSON.stringify(info).slice(0, 4000) };
    // 取最像的那个（含 title 且最长）
    let best = null;
    for (const a of arrs) {
      const arr = resolvePath(obj, a.path);
      if (!Array.isArray(arr)) continue;
      const mapped = arr.map(normItem).filter(Boolean);
      if (mapped.length && (!best || mapped.length > best.items.length)) best = { items: mapped, path: a.path };
    }
    return { items: best ? best.items : [], debug: JSON.stringify(info).slice(0, 4000), from: best && best.path };
  }

  function resolvePath(root, path) {
    try {
      let cur = root;
      const re = /\.(\w+)|\[(\d+)\]/g;
      let m;
      while ((m = re.exec(path))) { if (m[1] != null) cur = cur[m[1]]; else cur = cur[+m[2]]; }
      return cur;
    } catch (e) { return null; }
  }

  // 结构摘要（顶层 keys + 各层简略）
  function inspect(obj) {
    const out = { topKeys: [], sample: '' };
    try {
      if (obj && typeof obj === 'object') {
        out.topKeys = Object.keys(obj).slice(0, 30);
        out.sample = JSON.stringify(obj).slice(0, 500);
      }
    } catch (e) {}
    return out;
  }

  // DOM 兜底抓取（探针版：尝试常见结构 + 记录候选）
  function scrapeDom() {
    const debug = { selectorsTried: [], found: 0 };
    const items = [];
    // 试几组可能的选择器（淘宝 PC 购物车历史结构，现多半混淆，命中率有限）
    const candidates = [
      '[class*="Cart"][class*="Item"]',
      '[class*="cart"][class*="item"]',
      '[data-item-id]',
      'tr.J_ItemList',
      '.cart-item',
    ];
    for (const sel of candidates) {
      const els = document.querySelectorAll(sel);
      debug.selectorsTried.push({ sel, count: els.length });
      if (els.length) {
        els.forEach((el) => {
          const t = (el.querySelector('[class*="title"],[class*="Title"],a[href*="item.taobao"],a[href*="item.htm"]') || {}).textContent;
          const a = el.querySelector('a[href*="item.taobao.com"], a[href*="item.htm"]');
          const img = el.querySelector('img');
          const cb = el.querySelector('input[type=checkbox]');
          if (t || a) {
            items.push({
              title: (t || '').trim(),
              specs: [],
              detailsUrl: a ? a.href : '',
              quantity: 1,
              images: img && img.src ? [img.src] : [],
              _selected: cb ? cb.checked : true,
            });
          }
        });
        break;
      }
    }
    debug.found = items.length;
    return { items, debug };
  }
})();
