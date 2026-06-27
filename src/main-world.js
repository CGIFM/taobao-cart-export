/*!
 * main-world.js — 在页面【主世界】运行（manifest world:"MAIN", document_start）
 * 拦截 window.fetch + XMLHttpRequest，捕获淘宝购物车 API 的响应 JSON，
 * 通过 window.postMessage 转发给内容脚本（隔离世界）。
 *
 * Phase A（探针版）：把命中的购物车响应 + 其它 taobao 相关请求都打到控制台，
 * 方便用户复制 F12 日志发作者，Phase B 据此精准化解析。
 * 全原创代码。
 */
(() => {
  const TAG = '__TCE_CART__';
  const MAX = 200000; // 单次转发最大字符
  // 命中"购物车相关"的 URL（宽松，宁抓多）
  const CART_URL = /cart\.taobao\.com|\/cart\b|mtop\.[\w.]*cart|trade\.[\w.]*cart|h5api\.m\.taobao\.com/i;
  // taobao 站内、且非静态资源的 URL（仅记录 URL，不抓 body）
  const TB_URL = /(taobao|tmall)\.com/i;
  const STATIC = /\.(js|css|png|jpe?g|gif|webp|woff2?|ttf|mp4)(\?|$)/i;

  function relay(kind, url, body) {
    try {
      window.postMessage({ tag: TAG, kind, url: String(url || ''), body: String(body || '').slice(0, MAX), at: Date.now() }, '*');
    } catch (e) {}
  }

  // ---- 包装 fetch ----
  const _fetch = window.fetch;
  if (typeof _fetch === 'function' && !_fetch.__tce) {
    const wrapped = function (input, init) {
      const url = (typeof input === 'string') ? input : (input && input.url) || '';
      const p = _fetch.apply(this, arguments);
      try {
        if (url && CART_URL.test(url)) {
          p.then((resp) => {
            try {
              resp.clone().text().then((t) => {
                console.log('%c[购物车导出·命中] fetch', 'color:#1a73e8;font-weight:bold', url, '长度=' + t.length);
                relay('fetch', url, t);
              }).catch(() => {});
            } catch (e) {}
          }).catch(() => {});
        } else if (url && TB_URL.test(url) && !STATIC.test(url)) {
          console.log('%c[购物车导出·主世界] fetch', 'color:#999', url);
        }
      } catch (e) {}
      return p;
    };
    wrapped.__tce = true;
    window.fetch = wrapped;
  }

  // ---- 包装 XHR ----
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  if (typeof _open === 'function' && !_open.__tce) {
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__tce_url = url;
      this.__tce_cart = !!url && CART_URL.test(String(url));
      return _open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      const self = this;
      if (this.__tce_cart) {
        this.addEventListener('load', () => {
          try {
            const t = self.responseText || '';
            console.log('%c[购物车导出·命中] XHR', 'color:#1a73e8;font-weight:bold', self.__tce_url, '长度=' + t.length);
            relay('xhr', self.__tce_url, t);
          } catch (e) {}
        });
      } else if (this.__tce_url && TB_URL.test(String(this.__tce_url)) && !STATIC.test(String(this.__tce_url))) {
        console.log('%c[购物车导出·主世界] XHR', 'color:#999', this.__tce_url);
      }
      return _send.apply(this, arguments);
    };
    _open.__tce = true;
  }

  console.log('%c[购物车导出·主世界] 拦截器已装（fetch/XHR）', 'color:#34a853;font-weight:bold');
})();
