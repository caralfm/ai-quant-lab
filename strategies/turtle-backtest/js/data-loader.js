/**
 * data-loader.js — CSV 数据加载、解析、校验
 * 对齐 stock_data_spec.md §6 校验规则
 */

const DataLoader = (() => {

  const STOCKS = [
    { code: '300604.SZ', name: '长川科技', file: 'data/300604.SZ_daily.csv' },
    { code: '688008.SH', name: '澜起科技', file: 'data/688008.SH_daily.csv' },
    { code: '000977.SZ', name: '浪潮信息', file: 'data/000977.SZ_daily.csv' },
  ];

  let cachedData = {}; // { '300604.SZ': { ohlcv: [...], meta: {...} } }

  async function loadStock(stockCode) {
    if (cachedData[stockCode]) return cachedData[stockCode];

    const stock = STOCKS.find(s => s.code === stockCode);
    if (!stock) throw new Error(`未找到标的: ${stockCode}`);

    const resp = await fetch(stock.file);
    if (!resp.ok) throw new Error(`加载 ${stock.file} 失败: ${resp.status}`);

    let text = await resp.text();
    // 处理 BOM
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const lines = text.trim().split('\n');
    if (lines.length < 2) throw new Error(`${stockCode}: 数据为空`);

    const headers = lines[0].split(',');
    const ohlcv = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length < headers.length) continue;

      const row = {};
      for (let j = 0; j < headers.length; j++) {
        row[headers[j].trim()] = cols[j].trim();
      }

      ohlcv.push({
        date: row.trade_date,
        open: parseFloat(row.open),
        high: parseFloat(row.high),
        low: parseFloat(row.low),
        close: parseFloat(row.close),
        vol: parseFloat(row.vol),
        amount: parseFloat(row.amount),
      });
    }

    // 按日期排序
    ohlcv.sort((a, b) => a.date.localeCompare(b.date));

    // 校验
    const valid = validate(ohlcv, stockCode);
    if (!valid.ok) {
      console.warn(`${stockCode} 校验警告:`, valid.warnings);
    }

    const meta = {
      code: stockCode,
      name: stock.name,
      rowCount: ohlcv.length,
      dateRange: ohlcv.length > 0
        ? [ohlcv[0].date, ohlcv[ohlcv.length - 1].date]
        : [],
      validation: valid.ok ? 'PASS' : 'WARN',
      warnings: valid.warnings,
    };

    const result = { ohlcv, meta };
    cachedData[stockCode] = result;
    return result;
  }

  function validate(ohlcv, code) {
    const warnings = [];

    if (ohlcv.length < 30) {
      warnings.push(`数据行数过少: ${ohlcv.length}`);
    }

    for (let i = 0; i < ohlcv.length; i++) {
      const r = ohlcv[i];
      if (!r.close || r.close <= 0) warnings.push(`第 ${i + 1} 行 close 异常: ${r.close}`);
      if (r.low > r.open || r.low > r.close) warnings.push(`第 ${i + 1} 行 low 高于 open/close`);
      if (r.high < r.open || r.high < r.close) warnings.push(`第 ${i + 1} 行 high 低于 open/close`);
    }

    return { ok: warnings.length === 0, warnings };
  }

  function getStocks() {
    return STOCKS;
  }

  function clearCache() {
    cachedData = {};
  }

  return { loadStock, getStocks, clearCache };
})();
