// 端到端桩测 export.js：验证嵌入/浮动两模式产出结构正确
const fs = require('fs'), vm = require('vm');
const PROJ = '/Users/cgifm/Projects/taobao-cart-export';
globalThis.window = globalThis;
globalThis.ExcelJS = require(PROJ + '/vendor/exceljs.min.js');
globalThis.JSZip = require(PROJ + '/vendor/jszip.min.js');

const LOCAL = ['/Users/cgifm/Projects/aiprice-cart-mod/dist/timg1.jpeg', '/Users/cgifm/Projects/aiprice-cart-mod/dist/timg2.jpeg'];
let _i = 0;
function makePort() {
  let cb = null;
  return {
    onMessage: { addListener(fn) { cb = fn; } },
    postMessage(msg) {
      if (/invalid\.example/.test(msg.url)) { setTimeout(() => cb && cb({ _tceImg: true, ok: false }), 0); return; }
      try { const u8 = fs.readFileSync(LOCAL[_i % 2]); _i++; setTimeout(() => cb && cb({ _tceImg: true, ok: true, base64: u8.toString('base64'), ext: 'jpeg' }), 0); }
      catch (e) { setTimeout(() => cb && cb({ _tceImg: true, ok: false }), 0); }
    },
    disconnect() {},
  };
}
globalThis.chrome = { runtime: { connect: () => makePort() } };
globalThis.__captured = null;
globalThis.Blob = function (parts) { globalThis.__captured = parts[0]; };
globalThis.URL = { createObjectURL() { return 'blob:x'; }, revokeObjectURL() {} };
globalThis.document = { createElement() { return { click() {}, href: '', download: '' }; }, body: { appendChild() {}, removeChild() {} }, getElementById() { return null; } };

vm.runInThisContext(fs.readFileSync(PROJ + '/src/export.js', 'utf8'));

(async () => {
  const items = [
    { title: '测试商品A', specs: ['颜色：红', 'L码'], detailsUrl: 'https://item.taobao.com/item.htm?id=111', quantity: 2, images: ['https://gw.alicdn.com/a.png'], price: '￥12.5', shop: '店铺A', tagsText: '立减2元', itemId: '111' },
    { title: '测试商品B', specs: ['颜色：蓝'], detailsUrl: 'https://item.taobao.com/item.htm?id=222', quantity: 1, images: ['https://gw.alicdn.com/b.jpg'], price: '￥33.0', shop: '店铺B', tagsText: '退货宝', itemId: '222' },
    { title: '无图兜底', specs: [], detailsUrl: 'https://item.taobao.com/item.htm?id=333', quantity: 1, images: ['https://invalid.example/x.jpg'], price: '￥9.9', shop: '店铺C', tagsText: '', itemId: '333' },
  ];
  globalThis.__AP_FORCE_EXTRA = [{key:'price',label:'价格'},{key:'shop',label:'店铺'},{key:'itemId',label:'商品ID'},{key:'tagsText',label:'标签/优惠'}];
  for (const mode of ['embedded', 'floating']) {
    globalThis.__AP_FORCE_MODE = mode; globalThis.__captured = null; _i = 0;
    await globalThis.__tceExport(items, 'taobao');
    if (!globalThis.__captured) { console.error('✗ ' + mode + ' no buffer'); continue; }
    const out = '/tmp/tce-test-' + mode + '.xlsx';
    fs.writeFileSync(out, Buffer.from(globalThis.__captured));
    console.log('✓ [' + mode + '] ' + out + ' ' + fs.statSync(out).size + 'B');
  }
})();
