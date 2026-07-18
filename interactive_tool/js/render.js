// render.js — ECharts 图表渲染
// 主图: K线 + 成交量 + 布林带叠加(可选)
// 副图: 单指标(RSI/MACD/BB%B/ATR) 或 综合视图(4格堆叠)

let mainChart = null;
let subChart = null;

function initCharts() {
  mainChart = echarts.init(document.getElementById("mainChart"));
  subChart = echarts.init(document.getElementById("subChart"));
  window.addEventListener("resize", () => {
    mainChart.resize();
    subChart.resize();
  });
}

// 公共坐标轴样式
const axisLine = { lineStyle: { color: CONFIG.colors.borderStrong } };
const axisLabelColor = CONFIG.colors.textTertiary;
const splitLineColor = { lineStyle: { color: CONFIG.colors.bgSoft } };

function makeXAxis(dates, extra) {
  return {
    type: "category",
    data: dates,
    boundaryGap: true,
    axisLine,
    axisLabel: { color: axisLabelColor, fontSize: 10 },
    splitLine: { show: false },
    axisTick: { show: false },
    ...extra,
  };
}
function makeYAxis(extra) {
  return {
    scale: true,
    axisLine: { show: false },
    axisLabel: { color: axisLabelColor, fontSize: 10 },
    splitLine: splitLineColor,
    ...extra,
  };
}

/**
 * 渲染主图: K线 + 成交量 + 可选布林带叠加
 */
function renderMainChart(data, ind, showBB, stockName) {
  const dates = data.map(r => fmtDate(r.trade_date));
  const candleData = data.map(r => [r.open, r.close, r.low, r.high]);
  const volData = data.map((r, i) => ({
    value: r.vol,
    itemStyle: { color: r.close >= r.open ? CONFIG.colors.up : CONFIG.colors.down },
  }));

  const series = [
    {
      name: "K线",
      type: "candlestick",
      data: candleData,
      itemStyle: {
        color: CONFIG.colors.up,
        color0: CONFIG.colors.down,
        borderColor: CONFIG.colors.up,
        borderColor0: CONFIG.colors.down,
      },
    },
    {
      name: "成交量",
      type: "bar",
      data: volData,
      xAxisIndex: 1,
      yAxisIndex: 1,
    },
  ];

  if (showBB) {
    series.push({
      name: "布林上轨", type: "line", data: ind.bb.upper, smooth: true,
      symbol: "none", lineStyle: { color: CONFIG.colors.bbBand, width: 1 },
    });
    series.push({
      name: "布林中轨", type: "line", data: ind.bb.mid, smooth: true,
      symbol: "none", lineStyle: { color: CONFIG.colors.bbMid, width: 1, type: "dashed" },
    });
    series.push({
      name: "布林下轨", type: "line", data: ind.bb.lower, smooth: true,
      symbol: "none", lineStyle: { color: CONFIG.colors.bbBand, width: 1 },
      areaStyle: { color: CONFIG.colors.bbFill },
    });
  }

  mainChart.setOption({
    title: { text: `${stockName} · 日K线${showBB ? " + 布林带" : ""}`, left: 12, top: 6,
             textStyle: { fontSize: 12, color: CONFIG.colors.textSecondary, fontWeight: 500 } },
    grid: [
      { left: 60, right: 30, top: 30, height: "62%" },
      { left: 60, right: 30, top: "78%", height: "16%" },
    ],
    xAxis: [makeXAxis(dates, { gridIndex: 0 }), makeXAxis(dates, { gridIndex: 1, axisLabel: { show: false } })],
    yAxis: [
      makeYAxis({ gridIndex: 0, scale: true }),
      makeYAxis({ gridIndex: 1, scale: false, max: v => v.max * 1.5, axisLabel: { show: false }, splitLine: { show: false } }),
    ],
    series,
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      formatter: (params) => formatTooltipMain(params, data),
    },
    dataZoom: [
      { type: "inside", xAxisIndex: [0, 1], start: 60, end: 100 },
      { type: "slider", xAxisIndex: [0, 1], start: 60, end: 100, height: 18, bottom: 4 },
    ],
  }, true);
}

