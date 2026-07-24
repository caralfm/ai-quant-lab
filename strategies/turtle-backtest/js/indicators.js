/**
 * indicators.js — ATR / Donchian Channel 计算
 * 与 task02 indicator_lab_spec.md §2.4 公式对齐
 */

const Indicators = (() => {

  /**
   * True Range: max(high-low, |high-prevClose|, |low-prevClose|)
   */
  function trueRange(row, prevClose) {
    const a = row.high - row.low;
    const b = Math.abs(row.high - prevClose);
    const c = Math.abs(row.low - prevClose);
    return Math.max(a, b, c);
  }

  /**
   * ATR — Wilder smoothing (α = 1/period)
   * 返回与 ohlcv 等长的数组，前 (period-1) 个值为 NaN
   */
  function atr(ohlcv, period) {
    const n = ohlcv.length;
    const result = new Array(n).fill(NaN);

    if (n < period + 1) return result;

    // 第一个 ATR 用简单平均
    let sumTR = 0;
    for (let i = 1; i <= period; i++) {
      sumTR += trueRange(ohlcv[i], ohlcv[i - 1].close);
    }
    result[period] = sumTR / period;

    // 后续用 Wilder EMA
    const alpha = 1 / period;
    for (let i = period + 1; i < n; i++) {
      const tr = trueRange(ohlcv[i], ohlcv[i - 1].close);
      result[i] = result[i - 1] * (1 - alpha) + tr * alpha;
    }

    return result;
  }

  /**
   * Donchian Channel 上轨：过去 N 日最高价 (不含当日)
   * 返回与 ohlcv 等长的数组
   */
  function donchianHigh(ohlcv, period) {
    const n = ohlcv.length;
    const result = new Array(n).fill(NaN);

    for (let i = period; i < n; i++) {
      let maxHigh = -Infinity;
      for (let j = i - period; j < i; j++) {
        if (ohlcv[j].high > maxHigh) maxHigh = ohlcv[j].high;
      }
      result[i] = maxHigh;
    }

    return result;
  }

  /**
   * Donchian Channel 下轨：过去 N 日最低价 (不含当日)
   * 返回与 ohlcv 等长的数组
   */
  function donchianLow(ohlcv, period) {
    const n = ohlcv.length;
    const result = new Array(n).fill(NaN);

    for (let i = period; i < n; i++) {
      let minLow = Infinity;
      for (let j = i - period; j < i; j++) {
        if (ohlcv[j].low < minLow) minLow = ohlcv[j].low;
      }
      result[i] = minLow;
    }

    return result;
  }

  /**
   * 批量计算回测所需的全部指标
   */
  function computeAll(ohlcv, params) {
    const atr20 = atr(ohlcv, params.atrPeriod);

    return {
      atr: atr20,
      dcHigh_s1: donchianHigh(ohlcv, params.entryPeriod_s1),
      dcLow_s1: donchianLow(ohlcv, params.exitPeriod_s1),
      dcHigh_s2: donchianHigh(ohlcv, params.entryPeriod_s2),
      dcLow_s2: donchianLow(ohlcv, params.exitPeriod_s2),
    };
  }

  /**
   * 预热期长度：确保所有指标有有效值
   */
  function warmupPeriod(params) {
    return Math.max(
      params.atrPeriod + 1,
      params.entryPeriod_s1,
      params.exitPeriod_s1,
      params.entryPeriod_s2,
      params.exitPeriod_s2
    );
  }

  return { atr, donchianHigh, donchianLow, computeAll, warmupPeriod, trueRange };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Indicators;
}
