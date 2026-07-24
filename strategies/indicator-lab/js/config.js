// config.js — 股票清单、默认参数、预设、配色
// 对齐 interactive_tool_design_spec.md 第16节 YAML 配置块

const CONFIG = {
  // 股票清单 (数据来自 data.js 的 window.STOCK_DATA)
  stocks: [
    { code: "300604.SZ", name: "长川科技", market: "创业板" },
    { code: "688008.SH", name: "澜起科技", market: "科创板" },
    { code: "000977.SZ", name: "浪潮信息", market: "深主板" },
  ],

  // 指标默认参数与预设
  indicators: {
    rsi: {
      label: "RSI",
      fullName: "相对强弱指数",
      tag: "动量振荡器",
      defaults: { period: 14, overbought: 70, oversold: 30 },
      presets: [
        { name: "经典14",  period: 14 },
        { name: "短线7",   period: 7 },
        { name: "长线21",  period: 21 },
      ],
    },
    macd: {
      label: "MACD",
      fullName: "平滑异同移动平均线",
      tag: "趋势+动量",
      defaults: { fast: 12, slow: 26, signal: 9 },
      presets: [
        { name: "经典12/26/9", fast: 12, slow: 26, signal: 9 },
        { name: "短线5/35/5",  fast: 5,  slow: 35, signal: 5 },
      ],
    },
    bollinger: {
      label: "布林带",
      fullName: "Bollinger Bands",
      tag: "波动通道",
      defaults: { period: 20, k: 2.0 },
      presets: [
        { name: "经典20/2",  period: 20, k: 2.0 },
        { name: "窄带10/1.5", period: 10, k: 1.5 },
      ],
    },
    atr: {
      label: "ATR",
      fullName: "真实波动幅度均值",
      tag: "真实波幅",
      defaults: { period: 14, multiplier: 1.5 },
      presets: [
        { name: "经典14",   period: 14, multiplier: 1.5 },
        { name: "保守20/2", period: 20, multiplier: 2.0 },
      ],
    },
  },

  // 配色 (A股惯例: 涨红跌绿, 浅色主题)
  colors: {
    up:        "#D85A30",  // 涨红
    down:      "#1D9E75",  // 跌绿
    rsi:       "#185FA5",  // RSI线
    rsiOb:     "#FAECE7",  // 超买区底色
    rsiOs:     "#E1F5EE",  // 超卖区底色
    macdDif:   "#378ADD",  // MACD快线
    macdDea:   "#BA7517",  // MACD信号线
    bbBand:    "#534AB7",  // 布林带轨道
    bbMid:     "#888780",  // 布林中轨
    bbFill:    "rgba(83,74,183,0.06)", // 布林带填充
    atr:       "#993556",  // ATR线
    bg:        "#FFFFFF",
    bgPage:    "#F7F6F2",
    bgCard:    "#FFFFFF",
    bgSoft:    "#F1EFE8",
    textPrimary:   "#2C2C2A",
    textSecondary: "#5F5E5A",
    textTertiary:  "#888780",
    border:        "#E3E1D8",
    borderStrong:  "#B4B2A9",
    accent:     "#185FA5",
    accentBg:   "#E6F1FB",
  },

  // 视图列表
  views: ["rsi", "macd", "bollinger", "atr", "overview"],

  // 底栏表格显示最近N日
  tableDays: 10,

  // 决策标注 (D1-D4)
  decisions: {
    D1: "MACD hist = DIF − DEA（不乘 2）",
    D2: "Wilder smoothing = ewm(alpha=1/n, adjust=False)",
    D3: "Bollinger std ddof=0（总体标准差）",
    D4: "warmup 期保留 null，不填 0 / 不 ffill",
  },
};

// 工具函数: 格式化日期 YYYYMMDD → YYYY-MM-DD
function fmtDate(d) {
  if (!d || d.length !== 8) return d;
  return d.slice(0, 4) + "-" + d.slice(4, 6) + "-" + d.slice(6, 8);
}

// 工具函数: 获取股票中文名
function getStockName(code) {
  const s = CONFIG.stocks.find(x => x.code === code);
  return s ? s.name : code;
}
