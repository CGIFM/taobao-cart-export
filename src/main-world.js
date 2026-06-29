/*!
 * main-world.js — 在页面【主世界】运行（manifest world:"MAIN", document_start）
 * 逐个购物车行读 React Fiber，取每个商品的数据对象
 * （标题 / 规格 / 图 / 数量 / 勾选 天然对齐），postMessage 给内容脚本。
 * 全原创代码。
 */
(() => {
  const TAG = '__TCE_CART__';

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
    const itemId = pick(o, ['itemId', 'itemid', 'item_id', 'offerId', 'id']);
    const cartId = pick(o, ['cartId', 'cartid', 'cart_id']);
    const skuId = (o.sku && o.sku.skuId) || pick(o, ['skuId', 'skuid', 'sku_id']);
    const url = pick(o, ['detailUrl', 'url', 'clickUrl', 'itemUrl', 'detail_url', 'outerUrl']);
    const detailsUrl = url || fallbackUrl || (itemId ? 'https://item.taobao.com/item.htm?id=' + itemId : '');
    const qty = pick(o, ['quantity', 'qty', 'buyAmount', 'count', 'num', 'amount', 'amountValue']);
    const img = pick(o, ['pic', 'picUrl', 'imgUrl', 'image', 'mainPic', 'mainImage', 'img', 'imageUrl']);
    let specs = [];
    if (o.sku && typeof o.sku === 'object') {
      const sm = o.sku.skuMap;
      if (sm && typeof sm === 'object' && !Array.isArray(sm)) {
        const parts = Object.keys(sm).map((k) => (sm[k] != null && sm[k] !== '') ? (k + '：' + sm[k]) : '').filter(Boolean);
        if (parts.length) specs = parts;
      }
      if (!specs.length && o.sku.title) specs = [String(o.sku.title)];
    }
    if (!specs.length) specs = findSpec(o);
    // 可选追加列的数据（默认不导出，用户勾选时才追加）
    let price = '';
    if (o.pay) price = o.pay.nowTitle || (o.pay.now != null ? '￥' + (o.pay.now / 100) : '');
    let priceAfter = '';
    if (o.pay) {
      // 实付价：优先 平台加补后(couponDiscountedTitle)，再 店铺优惠后(shopPromotionPriceTitle)，再 afterPromPrice
      priceAfter = o.pay.couponDiscountedTitle || o.pay.shopPromotionPriceTitle || '';
      if (!priceAfter && o.pay.afterPromPrice != null) priceAfter = '¥' + (o.pay.afterPromPrice / 100);
    }
    if (!priceAfter) priceAfter = price; // 都没有则=现价
    let shop = pick(o, ['shopTitle', 'shopName', 'shop']) || '';
    let tagsText = '';
    if (Array.isArray(o.tags)) tagsText = o.tags.map((t) => (t && t.text) ? t.text : '').filter(Boolean).join(' / ');
    const title2 = typeof title === 'string' ? title : (title && (title.text || title.name || title.subject)) || '';
    if (!title2 && !itemId) return null;
    return {
      title: title2,
      specs: specs,
      detailsUrl: String(detailsUrl || ''),
      quantity: Number(qty) >= 1 ? Number(qty) : 1,
      images: [asImgUrl(img)].filter(Boolean),
      price: String(price || ''),
      priceAfter: String(priceAfter || ''),
      shop: String(shop || ''),
      tagsText: tagsText,
      itemId: itemId ? String(itemId) : '',
      _selected: false,
      _raw_id: cartId ? String(cartId) : (skuId ? ((itemId || '') + '_' + skuId) : (itemId ? String(itemId) : (detailsUrl || title2))),
    };
  }

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
    if (item && item.isChecked != null) {
      const v = item.isChecked;
      return v === true || v === 'true' || v === 1 || v === '1';
    }
    if (item && item.is_checked != null) {
      const v = item.is_checked;
      return v === true || v === 'true' || v === 1;
    }
    const cb = findCheckbox(rowEl);
    if (cb) {
      if (cb.kind === 'input') return !!cb.el.checked;
      if (cb.kind === 'aria') return cb.el.getAttribute('aria-checked') === 'true';
    }
    return false;
  }

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

  let lastSig = '', diagLogged = false;
  function scanAndRelay() {
    let items;
    try { items = scanCartItems(); } catch (e) { return; }
    const sig = items.map((i) => i._raw_id + ':' + (i._selected ? 1 : 0)).join('|');
    if (sig === lastSig && items.length) return;
    lastSig = sig;
    try { window.postMessage({ tag: TAG, kind: 'items', items }, '*'); } catch (e) {}

    // 诊断：首次扫描打印首个商品的完整字段（纯文本，一键复制）
    if (!diagLogged && items.length) {
      diagLogged = true;
      var firstItem = items[0];
      var preview = {};
      for (var k of Object.keys(firstItem)) {
        var v = firstItem[k];
        if (typeof v === 'string') preview[k] = '"' + (v.length > 80 ? v.slice(0,80)+'…' : v) + '"';
        else if (Array.isArray(v)) preview[k] = 'arr[' + v.length + ']';
        else if (v && typeof v === 'object') preview[k] = 'obj{' + Object.keys(v).slice(0,10).join(',') + '}';
        else preview[k] = String(v);
      }
      var rawJson = '';
      try { rawJson = JSON.stringify(firstItem).replace(/https?:\/\/[^"]{50,}/g, '<url>').slice(0, 2000); } catch(e) { rawJson = '(序列化失败)'; }
      console.log('%c[诊断] 选中下面整段复制发给作者👇', 'color:#d2691e;font-weight:bold;font-size:13px');
      console.log('DIAG_DATA=' + JSON.stringify({preview: preview, raw: rawJson}));
    }
  }

  let timer = null;
  function scheduleScan() { if (timer) return; timer = setTimeout(() => { timer = null; scanAndRelay(); }, 800); }
  try { new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
  setInterval(scanAndRelay, 2500);
  setTimeout(scanAndRelay, 600);
  console.log('%c[购物车导出] 主世界扫描已装 v1.0.1', 'color:#34a853;font-weight:bold');
})();
