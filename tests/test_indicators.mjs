// test_indicators.mjs — 验证 indicators.js 的 D1-D4 实现与 notebook CSV 数值比对
// 用法: node test_indicators.mjs
// 在 Node.js 环境中模拟浏览器加载, 执行数值比对

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TOOL_DIR = join(__dirname, "..", "interactive_tool", "js");

// 加载源码
const configCode = readFileSync(join(TOOL_DIR, "config.js"), "utf-8");
const indicatorsCode = readFileSync(join(TOOL_DIR, "indicators.js"), "utf-8");
const dataCode = readFileSync(join(TOOL_DIR, "data.js"), "utf-8");

// 用 new Function 创建非严格作用域, 暴露内部函数
const wrapper = new Function("window", "performance", `
  ${configCode}
  ${indicatorsCode}
  ${dataCode}
  return {
    CONFIG, calcRSI, calcMACD, calcBollinger, calcATR,
    calcAllIndicators, validateAgainstNotebook,
    STOCK_DATA: window.STOCK_DATA,
    NOTEBOOK_INDICATORS: window.NOTEBOOK_INDICATORS,
  };
`);

const sandbox = { window: {}, performance: { now: () => Date.now() } };
const F = wrapper(sandbox.window, sandbox.performance);
const { calcAllIndicators, validateAgainstNotebook } = F;
const STOCK_DATA = F.STOCK_DATA;
const NOTEBOOK_INDICATORS = F.NOTEBOOK_INDICATORS;

if (!STOCK_DATA || !STOCK_DATA["300604.SZ"]) {
  console.error("❌ 数据未加载");
  process.exit(1);
}

console.log("=".repeat(60));
console.log("指标数值验证 · D1-D4 对齐测试");
console.log("=".repeat(60));

const changchuan = STOCK_DATA["300604.SZ"].rows;
console.log(`数据: 长川科技 ${changchuan.length} 行`);
console.log(`参考: notebook指标 ${NOTEBOOK_INDICATORS.length} 行`);
console.log("");

// 使用默认参数计算
const defaultParams = {
  rsi: { period: 14, overbought: 70, oversold: 30 },
  macd: { fast: 12, slow: 26, signal: 9 },
  bollinger: { period: 20, k: 2.0 },
  atr: { period: 14, multiplier: 1.5 },
};

// 计算指标
const result = calcAllIndicators(changchuan, defaultParams);

// 验证
const val = validateAgainstNotebook(result, NOTEBOOK_INDICATORS, defaultParams);

console.log(`总结: ${val.passed ? "✅ ALL PASS" : "❌ 有差异"} (通过${val.totalPass} / 失败${val.totalFail})`);
console.log("");

val.checks.forEach(c => {
  const icon = c.fail === 0 ? "✅" : "❌";
  console.log(`  ${icon} ${c.name.padEnd(20)} pass=${String(c.pass).padStart(3)} fail=${c.fail}`);
  if (c.fails.length > 0) {
    c.fails.forEach(f => {
      console.log(`      idx=${f.idx} tool=${f.tool.toFixed(8)} ref=${f.ref.toFixed(8)} diff=${f.diff.toExponential(3)}`);
    });
  }
});

// 额外验证: D1-D4 特性
console.log("");
console.log("=".repeat(60));
console.log("D1-D4 特性验证");
console.log("=".repeat(60));

// D1: hist = dif - dea (不乘2)
let d1Pass = true, d1Checked = 0;
for (let i = 26; i < changchuan.length; i++) {
  if (result.macd.dif[i] !== null && result.macd.dea[i] !== null && result.macd.hist[i] !== null) {
    const expected = result.macd.dif[i] - result.macd.dea[i];
    if (Math.abs(result.macd.hist[i] - expected) > 1e-10) { d1Pass = false; break; }
    d1Checked++;
  }
}
console.log(`  D1 (hist=dif-dea不乘2): ${d1Pass ? "✅" : "❌"} (${d1Checked}点检查)`);

// D4: warmup期为null
const d4Checks = [
  { name: "RSI warmup", arr: result.rsi, period: 14 },
  { name: "MACD warmup", arr: result.macd.dif, period: 26 },
  { name: "BB warmup", arr: result.bb.mid, period: 20 },
  { name: "ATR warmup", arr: result.atr, period: 14 },
];
d4Checks.forEach(c => {
  let pass = true;
  for (let i = 0; i < c.period && i < c.arr.length; i++) {
    if (c.arr[i] !== null) { pass = false; break; }
  }
  console.log(`  D4 (${c.name} 前${c.period}期=null): ${pass ? "✅" : "❌"}`);
});

// RSI值域检查
let rsiRangePass = true;
for (let i = 14; i < result.rsi.length; i++) {
  if (result.rsi[i] !== null && (result.rsi[i] < 0 || result.rsi[i] > 100)) {
    rsiRangePass = false; break;
  }
}
console.log(`  RSI ∈ [0,100]: ${rsiRangePass ? "✅" : "❌"}`);

// BB有序检查 (upper >= mid >= lower)
let bbOrderPass = true;
for (let i = 20; i < result.bb.upper.length; i++) {
  if (result.bb.upper[i] !== null && result.bb.mid[i] !== null && result.bb.lower[i] !== null) {
    if (!(result.bb.upper[i] >= result.bb.mid[i] && result.bb.mid[i] >= result.bb.lower[i])) {
      bbOrderPass = false; break;
    }
  }
}
console.log(`  BB upper>=mid>=lower: ${bbOrderPass ? "✅" : "❌"}`);

// ATR非负检查
let atrPass = true;
for (let i = 14; i < result.atr.length; i++) {
  if (result.atr[i] !== null && result.atr[i] < 0) { atrPass = false; break; }
}
console.log(`  ATR >= 0: ${atrPass ? "✅" : "❌"}`);

// 性能测试
console.log("");
console.log("=".repeat(60));
console.log("性能测试");
console.log("=".repeat(60));
const t0 = performance.now();
for (let i = 0; i < 100; i++) {
  calcAllIndicators(changchuan, defaultParams);
}
const t1 = performance.now();
const avgMs = (t1 - t0) / 100;
console.log(`  100次全量重算平均: ${avgMs.toFixed(2)}ms (spec要求<50ms: ${avgMs < 50 ? "✅" : "❌"})`);

console.log("");
const allPass = val.passed && d1Pass && d4Checks.every(c => c.arr.slice(0, c.period).every(v => v === null)) && rsiRangePass && bbOrderPass && atrPass;
console.log("=".repeat(60));
console.log(`总体: ${allPass ? "✅ 全部通过" : "❌ 存在问题"}`);
console.log("=".repeat(60));
process.exit(allPass ? 0 : 1);