function formatTooltipMain(params, data) {
  if (!params || params.length === 0) return "";
  const idx = params[0].dataIndex;
  const r = data[idx];
  const chg = r.pct_chg;
  const chgStr = chg !== null && chg !== undefined
    ? `<span style="color:${chg >= 0 ? CONFIG.colors.up : CONFIG.colors.down}">${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%</span>`
    : "";
  let html = `<div style="font-size:11px">
    <b>${fmtDate(r.trade_date)}</b><br/>
    开 ${r.open.toFixed(2)} 高 ${r.high.toFixed(2)}<br/>
    低 ${r.low.toFixed(2)} 收 ${r.close.toFixed(2)} ${chgStr}<br/>
    量 ${(r.vol / 10000).toFixed(0)}万手 额 ${(r.amount / 10000).toFixed(0)}万</div>`;
  return html;
}

/**
 * 渲染副图: 单指标模式
 */
function renderSubChart(data, ind, view, params) {
  const dates = data.map(r => fmtDate(r.trade_date));
  const c = CONFIG.colors;
  let option;

  switch (view) {
    case "rsi":
      option = {
        title: { text: `RSI(${params.rsi.period}) · 超买${params.rsi.overbought}/超卖${params.rsi.oversold}`,
                 left: 12, top: 6, textStyle: { fontSize: 12, color: CONFIG.colors.textSecondary, fontWeight: 500 } },
        grid: { left: 60, right: 30, top: 30, bottom: 50 },
        xAxis: makeXAxis(dates),
        yAxis: makeYAxis({ min: 0, max: 100, scale: false }),
        series: [{
          name: "RSI", type: "line", data: ind.rsi, smooth: true, symbol: "none",
          lineStyle: { color: c.rsi, width: 1.5 },
          markArea: { silent: true, data: [
            [{ yAxis: params.rsi.overbought, itemStyle: { color: c.rsiOb } }, { yAxis: 100 }],
            [{ yAxis: 0, itemStyle: { color: c.rsiOs } }, { yAxis: params.rsi.oversold }],
          ] },
          markLine: { silent: true, symbol: "none", lineStyle: { color: c.textTertiary, type: "dashed", width: 0.8 },
                      data: [{ yAxis: params.rsi.overbought }, { yAxis: params.rsi.oversold }] },
        }],
        tooltip: { trigger: "axis", formatter: p => p[0] && p[0].value !== null ? `RSI: ${p[0].value.toFixed(2)}` : "RSI: —" },
        dataZoom: [{ type: "inside", start: 60, end: 100 }],
      };
      break;

    case "macd":
      option = {
        title: { text: `MACD(${params.macd.fast},${params.macd.slow},${params.macd.signal}) · hist=DIF−DEA (D1不乘2)`,
                 left: 12, top: 6, textStyle: { fontSize: 12, color: CONFIG.colors.textSecondary, fontWeight: 500 } },
        grid: { left: 60, right: 30, top: 30, bottom: 50 },
        xAxis: makeXAxis(dates),
        yAxis: makeYAxis({}),
        series: [
          { name: "DIF", type: "line", data: ind.macd.dif, symbol: "none", lineStyle: { color: c.macdDif, width: 1.5 } },
          { name: "DEA", type: "line", data: ind.macd.dea, symbol: "none", lineStyle: { color: c.macdDea, width: 1 } },
          { name: "hist", type: "bar", data: ind.macd.hist.map(v => v === null ? null : {
              value: v, itemStyle: { color: v >= 0 ? c.up : c.down } }) },
        ],
        tooltip: { trigger: "axis",
          formatter: p => {
            let html = `<div style="font-size:11px">${p[0].axisValue}</div>`;
            p.forEach(s => {
              const v = s.value;
              html += `<div>${s.marker} ${s.seriesName}: ${v !== null && v !== undefined ? v.toFixed(3) : "—"}</div>`;
            });
            return html;
          } },
        dataZoom: [{ type: "inside", start: 60, end: 100 }],
      };
      break;

    case "bollinger":
      option = {
        title: { text: `布林带 %B(${params.bollinger.period},${params.bollinger.k}σ) · ddof=0 (D3)`,
                 left: 12, top: 6, textStyle: { fontSize: 12, color: CONFIG.colors.textSecondary, fontWeight: 500 } },
        grid: { left: 60, right: 30, top: 30, bottom: 50 },
        xAxis: makeXAxis(dates),
        yAxis: makeYAxis({ min: 0, max: 1, scale: false }),
        series: [{
          name: "%B", type: "line", data: ind.bb.pctB, smooth: true, symbol: "none",
          lineStyle: { color: c.bbBand, width: 1.5 },
          markLine: { silent: true, symbol: "none", lineStyle: { color: c.textTertiary, type: "dashed", width: 0.8 },
                      data: [{ yAxis: 1, label: { formatter: "触上轨" } }, { yAxis: 0.5, label: { formatter: "中轨" } }, { yAxis: 0, label: { formatter: "触下轨" } }] },
        }],
        tooltip: { trigger: "axis", formatter: p => p[0] && p[0].value !== null ? `%B: ${p[0].value.toFixed(4)}` : "%B: —" },
        dataZoom: [{ type: "inside", start: 60, end: 100 }],
      };
      break;

    case "atr":
      option = {
        title: { text: `ATR(${params.atr.period}) · Wilder α=1/n (D2) · 止损倍数${params.atr.multiplier}`,
                 left: 12, top: 6, textStyle: { fontSize: 12, color: CONFIG.colors.textSecondary, fontWeight: 500 } },
        grid: { left: 60, right: 30, top: 30, bottom: 50 },
        xAxis: makeXAxis(dates),
        yAxis: makeYAxis({}),
        series: [{
          name: "ATR", type: "line", data: ind.atr, symbol: "none",
          lineStyle: { color: c.atr, width: 1.5 },
          areaStyle: { color: "rgba(153,53,86,0.08)" },
        }],
        tooltip: { trigger: "axis", formatter: p => p[0] && p[0].value !== null ? `ATR: ${p[0].value.toFixed(3)}` : "ATR: —" },
        dataZoom: [{ type: "inside", start: 60, end: 100 }],
      };
      break;

    case "overview":
      return renderOverview(data, ind, params);
  }

  subChart.setOption(option, true);
}

