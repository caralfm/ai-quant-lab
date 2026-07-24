/**
 * chart-kline.js — K线图 + Donchian 通道 + 买卖点标注
 */

const ChartKline = (() => {
  let chart = null;
  let currentData = null;

  function init(domId) {
    const dom = document.getElementById(domId);
    if (!dom) return;
    if (chart) chart.dispose();
    chart = echarts.init(dom);
  }

  function render(ohlcv, result, params, system = 's1') {
    if (!chart) return;

    const sysResult = result[system];
    if (!sysResult) { chart.clear(); return; }

    const dates = ohlcv.map(r => r.date);
    const kData = ohlcv.map(r => [r.open, r.close, r.low, r.high]);

    // 计算 Donchian 通道
    const entryP = system === 's1' ? params.entryPeriod_s1 : params.entryPeriod_s2;
    const exitP = system === 's1' ? params.exitPeriod_s1 : params.exitPeriod_s2;
    const dcHigh = Indicators.donchianHigh(ohlcv, entryP);
    const dcLow = Indicators.donchianLow(ohlcv, exitP);

    // 买卖点标注
    const buyMarks = [];
    const sellMarks = [];
    const addMarks = [];
    let entryDates = new Set();

    for (const t of sysResult.trades) {
      const dateIdx = dates.indexOf(t.entryDate);
      if (dateIdx >= 0) {
        if (entryDates.has(t.entryDate)) {
          addMarks.push({
            coord: [dateIdx, ohlcv[dateIdx].low * 0.985],
            value: '加仓',
          });
        } else {
          buyMarks.push({
            coord: [dateIdx, ohlcv[dateIdx].low * 0.97],
            value: '买入',
          });
          entryDates.add(t.entryDate);
        }
      }
      const exitIdx = dates.indexOf(t.exitDate);
      if (exitIdx >= 0) {
        sellMarks.push({
          coord: [exitIdx, ohlcv[exitIdx].high * 1.03],
          value: t.exitReason === '止损' ? '止损' : '卖出',
        });
      }
    }

    const option = {
      backgroundColor: '#fff',
      animation: false,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        backgroundColor: 'rgba(42,42,42,0.9)',
        borderWidth: 0,
        textStyle: { color: '#fff', fontSize: 12 },
        formatter: function (ps) {
          if (!ps || ps.length === 0) return '';
          const idx = ps[0].dataIndex;
          const r = ohlcv[idx];
          return `<b>${r.date}</b><br/>
            开: ¥${r.open} 收: ¥${r.close}<br/>
            高: ¥${r.high} 低: ¥${r.low}<br/>
            成交量: ${(r.vol/10000).toFixed(0)}万手`;
        }
      },
      legend: {
        data: ['K线', 'Donchian上轨', 'Donchian下轨'],
        top: 6,
        textStyle: { color: '#666', fontSize: 11 }
      },
      grid: { left: '8%', right: '4%', top: '12%', bottom: '10%' },
      xAxis: {
        type: 'category',
        data: dates,
        boundaryGap: true,
        axisLine: { onZero: false },
        axisLabel: { color: '#666', fontSize: 10, rotate: 30 },
        splitLine: { show: false },
      },
      yAxis: {
        scale: true,
        splitLine: { lineStyle: { color: '#f0f0f0' } },
        axisLabel: { color: '#666', fontSize: 11 },
      },
      dataZoom: [
        { type: 'inside', start: 0, end: 100 },
        { type: 'slider', start: 0, end: 100, height: 20, bottom: 6 },
      ],
      series: [
        {
          name: 'K线',
          type: 'candlestick',
          data: kData,
          itemStyle: {
            color: '#D85A30',       // 涨红
            color0: '#1D9E75',       // 跌绿
            borderColor: '#D85A30',
            borderColor0: '#1D9E75',
          },
          markPoint: {
            data: buyMarks.map(m => ({
              ...m,
              symbol: 'triangle',
              symbolSize: 14,
              symbolRotate: 0,
              itemStyle: { color: '#D85A30' },
              label: { show: true, position: 'bottom', fontSize: 10, color: '#D85A30' }
            })).concat(sellMarks.map(m => ({
              ...m,
              symbol: 'triangle',
              symbolSize: 14,
              symbolRotate: 180,
              itemStyle: { color: '#1D9E75' },
              label: { show: true, position: 'top', fontSize: 10, color: '#1D9E75' }
            }))).concat(addMarks.map(m => ({
              ...m,
              symbol: 'diamond',
              symbolSize: 10,
              itemStyle: { color: '#BA7517' },
              label: { show: true, position: 'bottom', fontSize: 9, color: '#BA7517' }
            }))),
          },
        },
        {
          name: 'Donchian上轨',
          type: 'line',
          data: dcHigh,
          symbol: 'none',
          lineStyle: { color: '#BA7517', width: 1, type: 'dashed' },
        },
        {
          name: 'Donchian下轨',
          type: 'line',
          data: dcLow,
          symbol: 'none',
          lineStyle: { color: '#185FA5', width: 1, type: 'dashed' },
        },
      ],
    };

    chart.setOption(option, true);
    currentData = { ohlcv, result, params, system };
  }

  function resize() { if (chart) chart.resize(); }
  function getChart() { return chart; }
  function dispose() { if (chart) { chart.dispose(); chart = null; } }

  return { init, render, resize, getChart, dispose };
})();
