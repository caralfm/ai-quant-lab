// indicators.js — 四指标算法实现
// 严格对齐 task02 notebook 的 D1-D4 决策:
//   D1: MACD hist = DIF - DEA (不乘 2)
//   D2: Wilder smoothing = ewm(alpha=1/n, adjust=False)
//   D3: Bollinger std ddof=0 (总体标准差)
//   D4: warmup 期保留 null, 不填 0 / 不 ffill

/**
 * EMA (adjust=False), 对齐 pandas ewm(adjust=False)
 * alpha = 2/(N+1) 用于 MACD; alpha = 1/n 用于 Wilder (RSI/ATR)
 * 递推: ema[i] = (1-alpha)*ema[i-1] + alpha*arr[i], 首值 = arr[0]
 * 注意: 此函数假设 arr 无前导 NaN (适用于 MACD/ATR, 它们的首值有效)
 */
function emaAdjustFalse(arr, n, wilder) {
  const alpha = wilder ? 1 / n : 2 / (n + 1);
  const out = new Array(arr.length).fill(null);
  if (arr.length === 0) return out;
  out[0] = arr[0];
  for (let i = 1; i < arr.length; i++) {
    out[i] = (1 - alpha) * out[i - 1] + alpha * arr[i];
  }
  return out;
}

/**
 * EMA (adjust=False) 跳过前导 NaN — 对齐 pandas ewm(adjust=False) 对前导 NaN 的行为
 * pandas ewm 遇到前导 NaN 时跳过, 用首个非 NaN 值作为种子
 * 用于 RSI: gain[0]/loss[0] 为 NaN (因 close.diff() 首值为 NaN)
 */
function emaAdjustFalseSkipNaN(arr, alpha) {
  const out = new Array(arr.length).fill(NaN);
  let seeded = false;
  let prev = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (isNaN(v)) continue; // 跳过前导 NaN
    if (!seeded) {
      prev = v;
      seeded = true;
    } else {
      prev = (1 - alpha) * prev + alpha * v;
    }
    out[i] = prev;
  }
  return out;
}

/**
 * RSI (Wilder) — 对齐 D2 + D4
 * @param closes 收盘价数组
 * @param period RSI周期 (默认14)
 * @returns rsi数组, 前 period 期为 null (D4)
 */
function calcRSI(closes, period) {
  const n = closes.length;
  const out = new Array(n).fill(null);
  if (n < period + 1) return out;

  // 1. 涨跌分离 (首日无前收 → NaN, 对齐 pandas close.diff())
  const gains = new Array(n), losses = new Array(n);
  gains[0] = NaN; losses[0] = NaN;
  for (let i = 1; i < n; i++) {
    const ch = closes[i] - closes[i - 1];
    gains[i] = ch > 0 ? ch : 0;
    losses[i] = ch < 0 ? -ch : 0;
  }

  // 2. Wilder smoothing via ewm(alpha=1/period, adjust=False) — D2
  //    对齐 pandas: avg_gain = gains.ewm(alpha=1/period, adjust=False).mean()
  //    pandas ewm 跳过前导 NaN, 用首个非NaN值 (gains[1]) 作为种子
  const alpha = 1 / period;
  const avgGains = emaAdjustFalseSkipNaN(gains, alpha);
  const avgLosses = emaAdjustFalseSkipNaN(losses, alpha);

  // 3. RSI = 100 - 100/(1+RS), RS = avgGain/avgLoss
  //    D4: warmup 前 period 期为 null
  //    avgLoss 确切为 0 时 RSI=100; NaN 时不替换 (保留 null)
  for (let i = period; i < n; i++) {
    const ag = avgGains[i], al = avgLosses[i];
    if (isNaN(ag) || isNaN(al)) continue; // 保留 null (D4)
    if (al === 0) {
      out[i] = 100; // avg_loss=0 → 涨势极强, RSI=100
    } else {
      const rs = ag / al;
      out[i] = 100 - 100 / (1 + rs);
    }
  }
  return out;
}

