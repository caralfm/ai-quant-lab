// app.js — 主控: 状态管理 + 事件绑定 + 视图切换 + 调参重绘

// ===== 全局状态 =====
const state = {
  currentStock: "300604.SZ",
  currentView: "rsi",
  data: null,       // 当前股票的OHLCV数据
  indicators: null, // 当前指标计算结果
  cache: {},        // 股票数据缓存 {code: data}
  params: {
    rsi: { ...CONFIG.indicators.rsi.defaults },
    macd: { ...CONFIG.indicators.macd.defaults },
    bollinger: { ...CONFIG.indicators.bollinger.defaults },
    atr: { ...CONFIG.indicators.atr.defaults },
  },
};

// ===== 股票数据加载 =====
async function loadStockData(code) {
  if (state.cache[code]) return state.cache[code];
  const sd = window.STOCK_DATA && window.STOCK_DATA[code];
  if (!sd || !sd.rows) {
    console.error("数据未找到:", code);
    return null;
  }
  state.cache[code] = sd.rows;
  return sd.rows;
}

// ===== 重算指标 =====
function recalc() {
  if (!state.data) return;
  const t0 = performance.now();
  state.indicators = calcAllIndicators(state.data, state.params);
  const t1 = performance.now();
  // console.debug(`重算耗时: ${(t1 - t0).toFixed(1)}ms`);
  return t1 - t0;
}

// ===== 重绘全部 =====
function renderAll() {
  if (!state.data || !state.indicators) return;
  const stockName = getStockName(state.currentStock);
  const showBB = (state.currentView === "bollinger" || state.currentView === "overview");
  renderMainChart(state.data, state.indicators, showBB, stockName);
  renderSubChart(state.data, state.indicators, state.currentView, state.params);
  renderValueTable(state.data, state.indicators, CONFIG.tableDays);
  updatePriceBadge(state.data);
}

// ===== 调参 → 重算 → 重绘 (防抖) =====
let recalcTimer = null;
function onParamChange(indicator, key, value) {
  state.params[indicator][key] = value;
  clearTimeout(recalcTimer);
  recalcTimer = setTimeout(() => {
    const ms = recalc();
    renderAll();
    // 更新副图标题中的参数显示
    updateSubTitle();
  }, 50);
}

// ===== 切换股票 =====
async function switchStock(code) {
  state.currentStock = code;
  const data = await loadStockData(code);
  if (!data) return;
  state.data = data;
  recalc();
  renderAll();
  // 高亮当前选中
  document.getElementById("stockSel").value = code;
  // 更新主图标签
  document.getElementById("mainTag").textContent = getStockName(code);
}

// ===== 切换视图 =====
function switchView(view) {
  state.currentView = view;
  // 更新tab高亮
  document.querySelectorAll(".viewtab").forEach(t =>
    t.classList.toggle("active", t.dataset.view === view));
  // 更新左侧参数面板高亮
  document.querySelectorAll(".param-group").forEach(g => {
    const isActive = g.dataset.group === view;
    g.classList.toggle("active", isActive);
    if (view !== "overview") {
      // 非综合视图时, 折叠非当前指标的参数面板
      if (g.dataset.group !== view) g.classList.add("collapsed");
      else g.classList.remove("collapsed");
    } else {
      // 综合视图展开全部
      g.classList.remove("collapsed");
    }
  });
  updateSubTitle();
  renderAll();
}

function updateSubTitle() {
  const p = state.params;
  const titles = {
    rsi: `副图 · RSI(${p.rsi.period}) 超买${p.rsi.overbought}/超卖${p.rsi.oversold}`,
    macd: `副图 · MACD(${p.macd.fast},${p.macd.slow},${p.macd.signal})`,
    bollinger: `副图 · 布林带 %B(${p.bollinger.period},${p.bollinger.k}σ)`,
    atr: `副图 · ATR(${p.atr.period}) 止损×${p.atr.multiplier}`,
    overview: "副图 · 综合视图 (4指标联动)",
  };
  const tags = {
    rsi: "动量振荡器",
    macd: "趋势+动量",
    bollinger: "波动通道",
    atr: "真实波幅",
    overview: "多指标",
  };
  document.getElementById("subTitle").textContent = titles[state.currentView] || "";
  document.getElementById("subTag").textContent = tags[state.currentView] || "";
}

