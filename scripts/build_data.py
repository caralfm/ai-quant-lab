#!/usr/bin/env python3
"""读取3只股票的daily CSV + notebook指标CSV, 生成嵌入式 data.js。
确保工具在 file:// 协议下双击即用(无需HTTP服务)。
"""
import csv, json, os, glob

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))      # ai-quant-lab/scripts/
BASE = os.path.dirname(SCRIPT_DIR)                             # ai-quant-lab/
DATA_DIR = os.path.join(BASE, "data", "processed")             # ai-quant-lab/data/processed/
INDICATORS_CSV = os.path.join(BASE, "outputs", "changchuan_indicators.csv")
OUTPUT = os.path.join(BASE, "interactive_tool", "js", "data.js")

STOCKS = [
    {"code": "300604.SZ", "name": "长川科技", "file": "300604.SZ_daily_20250718_20260718.csv"},
    {"code": "688008.SH", "name": "澜起科技", "file": "688008.SH_daily_20250718_20260718.csv"},
    {"code": "000977.SZ", "name": "浪潮信息", "file": "000977.SZ_daily_20250718_20260718.csv"},
]

def read_csv(path):
    """读取CSV, 返回 list[dict], 数值字段转float"""
    rows = []
    with open(path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for r in reader:
            row = {}
            for k, v in r.items():
                k = k.strip() if k else k
                if k in ("open", "high", "low", "close", "pre_close", "change", "pct_chg", "vol", "amount"):
                    try:
                        row[k] = float(v) if v != "" else None
                    except (ValueError, TypeError):
                        row[k] = None
                else:
                    row[k] = v
            rows.append(row)
    return rows

def read_indicators_csv(path):
    """读取notebook产出的指标CSV, 用于数值比对验证"""
    rows = []
    with open(path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for r in reader:
            row = {}
            for k, v in r.items():
                k = k.strip() if k else k
                try:
                    row[k] = float(v) if v != "" else None
                except (ValueError, TypeError):
                    row[k] = None
            rows.append(row)
    return rows

def main():
    stocks_data = {}
    for s in STOCKS:
        path = os.path.join(DATA_DIR, s["file"])
        if not os.path.exists(path):
            print(f"WARNING: {path} not found, skipping {s['code']}")
            continue
        rows = read_csv(path)
        stocks_data[s["code"]] = {
            "code": s["code"],
            "name": s["name"],
            "rows": rows,
            "count": len(rows),
        }
        print(f"  {s['code']} {s['name']}: {len(rows)} rows")

    # notebook指标CSV (仅长川科技, 用于验证)
    ref_data = None
    if os.path.exists(INDICATORS_CSV):
        ref_data = read_indicators_csv(INDICATORS_CSV)
        print(f"  notebook参考指标: {len(ref_data)} rows")

    js = "// 自动生成 - 请勿手动编辑\n"
    js += "// 由 build_data.py 从 data/processed/*.csv 生成\n"
    js += "// 确保工具在 file:// 协议下双击即用\n\n"
    js += "window.STOCK_DATA = " + json.dumps(stocks_data, ensure_ascii=False, separators=(",", ":")) + ";\n\n"
    if ref_data:
        js += "// notebook产出的指标参考值(仅长川科技), 用于D1-D4数值比对验证\n"
        js += "window.NOTEBOOK_INDICATORS = " + json.dumps(ref_data, ensure_ascii=False, separators=(",", ":")) + ";\n"

    with open(OUTPUT, "w", encoding="utf-8") as f:
        f.write(js)
    print(f"\n已生成: {OUTPUT} ({os.path.getsize(OUTPUT)//1024} KB)")

if __name__ == "__main__":
    main()