/**
 * MACD — 对齐 D1 + D2 + D4
 * EMA alpha = 2/(N+1), adjust=False (标准MACD, 非Wilder)
 * @param closes 收盘价数组
 * @param fast 快线EMA周期 (默认12)
 * @param slow 慢线EMA周期 (默认26)
 * @param signal 信号线EMA周期 (默认9)
 * @returns {dif, dea, hist} 前 slow 期为 null (D4)
 */
function calcMACD(closes, fast, slow, signal) {
  const n = closes.length;
  const result = {
    dif: new Array(n).fill(null),
    dea: new Array(n).fill(null),
    hist: new Array(n).fill(null),
  };
  if (n < slow) return result;

  // 1. EMA (alpha=2/(N+1), adjust=False)
  const emaFast = emaAdjustFalse(closes, fast, false);
  const emaSlow = emaAdjustFalse(closes, slow, false);

  // 2. DIF = EMA_fast - EMA_slow (从 index 0 开始有值, 因 adjust=False)
  const difRaw = closes.map((_, i) => emaFast[i] - emaSlow[i]);

  // 3. DEA = EMA(DIF, signal)
  const deaRaw = emaAdjustFalse(difRaw, signal, false);

  // 4. hist = DIF - DEA (D1: 不乘 2)
  const histRaw = difRaw.map((v, i) => v - deaRaw[i]);

  // 5. D4: warmup 前 slow 期为 null
  for (let i = slow; i < n; i++) {
    result.dif[i] = difRaw[i];
    result.dea[i] = deaRaw[i];
    result.hist[i] = histRaw[i];
  }
  return result;
}

/**
 * 布林带 — 对齐 D3 + D4
 * @param closes 收盘价数组
 * @param period 周期 (默认20)
 * @param k σ倍数 (默认2.0)
 * @returns {mid, upper, lower, width, pctB} 前 period 期为 null (D4)
 */
function calcBollinger(closes, period, k) {
  const n = closes.length;
  const result = {
    mid: new Array(n).fill(null),
    upper: new Array(n).fill(null),
    lower: new Array(n).fill(null),
    width: new Array(n).fill(null),
    pctB: new Array(n).fill(null),
  };
  if (n < period) return result;

  // D4: 前 period 期为 null (对齐 spec, 比 pandas rolling 多 mask 1 行)
  // 循环从 i=period 开始, 保证 warmup 一致性
  for (let i = period; i < n; i++) {
    // SMA (使用 closes[i-period .. i-1], 共 period 个值)
    let sum = 0;
    for (let j = 0; j < period; j++) sum += closes[i - j];
    const mid = sum / period;

    // 总体标准差 ddof=0 (D3): sqrt(sum((x-mean)^2) / n)
    let sqSum = 0;
    for (let j = 0; j < period; j++) {
      const dv = closes[i - j] - mid;
      sqSum += dv * dv;
    }
    const std = Math.sqrt(sqSum / period);

    const upper = mid + k * std;
    const lower = mid - k * std;
    const range = upper - lower;

    result.mid[i] = mid;
    result.upper[i] = upper;
    result.lower[i] = lower;
    result.width[i] = mid !== 0 ? range / mid : null;
    result.pctB[i] = range > 0 ? (closes[i] - lower) / range : null;
  }
  return result;
}

/**
 * ATR (Wilder) — 对齐 D2 + D4
 * @param highs 最高价数组
 * @param lows 最低价数组
 * @param closes 收盘价数组
 * @param period ATR周期 (默认14)
 * @returns atr数组, 前 period 期为 null (D4)
 */
