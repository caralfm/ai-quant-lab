/**
 * metrics.js — 回测指标统计
 * 对齐 turtle_backtest_spec.md §6
 */

const Metrics = (() => {

  function compute({ trades, equityCurve, initialCapital, maxDrawdown, dailyReturns, totalDays }) {
    const finalEquity = equityCurve.length > 0
      ? equityCurve[equityCurve.length - 1].equity
      : initialCapital;

    const totalReturn = initialCapital > 0
      ? (finalEquity - initialCapital) / initialCapital * 100
      : 0;

    // 年化收益率 (假设 252 个交易日/年)
    const annualReturn = totalDays > 0
      ? (Math.pow(1 + totalReturn / 100, 252 / totalDays) - 1) * 100
      : 0;

    // 日收益率统计
    const nonZeroRet = dailyReturns.filter(r => r !== 0);
    const avgDailyRet = nonZeroRet.length > 0
      ? nonZeroRet.reduce((a, b) => a + b, 0) / nonZeroRet.length
      : 0;
    const variance = nonZeroRet.length > 0
      ? nonZeroRet.reduce((s, r) => s + (r - avgDailyRet) ** 2, 0) / nonZeroRet.length
      : 0;
    const annualVol = Math.sqrt(variance) * Math.sqrt(252) * 100;
    const riskFreeRate = 0.025; // 2.5%
    const sharpe = annualVol > 0 ? (annualReturn / 100 - riskFreeRate) / (annualVol / 100) : 0;

    // 交易统计
    const winTrades = trades.filter(t => t.return > 0);
    const lossTrades = trades.filter(t => t.return <= 0);
    const totalTrades = trades.length;
    const winRate = totalTrades > 0 ? winTrades.length / totalTrades * 100 : 0;

    const totalProfit = winTrades.reduce((s, t) => s + t.return, 0);
    const totalLoss = lossTrades.reduce((s, t) => s + Math.abs(t.return), 0);
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : (totalProfit > 0 ? Infinity : 0);

    // 盈亏比
    const avgWin = winTrades.length > 0 ? winTrades.reduce((s, t) => s + t.return, 0) / winTrades.length : 0;
    const avgLoss = lossTrades.length > 0 ? lossTrades.reduce((s, t) => s + Math.abs(t.return), 0) / lossTrades.length : 0;
    const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

    // 平均持仓天数
    const avgHoldDays = totalTrades > 0
      ? trades.reduce((s, t) => s + t.holdDays, 0) / totalTrades
      : 0;

    // Calmar 比率
    const calmar = maxDrawdown > 0 ? annualReturn / maxDrawdown : 0;

    // 最大连胜/连亏
    let maxWinStreak = 0, maxLossStreak = 0;
    let curWinStreak = 0, curLossStreak = 0;
    for (const t of trades) {
      if (t.return > 0) {
        curWinStreak++;
        curLossStreak = 0;
        if (curWinStreak > maxWinStreak) maxWinStreak = curWinStreak;
      } else {
        curLossStreak++;
        curWinStreak = 0;
        if (curLossStreak > maxLossStreak) maxLossStreak = curLossStreak;
      }
    }

    return {
      totalReturn: round(totalReturn, 2),
      annualReturn: round(annualReturn, 2),
      maxDrawdown: round(maxDrawdown, 2),
      annualVolatility: round(annualVol, 2),
      sharpeRatio: round(sharpe, 2),
      calmarRatio: round(calmar, 2),
      winRate: round(winRate, 1),
      profitFactor: round(profitFactor, 2),
      avgWin: round(avgWin, 2),
      avgLoss: round(avgLoss, 2),
      winLossRatio: round(winLossRatio, 2),
      totalTrades,
      winTrades: winTrades.length,
      lossTrades: lossTrades.length,
      avgHoldDays: round(avgHoldDays, 1),
      maxWinStreak,
      maxLossStreak,
      finalEquity: round(finalEquity, 2),
      initialCapital,
    };
  }

  function round(v, d) { const m = Math.pow(10, d); return Math.round(v * m) / m; }

  return { compute };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Metrics;
}