// ===== 重置参数 =====
function resetParams() {
  state.params = {
    rsi: { ...CONFIG.indicators.rsi.defaults },
    macd: { ...CONFIG.indicators.macd.defaults },
    bollinger: { ...CONFIG.indicators.bollinger.defaults },
    atr: { ...CONFIG.indicators.atr.defaults },
  };
  syncSlidersFromState();
  recalc();
  renderAll();
  updateSubTitle();
}

// ===== 同步滑块UI ← state =====
function syncSlidersFromState() {
  const p = state.params;
  setSlider("rsiP", p.rsi.period, "rsiPVal");
  setSlider("rsiOb", p.rsi.overbought, "rsiObVal");
  setSlider("rsiOs", p.rsi.oversold, "rsiOsVal");
  setSlider("macdFast", p.macd.fast, "macdFastVal");
  setSlider("macdSlow", p.macd.slow, "macdSlowVal");
  setSlider("macdSig", p.macd.signal, "macdSigVal");
  setSlider("bbP", p.bollinger.period, "bbPVal");
  setSlider("bbK", p.bollinger.k * 10, "bbKVal", true);
  setSlider("atrP", p.atr.period, "atrPVal");
  setSlider("atrM", p.atr.multiplier * 10, "atrMVal", true);
  // 清除所有预设选中
  document.querySelectorAll(".preset-chip").forEach(c => c.classList.remove("sel"));
}

function setSlider(id, val, labelId, isDecimal) {
  const el = document.getElementById(id);
  if (el) el.value = val;
  const lab = document.getElementById(labelId);
  if (lab) lab.textContent = isDecimal ? (val / 10).toFixed(1) : val;
}

// ===== 应用预设 =====
function applyPreset(indicator, preset) {
  Object.assign(state.params[indicator], preset);
  // 清除该指标的所有预设选中
  document.querySelectorAll(`.param-group[data-group="${indicator}"] .preset-chip`)
    .forEach(c => c.classList.remove("sel"));
  syncSlidersFromState();
  // 重新标记当前预设
  // (由 click 事件处理)
  recalc();
  renderAll();
  updateSubTitle();
}

// ===== 数值验证 (V6-V8) =====
function runValidation() {
  if (!window.NOTEBOOK_INDICATORS) {
    console.warn("notebook参考数据未加载, 跳过验证");
    return;
  }
  // 临时用默认参数计算 (验证须在默认参数下进行)
  const defaultParams = {
    rsi: { ...CONFIG.indicators.rsi.defaults },
    macd: { ...CONFIG.indicators.macd.defaults },
    bollinger: { ...CONFIG.indicators.bollinger.defaults },
    atr: { ...CONFIG.indicators.atr.defaults },
  };
  const changchuan = window.STOCK_DATA["300604.SZ"].rows;
  const result = calcAllIndicators(changchuan, defaultParams);
  const val = validateAgainstNotebook(result, window.NOTEBOOK_INDICATORS, defaultParams);

  console.group("%c指标数值验证 (D1-D4 对齐)", "color:#185FA5;font-weight:bold");
  console.log(`总结: ${val.passed ? "✅ ALL PASS" : "❌ 有差异"} (通过${val.totalPass} / 失败${val.totalFail})`);
  val.checks.forEach(c => {
    const icon = c.fail === 0 ? "✅" : "❌";
    console.log(`  ${icon} ${c.name}: pass=${c.pass} fail=${c.fail}`);
    if (c.fails.length > 0) {
      c.fails.forEach(f => console.log(`      idx=${f.idx} tool=${f.tool.toFixed(6)} ref=${f.ref.toFixed(6)} diff=${f.diff.toFixed(8)}`));
    }
  });
  console.groupEnd();

  // 在页面底部显示验证结果
  const banner = document.getElementById("validationBanner");
  if (banner) {
    banner.style.display = "block";
    if (val.passed) {
      banner.className = "val-banner pass";
      banner.textContent = `✅ D1-D4 数值验证通过: ${val.totalPass}项全部一致 (容差1e-6)`;
    } else {
      banner.className = "val-banner fail";
      banner.textContent = `❌ D1-D4 数值验证有差异: 通过${val.totalPass} / 失败${val.totalFail} (详见控制台)`;
    }
  }
  return val;
}

