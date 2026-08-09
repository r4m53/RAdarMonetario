"""Transforma el libro maestro de pronósticos en JSON web auditable.

Uso: python scripts/extract_forecasts_workbook.py [ruta-al-xlsm]
"""
from __future__ import annotations
import json, math, sys
from collections import Counter
from datetime import date, datetime
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "master" / "pronosticos_banxico_historico.xlsm"
OUT = ROOT / "public" / "data" / "pronosticos-banxico.json"
REPORT = ROOT / "data" / "forecast-validation-report.json"

def iso(v):
    if isinstance(v, (datetime, date)): return v.date().isoformat() if isinstance(v, datetime) else v.isoformat()
    return str(v)[:10] if v else None
def clean(v):
    if v is None or (isinstance(v, float) and math.isnan(v)): return None
    if isinstance(v, (datetime, date)): return iso(v)
    return v
def rows(ws):
    it = ws.iter_rows(values_only=True); headers = [str(x) if x is not None else "" for x in next(it)]
    return [{headers[i]: clean(v) for i, v in enumerate(row) if i < len(headers) and headers[i]} for row in it if any(v is not None for v in row)]

wb = openpyxl.load_workbook(SOURCE, read_only=True, data_only=True, keep_vba=True)
decisions = rows(wb["Decisiones"])
forecasts = rows(wb["Pronosticos"])
quarterly = rows(wb["Series_trimestrales"])
categories = rows(wb["Catalogos"])

decision_out = [{"id":r["decision_id"],"date":iso(r["fecha_decision"]),"status":r.get("estado"),"hasForecasts":r.get("cuadro_anual_disponible")=="Sí","source":r.get("url_fuente")} for r in decisions]
forecast_out = [{"id":r["forecast_id"],"decisionId":r["decision_id"],"date":iso(r["fecha_decision"]),"category":r["categoria_codigo"],"period":r["periodo"],"value":r.get("valor_porcentaje"),"source":r.get("url_fuente")} for r in forecasts]
observed = {}
for r in quarterly:
    period, variable = r.get("trimestre"), r.get("variable")
    if not period or period > "2026-T2" or variable not in {"INPC","SUB"}: continue
    observed.setdefault(period, {})[variable] = r.get("inflacion_anual_indices_promedio")
    observed[period][f"{variable}_DES"] = r.get("inflacion_trimestral_desest_anualizada")

decision_dates = {d["date"]: d["id"] for d in decision_out if d["status"] == "Efectiva"}
try:
    existing = json.loads((ROOT/"public/data/radar-decisiones.json").read_text(encoding="utf-8"))
    crosswalk = [{"forecastDecisionId":d["id"],"decisionExplorerId":decision_dates_ex[d["date"]],"date":d["date"]} for d in decision_out if d["status"]=="Efectiva" and d["date"] in (decision_dates_ex := {x["Fecha_Decision"]:x["Decision_ID"] for x in existing["decisions"]})]
except Exception: crosswalk=[]

cat_config = [
 {"code":"INPC","label":"INPC","color":"#f28c28"}, {"code":"SUB","label":"Subyacente","color":"#4da3ff"},
 {"code":"INPC_DES","label":"INPC desestacionalizado","color":"#33c37d"}, {"code":"SUB_DES","label":"Subyacente desestacionalizado","color":"#c084fc"},
]
payload={"metadata":{"generatedAt":datetime.now().astimezone().isoformat(),"source":SOURCE.name,"biasDefinition":"Pronóstico − Observado","lastObservedPeriod":"2026-T2"},"config":{"categories":cat_config,"horizons":list(range(-16,1)),"cohorts":[{"id":"2-4","label":"Entre 2% y 4%","min":2,"max":4,"color":"#33c37d"},{"id":"4-5","label":"Mayor a 4% y hasta 5%","min":4,"max":5,"color":"#f2c94c"},{"id":"gt5","label":"Mayor a 5%","min":5,"max":None,"color":"#ef6b6b"}]},"decisions":decision_out,"forecasts":forecast_out,"observed":observed,"decisionCrosswalk":crosswalk}

duplicate_forecasts=[k for k,n in Counter((x["decisionId"],x["period"],x["category"]) for x in forecast_out).items() if n>1]
ambiguous_dates=[k for k,n in Counter(x["date"] for x in decision_out).items() if n>1]
report={"source":str(SOURCE),"decisions":len(decision_out),"effectiveDecisions":sum(x["status"]=="Efectiva" for x in decision_out),"forecasts":len(forecast_out),"periods":len({x["period"] for x in forecast_out}),"categories":sorted({x["category"] for x in forecast_out}),"nullForecastValues":sum(x["value"] is None for x in forecast_out),"duplicateForecastKeys":duplicate_forecasts,"ambiguousDecisionDates":ambiguous_dates,"crosswalkMatches":len(crosswalk),"crosswalkUnmatchedEffective":[x["id"] for x in decision_out if x["status"]=="Efectiva" and not any(c["forecastDecisionId"]==x["id"] for c in crosswalk)]}
OUT.parent.mkdir(parents=True,exist_ok=True); REPORT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps(payload,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
print(json.dumps(report,ensure_ascii=False,indent=2))
if duplicate_forecasts or ambiguous_dates: raise SystemExit(2)

