/**
 * app.js — 海龟回测看板应用入口
 * 协调 UI 事件、数据加载、策略回测、图表渲染
 */

(function () {
  'use strict';

  // ===== State =====
  let currentStock = '300604.SZ';
  let currentOhlcv = null;
  let currentResult = null;
  let currentParams = Engine.defaults();
  let currentDateRange = { start: null, end: null };
  let currentViewSystem = 's1'; // 's1' | 's2'
  let isLoading = false;

  // ===== DOM Refs =====
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ===== Init =====
  async function init() {
    // 初始化图表
    ChartKline.init('chart-kline');
    ChartEquity.init('chart-equity', 'chart-drawdown');

    // 绑定 UI 事件
    bindEvents();

    // 加载默认标的
    await selectStock('300604.SZ');
  }

  // ===== Data =====
  async function selectStock(code) {
    if (isLoading) return;
    isLoading = true;
    showToast('加载数据中...');

    try {
      const data = await DataLoader.loadStock(code);
      currentStock = code;
      currentOhlcv = data.ohlcv;
      currentDateRange = {
        start: data.meta.dateRange[0],
        end: data.meta.dateRange[1]
      };

      // 更新UI
      updateDateRangeUI(data.meta);
      updateDataStatus(data.meta);
      updateStockSelector(code);

      // 运行回测
      runBacktest();

      showToast(`${data.meta.name} · ${data.meta.rowCount} 个交易日`);
    } catch (err) {
      console.error('加载数据失败:', err);
      showToast('数据加载失败: ' + err.message);
    } finally {
      isLoading = false;
    }
  }

  function runBacktest() {
    if (!currentOhlcv || currentOhlcv.length === 0) return;

    // 过滤日期范围
    let ohlcv = currentOhlcv;
    if (currentDateRange.start || currentDateRange.end) {
      ohlcv = currentOhlcv.filter(r => {
        if (currentDateRange.start && r.date < currentDateRange.start) return false;
        if (currentDateRange.end && r.date > currentDateRange.end) return false;
        return true;
      });
    }

    if (ohlcv.length < 56) {
      showToast('数据不足：至少需要 56 个交易日（预热期）');
      return;
    }

    currentResult = Engine.run(ohlcv, currentParams);

    if (!currentResult) {
      showToast('回测计算失败');
      return;
    }

    // 更新所有视图
    updateMetricsCards();
    updateKlineChart(ohlcv);
    updateEquityCharts();
    updateTradeTable();
  }

  function refreshAll() {
    if (currentResult) {
      const ohlcv = getFilteredOhlcv();
      updateMetricsCards();
      updateKlineChart(ohlcv);
      updateEquityCharts();
      updateTradeTable();
    }
  }

  function getFilteredOhlcv() {
    if (!currentOhlcv) return [];
    let ohlcv = currentOhlcv;
    if (currentDateRange.start || currentDateRange.end) {
      ohlcv = ohlcv.filter(r => {
        if (currentDateRange.start && r.date < currentDateRange.start) return false;
        if (currentDateRange.end && r.date > currentDateRange.end) return false;
        return true;
      });
    }
    return ohlcv;
  }

  // ===== UI Updates =====
  function updateMetricsCards() {
    const systems = [];
    if (currentParams.s1_enabled && currentResult.s1) systems.push('s1');
    if (currentParams.s2_enabled && currentResult.s2) systems.push('s2');

    const container = $('#metrics-container');
    if (!container) return;

    let html = '';

    for (const sys of systems) {
      const m = currentResult[sys].metrics;
      const label = sys === 's1' ? 'S1 (20/10)' : 'S2 (55/20)';
      const color = sys === 's1' ? '#185FA5' : '#BA7517';
      html += `
      <div class="metrics-col" style="border-left: 4px solid ${color}">
        <h3><span class="sys-tag">${label}</span></h3>
        <div class="metrics-grid">
          <div class="metric-item"><span class="ml">总收益率</span><span class="mv ${m.totalReturn >= 0 ? 'positive' : 'negative'}">${m.totalReturn > 0 ? '+' : ''}${m.totalReturn}%</span></div>
          <div class="metric-item"><span class="ml">年化收益</span><span class="mv ${m.annualReturn >= 0 ? 'positive' : 'negative'}">${m.annualReturn > 0 ? '+' : ''}${m.annualReturn}%</span></div>
          <div class="metric-item"><span class="ml">最大回撤</span><span class="mv negative">-${m.maxDrawdown}%</span></div>
          <div class="metric-item"><span class="ml">夏普比率</span><span class="mv">${m.sharpeRatio}</span></div>
          <div class="metric-item"><span class="ml">胜率</span><span class="mv">${m.winRate}%</span></div>
          <div class="metric-item"><span class="ml">盈亏比</span><span class="mv">${m.profitFactor}</span></div>
          <div class="metric-item"><span class="ml">交易次数</span><span class="mv">${m.totalTrades}</span></div>
          <div class="metric-item"><span class="ml">平均持仓</span><span class="mv">${m.avgHoldDays}天</span></div>
          <div class="metric-item"><span class="ml">胜率笔数</span><span class="mv">${m.winTrades}胜/${m.lossTrades}负</span></div>
          <div class="metric-item"><span class="ml">最大连胜</span><span class="mv positive">${m.maxWinStreak}</span></div>
          <div class="metric-item"><span class="ml">平均盈利</span><span class="mv positive">+${m.avgWin}%</span></div>
          <div class="metric-item"><span class="ml">平均亏损</span><span class="mv negative">-${m.avgLoss}%</span></div>
        </div>
      </div>`;
    }

    // 基准
    if (currentResult.benchmark) {
      const b = currentResult.benchmark;
      const benchFirst = b.equityCurve[0].equity;
      const benchLast = b.equityCurve[b.equityCurve.length - 1].equity;
      const benchRet = ((benchLast - benchFirst) / benchFirst * 100);
      html += `
      <div class="metrics-col benchmark-col" style="border-left: 4px solid #ccc">
        <h3><span class="sys-tag">买入持有</span></h3>
        <div class="metrics-grid">
          <div class="metric-item"><span class="ml">总收益率</span><span class="mv ${benchRet >= 0 ? 'positive' : 'negative'}">${benchRet > 0 ? '+' : ''}${benchRet.toFixed(2)}%</span></div>
          <div class="metric-item"><span class="ml">初始价</span><span class="mv">¥${ohlcvOfBenchFirst().toFixed(2)}</span></div>
          <div class="metric-item"><span class="ml">最新价</span><span class="mv">¥${ohlcvOfBenchLast().toFixed(2)}</span></div>
        </div>
      </div>`;
    }

    container.innerHTML = html;
  }

  function ohlcvOfBenchFirst() {
    const o = getFilteredOhlcv();
    return o.length > 0 ? o[Math.min(55, o.length - 1)].close : 0;
  }
  function ohlcvOfBenchLast() {
    const o = getFilteredOhlcv();
    return o.length > 0 ? o[o.length - 1].close : 0;
  }

  function updateKlineChart(ohlcv) {
    ChartKline.render(ohlcv, currentResult, currentParams, currentViewSystem);
  }

  function updateEquityCharts() {
    ChartEquity.render(currentResult, currentParams);
  }

  function updateTradeTable() {
    const tbody = $('#trade-tbody');
    if (!tbody) return;

    const allTrades = [];
    if (currentResult.s1) allTrades.push(...currentResult.s1.trades);
    if (currentResult.s2) allTrades.push(...currentResult.s2.trades);
    allTrades.sort((a, b) => a.entryDate.localeCompare(b.entryDate));

    let html = '';
    for (const t of allTrades) {
      html += `
      <tr>
        <td>${t.system}</td>
        <td>${t.entryDate}</td>
        <td>${t.exitDate}</td>
        <td>¥${t.entryPrice}</td>
        <td>¥${t.exitPrice}</td>
        <td class="${t.return >= 0 ? 'positive' : 'negative'}">${t.return > 0 ? '+' : ''}${t.return}%</td>
        <td>${t.holdDays}</td>
        <td>${t.exitReason}</td>
        <td>${t.addedUnits}</td>
      </tr>`;
    }

    if (allTrades.length === 0) {
      html = '<tr><td colspan="9" style="text-align:center;color:#999;padding:20px;">该时段内无交易信号</td></tr>';
    }

    tbody.innerHTML = html;
    $('#trade-count').textContent = `${allTrades.length} 笔`;
  }

  function updateDataStatus(meta) {
    const el = $('#data-status');
    if (el) {
      el.innerHTML = `<span class="status-dot"></span> ${meta.name} (${meta.code}) · ${meta.dateRange[0]} ~ ${meta.dateRange[1]} · ${meta.rowCount} 个交易日`;
    }
  }

  function updateDateRangeUI(meta) {
    const startEl = $('#date-start');
    const endEl = $('#date-end');
    if (startEl) startEl.value = meta.dateRange[0];
    if (endEl) endEl.value = meta.dateRange[1];
  }

  function updateStockSelector(code) {
    const sel = $('#stock-select');
    if (sel) sel.value = code;
  }

  // ===== Events =====
  function bindEvents() {
    // 标的选择
    $('#stock-select')?.addEventListener('change', (e) => {
      selectStock(e.target.value);
    });

    // 日期变化
    $('#date-start')?.addEventListener('change', () => {
      currentDateRange.start = $('#date-start').value;
      runBacktest();
    });
    $('#date-end')?.addEventListener('change', () => {
      currentDateRange.end = $('#date-end').value;
      runBacktest();
    });

    // 快捷时段按钮
    $$('.quick-btns .btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.quick-btns .btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const range = btn.dataset.range;
        if (!currentOhlcv || currentOhlcv.length === 0) return;
        const lastDate = currentOhlcv[currentOhlcv.length - 1].date;
        const [ly, lm, ld] = lastDate.split('-').map(Number);

        let startDate;
        if (range === 'all') {
          startDate = currentOhlcv[0].date;
        } else if (range === '1y') {
          startDate = `${ly - 1}-${String(lm).padStart(2, '0')}-${String(ld).padStart(2, '0')}`;
        } else if (range === '2y') {
          startDate = `${ly - 2}-${String(lm).padStart(2, '0')}-${String(ld).padStart(2, '0')}`;
        } else if (range === '5y') {
          startDate = `${ly - 5}-${String(lm).padStart(2, '0')}-${String(ld).padStart(2, '0')}`;
        }

        currentDateRange.start = startDate;
        currentDateRange.end = lastDate;
        $('#date-start').value = startDate;
        $('#date-end').value = lastDate;
        runBacktest();
      });
    });

    // 预设方案
    $('#preset-select')?.addEventListener('change', (e) => {
      applyPreset(e.target.value);
    });

    // 参数面板绑定
    bindParamInputs();

    // S1/S2 开关
    $('#s1-toggle')?.addEventListener('change', (e) => {
      currentParams.s1_enabled = e.target.checked;
      runBacktest();
    });
    $('#s2-toggle')?.addEventListener('change', (e) => {
      currentParams.s2_enabled = e.target.checked;
      runBacktest();
    });

    // 视图切换
    $('#view-s1')?.addEventListener('click', () => {
      currentViewSystem = 's1';
      $('#view-s1').classList.add('active');
      $('#view-s2').classList.remove('active');
      updateKlineChart(getFilteredOhlcv());
    });
    $('#view-s2')?.addEventListener('click', () => {
      currentViewSystem = 's2';
      $('#view-s2').classList.add('active');
      $('#view-s1').classList.remove('active');
      updateKlineChart(getFilteredOhlcv());
    });

    // 更新数据
    $('#btn-update')?.addEventListener('click', async () => {
      showToast('数据更新需要本地 MCP 环境，请在工作站中运行更新脚本。\n当前使用缓存数据回测。');
    });

    // 侧边栏折叠
    $('#sidebar-toggle')?.addEventListener('click', () => {
      $('#sidebar')?.classList.toggle('collapsed');
    });

    // 导出
    $('#btn-export')?.addEventListener('click', exportReport);

    // 窗口 resize
    window.addEventListener('resize', () => {
      ChartKline.resize();
      ChartEquity.resize();
    });

    // 参数组折叠
    $$('.param-group-title').forEach(el => {
      el.addEventListener('click', () => {
        const group = el.closest('.param-group');
        const rows = group.querySelectorAll('.param-row, .check-row');
        const isHidden = rows[0]?.style.display === 'none';
        rows.forEach(r => { r.style.display = isHidden ? '' : 'none'; });
        el.textContent = el.textContent.replace(isHidden ? '▶' : '▼', isHidden ? '▼' : '▶');
      });
    });
  }

  function bindParamInputs() {
    const paramMap = {
      'entry-s1': 'entryPeriod_s1',
      'exit-s1': 'exitPeriod_s1',
      'entry-s2': 'entryPeriod_s2',
      'exit-s2': 'exitPeriod_s2',
      'atr-period': 'atrPeriod',
      'stop-atr': 'stopATR',
      'add-unit': 'addUnitATR',
      'max-units': 'maxUnits',
      'init-capital': 'initialCapital',
      'risk-per-unit': 'riskPerUnit',
    };

    // 滑块 + 数字输入双向绑定
    for (const [domId, paramKey] of Object.entries(paramMap)) {
      const slider = $(`#${domId}`);
      const input = $(`#${domId}-num`);
      const valEl = $(`#${domId}-val`);

      if (slider) {
        slider.addEventListener('input', () => {
          const val = parseFloat(slider.value);
          currentParams[paramKey] = val;
          if (input) input.value = val;
          if (valEl) {
            if (domId === 'init-capital') valEl.textContent = (val / 10000).toFixed(0) + '万';
            else if (domId === 'risk-per-unit') valEl.textContent = (val * 100).toFixed(1) + '%';
            else valEl.textContent = val;
          }
          debounceRun();
        });
      }
      if (input) {
        input.addEventListener('change', () => {
          const val = parseFloat(input.value);
          if (!isNaN(val)) {
            currentParams[paramKey] = val;
            if (slider) slider.value = val;
            if (valEl) {
              if (domId === 'init-capital') valEl.textContent = (val / 10000).toFixed(0) + '万';
              else if (domId === 'risk-per-unit') valEl.textContent = (val * 100).toFixed(1) + '%';
              else valEl.textContent = val;
            }
            debounceRun();
          }
        });
      }
    }

    // 过滤器开关
    $('#s1-filter')?.addEventListener('change', (e) => {
      currentParams.s1_lastFilter = e.target.checked;
      runBacktest();
    });
  }

  function applyPreset(preset) {
    switch (preset) {
      case 's1':
        Object.assign(currentParams, {
          s1_enabled: true, s2_enabled: false,
          entryPeriod_s1: 20, exitPeriod_s1: 10,
          atrPeriod: 20, stopATR: 2.0,
          addUnitATR: 0.5, maxUnits: 4,
          s1_lastFilter: true,
        });
        break;
      case 's2':
        Object.assign(currentParams, {
          s1_enabled: false, s2_enabled: true,
          entryPeriod_s2: 55, exitPeriod_s2: 20,
          atrPeriod: 20, stopATR: 2.0,
          addUnitATR: 0.5, maxUnits: 4,
        });
        break;
      case 'both':
        Object.assign(currentParams, {
          s1_enabled: true, s2_enabled: true,
          entryPeriod_s1: 20, exitPeriod_s1: 10,
          entryPeriod_s2: 55, exitPeriod_s2: 20,
          atrPeriod: 20, stopATR: 2.0,
          addUnitATR: 0.5, maxUnits: 4,
          s1_lastFilter: true,
        });
        break;
    }
    syncParamsToUI();
    runBacktest();
  }

  function syncParamsToUI() {
    const map = {
      'entry-s1': currentParams.entryPeriod_s1,
      'exit-s1': currentParams.exitPeriod_s1,
      'entry-s2': currentParams.entryPeriod_s2,
      'exit-s2': currentParams.exitPeriod_s2,
      'atr-period': currentParams.atrPeriod,
      'stop-atr': currentParams.stopATR,
      'add-unit': currentParams.addUnitATR,
      'max-units': currentParams.maxUnits,
      'init-capital': currentParams.initialCapital,
      'risk-per-unit': currentParams.riskPerUnit,
    };
    for (const [id, val] of Object.entries(map)) {
      const slider = $(`#${id}`);
      const input = $(`#${id}-num`);
      const valEl = $(`#${id}-val`);
      if (slider) slider.value = val;
      if (input) input.value = val;
      if (valEl) {
        if (id === 'init-capital') valEl.textContent = (val / 10000).toFixed(0) + '万';
        else if (id === 'risk-per-unit') valEl.textContent = (val * 100).toFixed(1) + '%';
        else valEl.textContent = val;
      }
    }
    const s1Toggle = $('#s1-toggle');
    const s2Toggle = $('#s2-toggle');
    const filterToggle = $('#s1-filter');
    if (s1Toggle) s1Toggle.checked = currentParams.s1_enabled;
    if (s2Toggle) s2Toggle.checked = currentParams.s2_enabled;
    if (filterToggle) filterToggle.checked = currentParams.s1_lastFilter;
  }

  // ===== Debounce =====
  let debounceTimer = null;
  function debounceRun() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runBacktest(), 120);
  }

  // ===== Export =====
  function exportReport() {
    // 简单导出交易明细 CSV
    const allTrades = [];
    if (currentResult.s1) allTrades.push(...currentResult.s1.trades);
    if (currentResult.s2) allTrades.push(...currentResult.s2.trades);

    if (allTrades.length === 0) {
      showToast('无交易记录可导出');
      return;
    }

    let csv = '系统,入场日期,出场日期,入场价,出场价,收益率%,持仓天数,出场原因,加仓次数\n';
    for (const t of allTrades) {
      csv += `${t.system},${t.entryDate},${t.exitDate},${t.entryPrice},${t.exitPrice},${t.return},${t.holdDays},${t.exitReason},${t.addedUnits}\n`;
    }

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `turtle_trades_${currentStock}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('交易明细已导出');
  }

  // ===== Toast =====
  function showToast(msg) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._timeout);
    el._timeout = setTimeout(() => el.classList.remove('show'), 2500);
  }

  // ===== Boot =====
  document.addEventListener('DOMContentLoaded', init);
})();
