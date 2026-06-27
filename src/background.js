/*!
 * background.js — 淘宝购物车导出助手 · service worker
 * 唯一职责：图片下载助手。内容脚本经专用 port 请求图片字节，
 * 这里用扩展 host 权限 fetch（绕过页面 CORS），base64 回传。
 * （全原创代码，无任何第三方版权代码。）
 */
const PORT_NAME = 'tce_img_fetch';

function sniff(u8) {
  if (u8[0] === 0x89 && u8[1] === 0x50) return 'png';
  if (u8[0] === 0xff && u8[1] === 0xd8) return 'jpeg';
  if (u8[0] === 0x47 && u8[1] === 0x49) return 'gif';
  if (u8[0] === 0x42 && u8[1] === 0x4d) return 'bmp';
  if (u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46) return 'webp';
  return 'jpeg';
}

// 部分 alicdn 图天生 webp，尝试用 OSS 参数转 jpg（对部分图床有效；无效则保留原字节）
function maybeOssJpg(url) {
  if (/alicdn\.com|taobaocdn\.com/i.test(url) && !/[?&]x-oss-process=/.test(url)) {
    return url + (url.indexOf('?') > -1 ? '&' : '?') + 'x-oss-process=image/format,jpg';
  }
  return null;
}

function toBase64(u8) {
  const CHUNK = 0x8000;
  let bin = '';
  for (let i = 0; i < u8.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;
  port.onMessage.addListener(async (msg) => {
    const url = msg && msg.url;
    if (!url) return;
    try {
      let resp = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
      let u8 = new Uint8Array(await resp.arrayBuffer());
      let ext = sniff(u8);
      if (ext === 'webp') {
        // 尝试 OSS 转 jpg
        const u2 = maybeOssJpg(url);
        if (u2) {
          try {
            const r2 = await fetch(u2, { credentials: 'omit', referrerPolicy: 'no-referrer' });
            const u8b = new Uint8Array(await r2.arrayBuffer());
            const e2 = sniff(u8b);
            if (e2 !== 'webp') { u8 = u8b; ext = e2; }
          } catch (e) { /* 忽略，保留原 webp */ }
        }
      }
      port.postMessage({ _tceImg: true, ok: true, base64: toBase64(u8), ext });
    } catch (e) {
      port.postMessage({ _tceImg: true, ok: false, error: String(e && e.message || e) });
    }
  });
});