/**
 * 综合视图: 4个指标子图堆叠在一个chart实例中
 */
function renderOverview(data, ind, params) {
  const dates = data.map(r => fmtDate(r.trade_date));
  const c = CONFIG.colors;
  const grids = [];
  const xAxes = [];
  const yAxes = [];
  const series = [];

  const panels = [
    { name: "RSI", data: ind.rsi, color: c.rsi, yMin: 0, yMax: 100 },
    { name: "MACD hist", data: ind.macd.hist, color: c.up, isBar: true },
    { name: "BB %B", data: ind.bb.pctB, color: c.bbBand, yMin: 0, yMax: 1 },
    { name: "ATR", data: ind.atr, color: c.atr },
  ];

  const gap = 0.04;
  const panelH = (1 - 0.1 - 0.06) / 4 - gap; // top 10%, bottom 6%, 4 panels with gaps
  panels.forEach((p, i) => {
    const top = 0.1 + i * (panelH + gap);
    grids.push({ left: 60, right: 30, top: `${(top * 100).toFixed(1)}%`, height: `${(panelH * 100).toFixed(1)}%` });
    xAxes.push(makeXAxis(dates, { gridIndex: i, axisLabel: { show: i === panels.length - 1 ? { color: axisLabelColor, fontSize: 9 } : false } }));
    yAxes.push(makeYAxis({
      gridIndex: i,
      scale: p.yMin === undefined,
      min: p.yMin,
      max: p.yMax,
      axisLabel: { color: axisLabelColor, fontSize: 9 },
    }));

    if (p.isBar) {
      series.push({
        name: p.name, type: "bar", xAxisIndex: i, yAxisIndex: i,
        data: p.data.map(v => v === null ? null : { value: v, itemStyle: { color: v >= 0 ? c.up : c.down } }),
      });
    } else {
      series.push({
        name: p.name, type: "line", xAxisIndex: i, yAxisIndex: i,
        data: p.data, symbol: "none", smooth: true,
        lineStyle: { color: p.color, width: 1.2 },
      });
    }
  });

  subChart.setOption({
    title: { text: "综合视图 · 4指标联动", left: 12, top: 6,
             textStyle: { fontSize: 12, color: CONFIG.colors.textSecondary, fontWeight: 500 } },
    grid: grids,
    xAxis: xAxes,
    yAxis: yAxes,
    series,
    tooltip: { trigger: "axis", axisPointer: { type: "cross", link: [{ xAxisIndex: "all" }] } },
    dataZoom: [{ type: "inside", xAxisIndex: [0, 1, 2, 3], start: 60, end: 100 }],
  }, true);
}

