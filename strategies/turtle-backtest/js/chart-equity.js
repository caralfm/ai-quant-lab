/**
 * chart-equity.js — 资金曲线 + 回撤曲线
 */

const ChartEquity = (() => {
  let equityChart = null;
  let drawdownChart = null;

  function init(equityDomId, ddDomId) {
    const eqDom = document.getElementById(equityDomId);
    const ddDom = document.getElementById(ddDomId);
    if (eqDom) {
      if (equityChart) equityChart.dispose();
      equityChart = echarts.init(eqDom);
    }
    if (ddDom) {
      if (drawdownChart) drawdownChart.dispose();
      drawdownChart = echarts.init(ddDom);
    }
  }

  function render(result, params) {
    renderEquity(result, params);
    renderDrawdown(result);
  }

  function renderEquity(result, params) {
    if (!equityChart) return;

    const series = [];

    // 基准
    if (result.benchmark && result.benchmark.equityCurve) {
      series.push({
        name: '买入持有',
        type: 'line',
        data: result.benchmark.equityCurve.map(e => e.equity),
        symbol: 'none',
        lineStyle: { color: '#ccc', width: 1, type: 'dashed' },
      });
    }

    const colors = { s1: '#185FA5', s2: '#BA7517' };
    const dates = [];

    for (const sys of ['s1', 's2']) {
      if (result[sys] && result[sys].equityCurve) {
        if (dates.length === 0) {
          dates.push(...result[sys].equityCurve.map(e => e.date));
        }
        series.push({
          name: `S${sys === 's1' ? '1 (20/10)' : '2 (55/20)'}`,
          type: 'line',
          data: result[sys].equityCurve.map(e => e.equity),
          symbol: 'none',
          lineStyle: { color: colors[sys], width: 2 },
        });
      }
    }

    const option = {
      backgroundColor: '#fff',
      animation: false,
      title: {
        text: '资金曲线',
        left: 'center',
        top: 4,
        textStyle: { fontSize: 13, fontWeight: 500, color: '#2C2C2A' }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(42,42,42,0.9)',
        borderWidth: 0,
        textStyle: { color: '#fff', fontSize: 12 },
        formatter: function (ps) {
          if (!ps || ps.length === 0) return '';
          let html = `<b>${ps[0].axisValue}</b><br/>`;
          for (const p of ps) {
            const val = (p.value / 10000).toFixed(2);
            html += `${p.marker} ${p.seriesName}: ¥${val}万<br/>`;
          }
          return html;
        }
      },
      legend: {
        data: series.map(s => s.name),
        bottom: 4,
        textStyle: { color: '#666', fontSize: 11 }
      },
      grid: { left: '10%', right: '4%', top: '14%', bottom: '16%' },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: { color: '#666', fontSize: 10 },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        scale: true,
        axisLabel: {
          color: '#666', fontSize: 10,
          formatter: v => (v / 10000).toFixed(0) + '万'
        },
        splitLine: { lineStyle: { color: '#f0f0f0' } },
      },
      series,
    };

    equityChart.setOption(option, true);
  }

  function renderDrawdown(result) {
    if (!drawdownChart) return;

    const series = [];
    const colors = { s1: '#185FA5', s2: '#BA7517' };
    let dates = [];

    for (const sys of ['s1', 's2']) {
      if (result[sys] && result[sys].drawdownCurve) {
        if (dates.length === 0) {
          dates = result[sys].drawdownCurve.map(e => e.date);
        }
        series.push({
          name: `S${sys === 's1' ? '1' : '2'} 回撤`,
          type: 'line',
          data: result[sys].drawdownCurve.map(e => -Math.abs(e.drawdown)),
          symbol: 'none',
          lineStyle: { color: colors[sys], width: 1.5 },
          areaStyle: { color: colors[sys] + '15' },
        });
      }
    }

    const option = {
      backgroundColor: '#fff',
      animation: false,
      title: {
        text: '回撤曲线',
        left: 'center',
        top: 4,
        textStyle: { fontSize: 13, fontWeight: 500, color: '#2C2C2A' }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(42,42,42,0.9)',
        borderWidth: 0,
        textStyle: { color: '#fff', fontSize: 12 },
        formatter: function (ps) {
          if (!ps || ps.length === 0) return '';
          let html = `<b>${ps[0].axisValue}</b><br/>`;
          for (const p of ps) {
            html += `${p.marker} ${p.seriesName}: ${Math.abs(p.value).toFixed(2)}%<br/>`;
          }
          return html;
        }
      },
      legend: {
        data: series.map(s => s.name),
        bottom: 4,
        textStyle: { color: '#666', fontSize: 11 }
      },
      grid: { left: '8%', right: '4%', top: '14%', bottom: '16%' },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: { color: '#666', fontSize: 10 },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: '#666', fontSize: 10,
          formatter: v => Math.abs(v).toFixed(0) + '%'
        },
        splitLine: { lineStyle: { color: '#f0f0f0' } },
      },
      series,
    };

    drawdownChart.setOption(option, true);
  }

  function resize() {
    if (equityChart) equityChart.resize();
    if (drawdownChart) drawdownChart.resize();
  }

  function dispose() {
    if (equityChart) { equityChart.dispose(); equityChart = null; }
    if (drawdownChart) { drawdownChart.dispose(); drawdownChart = null; }
  }

  return { init, render, resize, dispose };
})();
