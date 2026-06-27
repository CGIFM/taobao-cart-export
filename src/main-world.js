/*!
 * main-world.js — 在页面【主世界】运行（manifest world:"MAIN", document_start）
 * 仿 AiPrice：逐个购物车行读 React Fiber，取每个商品的数据对象（图+标题对齐）。
 * 勾选状态：从商品行的复选框读（往上找），找不到则用商品对象字段，再不行按未勾选处理。
 * 诊断日志：打印首个商品的原始字段名 + 复选框探测结果，便于按真实结构精准化。
 * 全原创代码。
 */
(() => {
  const TAG = '__TCE_CART__';
  const MAX = 200000;

  function fiberKey(el) {
    if (!el) return null;
    return Object.keys(el).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
  }
  function deepFindItem(obj, depth, seen) {
    if (!obj || typeof obj !== 'object' || depth > 4) return null;
    if (seen.has(obj)) return null;
    seen.add(obj);
    let keys = '';
    try { keys = Array.isArray(obj) ? '' : Object.keys(obj).join('|'); } catch (e) { return null; }
    if (keys && /title|itemTitle|subject/i.test(keys) && /itemId|itemid|skuId|offerId|id\b/i.test(keys) && /pic|img|image/i.test(keys)) return obj;
    try {
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (v && typeof v === 'object') { const r = deepFindItem(v, depth + 1, seen); if (r) return r; }
      }
    } catch (e) {}
    return null;
  }
  function findItemInFiber(el) {
    const k = fiberKey(el);
    if (!k) return null;
    let fiber = el[k], depth = 0;
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
      } else if (o[k] != null && o[k] !== '') return o[k];
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
  // 把各种规格值结构（字符串/数组/对象）统一成字符串数组
  function parseSpecValue(v) {
    if (v == null || v === '') return [];
    if (typeof v === 'string') {
      const s = v.replace(/&gt;|&amp;gt;|>/g, ' ');
      return s.split(/[;；\n]/).map((x) => x.trim()).filter(Boolean);
    }
    if (Array.isArray(v)) {
      const parts = v.map((x) => {
        if (typeof x === 'string') return x;
        if (x && typeof x === 'object') {
          const n = x.name || x.propName || x.key || x.label || x.k || '';
          const val = x.value || x.propValue || x.v || x.text || x.val || '';
          if (n && val && n !== val) return n + '：' + val;
          return val || n || '';
        }
        return '';
      }).filter(Boolean);
      if (parts.length) return parts.join(' ').split(/[;；\n]/).map((s) => s.trim()).filter(Boolean);
    }
    if (typeof v === 'object') {
      const parts = [];
      for (const k of Object.keys(v)) {
        const val = v[k];
        if (typeof val === 'string' || typeof val === 'number') parts.push(k + '：' + val);
      }
      if (parts.length) return parts;
    }
    return [];
  }
  // 规格提取：先按字段名（广撒网），再按内容（颜色/尺码…）兜底
  function findSpec(o) {
    if (!o || typeof o !== 'object') return [];
    const SPEC_FIELDS = ['skuText', 'cartSkuText', 'skuDesc', 'skuInfo', 'skuInfoText', 'properties', 'property', 'propText', 'saleProp', 'salePropText', 'stdProp', 'skuProperties', 'subTitle', 'spec', 'specs', 'attrText', 'cartAttr', 'skuList', 'skuValues', 'saleInfo', 'selectedSkuInfo', 'skuInfoList', 'cartSkuInfo', 'propStr', 'skuProp', 'stdPropText'];
    for (const k of SPEC_FIELDS) {
      if (o[k] != null && o[k] !== '') {
        const parsed = parseSpecValue(o[k]);
        if (parsed.length) return parsed;
      }
    }
    const SPEC_RE = /颜色|尺码|规格|版本|套餐|样式|分类|已选|容量|款式|型号|材质|花色|色号|净含量|口味/;
    const seen = new Set();
    function walk(obj, depth) {
      if (!obj || typeof obj !== 'object' || depth > 3 || seen.has(obj)) return null;
      seen.add(obj);
      try {
        for (const k of Object.keys(obj)) {
          const v = obj[k];
          if (typeof v === 'string' && v.length >= 2 && v.length < 300 && (SPEC_RE.test(v) || (/：/.test(v) && v.length < 80 && !/https?:|\.htm|淘宝|天猫|京东|aliexpress/i.test(v)))) return v;
        }
        for (const k of Object.keys(obj)) {
          const v = obj[k];
          if (v && typeof v === 'object') { const r = walk(v, depth + 1); if (r) return r; }
        }
      } catch (e) {}
      return null;
    }
    const s = walk(o, 0);
    return s ? s.replace(/&gt;|&amp;gt;|>/g, ' ').split(/[;；\n]/).map((x) => x.trim()).filter(Boolean) : [];
  }
  function normItem(o, fallbackUrl) {
    if (!o || typeof o !== 'object') return null;
    const title = pick(o, ['title', 'itemTitle', 'subject', 'titleSimple', 'name', 'itemName']);
    const itemId = pick(o, ['itemId', 'itemid', 'item_id', 'offerId', 'id', 'skuId']);
    const url = pick(o, ['detailUrl', 'url', 'clickUrl', 'itemUrl', 'detail_url']);
    const detailsUrl = url || fallbackUrl || (itemId ? 'https://item.taobao.com/item.htm?id=' + itemId : '');
    const qty = pick(o, ['quantity', 'qty', 'buyAmount', 'count', 'num', 'amount', 'amountValue']);
    const img = pick(o, ['pic', 'picUrl', 'imgUrl', 'image', 'mainPic', 'mainImage', 'img', 'imageUrl']);
    let specs = findSpec(o);
    if (!specs.length) {
      const sku = pick(o, ['skuText', 'skuValues', 'skuDesc', 'attributes', 'specAttrs', 'skuInfo', 'props', 'cartSkuText', 'skuProperties', 'properties', 'salePropText', 'subTitle']);
      if (typeof sku === 'string') specs = sku.replace(/&gt;|>/g, ' ').split(/[;；,]/).map((s) => s.trim()).filter(Boolean);
      else if (Array.isArray(sku)) specs = sku.map((x) => (typeof x === 'string' ? x : Array.isArray(x) ? x.flat().join(' ') : (x && (x.text || x.name || x.value)) || '')).filter(Boolean);
    }
    const title2 = typeof title === 'string' ? title : (title && (title.text || title.name || title.subject)) || '';
    if (!title2 && !itemId) return null;
    return {
      title: title2,
      specs: specs,
      detailsUrl: String(detailsUrl || ''),
      quantity: Number(qty) >= 1 ? Number(qty) : 1,
      images: [asImgUrl(img)].filter(Boolean),
      _selected: false,
      _selSource: '',
      _raw_id: itemId ? String(itemId) : (detailsUrl || title2),
    };
  }

  // 从 rowEl 往上找最近的"商品勾选框"（宁近勿远，避免抓到"全选"）
  function findCheckbox(rowEl) {
    let el = rowEl, depth = 0;
    while (el && depth < 6) {
      const inputs = el.querySelectorAll(':scope input[type=checkbox]');
      if (inputs.length) return { el: inputs[0], level: depth, kind: 'input' };
      const aria = el.querySelector(':scope [aria-checked]');
      if (aria) return { el: aria, level: depth, kind: 'aria' };
      el = el.parentElement;
      depth++;
    }
    return null;
  }
  function readSelected(rowEl, item) {
    const cb = findCheckbox(rowEl);
    if (cb) {
      let on = false;
      if (cb.kind === 'input') on = !!cb.el.checked;
      else if (cb.kind === 'aria') on = cb.el.getAttribute('aria-checked') === 'true';
      return { on, source: cb.kind + '@L' + cb.level };
    }
    // 回退：商品对象里的"勾选"字段（保守，只认明确表示勾选的；去掉 inCart 这种恒真）
    const FIELDS = ['isSelected', 'isChecked', 'is_checked', 'cartChecked', 'checkedStatus', 'inCheckedAmounts'];
    for (const k of FIELDS) {
      if (item && typeof item[k] === 'boolean') return { on: item[k], source: 'field:' + k };
    }
    return { on: false, source: 'default:false' };
  }

  function itemLinkMatches() {
    return /item\.htm|taobao\.com\/i\.|detail\.tmall\.com|^https?:\/\/a\.m\.taobao/i;
  }
  function scanCartItems() {
    const links = [...document.querySelectorAll('a[href]')].filter((a) => itemLinkMatches().test(a.href));
    const items = [];
    const seen = new Set();
    let firstRaw = null, firstRowEl = null;
    for (const link of links) {
      let el = link, found = null, rowEl = null;
      for (let up = 0; up < 14 && el; up++, el = el.parentElement) {
        const it = findItemInFiber(el);
        if (it) { found = it; rowEl = el; break; }
      }
      if (!found) continue;
      if (!firstRaw) { firstRaw = found; firstRowEl = rowEl; }
      const norm = normItem(found, link.href);
      if (!norm) continue;
      if (seen.has(norm._raw_id)) continue;
      seen.add(norm._raw_id);
      const sel = readSelected(rowEl, found);
      norm._selected = sel.on;
      norm._selSource = sel.source;
      items.push(norm);
    }
    return { items, firstRaw, firstRowEl };
  }

  let lastSig = '', diagLogged = false;
  function scanAndRelay() {
    let result;
    try { result = scanCartItems(); } catch (e) { console.warn('[购物车导出·主世界] 扫描异常', e); return; }
    const items = result.items;
    const sig = items.map((i) => i._raw_id + ':' + (i._selected ? 1 : 0)).join('|');
    if (sig === lastSig && items.length) return;
    lastSig = sig;

    const selCount = items.filter((i) => i._selected).length;
    console.log('%c[购物车导出·主世界] 扫描 ' + items.length + ' 个商品（判定勾选 ' + selCount + '）', 'color:#1a73e8;font-weight:bold');
    if (items[0]) console.log('  样例:', items[0]);

    // 诊断（只打一次；用纯文本字符串输出，避免控制台显示成 Object 复制不出来）
    if (!diagLogged && result.firstRaw) {
      diagLogged = true;
      const preview = {};
      let rawJson = '';
      try {
        for (const k of Object.keys(result.firstRaw)) {
          const v = result.firstRaw[k];
          let pv;
          if (typeof v === 'string') pv = '"' + (v.length > 70 ? v.slice(0, 70) + '…' : v) + '"';
          else if (Array.isArray(v)) pv = 'arr[' + v.length + ']' + (v.length ? ' ' + JSON.stringify(v[0]).slice(0, 60) : '');
          else if (v && typeof v === 'object') pv = 'obj{' + Object.keys(v).slice(0, 10).join(',') + '}';
          else pv = String(v);
          preview[k] = pv;
        }
        rawJson = JSON.stringify(result.firstRaw).replace(/https?:\/\/[^"]{50,}/g, '<url>').slice(0, 2500);
      } catch (e) { rawJson = '序列化失败: ' + e; }
      console.log('%c[诊断·首个商品] 选中下面 2 行复制发作者👇', 'color:#d2691e;font-weight:bold;font-size:13px');
      console.log('FIELD_PREVIEW=' + JSON.stringify(preview));
      console.log('RAW_JSON=' + rawJson);
    }

    try { window.postMessage({ tag: TAG, kind: 'items', items }, '*'); } catch (e) {}
  }

  let timer = null;
  function scheduleScan() { if (timer) return; timer = setTimeout(() => { timer = null; scanAndRelay(); }, 800); }
  try { new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
  setInterval(scanAndRelay, 2500);
  setTimeout(scanAndRelay, 600);

  // 兜底：fetch/XHR 拦截
  const CART_URL = /cart\.taobao\.com|\/cart\b|mtop\.[\w.]*cart|trade\.[\w.]*cart|h5api\.m\.taobao\.com/i;
  function relay(kind, url, body) { try { window.postMessage({ tag: TAG, kind, url: String(url || ''), body: String(body || '').slice(0, MAX) }, '*'); } catch (e) {} }
  const _fetch = window.fetch;
  if (typeof _fetch === 'function' && !_fetch.__tce) {
    const wrapped = function (input) {
      const url = (typeof input === 'string') ? input : (input && input.url) || '';
      const p = _fetch.apply(this, arguments);
      try { if (url && CART_URL.test(url)) p.then((resp) => { try { resp.clone().text().then((t) => { console.log('%c[购物车导出·命中] fetch', 'color:#9c27b0', url, 'len=' + t.length); relay('fetch', url, t); }).catch(() => {}); } catch (e) {} }).catch(() => {}); } catch (e) {}
      return p;
    };
    wrapped.__tce = true; window.fetch = wrapped;
  }
  const _open = XMLHttpRequest.prototype.open, _send = XMLHttpRequest.prototype.send;
  if (typeof _open === 'function' && !_open.__tce) {
    XMLHttpRequest.prototype.open = function (method, url) { this.__tce_url = url; this.__tce_cart = !!url && CART_URL.test(String(url)); return _open.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () { if (this.__tce_cart) this.addEventListener('load', () => { try { const t = this.responseText || ''; console.log('%c[购物车导出·命中] XHR', 'color:#9c27b0', this.__tce_url, 'len=' + t.length); relay('xhr', this.__tce_url, t); } catch (e) {} }); return _send.apply(this, arguments); };
    _open.__tce = true;
  }

  console.log('%c[购物车导出·主世界] 已装：Fiber 逐行扫描 + 复选框读取 + fetch/XHR 兜底', 'color:#34a853;font-weight:bold');
})();
