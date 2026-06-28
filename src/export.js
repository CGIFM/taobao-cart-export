/*!
 * export.js — 淘宝购物车导出助手 · xlsx 导出引擎（双模式 + 可选追加列）
 * 固定 6 列：名称 | 规格 | 链接 | 数量 | 紧急程度 | 图片
 * 点导出弹窗：① 选图片模式（嵌入/浮动）② 可选勾选追加列（价格/店铺/商品ID/标签），勾了追加到表格末尾。
 *
 * 图片字节经 background service worker 拉取（host 权限，绕过 CORS）
 * 暴露：globalThis.__tceExport(items, platform)
 * 全原创代码。
 */
;(function () {
  'use strict';

  var COLS = ['名称', '规格', '链接', '数量', '紧急程度', '图片'];
  var IMG_COL = 5;
  var IMG_SIZE = 96;
  var ROW_HEIGHT_PT = 74;
  var URGENCY_DEFAULT = '普通';
  var IMG_PLACEHOLDER = '__TCE_RICHIMG__';

  // 可选追加列（勾选时追加到表格末尾，图片列之后）
  var EXTRA_COLS = [
    { key: 'price', label: '优惠前价格', width: 12 },
    { key: 'priceAfter', label: '优惠后价格', width: 12 },
    { key: 'shop', label: '店铺', width: 22 },
    { key: 'itemId', label: '商品ID', width: 16 },
    { key: 'tagsText', label: '标签/优惠', width: 30 },
  ];

  var RD_RVT_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<rvTypesInfo xmlns="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata2" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="x" xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><global><keyFlags>' +
    '<key name="_Self"><flag name="ExcludeFromFile" value="1"/><flag name="ExcludeFromCalcComparison" value="1"/></key>' +
    '<key name="_DisplayString"><flag name="ExcludeFromCalcComparison" value="1"/></key>' +
    '<key name="_Flags"><flag name="ExcludeFromCalcComparison" value="1"/></key>' +
    '<key name="_Format"><flag name="ExcludeFromCalcComparison" value="1"/></key>' +
    '<key name="_SubLabel"><flag name="ExcludeFromCalcComparison" value="1"/></key>' +
    '<key name="_Attribution"><flag name="ExcludeFromCalcComparison" value="1"/></key>' +
    '<key name="_Icon"><flag name="ExcludeFromCalcComparison" value="1"/></key>' +
    '<key name="_Display"><flag name="ExcludeFromCalcComparison" value="1"/></key>' +
    '<key name="_CanonicalPropertyNames"><flag name="ExcludeFromCalcComparison" value="1"/></key>' +
    '<key name="_ClassificationId"><flag name="ExcludeFromCalcComparison" value="1"/></key>' +
    '</keyFlags></global></rvTypesInfo>';

  function specsText(specs) {
    if (!Array.isArray(specs) || !specs.length) return '';
    return specs.map(function (s) {
      if (s == null) return '';
      if (typeof s === 'string') return s;
      if (typeof s === 'object') return s.text || s.name || s.value || s.title || '';
      return String(s);
    }).filter(Boolean).join(' / ');
  }

  function fetchImageArrayBuffer(url) {
    return new Promise(function (resolve) {
      var port;
      try { port = chrome.runtime.connect({ name: 'tce_img_fetch' }); }
      catch (e) { return resolve(null); }
      var done = false;
      port.onMessage.addListener(function (msg) {
        if (!msg || msg._tceImg !== true) return;
        done = true;
        try { port.disconnect(); } catch (e) {}
        if (msg.ok && msg.base64) {
          var bin = atob(msg.base64);
          var u8 = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          resolve({ buf: u8, ext: msg.ext || 'jpeg' });
        } else { resolve(null); }
      });
      setTimeout(function () {
        if (!done) { try { port.disconnect(); } catch (e) {} resolve(null); }
      }, 15000);
      try { port.postMessage({ url: url }); } catch (e) { resolve(null); }
    });
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function ts() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
  }
  function toU8(raw) {
    if (raw instanceof Uint8Array) return raw;
    if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
    if (ArrayBuffer.isView(raw)) return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    return new Uint8Array(0);
  }
  function replaceCell(xml, ref, newCell) {
    var re = new RegExp('<c r="' + ref + '"[^>]*>[\\s\\S]*?</c>');
    if (re.test(xml)) return xml.replace(re, newCell);
    re = new RegExp('<c r="' + ref + '"[^>]*/>');
    if (re.test(xml)) return xml.replace(re, newCell);
    return xml;
  }
  async function fetchImgEntry(imgUrl) {
    if (!imgUrl) return null;
    var img = await fetchImageArrayBuffer(imgUrl);
    if (!img) return null;
    var u8 = toU8(img.buf);
    if (!u8.length) return null;
    return { u8: u8, ext: img.ext || 'jpeg' };
  }

  // ============ 模式 + 可选列 选择弹窗 ============
  async function chooseMode() {
    if (globalThis.__AP_FORCE_MODE) return { mode: globalThis.__AP_FORCE_MODE, extraCols: globalThis.__AP_FORCE_EXTRA || [] };
    // 读取上次勾选的可选列（记忆功能）
    var savedKeys = [];
    try {
      var r = await chrome.storage.local.get(['tce_extra_cols']);
      if (r && Array.isArray(r.tce_extra_cols)) savedKeys = r.tce_extra_cols;
    } catch (e) {}
    return new Promise(function (resolve) {
      var backdrop = document.createElement('div');
      backdrop.id = '__tce_export_chooser';
      backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:-apple-system,"Microsoft YaHei",system-ui,sans-serif;';
      var card = document.createElement('div');
      card.style.cssText = 'background:#fff;border-radius:14px;padding:24px 22px 16px;box-shadow:0 12px 40px rgba(0,0,0,.3);width:460px;max-width:92vw;box-sizing:border-box;';
      var title = document.createElement('div');
      title.style.cssText = 'font-size:17px;font-weight:600;color:#222;margin-bottom:4px;';
      title.textContent = '选择导出方式';
      var sub = document.createElement('div');
      sub.style.cssText = 'font-size:12px;color:#888;margin-bottom:14px;';
      sub.textContent = '先勾选要追加的列（可选），再点导出模式';
      card.appendChild(title); card.appendChild(sub);

      // 可选列区
      var optTitle = document.createElement('div');
      optTitle.style.cssText = 'font-size:12px;color:#555;font-weight:600;margin-bottom:8px;';
      optTitle.textContent = '可选追加列（勾选后追加到表格末尾）';
      var optBox = document.createElement('div');
      optBox.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px 14px;background:#fafafa;border:1px solid #eee;border-radius:8px;padding:10px 12px;margin-bottom:16px;';
      // 全选
      var allLbl = document.createElement('label');
      allLbl.style.cssText = 'display:flex;align-items:center;gap:5px;width:100%;font-size:12.5px;font-weight:700;color:#222;cursor:pointer;border-bottom:1px solid #e5e5e5;padding-bottom:7px;margin-bottom:2px;';
      var allCb = document.createElement('input');
      allCb.type = 'checkbox'; allCb.style.cssText = 'margin:0;width:14px;height:14px;cursor:pointer;';
      var allSp = document.createElement('span'); allSp.textContent = '全选';
      allLbl.appendChild(allCb); allLbl.appendChild(allSp);
      optBox.appendChild(allLbl);
      var checks = {};
      function syncAll() {
        allCb.checked = EXTRA_COLS.every(function (c) { return checks[c.key] && checks[c.key].checked; });
      }
      allCb.addEventListener('click', function () {
        EXTRA_COLS.forEach(function (c) { if (checks[c.key]) checks[c.key].checked = allCb.checked; });
      });
      EXTRA_COLS.forEach(function (c) {
        var lbl = document.createElement('label');
        lbl.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:12.5px;color:#444;cursor:pointer;';
        var cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = savedKeys.indexOf(c.key) >= 0;
        cb.style.cssText = 'margin:0;width:14px;height:14px;cursor:pointer;';
        cb.addEventListener('change', syncAll);
        var sp = document.createElement('span'); sp.textContent = c.label;
        lbl.appendChild(cb); lbl.appendChild(sp);
        optBox.appendChild(lbl);
        checks[c.key] = cb;
      });
      syncAll();
      card.appendChild(optTitle); card.appendChild(optBox);

      // 模式按钮
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:12px;';
      function mkBtn(emoji, label, desc, color, mode) {
        var b = document.createElement('button');
        b.style.cssText = 'flex:1;padding:14px 12px;border:1.5px solid ' + color + ';background:' + color + '0f;color:' + color + ';border-radius:10px;cursor:pointer;text-align:left;transition:transform .08s;';
        b.innerHTML = '<div style="font-size:14px;font-weight:700;margin-bottom:5px;">' + emoji + ' ' + label + '</div><div style="font-size:11px;font-weight:400;line-height:1.5;opacity:.85;white-space:pre-line;">' + desc + '</div>';
        b.onmouseenter = function () { b.style.transform = 'translateY(-1px)'; b.style.background = color + '1a'; };
        b.onmouseleave = function () { b.style.transform = ''; b.style.background = color + '0f'; };
        b.onclick = function () {
          var extraCols = EXTRA_COLS.filter(function (c) { return checks[c.key] && checks[c.key].checked; });
          try { chrome.storage.local.set({ tce_extra_cols: extraCols.map(function (c) { return c.key; }) }); } catch (e) {}
          try { backdrop.remove(); } catch (e) {}
          resolve({ mode: mode, extraCols: extraCols });
        };
        return b;
      }
      row.appendChild(mkBtn('🖼️', '导出嵌入', 'Excel 365 / 新版 WPS\n真·嵌单元格\n（旧版 WPS 显 #VALUE!）', '#1a73e8', 'embedded'));
      row.appendChild(mkBtn('📦', '导出浮动', '所有 WPS / 所有 Excel\n兼容性最好\n（图浮单元格上方）', '#34a853', 'floating'));
      card.appendChild(row);

      var cancel = document.createElement('div');
      cancel.style.cssText = 'text-align:center;margin-top:14px;font-size:12px;color:#aaa;cursor:pointer;';
      cancel.textContent = '取消';
      cancel.onclick = function () { try { backdrop.remove(); } catch (e) {} resolve(null); };
      card.appendChild(cancel);

      backdrop.appendChild(card);
      document.body.appendChild(backdrop);
    });
  }

  // ============ 公共：写表头 + 行容器 ============
  function writeRows(ws, items, extraCols) {
    var widths = [42, 30, 44, 8, 12, 14.5];
    for (var c = 0; c < widths.length; c++) ws.getColumn(c + 1).width = widths[c];
    extraCols.forEach(function (ec, i) {
      var def = EXTRA_COLS.filter(function (e) { return e.key === ec.key; })[0];
      ws.getColumn(COLS.length + 1 + i).width = (def && def.width) || 16;
    });
    var headerLabels = COLS.concat(extraCols.map(function (c) { return c.label; }));
    var header = ws.addRow(headerLabels);
    header.height = 22;
    header.eachCell(function (cell) {
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
    var rows = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {};
      rows.push({ item: it, imgUrl: Array.isArray(it.images) ? it.images[0] : it.images });
    }
    return rows;
  }
  function styleDataRow(row) {
    row.height = ROW_HEIGHT_PT;
    row.alignment = { vertical: 'middle' };
    row.eachCell(function (cell) { cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; });
    var linkCell = row.getCell(3);
    var url = row.getCell(3).value;
    if (url && typeof url === 'string') {
      linkCell.value = { text: url, hyperlink: url };
      linkCell.font = { color: { argb: 'FF0563C1' }, underline: true };
    }
    row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
  }
  // 一行数据：base 6 列 + 追加列
  function rowValues(it, placeholder, extraCols) {
    var base = [
      it.title || '',
      specsText(it.specs),
      it.detailsUrl || '',
      (it.quantity != null && it.quantity !== '') ? Number(it.quantity) : '',
      URGENCY_DEFAULT,
      placeholder,
    ];
    var extra = extraCols.map(function (c) { return (it[c.key] != null && it[c.key] !== '') ? String(it[c.key]) : ''; });
    return base.concat(extra);
  }

  // ============ 嵌入：Rich Data ============
  async function injectRichData(buffer, cellImages, JSZip) {
    var succ = [];
    for (var i = 0; i < cellImages.length; i++) if (cellImages[i].img) succ.push(cellImages[i]);
    if (!succ.length) return buffer;
    var N = succ.length;
    var zip = await JSZip.loadAsync(buffer);
    for (var i = 0; i < N; i++) zip.file('xl/media/image' + (i + 1) + '.' + succ[i].img.ext, succ[i].img.u8);
    zip.file('xl/richData/rdrichvaluestructure.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<rvStructures xmlns="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata" count="1"><s t="_localImage"><k n="_rvRel:LocalImageIdentifier" t="i"/><k n="CalcOrigin" t="i"/></s></rvStructures>');
    var rvXml = '', relXml = '', rvrXml = '';
    for (var i = 0; i < N; i++) {
      rvXml += '<rv s="0"><v>' + i + '</v><v>5</v></rv>';
      relXml += '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image' + (i + 1) + '.' + succ[i].img.ext + '"/>';
      rvrXml += '<rel r:id="rId' + (i + 1) + '"/>';
    }
    zip.file('xl/richData/rdrichvalue.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<rvData xmlns="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata" count="' + N + '">' + rvXml + '</rvData>');
    zip.file('xl/richData/richValueRel.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<richValueRels xmlns="http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' + rvrXml + '</richValueRels>');
    zip.file('xl/richData/_rels/richValueRel.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + relXml + '</Relationships>');
    zip.file('xl/richData/rdRichValueTypes.xml', RD_RVT_XML);
    var fmd = '', vmd = '';
    for (var i = 0; i < N; i++) {
      fmd += '<bk><extLst><ext uri="{3e2802c4-a4d2-4d8b-9148-e3be6c30e623}"><xlrd:rvb i="' + i + '"/></ext></extLst></bk>';
      vmd += '<bk><rc t="1" v="' + i + '"/></bk>';
    }
    zip.file('xl/metadata.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<metadata xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:xlrd="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata"><metadataTypes count="1"><metadataType name="XLRICHVALUE" minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" clearFormats="1" clearComments="1" assign="1" coerce="1"/></metadataTypes><futureMetadata name="XLRICHVALUE" count="' + N + '">' + fmd + '</futureMetadata><valueMetadata count="' + N + '">' + vmd + '</valueMetadata></metadata>');
    var ct = await zip.file('[Content_Types].xml').async('string');
    var extSet = {};
    for (var i = 0; i < N; i++) extSet[succ[i].img.ext] = 1;
    Object.keys(extSet).forEach(function (ext) {
      if (!new RegExp('<Default Extension="' + ext + '"').test(ct)) ct = ct.replace(/(<Types[^>]*>)/, '$1<Default Extension="' + ext + '" ContentType="image/' + ext + '"/>');
    });
    [['metadata.xml','application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml'],['richData/richValueRel.xml','application/vnd.ms-excel.richvaluerel+xml'],['richData/rdrichvalue.xml','application/vnd.ms-excel.rdrichvalue+xml'],['richData/rdrichvaluestructure.xml','application/vnd.ms-excel.rdrichvaluestructure+xml'],['richData/rdRichValueTypes.xml','application/vnd.ms-excel.rdrichvaluetypes+xml']].forEach(function (o) {
      if (!new RegExp('PartName="/xl/' + o[0] + '"').test(ct)) ct = ct.replace(/<\/Types>/, '<Override PartName="/xl/' + o[0] + '" ContentType="' + o[1] + '"/></Types>');
    });
    zip.file('[Content_Types].xml', ct);
    var wr = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    var em = wr.match(/Id="rId(\d+)"/g) || []; var mx = 0; em.forEach(function (s) { var n = +(s.match(/\d+/) || [0])[0]; if (n > mx) mx = n; });
    var nid = mx + 1;
    var add = '';
    [['http://schemas.openxmlformats.org/officeDocument/2006/relationships/sheetMetadata','metadata.xml'],['http://schemas.microsoft.com/office/2017/06/relationships/rdRichValue','richData/rdrichvalue.xml'],['http://schemas.microsoft.com/office/2017/06/relationships/rdRichValueStructure','richData/rdrichvaluestructure.xml'],['http://schemas.microsoft.com/office/2017/06/relationships/rdRichValueTypes','richData/rdRichValueTypes.xml'],['http://schemas.microsoft.com/office/2022/10/relationships/richValueRel','richData/richValueRel.xml']].forEach(function (nr) { add += '<Relationship Id="rId' + nid + '" Type="' + nr[0] + '" Target="' + nr[1] + '"/>'; nid++; });
    wr = wr.replace(/<\/Relationships>/, add + '</Relationships>');
    zip.file('xl/_rels/workbook.xml.rels', wr);
    var sheet = await zip.file('xl/worksheets/sheet1.xml').async('string');
    for (var i = 0; i < N; i++) { var ref = succ[i].ref; sheet = replaceCell(sheet, ref, '<c r="' + ref + '" t="e" vm="' + (i + 1) + '"><v>#VALUE!</v></c>'); }
    zip.file('xl/worksheets/sheet1.xml', sheet);
    return await zip.generateAsync({ type: 'arraybuffer', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  async function buildEmbedded(items, platform, extraCols) {
    var ExcelJS = window.ExcelJS || globalThis.ExcelJS;
    var JSZip = window.JSZip || globalThis.JSZip;
    if (!ExcelJS) throw new Error('ExcelJS 未加载');
    if (!JSZip) throw new Error('JSZip 未加载');
    var wb = new ExcelJS.Workbook();
    var ws = wb.addWorksheet('购物车');
    var rows = writeRows(ws, items, extraCols);
    var cellImages = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], it = r.item;
      var row = ws.addRow(rowValues(it, IMG_PLACEHOLDER, extraCols));
      styleDataRow(row);
      var entry = { ref: 'F' + row.number, img: null };
      var img = await fetchImgEntry(r.imgUrl);
      if (img) entry.img = img;
      else if (r.imgUrl) row.getCell(6).value = String(r.imgUrl);
      cellImages.push(entry);
    }
    var buffer = await wb.xlsx.writeBuffer();
    buffer = await injectRichData(buffer, cellImages, JSZip);
    return { buffer: buffer, filename: '淘宝购物车导出-' + (platform || 'cart').replace(/[^a-zA-Z0-9_-]/g, '') + '-' + ts() + '-嵌入.xlsx' };
  }

  async function buildFloating(items, platform, extraCols) {
    var ExcelJS = window.ExcelJS || globalThis.ExcelJS;
    if (!ExcelJS) throw new Error('ExcelJS 未加载');
    var wb = new ExcelJS.Workbook();
    var ws = wb.addWorksheet('购物车');
    var rows = writeRows(ws, items, extraCols);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], it = r.item;
      var row = ws.addRow(rowValues(it, '', extraCols));
      styleDataRow(row);
      var img = await fetchImgEntry(r.imgUrl);
      if (img) {
        try {
          var imgId = wb.addImage({ buffer: img.u8, extension: img.ext });
          ws.addImage(imgId, { tl: { col: IMG_COL, row: row.number - 1 }, ext: { width: IMG_SIZE, height: IMG_SIZE } });
        } catch (e) { if (r.imgUrl) row.getCell(6).value = String(r.imgUrl); }
      } else if (r.imgUrl) { row.getCell(6).value = String(r.imgUrl); }
    }
    var buffer = await wb.xlsx.writeBuffer();
    return { buffer: buffer, filename: '淘宝购物车导出-' + (platform || 'cart').replace(/[^a-zA-Z0-9_-]/g, '') + '-' + ts() + '-浮动.xlsx' };
  }

  function download(buffer, filename) {
    var blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { try { document.body.removeChild(a); } catch (e) {} URL.revokeObjectURL(url); }, 1500);
  }

  async function customExport(items, platform) {
    var old = document.getElementById('__tce_export_chooser'); if (old) old.remove();
    var choice = await chooseMode();
    if (!choice) return;
    var out = await (choice.mode === 'floating' ? buildFloating(items || [], platform, choice.extraCols) : buildEmbedded(items || [], platform, choice.extraCols));
    download(out.buffer, out.filename);
  }

  globalThis.__tceExport = customExport;
  window.__tceExport = customExport;
})();
