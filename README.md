# AdBlockShield

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/axiaoxin/adblock-shield)

> 一个轻量级、高准确率的 Google AdSense 广告拦截检测库，支持 7 种检测维度，覆盖主流广告拦截工具。

## 特性

- 🔍 **7 种检测方式**：资源重定向、元素隐藏、脚本拦截、DNS 拦截、Safari 内容拦截器、企业防火墙、Brave 浏览器识别
- 🛡️ **防绕过机制**：MutationObserver 监控 + 定时检查，遮罩被移除立即重建
- 📱 **多语言支持**：自动根据浏览器语言切换（简体中文 / 繁体中文 / 英文）
- 🔒 **页面锁定**：检测到拦截后禁止页面滚动和一切交互
- 🎨 **高度可定制**：支持自定义遮罩层 HTML 和样式
- ⚡ **零依赖**：纯原生 JavaScript，无需任何第三方库
- 📦 **轻量级**：压缩后仅 ~3KB

## 快速开始

### 方式一：直接引入（推荐）

将 `adblock-shield.js` 放到页面底部，`</body>` 标签之前：

```html
<!DOCTYPE html>
<html>
  <head>
    <title>My Site</title>
  </head>
  <body>
    <!-- 你的页面内容 -->

    <!-- 在 </body> 前引入 -->
    <script src="adblock-shield.js"></script>
    <script>
      AdBlockShield.init();
    </script>
  </body>
</html>
```

### 方式二：模块化引入

```javascript
import AdBlockShield from "adblock-shield";

AdBlockShield.init({
  debug: true,
});
```

## 配置选项

```javascript
AdBlockShield.init({
  // 检测阈值 (0-100)，达到此分数触发拦截提示
  threshold: 50,

  // 最大检测次数
  maxChecks: 3,

  // 检测间隔，单位毫秒
  checkInterval: 2000,

  // 初始检测延迟，等待页面资源加载
  initialDelay: 500,

  // 广告资源 URL 特征
  adPatterns: [
    "adsbygoogle",
    "googlesyndication",
    "doubleclick",
    "googleads",
    "googletagmanager",
  ],

  // 诱饵元素类名
  baitClasses: ["adsbygoogle", "adsbox", "ad-banner", "advertisement"],

  // 是否启用页面锁定（禁止滚动和交互）
  lockPage: true,

  // 是否启用防绕过（监控遮罩被移除）
  antiBypass: true,

  // 是否阻止键盘事件
  blockKeyboard: true,

  // 是否阻止右键菜单
  blockContextMenu: true,

  // 调试模式
  debug: false,

  // 自定义遮罩层 HTML（覆盖默认内容）
  overlayHTML: null,

  // 检测到拦截时的回调
  onDetected: function (info) {
    console.log("Detected!", info);
  },

  // 每次检测后的回调
  onCheck: function (info) {
    console.log("Check #" + info.count, "Score:", info.score);
  },
});
```

## 检测原理

| #   | 检测方式                  | 原理                                                               | 覆盖工具                             |
| --- | ------------------------- | ------------------------------------------------------------------ | ------------------------------------ |
| 1   | **资源重定向检测**        | `performance.getEntriesByType()` 检查广告资源 `transferSize === 0` | AdGuard, uBlock Origin, AdBlock Plus |
| 2   | **元素隐藏规则检测**      | 动态创建诱饵元素，检查是否被 `display:none` 隐藏                   | EasyList, AdGuard Base               |
| 3   | **脚本拦截检测**          | 检查 `window.adsbygoogle` 对象是否存在且功能正常                   | Pi-hole, NextDNS, 企业防火墙         |
| 4   | **DNS 层拦截检测**        | 请求广告域名 favicon，DNS 拦截会快速失败（< 50ms）                 | Pi-hole, NextDNS, AdGuard DNS        |
| 5   | **Safari 内容拦截器检测** | 对比广告域名和本站资源的加载结果差异                               | 1Blocker, Wipr, AdGuard for Safari   |
| 6   | **企业防火墙检测**        | `fetch` 广告脚本，防火墙返回极快的阻止响应                         | Fortinet, Palo Alto, Cisco           |
| 7   | **Brave 浏览器识别**      | 检测 `navigator.brave` 对象                                        | Brave Shields                        |

### 评分系统

每种检测方式有不同的权重，组合交叉验证提高准确率：

| 检测项        | 权重 | 组合加成              |
| ------------- | ---- | --------------------- |
| 资源重定向    | 40   | +15（配合元素隐藏）   |
| 元素隐藏      | 25   | +15（配合资源重定向） |
| 脚本拦截      | 20   | +15（配合 DNS 拦截）  |
| DNS 拦截      | 15   | +15（配合脚本拦截）   |
| Safari 拦截器 | 15   | -                     |
| 企业防火墙    | 10   | -                     |

**默认阈值：50 分**，达到即触发遮罩。

## 自定义遮罩层

### 完全自定义 HTML

```javascript
AdBlockShield.init({
  overlayHTML: `
        <h2>🚫 Ad Blocker Detected</h2>
        <p>Please support us by disabling your ad blocker.</p>
        <button onclick="location.reload()">I've disabled it</button>
        <a href="/premium">Go Premium</a>
    `,
});
```

### 仅统计不拦截

```javascript
AdBlockShield.init({
  lockPage: false, // 不锁定页面
  antiBypass: false, // 不启用防绕过
  onDetected: function (info) {
    // 发送统计到服务端
    fetch("/api/adblock-stats", {
      method: "POST",
      body: JSON.stringify(info),
    });
  },
});
```

## API 参考

### `AdBlockShield.init(config)`

初始化检测库，启动自动检测。

- **参数**: `config` - 配置对象（可选）
- **返回**: `AdBlockShield` 实例（支持链式调用）

### `AdBlockShield.detect()`

手动触发一次检测。

- **返回**: `Promise<boolean>` - 是否检测到拦截

```javascript
AdBlockShield.detect().then(function (blocked) {
  console.log("Blocked:", blocked);
});
```

### `AdBlockShield.getState()`

获取当前检测状态。

- **返回**: `Object` - `{ detected, checkCount, score, reasons }`

```javascript
var state = AdBlockShield.getState();
console.log(state.detected); // true/false
console.log(state.score); // 当前分数
console.log(state.reasons); // 检测原因数组
```

### `AdBlockShield.reset()`

重置所有状态，移除遮罩和锁定。

- **返回**: `AdBlockShield` 实例

### `AdBlockShield.destroy()`

完全销毁实例，清理所有资源。

- **返回**: `AdBlockShield` 实例

## 浏览器兼容性

| 浏览器  | 最低版本 |
| ------- | -------- |
| Chrome  | 60+      |
| Firefox | 55+      |
| Safari  | 12+      |
| Edge    | 79+      |
| Brave   | 1.0+     |

> 需要支持 `Promise`、`fetch`、`MutationObserver` 和 `Performance API`。

## 注意事项

1. **引入位置**：建议放在 `</body>` 之前，确保页面 DOM 已解析
2. **异步脚本**：如果页面使用了 `async` 加载广告脚本，建议适当增加 `initialDelay`
3. **CDN 资源**：使用 CDN 时确保域名未被用户的拦截规则屏蔽
4. **误报处理**：如果用户反馈误报，可通过 `debug: true` 查看具体检测日志

## 作者

**axiaoxin**

- Blog: [https://blog.axiaoxin.com](https://blog.axiaoxin.com/post/adsense-ad-block-detection-guide/)
- GitHub: [@axiaoxin](https://github.com/axiaoxin)

如果这个项目对你有帮助，欢迎 ⭐ Star 支持！