/**
 * 渲染底栏指标值表
 */
function renderValueTable(data, ind, days) {
  const tbody = document.getElementById("valTable");
  tbody.innerHTML = "";
  const n = data.length;
  const start = Math.max(0, n - days);
  for (let i = start; i < n; i++) {
    const r = data[i];
    const chg = r.pct_chg;
    const chgCls = chg >= 0 ? "up-cell" : "down-cell";
    const chgSign = chg >= 0 ? "+" : "";
    const histCls = ind.macd.hist[i] !== null && ind.macd.hist[i] >= 0 ? "up-cell" : "down-cell";
    const pctBCls = ind.bb.pctB[i] !== null && ind.bb.pctB[i] >= 0.5 ? "up-cell" : "down-cell";

    tbody.insertAdjacentHTML("beforeend",
      `<tr>
        <td>${fmtDate(r.trade_date)}</td>
        <td>${r.close.toFixed(2)}</td>
        <td class="${chgCls}">${chgSign}${chg.toFixed(2)}%</td>
        <td>${ind.rsi[i] !== null ? ind.rsi[i].toFixed(2) : "—"}</td>
        <td>${ind.macd.dif[i] !== null ? ind.macd.dif[i].toFixed(3) : "—"}</td>
        <td class="${histCls}">${ind.macd.hist[i] !== null ? ind.macd.hist[i].toFixed(3) : "—"}</td>
        <td class="${pctBCls}">${ind.bb.pctB[i] !== null ? ind.bb.pctB[i].toFixed(3) : "—"}</td>
        <td>${ind.atr[i] !== null ? ind.atr[i].toFixed(3) : "—"}</td>
      </tr>`);
  }
}

/**
 * 更新顶栏价格信息
 */
function updatePriceBadge(data) {
  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  const chg = last.change;
  const pct = last.pct_chg;
  const isUp = chg >= 0;
  document.getElementById("priceNow").textContent = "¥" + last.close.toFixed(2);
  const chgEl = document.getElementById("priceChg");
  chgEl.textContent = `${isUp ? "+" : ""}${chg.toFixed(2)} (${isUp ? "+" : ""}${pct.toFixed(2)}%)`;
  chgEl.className = "price-chg mono " + (isUp ? "up" : "down");
}

/**
 * 导出当前图表为PNG
 */
function exportPNG(view) {
  const chart = view === "overview" ? subChart : mainChart;
  const url = chart.getDataURL({
    type: "png",
    pixelRatio: 2,
    backgroundColor: "#FFFFFF",
  });
  const a = document.createElement("a");
  a.href = url;
  a.download = `indicator_${view}_${Date.now()}.png`;
  a.click();
}