function calcATR(highs, lows, closes, period) {
  const n = closes.length;
  const out = new Array(n).fill(null);
  if (n < period + 1) return out;

  // 1. TR: 真实波幅
  //    首日无前收, 用 H-L; 后续取 max(H-L, |H-preC|, |L-preC|)
  const tr = new Array(n);
  tr[0] = highs[0] - lows[0];
  for (let i = 1; i < n; i++) {
    tr[i] = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
  }

  // 2. Wilder smoothing via ewm(alpha=1/period, adjust=False) — D2
  //    对齐 pandas: atr = tr.ewm(alpha=1/period, adjust=False).mean()
  const alpha = 1 / period;
  let atr = tr[0]; // ewm adjust=False 首值 = tr[0]
  const atrs = [atr];
  for (let i = 1; i < n; i++) {
    atr = (1 - alpha) * atr + alpha * tr[i];
    atrs.push(atr);
  }

  // 3. D4: warmup 前 period 期为 null
  for (let i = period; i < n; i++) {
    out[i] = atrs[i];
  }
  return out;
}

/**
 * 计算全部4个指标
 * @param data OHLCV数据 (rows数组, 每行含 open/high/low/close/vol 等)
 * @param params {rsi:{...}, macd:{...}, bollinger:{...}, atr:{...}}
 * @returns {dates, closes, rsi, macd, bb, atr} 合并结果
 */
function calcAllIndicators(data, params) {
  const closes = data.map(r => r.close);
  const highs = data.map(r => r.high);
  const lows = data.map(r => r.low);
  const dates = data.map(r => r.trade_date);

  const rsi = calcRSI(closes, params.rsi.period);
  const macd = calcMACD(closes, params.macd.fast, params.macd.slow, params.macd.signal);
  const bb = calcBollinger(closes, params.bollinger.period, params.bollinger.k);
  const atr = calcATR(highs, lows, closes, params.atr.period);

  return { dates, closes, highs, lows, rsi, macd, bb, atr };
}

/**
 * 数值比对验证: 将工具计算结果与 notebook CSV 参考值比对
 * 对齐 spec V6-V8: 容差 1e-6
 * @param toolResult calcAllIndicators 的返回值
 * @param refData window.NOTEBOOK_INDICATORS (notebook CSV)
 * @param params 当前参数 (须为默认值才能比对)
 * @returns {passed, failed, details}
 */
function validateAgainstNotebook(toolResult, refData, params) {
  const tol = 1e-6;
  const checks = [];
  const n = Math.min(toolResult.dates.length, refData.length);

  // 比对函数: 仅在两边都有非null值时比对
  function cmp(name, toolArr, refKey, startIndex) {
    let pass = 0, fail = 0;
    const fails = [];
    for (let i = startIndex; i < n; i++) {
      const tv = toolArr[i];
      const rv = refData[i] ? refData[i][refKey] : null;
      if (tv === null || rv === null || rv === undefined || isNaN(rv)) continue;
      if (Math.abs(tv - rv) > tol) {
        fail++;
        if (fails.length < 3) fails.push({ idx: i, tool: tv, ref: rv, diff: Math.abs(tv - rv) });
      } else {
        pass++;
      }
    }
    checks.push({ name, pass, fail, fails });
  }

  // RSI (warmup = period, 默认14)
  cmp("RSI(14)", toolResult.rsi, "rsi_14", params.rsi.period);
  // MACD DIF/DEA/hist (warmup = slow, 默认26)
  cmp("MACD DIF", toolResult.macd.dif, "macd_dif", params.macd.slow);
  cmp("MACD DEA", toolResult.macd.dea, "macd_dea", params.macd.slow);
  cmp("MACD hist (D1:不乘2)", toolResult.macd.hist, "macd_hist", params.macd.slow);
  // 布林带 (warmup = period, 默认20)
  cmp("BB mid", toolResult.bb.mid, "bb_mid", params.bollinger.period);
  cmp("BB upper", toolResult.bb.upper, "bb_upper", params.bollinger.period);
  cmp("BB lower", toolResult.bb.lower, "bb_lower", params.bollinger.period);
  cmp("BB %B", toolResult.bb.pctB, "bb_pct_b", params.bollinger.period);
  // ATR (warmup = period, 默认14)
  cmp("ATR(14)", toolResult.atr, "atr_14", params.atr.period);

  const totalPass = checks.reduce((s, c) => s + c.pass, 0);
  const totalFail = checks.reduce((s, c) => s + c.fail, 0);
  return { passed: totalFail === 0, totalPass, totalFail, checks };
}
