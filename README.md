# 淘宝购物车导出助手

一个**完全独立**的 Chrome 扩展：把淘宝购物车里勾选的商品一键导出为 Excel(.xlsx)，6 列：名称 | 规格 | 链接 | 数量 | 紧急程度 | 图片。图片支持「单元格内嵌」或「浮动」两种模式。

**不依赖 AiPrice / AliPrice 或任��第三方扩展，代码全部原创**（可自由分发）。

> 作者：**FengMingyang**　·　当前 **v1.0.0 稳定版**

---

## 功能
- 支持淘宝 PC 购物车（`cart.taobao.com`）
- 勾选商品 → 导出 xlsx（6 列）
- 图片两种模式，点导出时弹窗二选一：
  - 🖼️ **嵌入**：Excel 365 Rich Data，真·嵌单元格（Excel 365 / 新版 WPS 显示；旧版 WPS/旧版 Excel 显示 `#VALUE!`）
  - 📦 **浮动**：标准浮动图，所有 WPS / 所有 Excel / 所有机器都显示
- 失败的图回退为链接文字

---

## 安装（加载已解压扩展）
1. 解压本包，得到 `taobao-cart-export/` 文件夹（放到固定位置，**不要删/移动**）
2. Chrome（或 Edge / Brave）地址栏输入 `chrome://extensions`
3. 右上角打开「开发者模式」
4. 点左上角「加载已解压的扩展程序」，选 `taobao-cart-export/` 这一层
5. 打开 https://cart.taobao.com/ → 勾选商品 → 点页面右下角橙色「📥 导出购物车」按钮 → 选模式 → 下载

---

## 🔍 探针版必做：发一次日志（用于出正式版）
第一次用大概率抓不全商品——淘宝数据结构千变万化，需按你的真实页面调一次。请：
1. 在购物车页按 **F12** → **Console**
2. 上下滚动一下购物车（让数据加载），再点右下角「导出购物车」
3. 把控制台里 **`[购物车导出]`** 开头的日志（尤其**红色错误**那段）**复制 / 截图发给作者**
4. 作者据此精准适配淘宝字段，出正式版（届时无需再发日志）

---

## 目录结构
```
taobao-cart-export/
├── manifest.json          MV3，淘宝购物车导出助手 v1.0.0
├── src/
│   ├── background.js      图片下载助手（service worker，host 权限 fetch + base64）
│   ├── main-world.js      主世界拦截 fetch/XHR，捕获购物车 API JSON（探针版重 log）
│   ├── cart-parse.js      JSON/DOM → 统一商品对象（探针版宽松启发式）
│   ├── content.js         注入「导出」按钮 + orchestrator
│   └── export.js          xlsx 导出引擎（ExcelJS + JSZip 双模式）
├── vendor/ exceljs.min.js, jszip.min.js
├── popup.html / popup.js  工具栏弹窗（说明 + 打开购物车）
├── icons/ 16/32/48/128
├── README.md
└── 安装说明.txt
```

## 技术原理
1. **主世界拦截**：`main-world.js` 在页面主世界包 `window.fetch` + `XMLHttpRequest`，命中购物车 API 时把响应 JSON 经 `postMessage` 转给内容脚本。
2. **DOM 兜底**：拦截不到时，`cart-parse.js` 直接从页面 DOM 抓可见字段。
3. **导出引擎**：`export.js` 用 ExcelJS 建表；嵌入模式再用 JSZip 后处理注入 Excel 365 Rich Data（图片真嵌单元格），浮动模式用 ExcelJS 浮动锚定。
4. **图片**：经 `background.js` 用扩展 host 权限 fetch，绕过页面 CORS，base64 回传。

## 声明
本扩展全部代码原创，不含任何第三方版权代码。「淘宝」为阿里巴巴集团商标，本扩展与其无任何关联/授权。仅限个人学习自用。
