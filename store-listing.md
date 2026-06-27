# Chrome / Edge 商店上架文案

## 名称（≤45 字符）
- 中文：淘宝购物车导出助手
- 英文：Taobao Cart Export

## 简短摘要（≤132 字符）
- 中文：把淘宝购物车勾选的商品一键导出为 Excel(.xlsx)，图片支持单元格内嵌/浮动两种模式。
- 英文：Export checked Taobao cart items to Excel (.xlsx); images embedded or floating.

## 详细描述（中文）
把淘宝购物车里**勾选**的商品一键导出为 Excel(.xlsx) 表格，固定 6 列：
名称 | 规格 | 链接 | 数量 | 紧急程度 | 图片

**主要特性：**
• 一键导出勾选商品（同款不同规格也能分别导出）
• 图片两种模式：单元格内嵌（Excel 365 / 新版 WPS）/ 浮动（所有软件兼容）
• 规格自动识别（颜色、尺码等）
• 链接可点击；数量、紧急程度列齐全
• 个别图片拉取失败时自动回退为链接文字
• 数据全部本地处理，不上传任何服务器，无广告无追踪

**使用方法：**
打开淘宝购物车（cart.taobao.com）→ 勾选要导出的商品 → 点页面右下角橙色「导出购物车」按钮 → 选模式 → 下载 .xlsx。

## 详细描述（英文）
Export **checked** items in your Taobao shopping cart to a clean Excel (.xlsx) — 6 columns:
Name | Spec | Link | Quantity | Urgency | Image

• Exports only checked items (same product, different specs each exported separately)
• Two image modes: cell-embedded (Excel 365 / new WPS) or floating (universal)
• Auto-detects SKU specs (color, size, etc.)
• Clickable links; quantity & urgency columns
• Failed images fall back to link text
• 100% local processing — no servers, no ads, no tracking

**Usage:** open cart.taobao.com → check items → click the orange "Export" button → choose mode → download.

## 类目
购物 / 效率（Shopping / Productivity）

## 需要准备的图片
- 商店图标 128×128 PNG（已有：icons/128.png）
- 截图 1280×800（1~5 张），建议：
  1. 购物车页 + 勾选了几个商品 + 右下角橙色"导出"按钮
  2. 点导出后的"嵌入/浮动"二选一弹窗
  3. 导出的 xlsx 在 Excel 打开（图片嵌在单元格里）
  4. 浮动模式在 WPS / 旧版打开（图片显示）
- 小推广图 440×280（可选，提升商店展示）

## 隐私政策 URL
本仓库的 PRIVACY.md 发布到 GitHub 后，用其公开链接（GitHub Pages 或 raw URL）填入"隐私权做法"。

## 权限说明（填表用）
- host_permissions taobao.com：读取购物车页商品数据
- host_permissions alicdn.com：拉取商品主图嵌入导出文件
- storage：保存用户偏好
- 选中"我的扩展不收集用户数据"或对应声明
