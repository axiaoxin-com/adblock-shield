/**
 * AdBlockShield - 通用广告拦截检测库
 * @version 1.0.0
 * @Author axiaoxin https://blog.axiaoxin.com
 * @license MIT
 *
 * 使用方式：
 * 1. 在页面底部引入此脚本
 * 2. 调用 AdBlockShield.init(config) 初始化
 * 3. 检测到拦截时触发回调
 */

(function (global) {
  "use strict";

  // ═══════════════════════════════════════════════════════
  // 多语言配置：根据浏览器语言自动切换
  // ═══════════════════════════════════════════════════════
  var i18n = {
    "zh-Hans": {
      title: "🛡️ 检测到广告拦截插件",
      desc1: "我们检测到您正在使用广告拦截工具。",
      desc2: "请关闭广告拦截插件并刷新页面以继续访问。",
      refresh: "刷新页面",
    },
    "zh-Hant": {
      title: "🛡️ 檢測到廣告攔截插件",
      desc1: "我們檢測到您正在使用廣告攔截工具。",
      desc2: "請關閉廣告攔截插件並重新整理頁面以繼續瀏覽。",
      refresh: "重新整理頁面",
    },
    en: {
      title: "🛡️ Ad Blocker Detected",
      desc1: "We detected that you are using an ad blocker.",
      desc2: "Please disable your ad blocker and refresh the page to continue.",
      refresh: "Refresh Page",
    },
  };

  /**
   * 检测浏览器语言
   * @returns {string} 语言代码：'zh-Hans' | 'zh-Hant' | 'en'
   */
  function detectLang() {
    var lang = navigator.language || navigator.userLanguage || "en";
    if (lang.indexOf("zh") === 0) {
      if (
        lang.indexOf("Hant") !== -1 ||
        lang.indexOf("TW") !== -1 ||
        lang.indexOf("HK") !== -1
      ) {
        return "zh-Hant";
      }
      return "zh-Hans";
    }
    return "en";
  }

  // ═══════════════════════════════════════════════════════
  // 默认配置
  // ═══════════════════════════════════════════════════════
  var defaults = {
    // 检测阈值 (0-100)，达到此分数触发拦截提示
    threshold: 50,
    // 最大检测次数
    maxChecks: 3,
    // 检测间隔 (ms)
    checkInterval: 2000,
    // 初始检测延迟 (ms)，等待页面资源加载
    initialDelay: 500,
    // 广告资源 URL 特征，用于 performance API 匹配
    adPatterns: [
      "adsbygoogle",
      "googlesyndication",
      "doubleclick",
      "googleads",
      "googletagmanager",
    ],
    // 诱饵元素类名，广告拦截器会隐藏/移除这些元素
    baitClasses: ["adsbygoogle", "adsbox", "ad-banner", "advertisement"],
    // 是否启用页面锁定（禁止滚动和操作）
    lockPage: true,
    // 是否启用防绕过（监控遮罩被移除）
    antiBypass: true,
    // 检测到拦截时的回调函数
    onDetected: null,
    // 每次检测后的回调函数
    onCheck: null,
    // 自定义遮罩层 HTML（覆盖默认内容）
    overlayHTML: null,
    // 是否阻止键盘事件穿透
    blockKeyboard: true,
    // 是否阻止右键菜单
    blockContextMenu: true,
    // 调试模式，输出检测日志到控制台
    debug: false,
  };

  // ═══════════════════════════════════════════════════════
  // 内部状态
  // ═══════════════════════════════════════════════════════
  var state = {
    detected: false, // 是否已检测到拦截
    checkCount: 0, // 当前检测次数
    score: 0, // 当前分数
    reasons: [], // 检测原因列表
    observer: null, // MutationObserver 实例
    lockInterval: null, // 定时锁定检查器
    config: null, // 运行时配置
  };

  /**
   * 调试日志输出
   */
  function log() {
    if (!state.config || !state.config.debug) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift("[AdBlockShield]");
    console.log.apply(console, args);
  }

  /**
   * 对象属性合并
   * @param {Object} target - 目标对象
   * @param {Object} source - 源对象
   * @returns {Object} 合并后的目标对象
   */
  function extend(target, source) {
    for (var key in source) {
      if (source.hasOwnProperty(key)) {
        target[key] = source[key];
      }
    }
    return target;
  }

  // ═══════════════════════════════════════════════════════
  // 检测模块：7 种检测方式覆盖主流拦截工具
  // ═══════════════════════════════════════════════════════

  /**
   * 检测 1：资源重定向检测
   * 原理：AdGuard/uBlock 等会将广告脚本重定向到本地扩展
   * 特征：performance.getEntriesByType('resource') 中 transferSize === 0
   * 覆盖：AdGuard, uBlock Origin, AdBlock Plus
   */
  function checkResourceRedirect() {
    if (!window.performance || !performance.getEntriesByType) {
      return { blocked: false, confidence: 0, reason: "no-api" };
    }

    var entries = performance.getEntriesByType("resource");
    var patterns = state.config.adPatterns;
    var blocked = 0;
    var total = 0;
    var details = [];

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var name = entry.name || "";
      var isAd = false;

      for (var j = 0; j < patterns.length; j++) {
        if (name.indexOf(patterns[j]) !== -1) {
          isAd = true;
          break;
        }
      }

      if (!isAd) continue;

      total++;
      var transferSize = entry.transferSize || 0;
      var deliveryType = entry.deliveryType || "";

      // 核心判断：transferSize 为 0 且非缓存 = 被重定向到本地
      var isBlocked =
        (transferSize === 0 && deliveryType === "") ||
        name.indexOf("chrome-extension://") !== -1 ||
        name.indexOf("moz-extension://") !== -1 ||
        name.indexOf("safari-extension://") !== -1;

      if (isBlocked) blocked++;

      details.push({
        name: name.substring(
          name.lastIndexOf("/") + 1,
          name.lastIndexOf("/") + 50,
        ),
        transferSize: transferSize,
        deliveryType: deliveryType,
        blocked: isBlocked,
      });
    }

    return {
      blocked: total > 0 && blocked > 0,
      confidence: total > 0 ? Math.round((blocked / total) * 100) : 0,
      totalChecked: total,
      blockedCount: blocked,
      details: details,
    };
  }

  /**
   * 检测 2：元素隐藏规则检测
   * 原理：动态创建诱饵元素，检查是否被 EasyList 等规则隐藏
   * 覆盖：所有基于元素隐藏的拦截器
   */
  function checkElementHiding() {
    var classes = state.config.baitClasses;
    var blocked = 0;
    var total = classes.length;
    var details = [];

    for (var i = 0; i < total; i++) {
      var el = document.createElement("div");
      el.className = classes[i];
      el.style.cssText =
        "display:block;width:10px;height:10px;position:absolute;left:-9999px;";
      el.textContent = "ad";
      document.body.appendChild(el);

      var style = window.getComputedStyle(el);
      var rect = el.getBoundingClientRect();
      var isBlocked = false;
      var reason = "";

      if (style.display === "none") {
        isBlocked = true;
        reason = "display:none";
      } else if (style.visibility === "hidden") {
        isBlocked = true;
        reason = "visibility:hidden";
      } else if (parseFloat(style.opacity) === 0) {
        isBlocked = true;
        reason = "opacity:0";
      } else if (el.offsetHeight === 0) {
        isBlocked = true;
        reason = "offsetHeight:0";
      }

      if (isBlocked) blocked++;
      details.push({
        className: classes[i],
        blocked: isBlocked,
        reason: reason,
      });

      document.body.removeChild(el);
    }

    return {
      blocked: blocked >= 2,
      confidence: Math.round((blocked / total) * 100),
      details: details,
    };
  }

  /**
   * 检测 3：脚本拦截检测
   * 原理：检查 adsbygoogle 全局对象是否存在且功能正常
   * 覆盖：Pi-hole, NextDNS, 企业防火墙（网络层拦截）
   */
  function checkScriptBlocked() {
    var hasScript = false;
    var scripts = document.querySelectorAll("script");
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].src || "";
      for (var j = 0; j < state.config.adPatterns.length; j++) {
        if (src.indexOf(state.config.adPatterns[j]) !== -1) {
          hasScript = true;
          break;
        }
      }
      if (hasScript) break;
    }

    var obj = window.adsbygoogle;

    if (!hasScript) {
      return { hasAds: false, blocked: false };
    }

    if (!obj) {
      return { hasAds: true, blocked: true, reason: "object-missing" };
    }

    if (typeof obj.push !== "function") {
      return { hasAds: true, blocked: true, reason: "push-missing" };
    }

    return { hasAds: true, blocked: false };
  }

  /**
   * 检测 4：DNS 层拦截检测
   * 原理：请求广告域名 favicon，DNS 拦截（如 Pi-hole）会快速失败
   * 特征：失败时间 < 50ms（本地 NXDOMAIN 响应）
   * 覆盖：Pi-hole, NextDNS, AdGuard DNS
   */
  function checkDNSBlocking() {
    return new Promise(function (resolve) {
      var img = new Image();
      var start = Date.now();
      var resolved = false;

      img.onload = function () {
        if (resolved) return;
        resolved = true;
        resolve({ blocked: false, reason: "loaded" });
      };

      img.onerror = function () {
        if (resolved) return;
        resolved = true;
        var duration = Date.now() - start;
        resolve({
          blocked: duration < 50,
          reason: duration < 50 ? "fast-fail" : "slow-fail",
          duration: duration,
        });
      };

      img.src =
        "https://pagead2.googlesyndication.com/favicon.ico?_=" + Date.now();

      setTimeout(function () {
        if (resolved) return;
        resolved = true;
        resolve({ blocked: false, reason: "timeout" });
      }, 3000);
    });
  }

  /**
   * 检测 5：Brave 浏览器内置拦截检测
   * 原理：Brave Shields 会设置 navigator.brave 对象
   * 覆盖：Brave Browser
   */
  function checkBraveBrowser() {
    var isBrave = false;
    if (navigator.brave && typeof navigator.brave.isBrave === "function") {
      isBrave = true;
    }
    if (navigator.userAgent && navigator.userAgent.indexOf("Brave") !== -1) {
      isBrave = true;
    }
    return { isBrave: isBrave, blocked: false };
  }

  /**
   * 检测 6：Safari 内容拦截器检测
   * 原理：对比广告域名和本站资源的加载结果
   * 覆盖：1Blocker, Wipr, AdGuard for Safari
   */
  function checkSafariContentBlocker() {
    var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (!isSafari) return { isSafari: false, blocked: false };

    return new Promise(function (resolve) {
      var testImg = new Image();
      var ctrlImg = new Image();
      var testDone = false;
      var ctrlDone = false;
      var testBlocked = false;

      testImg.onload = function () {
        testDone = true;
        check();
      };
      testImg.onerror = function () {
        testDone = true;
        testBlocked = true;
        check();
      };
      ctrlImg.onload = function () {
        ctrlDone = true;
        check();
      };
      ctrlImg.onerror = function () {
        ctrlDone = true;
        check();
      };

      testImg.src =
        "https://pagead2.googlesyndication.com/favicon.ico?_=" + Date.now();
      ctrlImg.src = "/favicon.ico?_=" + Date.now();

      function check() {
        if (!testDone || !ctrlDone) return;
        resolve({ isSafari: true, blocked: testBlocked });
      }

      setTimeout(function () {
        if (!testDone) {
          testDone = true;
          testBlocked = true;
          check();
        }
      }, 2000);
    });
  }

  /**
   * 检测 7：企业防火墙/安全软件检测
   * 原理：fetch 广告脚本，企业防火墙可能返回极快的阻止响应
   * 覆盖：Fortinet, Palo Alto, Cisco 等
   */
  function checkEnterpriseFirewall() {
    return new Promise(function (resolve) {
      if (!window.fetch) {
        resolve({ blocked: false });
        return;
      }

      var start = Date.now();
      fetch(
        "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?_=" +
          Date.now(),
        {
          mode: "no-cors",
          cache: "no-cache",
        },
      )
        .then(function (response) {
          var duration = Date.now() - start;
          resolve({
            blocked: duration < 50 && response.status === 200,
            duration: duration,
            status: response.status,
          });
        })
        .catch(function () {
          resolve({ blocked: true, reason: "fetch-error" });
        });
    });
  }

  // ═══════════════════════════════════════════════════════
  // 遮罩层与防绕过模块
  // ═══════════════════════════════════════════════════════

  /**
   * 创建遮罩层样式
   * 关键：使用 flex 布局确保弹窗居中，大字显示确保可读性
   */
  function injectStyles() {
    var style = document.getElementById("adblock-shield-style");
    if (style) return;

    style = document.createElement("style");
    style.id = "adblock-shield-style";
    style.textContent = [
      // 页面锁定：禁止滚动和一切交互
      "html.adblock-shield-locked,",
      "html.adblock-shield-locked body {",
      "  overflow: hidden !important;",
      "  position: fixed !important;",
      "  width: 100% !important;",
      "  height: 100% !important;",
      "  touch-action: none !important;",
      "  pointer-events: none !important;",
      "  -webkit-overflow-scrolling: none !important;",
      "}",
      // 遮罩层容器：fixed 全屏，flex 居中，最高层级
      "#adblock-shield-overlay {",
      "  display: none;",
      "  position: fixed;",
      "  top: 0;",
      "  left: 0;",
      "  right: 0;",
      "  bottom: 0;",
      "  z-index: 2147483647;",
      "  background: rgba(0,0,0,0.85);",
      "  pointer-events: all !important;",
      "  touch-action: auto !important;",
      // 核心：flex 布局实现水平和垂直居中
      "  align-items: center;",
      "  justify-content: center;",
      "  overflow-y: auto;",
      "  -webkit-overflow-scrolling: touch;",
      "}",
      // 显示状态：启用 flex
      "#adblock-shield-overlay.show {",
      "  display: flex !important;",
      "}",
      // 弹窗内容容器：大字体，清晰可读
      "#adblock-shield-content {",
      "  background: #fff;",
      "  padding: 48px 40px;",
      "  border-radius: 16px;",
      "  max-width: 560px;",
      "  width: 92%;",
      "  text-align: center;",
      "  box-shadow: 0 24px 80px rgba(0,0,0,0.4);",
      "  pointer-events: all !important;",
      "}",
      // 标题：超大字体
      "#adblock-shield-content h2 {",
      "  margin: 0 0 24px 0;",
      "  font-size: 2rem;",
      "  font-weight: 700;",
      "  color: #1a1a2e;",
      "  line-height: 1.3;",
      "}",
      // 描述文字：大字体
      "#adblock-shield-content p {",
      "  margin: 0 0 16px 0;",
      "  font-size: 1.25rem;",
      "  color: #444;",
      "  line-height: 1.7;",
      "}",
      // 按钮：大字体，醒目
      "#adblock-shield-content button {",
      "  margin-top: 28px;",
      "  padding: 16px 48px;",
      "  font-size: 1.25rem;",
      "  font-weight: 600;",
      "  color: #fff;",
      "  background: #007bff;",
      "  border: none;",
      "  border-radius: 10px;",
      "  cursor: pointer;",
      "  transition: background 0.2s, transform 0.1s;",
      "}",
      "#adblock-shield-content button:hover {",
      "  background: #0056b3;",
      "  transform: translateY(-2px);",
      "}",
      "#adblock-shield-content button:active {",
      "  transform: translateY(0);",
      "}",
      // 移动端适配
      "@media (max-width: 480px) {",
      "  #adblock-shield-content {",
      "    padding: 36px 24px;",
      "    width: 94%;",
      "  }",
      "  #adblock-shield-content h2 {",
      "    font-size: 1.6rem;",
      "  }",
      "  #adblock-shield-content p {",
      "    font-size: 1.1rem;",
      "  }",
      "  #adblock-shield-content button {",
      "    font-size: 1.1rem;",
      "    padding: 14px 36px;",
      "  }",
      "}",
    ].join("\n");

    document.head.appendChild(style);
  }

  /**
   * 锁定页面：禁止滚动和一切交互
   */
  function lockPage() {
    if (!state.config.lockPage) return;
    document.documentElement.classList.add("adblock-shield-locked");
  }

  /**
   * 解锁页面
   */
  function unlockPage() {
    document.documentElement.classList.remove("adblock-shield-locked");
  }

  /**
   * 创建遮罩层 DOM
   * @returns {HTMLElement} 遮罩层元素
   */
  function createOverlay() {
    var overlay = document.getElementById("adblock-shield-overlay");
    if (overlay) return overlay;

    // 注入样式
    injectStyles();

    // 创建遮罩层
    overlay = document.createElement("div");
    overlay.id = "adblock-shield-overlay";

    // 创建内容容器
    var content = document.createElement("div");
    content.id = "adblock-shield-content";

    // 获取当前语言
    var lang = detectLang();
    var t = i18n[lang];

    // 填充内容：自定义 HTML 或默认多语言内容
    if (state.config.overlayHTML) {
      content.innerHTML = state.config.overlayHTML;
    } else {
      content.innerHTML = [
        "<h2>" + t.title + "</h2>",
        "<p>" + t.desc1 + "</p>",
        "<p>" + t.desc2 + "</p>",
        '<button onclick="location.reload()">' + t.refresh + "</button>",
      ].join("");
    }

    overlay.appendChild(content);
    document.body.appendChild(overlay);

    return overlay;
  }

  /**
   * 显示遮罩层
   * 触发条件：检测分数达到阈值
   */
  function showOverlay() {
    if (state.detected) return;
    state.detected = true;

    log("Ad blocker detected! Score:", state.score, "Reasons:", state.reasons);

    // 锁定页面（禁止滚动和交互）
    lockPage();

    // 创建并显示遮罩
    var overlay = createOverlay();
    overlay.classList.add("show");

    // 触发用户回调
    if (typeof state.config.onDetected === "function") {
      state.config.onDetected({
        score: state.score,
        reasons: state.reasons,
        checks: state.checkCount,
      });
    }

    // 启动防绕过机制
    if (state.config.antiBypass) {
      startAntiBypass();
    }
  }

  /**
   * 启动防绕过机制
   * 原理：MutationObserver 监控 DOM 变化，遮罩被移除立即重建
   */
  function startAntiBypass() {
    // 使用 MutationObserver 监控遮罩层
    if (!state.observer && window.MutationObserver) {
      state.observer = new MutationObserver(function (mutations) {
        if (!state.detected) return;

        var overlay = document.getElementById("adblock-shield-overlay");
        if (!overlay) {
          log("Overlay removed, recreating...");
          state.detected = false;
          showOverlay();
        }

        // 确保页面锁定未被移除
        if (
          !document.documentElement.classList.contains("adblock-shield-locked")
        ) {
          lockPage();
        }
      });

      state.observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      // 同时监控 html 元素的 class 变化
      state.observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    // 定时检查作为兜底
    if (!state.lockInterval) {
      state.lockInterval = setInterval(function () {
        if (!state.detected) return;

        var overlay = document.getElementById("adblock-shield-overlay");
        if (!overlay) {
          state.detected = false;
          showOverlay();
        }

        lockPage();
      }, 300);
    }

    // 阻止键盘事件穿透
    if (state.config.blockKeyboard) {
      document.addEventListener(
        "keydown",
        function (e) {
          if (state.detected) {
            e.stopPropagation();
            e.preventDefault();
          }
        },
        true,
      );
    }

    // 阻止右键菜单
    if (state.config.blockContextMenu) {
      document.addEventListener(
        "contextmenu",
        function (e) {
          if (state.detected) {
            e.stopPropagation();
            e.preventDefault();
          }
        },
        true,
      );
    }

    // 阻止滚轮事件
    document.addEventListener(
      "wheel",
      function (e) {
        if (state.detected) {
          e.stopPropagation();
          e.preventDefault();
        }
      },
      { passive: false, capture: true },
    );

    // 阻止触摸滚动
    document.addEventListener(
      "touchmove",
      function (e) {
        if (state.detected) {
          e.stopPropagation();
          e.preventDefault();
        }
      },
      { passive: false, capture: true },
    );
  }

  // ═══════════════════════════════════════════════════════
  // 主检测逻辑：多维度加权评分
  // ═══════════════════════════════════════════════════════

  /**
   * 执行一次完整检测
   * 所有检测并行执行，结果加权评分
   */
  async function runDetection() {
    state.checkCount++;

    // 并行执行异步检测
    var [dnsResult, safariResult, fwResult] = await Promise.all([
      checkDNSBlocking(),
      checkSafariContentBlocker(),
      checkEnterpriseFirewall(),
    ]);

    // 同步执行 DOM/资源检测
    var redirectResult = checkResourceRedirect();
    var elementResult = checkElementHiding();
    var scriptResult = checkScriptBlocked();
    var braveResult = checkBraveBrowser();

    // 汇总所有检测结果
    var results = {
      redirect: redirectResult,
      element: elementResult,
      script: scriptResult,
      dns: dnsResult,
      brave: braveResult,
      safari: safariResult,
      firewall: fwResult,
    };

    // ═════════════════════════════════════════════════════
    // 加权评分系统
    // ═════════════════════════════════════════════════════
    var score = 0;
    var reasons = [];

    // 单项权重
    if (redirectResult.blocked) {
      score += 40;
      reasons.push("resource-redirect");
    }
    if (elementResult.blocked) {
      score += 25;
      reasons.push("element-hidden");
    }
    if (scriptResult.blocked) {
      score += 20;
      reasons.push("script-blocked");
    }
    if (dnsResult.blocked) {
      score += 15;
      reasons.push("dns-blocking");
    }
    if (safariResult.blocked) {
      score += 15;
      reasons.push("safari-content-blocker");
    }
    if (fwResult.blocked) {
      score += 10;
      reasons.push("enterprise-firewall");
    }

    // 组合加成：多信号交叉验证提高置信度
    if (redirectResult.blocked && elementResult.blocked) {
      score += 15;
    }
    if (dnsResult.blocked && scriptResult.blocked) {
      score += 15;
    }

    state.score = score;
    state.reasons = reasons;

    log("Check #" + state.checkCount, "Score:", score, "Results:", results);

    // 触发检测回调（无论是否达到阈值）
    if (typeof state.config.onCheck === "function") {
      state.config.onCheck({
        count: state.checkCount,
        score: score,
        reasons: reasons,
        results: results,
      });
    }

    // 判定：达到阈值则显示遮罩
    if (score >= state.config.threshold) {
      showOverlay();
      return true;
    }

    // 未达阈值且未达最大次数，继续检测
    if (state.checkCount < state.config.maxChecks) {
      setTimeout(runDetection, state.config.checkInterval);
    }

    return false;
  }

  // ═══════════════════════════════════════════════════════
  // 公共 API
  // ═══════════════════════════════════════════════════════

  var AdBlockShield = {
    version: "1.0.0",

    /**
     * 初始化检测库
     * @param {Object} userConfig - 用户自定义配置
     * @returns {Object} AdBlockShield 实例（链式调用）
     */
    init: function (userConfig) {
      // 合并配置
      state.config = extend({}, defaults);
      if (userConfig) {
        extend(state.config, userConfig);
      }

      log("Initializing with config:", state.config);

      // 等待页面加载完成后开始检测
      if (document.readyState === "complete") {
        setTimeout(runDetection, state.config.initialDelay);
      } else {
        window.addEventListener("load", function () {
          setTimeout(runDetection, state.config.initialDelay);
        });
      }

      return this;
    },

    /**
     * 手动触发检测
     * @returns {Promise<boolean>} 是否检测到拦截
     */
    detect: function () {
      if (!state.config) {
        console.error("[AdBlockShield] Not initialized. Call init() first.");
        return Promise.resolve(false);
      }
      return runDetection();
    },

    /**
     * 获取当前检测状态
     * @returns {Object} 状态对象
     */
    getState: function () {
      return {
        detected: state.detected,
        checkCount: state.checkCount,
        score: state.score,
        reasons: state.reasons.slice(),
      };
    },

    /**
     * 重置所有状态（用于测试）
     * @returns {Object} AdBlockShield 实例
     */
    reset: function () {
      state.detected = false;
      state.checkCount = 0;
      state.score = 0;
      state.reasons = [];

      // 断开 MutationObserver
      if (state.observer) {
        state.observer.disconnect();
        state.observer = null;
      }

      // 清除定时器
      if (state.lockInterval) {
        clearInterval(state.lockInterval);
        state.lockInterval = null;
      }

      // 解锁页面
      unlockPage();

      // 移除遮罩层
      var overlay = document.getElementById("adblock-shield-overlay");
      if (overlay) {
        overlay.remove();
      }

      return this;
    },

    /**
     * 完全销毁实例
     * @returns {Object} AdBlockShield 实例
     */
    destroy: function () {
      this.reset();
      state.config = null;
      return this;
    },
  };

  // 导出模块
  if (typeof module !== "undefined" && module.exports) {
    module.exports = AdBlockShield;
  } else {
    global.AdBlockShield = AdBlockShield;
  }
})(typeof window !== "undefined" ? window : this);
