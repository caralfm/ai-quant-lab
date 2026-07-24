/**
 * engine.js — 海龟交易法则回测引擎
 *
 * 实现:
 *   System 1: 20日入场 / 10日出场 (含过滤器)
 *   System 2: 55日入场 / 20日出场
 *   ATR 仓位管理 / 加仓金字塔 / 独立止损
 *
 * 算法对齐 turtle_backtest_spec.md §1-§3
 */

const Engine = (() => {

  /**
   * 主回测函数
   * @param {Array} ohlcv — [{date, open, high, low, close, vol}, ...]
   * @param {Object} params — 完整参数 (见 spec §7)
   * @returns {Object} { s1: {...}, s2: {...}, benchmark: {...} }
   */
  function run(ohlcv, params) {
    const warmup = Indicators.warmupPeriod(params);
    if (ohlcv.length <= warmup) {
      console.warn(`数据不足: 需要至少 ${warmup + 1} 行，实际 ${ohlcv.length} 行`);
      return null;
    }

    const p = { ...defaults(), ...params };
    const ind = Indicators.computeAll(ohlcv, p);

    const bench = runBenchmark(ohlcv, warmup, p.initialCapital);

    const results = { benchmark: bench };
    if (p.s1_enabled) results.s1 = runSystem(ohlcv, ind, p, 's1');
    if (p.s2_enabled) results.s2 = runSystem(ohlcv, ind, p, 's2');

    return results;
  }

  /**
   * 单系统回测
   */
  function runSystem(ohlcv, ind, p, system) {
    const isS1 = system === 's1';
    const entryHigh = ind[`dcHigh_${system}`];
    const exitLow = ind[`dcLow_${system}`];
    const warmup = Indicators.warmupPeriod(p);

    const trades = [];
    const equityCurve = [];
    const drawdownCurve = [];

    // 状态
    let position = 0;                     // 当前持仓单位数
    const units = [];                     // [{entryPrice, entryDate, entryIdx, stopPrice}]
    let lastS1TradeWinner = true;         // S1 过滤器状态
    let cash = p.initialCapital;
    let peakEquity = p.initialCapital;
    let maxDrawdown = 0;
    let maxDrawdownDate = null;

    // 计算每单位股数（动态，取入场日 ATR）
    function calcShares(entryIdx) {
      const atrVal = ind.atr[entryIdx];
      if (!atrVal || atrVal <= 0) return 0;
      const riskAmount = p.initialCapital * p.riskPerUnit;
      const perShareRisk = p.stopATR * atrVal;
      const shares = Math.floor(riskAmount / perShareRisk / 100) * 100; // 整手
      return Math.max(shares, 100);
    }

    // 记录交易
    function recordTrade(entryDate, exitDate, entryIdx, exitIdx, entryPrice, exitPrice, addedCount, exitReason) {
      const holdDays = exitIdx - entryIdx;
      const ret = (exitPrice - entryPrice) / entryPrice * 100;
      trades.push({
        system: system.toUpperCase(),
        entryDate, exitDate,
        entryPrice: round(entryPrice, 2),
        exitPrice: round(exitPrice, 2),
        return: round(ret, 2),
        holdDays,
        exitReason,
        addedUnits: addedCount,
      });
      return ret >= 0;
    }

    // 逐日遍历
    for (let i = warmup; i < ohlcv.length; i++) {
      const row = ohlcv[i];
      const date = row.date;
      const atrVal = ind.atr[i];

      if (!atrVal || isNaN(atrVal)) {
        // ATR 无效日：持有不变
        const currentEquity = cash + computePositionValue(units, row.close);
        equityCurve.push({ date, equity: currentEquity });
        drawdownCurve.push({ date, drawdown: currentEquity >= peakEquity ? 0 : (1 - currentEquity / peakEquity) * 100 });
        if (currentEquity > peakEquity) { peakEquity = currentEquity; }
        continue;
      }

      // ---- 有持仓：先检查止损 (盘中，用最低价) ----
      if (position > 0) {
        const surviving = [];
        for (const u of units) {
          if (row.low <= u.stopPrice) {
            // 止损触发
            const exitPrice = (row.open < u.stopPrice) ? row.open : u.stopPrice;
            cash += exitPrice * u.shares;
            const isWin = recordTrade(u.entryDate, date, u.entryIdx, i, u.entryPrice, exitPrice, u.addedCount, '止损');
            if (isS1) lastS1TradeWinner = isWin;
            position--;
          } else {
            surviving.push(u);
          }
        }
        units.length = 0;
        units.push(...surviving);
      }

      // ---- 出场信号 (通道突破) ----
      if (position > 0 && row.close < exitLow[i]) {
        // 全部平仓
        for (const u of units) {
          cash += row.close * u.shares;
          const isWin = recordTrade(u.entryDate, date, u.entryIdx, i, u.entryPrice, row.close, u.addedCount, '通道出场');
          if (isS1) lastS1TradeWinner = isWin;
        }
        units.length = 0;
        position = 0;
      }

      // ---- 入场信号 (通道突破) ----
      if (position === 0 && !isNaN(entryHigh[i])) {
        // 突破价 = 入场价 = max(open, 通道上轨)，模拟次日以开盘或突破价入场
        const entrySignal = entryHigh[i];
        if (row.close > entrySignal) {
          // S1 过滤器
          if (isS1 && p.s1_lastFilter && !lastS1TradeWinner) {
            // 跳过，不进场
          } else {
            const shares = calcShares(i);
            if (shares >= 100) {
              const entryPrice = row.close; // 以当日收盘价入场（简化）
              const cost = entryPrice * shares;
              if (cost <= cash) {
                cash -= cost;
                units.push({
                  entryPrice,
                  entryDate: date,
                  entryIdx: i,
                  stopPrice: entryPrice - p.stopATR * atrVal,
                  shares,
                  addedCount: 0,
                });
                position = 1;
                lastS1TradeWinner = true; // 重置过滤器（进场即视为"新交易开始"）
              }
            }
          }
        }
      }

      // ---- 加仓信号 ----
      if (position > 0 && position < p.maxUnits) {
        const lastUnit = units[units.length - 1];
        const addPrice = lastUnit.entryPrice + p.addUnitATR * atrVal;
        if (row.close >= addPrice) {
          const shares = calcShares(i);
          if (shares >= 100) {
            const cost = row.close * shares;
            if (cost <= cash) {
              cash -= cost;
              const newUnit = {
                entryPrice: row.close,
                entryDate: date,
                entryIdx: i,
                stopPrice: row.close - p.stopATR * atrVal,
                shares,
                addedCount: position, // 这是第几次加仓
              };
              units.push(newUnit);
              position++;
            }
          }
        }
      }

      // ---- 记录权益 ----
      const currentEquity = cash + computePositionValue(units, row.close);
      equityCurve.push({ date, equity: currentEquity });

      let dd = 0;
      if (currentEquity > peakEquity) {
        peakEquity = currentEquity;
      } else if (peakEquity > 0) {
        dd = (1 - currentEquity / peakEquity) * 100;
      }
      drawdownCurve.push({ date, drawdown: dd });
      if (dd > maxDrawdown) {
        maxDrawdown = dd;
        maxDrawdownDate = date;
      }
    }

    // ---- 强制平仓 (回测结束时仍有持仓) ----
    if (position > 0 && ohlcv.length > 0) {
      const lastRow = ohlcv[ohlcv.length - 1];
      for (const u of units) {
        cash += lastRow.close * u.shares;
        recordTrade(u.entryDate, lastRow.date, u.entryIdx, ohlcv.length - 1, u.entryPrice, lastRow.close, u.addedCount, '回测结束平仓');
      }
      units.length = 0;
      position = 0;
      const finalEquity = cash;
      equityCurve[equityCurve.length - 1] = { date: lastRow.date, equity: finalEquity };
    }

    // ---- 计算指标 ----
    const metrics = Metrics.compute({
      trades,
      equityCurve,
      initialCapital: p.initialCapital,
      peakEquity: peakEquity || p.initialCapital,
      maxDrawdown,
      dailyReturns: equityCurve.map((e, idx) => {
        if (idx === 0) return 0;
        return (e.equity - equityCurve[idx - 1].equity) / equityCurve[idx - 1].equity;
      }),
      totalDays: ohlcv.length - warmup,
    });

    return {
      metrics,
      trades,
      equityCurve,
      drawdownCurve,
      warmup,
    };
  }

  /**
   * 买入持有基准
   */
  function runBenchmark(ohlcv, warmup, initialCapital) {
    const firstPrice = ohlcv[warmup].close;
    const shares = Math.floor(initialCapital / firstPrice / 100) * 100;
    const cost = shares * firstPrice;
    const remainingCash = initialCapital - cost;

    const equityCurve = [];
    for (let i = warmup; i < ohlcv.length; i++) {
      const eq = remainingCash + shares * ohlcv[i].close;
      equityCurve.push({ date: ohlcv[i].date, equity: eq });
    }

    return { shares, firstPrice, equityCurve };
  }

  function computePositionValue(units, currentPrice) {
    let val = 0;
    for (const u of units) val += u.shares * currentPrice;
    return val;
  }

  function defaults() {
    return {
      s1_enabled: true,
      s2_enabled: true,
      entryPeriod_s1: 20,
      exitPeriod_s1: 10,
      entryPeriod_s2: 55,
      exitPeriod_s2: 20,
      atrPeriod: 20,
      stopATR: 2.0,
      addUnitATR: 0.5,
      maxUnits: 4,
      s1_lastFilter: true,
      initialCapital: 1000000,
      riskPerUnit: 0.01,
    };
  }

  function round(v, d) { const m = Math.pow(10, d); return Math.round(v * m) / m; }

  return { run, defaults };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Engine;
}