// ===== 初始化 =====
async function init() {
  // 检查 echarts 是否加载
  if (typeof echarts === "undefined") {
    document.body.insertAdjacentHTML("afterbegin",
      '<div style="background:#fff3cd;color:#856404;padding:16px;text-align:center;font-size:14px;border-bottom:2px solid #ffc107">'
      + '⚠️ ECharts 图表库加载失败，请检查网络连接。<br/>'
      + '<small>如果你在使用 <code>file://</code> 协议打开此文件，请改用本地 HTTP 服务：<br/>'
      + '<code>python3 -m http.server 8765</code> 然后访问 <code>http://localhost:8765</code></small>'
      + '</div>');
    return;
  }

  // 检查数据
  if (!window.STOCK_DATA) {
    document.body.insertAdjacentHTML("afterbegin",
      '<div style="background:#fee;color:#c00;padding:12px;text-align:center">数据加载失败: data.js 未找到</div>');
    return;
  }

  initCharts();

  // 绑定股票选择
  document.getElementById("stockSel").addEventListener("change", e => switchStock(e.target.value));

  // 绑定视图tab
  document.querySelectorAll(".viewtab").forEach(t =>
    t.addEventListener("click", () => switchView(t.dataset.view)));

  // 绑定参数面板折叠
  document.querySelectorAll(".param-head").forEach(h =>
    h.addEventListener("click", () => h.parentElement.classList.toggle("collapsed")));

  // 绑定滑块
  bindSlider("rsiP", "rsiPVal", "rsi", "period", false);
  bindSlider("rsiOb", "rsiObVal", "rsi", "overbought", false);
  bindSlider("rsiOs", "rsiOsVal", "rsi", "oversold", false);
  bindSlider("macdFast", "macdFastVal", "macd", "fast", false);
  bindSlider("macdSlow", "macdSlowVal", "macd", "slow", false);
  bindSlider("macdSig", "macdSigVal", "macd", "signal", false);
  bindSlider("bbP", "bbPVal", "bollinger", "period", false);
  bindSlider("bbK", "bbKVal", "bollinger", "k", true);
  bindSlider("atrP", "atrPVal", "atr", "period", false);
  bindSlider("atrM", "atrMVal", "atr", "multiplier", true);

  // 绑定预设
  document.querySelectorAll(".preset-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const group = chip.closest(".param-group");
      const indicator = group.dataset.group;
      const presetName = chip.textContent.trim();
      const preset = CONFIG.indicators[indicator].presets.find(p => p.name === presetName);
      if (preset) {
        const { name, ...vals } = preset;
        applyPreset(indicator, vals);
        group.querySelectorAll(".preset-chip").forEach(c => c.classList.remove("sel"));
        chip.classList.add("sel");
      }
    });
  });

  // 绑定重置和导出
  document.getElementById("resetBtn").addEventListener("click", resetParams);
  document.getElementById("exportBtn").addEventListener("click", () => exportPNG(state.currentView));

  // 绑定验证按钮 (如果存在)
  const valBtn = document.getElementById("validateBtn");
  if (valBtn) valBtn.addEventListener("click", runValidation);

  // 加载默认股票
  await switchStock(state.currentStock);
  switchView(state.currentView);

  // 自动运行验证 (延迟, 不阻塞首屏)
  setTimeout(runValidation, 500);
}

function bindSlider(sliderId, labelId, indicator, key, isDecimal) {
  const el = document.getElementById(sliderId);
  const lab = document.getElementById(labelId);
  if (!el) return;
  el.addEventListener("input", () => {
    const raw = parseFloat(el.value);
    const val = isDecimal ? raw / 10 : raw;
    lab.textContent = isDecimal ? val.toFixed(1) : val;
    onParamChange(indicator, key, val);
  });
}

// 启动
document.addEventListener("DOMContentLoaded", init);
