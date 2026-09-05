"""Actualiza los libros maestros con el último corte mensual del SIE de Banxico.

La escritura se realiza directamente sobre las partes OOXML para conservar sin
cambios el proyecto VBA, validaciones extendidas, gráficas y demás objetos que
las bibliotecas de hojas de cálculo suelen descartar al guardar un ``.xlsm``.
"""
from __future__ import annotations

import argparse
import calendar
import copy
import math
import re
import shutil
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from datetime import date, datetime
from pathlib import Path

import openpyxl
from lxml import etree, html


ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "data" / "master"
FORECAST_BOOK = MASTER / "banxico_expectativas_pronosticos.xlsm"
OPINION_BOOK = MASTER / "banxico_expectativas_monitor_opiniones.xlsm"
SURVEY_DATE = date(2026, 8, 31)
PUBLICATION_DATE = date(2026, 9, 1)
SIE_MONTH = "Ago 2026"
FORECAST_TABLES = ("CR154", "CR156", "CR163", "CR164", "CR165", "CR168", "CR170", "CR189")
OPINION_TABLES = ("CR180", "CR182", "CR357")
CACHE_DIR = ROOT / "work" / "sie-expectations-cache-202608"

NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
XML = {"x": NS, "r": REL_NS, "pr": PKG_REL_NS}

STAT_FIELDS = {
    "Media": "mean",
    "Mediana": "median",
    "Primer cuartil": "q1",
    "Tercer cuartil": "q3",
    "Mínimo": "min",
    "Máximo": "max",
    "Desviación estándar": "std_dev",
    "Número de respuestas": "n_responses",
}


def compact(value: str) -> str:
    return " ".join(value.split())


def fetch_structure(table_id: str) -> bytes:
    cache = CACHE_DIR / f"{table_id}.html"
    if cache.exists():
        return cache.read_bytes()
    url = (
        "https://www.banxico.org.mx/SieInternet/"
        "consultarDirectorioInternetAction.do?accion=consultarCuadro"
        f"&idCuadro={table_id}&locale=es&sector=24"
    )
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    for attempt, delay in enumerate((0, 5, 15, 30), start=1):
        if delay:
            time.sleep(delay)
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                content = response.read()
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            cache.write_bytes(content)
            time.sleep(2)
            return content
        except urllib.error.HTTPError as error:
            if error.code != 429 or attempt == 4:
                raise
    raise RuntimeError(f"No se pudo descargar {table_id}")


def parse_structure(table_id: str) -> list[dict[str, object]]:
    document = html.fromstring(fetch_structure(table_id))
    titles: dict[str, str] = {}
    for row in document.xpath('//tr[starts-with(@id, "nodo_")]'):
        cells = row.xpath('.//td[contains(@class, "titulo")]')
        if cells:
            titles[row.get("id")] = compact(cells[0].text_content())

    series = []
    for checkbox in document.xpath('//input[@name="series"]'):
        row = checkbox.xpath('ancestor::tr[starts-with(@id, "nodo_")][1]')[0]
        node_id = row.get("id")
        parts = node_id.split("_")
        path = []
        for length in range(2, len(parts)):
            parent_id = "_".join(parts[:length])
            if parent_id in titles:
                path.append(titles[parent_id])
        labels = row.xpath('.//td[contains(@class, "tdDescripcion")]')
        label = compact(labels[-1].text_content()) if labels else ""
        dates = [compact(x.text_content()) for x in row.xpath('.//table[contains(@class, "tablaObservaciones")]//th')]
        values = [compact(x.text_content()) for x in row.xpath('.//table[contains(@class, "tablaObservaciones")]//td[contains(@class, "tdObservacion")]')]
        series.append({
            "series_id": checkbox.get("value"),
            "node_id": node_id,
            "path": tuple(path),
            "label": label,
            "observations": dict(zip(dates, values)),
        })
    if not series:
        raise RuntimeError(f"{table_id}: no se localizaron series SIE")
    return series


def number(value: object) -> float | int | None:
    if value is None:
        return None
    text = str(value).strip().replace(",", "")
    if not text or text in {"N/E", "N/D", "NA"}:
        return None
    result = float(text)
    return int(result) if result.is_integer() else result


def grouped_statistics(series: list[dict[str, object]]) -> list[dict[str, object]]:
    groups: dict[tuple[str, ...], dict[str, object]] = {}
    for item in series:
        path = item["path"]
        group = groups.setdefault(path, {"path": path, "series": {}})
        group["series"][item["label"]] = item
    output = []
    for group in groups.values():
        values = {}
        ids = {}
        for label, field in STAT_FIELDS.items():
            item = group["series"].get(label)
            if item:
                values[field] = number(item["observations"].get(SIE_MONTH))
                ids[field] = item["series_id"]
            else:
                values[field] = None
        if values["mean"] is not None:
            output.append({"path": group["path"], "values": values, "series_ids": ids})
    return output


def read_data_rows(book: Path) -> tuple[list[str], list[dict[str, object]]]:
    workbook = openpyxl.load_workbook(book, read_only=True, data_only=True, keep_vba=True)
    sheet = workbook["DATA_RAW"]
    headers = [cell.value for cell in sheet[5]]
    rows = [dict(zip(headers, values)) for values in sheet.iter_rows(min_row=6, values_only=True) if values[0] is not None]
    workbook.close()
    return headers, rows


def relative_offset(text: str, unit: str) -> int:
    match = re.search(rf"{unit}\s+t([+-]\d+)?", text, flags=re.IGNORECASE)
    if match:
        return int(match.group(1) or 0)
    if "anterior" in text.lower():
        return -1
    if "actual" in text.lower() or "en curso" in text.lower():
        return 0
    word_offsets = {
        "siguiente": 1,
        "dos": 2,
        "tres": 3,
        "cuatro": 4,
        "cinco": 5,
        "seis": 6,
        "siete": 7,
        "ocho": 8,
        "nueve": 9,
    }
    lowered = text.lower()
    for word, offset in word_offsets.items():
        if word in lowered:
            return offset
    raise ValueError(f"No se pudo derivar el periodo relativo de: {text}")


def add_quarters(year: int, quarter: int, offset: int) -> tuple[int, int]:
    index = year * 4 + quarter - 1 + offset
    return index // 4, index % 4 + 1


def forecast_identity(table_id: str, path: tuple[str, ...]) -> dict[str, object]:
    period_text = path[-1]
    if table_id in {"CR154", "CR163", "CR170", "CR189"}:
        target_year = SURVEY_DATE.year + relative_offset(period_text, "año")
        indicator = {
            "CR163": "GDP_REAL",
            "CR170": "CETE28",
            "CR189": "OTHER",
        }.get(table_id)
        if table_id == "CR154":
            indicator = "INF_SUB" if any("subyacente" in part.lower() for part in path) else "INF_GEN"
        return {
            "indicator_id": indicator,
            "forecast_type": "Cierre anual",
            "target_period": str(target_year),
            "target_year": target_year,
            "target_quarter": None,
            "target_date": date(target_year, 12, 31),
            "period_id": f"A_{target_year}",
        }
    if table_id in {"CR165", "CR168"}:
        offset = relative_offset(period_text, "trimestre")
        current_quarter = (SURVEY_DATE.month - 1) // 3 + 1
        target_year, target_quarter = add_quarters(SURVEY_DATE.year, current_quarter, offset)
        target_month = target_quarter * 3
        target_date = date(target_year, target_month, calendar.monthrange(target_year, target_month)[1])
        return {
            "indicator_id": "GDP_REAL" if table_id == "CR165" else "FONDEO",
            "forecast_type": "Cierre trimestral",
            "target_period": f"{target_quarter}T{str(target_year)[-2:]}",
            "target_year": target_year,
            "target_quarter": target_quarter,
            "target_date": target_date,
            "period_id": f"Q_{target_year}Q{target_quarter}",
        }
    if table_id == "CR164":
        return {"indicator_id": "GDP_REAL", "forecast_type": "Largo plazo", "target_period": "LT_10Y", "target_year": None, "target_quarter": None, "target_date": None, "period_id": "LT_10Y"}
    if table_id == "CR156":
        indicator = "INF_SUB" if any("subyacente" in part.lower() for part in path) else "INF_GEN"
        period_id = "LT_1_4Y" if "uno a cuatro" in period_text.lower() else "LT_5_8Y"
        return {"indicator_id": indicator, "forecast_type": "Largo plazo", "target_period": period_id, "target_year": None, "target_quarter": None, "target_date": None, "period_id": period_id}
    raise ValueError(table_id)


def month_gap(start: date, end: date | None) -> int | None:
    if end is None:
        return None
    return (end.year - start.year) * 12 + end.month - start.month


def build_forecasts(scraped: dict[str, list[dict[str, object]]], current: list[dict[str, object]]) -> list[dict[str, object]]:
    templates: dict[tuple[str, str], dict[str, object]] = {}
    previous: dict[tuple[str, str], dict[str, object]] = {}
    for row in current:
        templates.setdefault((row["source_table_id"], row["indicator_id"]), row)
        if str(row.get("survey_date"))[:10] == "2026-07-31":
            previous[(row["indicator_id"], row["period_id"])] = row

    rows = []
    for table_id in FORECAST_TABLES:
        for group in grouped_statistics(scraped[table_id]):
            identity = forecast_identity(table_id, group["path"])
            template = templates[(table_id, identity["indicator_id"])]
            row = dict(template)
            target_date = identity["target_date"]
            horizon = month_gap(SURVEY_DATE, target_date)
            row.update(identity)
            row.update(group["values"])
            row.update({
                "survey_date": SURVEY_DATE.isoformat(),
                "survey_year": SURVEY_DATE.year,
                "survey_month": SURVEY_DATE.month,
                "publication_date": PUBLICATION_DATE,
                "horizon_months": horizon,
                "horizon_quarters": math.ceil(horizon / 3) if horizon is not None and identity["target_quarter"] else None,
                "horizon_label": f"T-{horizon}" if horizon is not None else None,
                "IQR": group["values"]["q3"] - group["values"]["q1"] if group["values"]["q3"] is not None and group["values"]["q1"] is not None else None,
                "Range": group["values"]["max"] - group["values"]["min"] if group["values"]["max"] is not None and group["values"]["min"] is not None else None,
                "Mean_Median_Gap": group["values"]["mean"] - group["values"]["median"] if group["values"]["median"] is not None else None,
                "actual_value": None,
                "forecast_error": None,
                "absolute_error": None,
                "squared_error": None,
                "source_series_id": f"SIE-{table_id}-{identity['target_period']}",
                "notes": group["path"][-1],
                "chart_date": target_date,
                "survey_id": "SURV_202608",
                "forecast_id": f"SURV_202608|{identity['indicator_id']}|{identity['period_id']}",
                "Column1": SURVEY_DATE.isoformat(),
            })
            prior = previous.get((identity["indicator_id"], identity["period_id"]))
            row["Revision_1M"] = row["median"] - prior["median"] if prior and row["median"] is not None and prior.get("median") is not None else None
            row["Dispersion_Change"] = row["IQR"] - prior["IQR"] if prior and row["IQR"] is not None and prior.get("IQR") is not None else None
            rows.append(row)
    return rows


def opinion_group(table_id: str, path: tuple[str, ...]) -> str:
    text = " ".join(path).lower()
    if table_id == "CR180":
        if "clima de negocios" in text:
            return "Clima de negocios próximos 6 meses"
        if "mejor que hace un año" in text:
            return "Economía vs hace un año"
        return "Coyuntura para inversiones"
    if table_id == "CR182":
        return "Distribución porcentual de respuestas" if "distribución porcentual" in text else "Nivel promedio de preocupación"
    if "factor que obstaculiza" in text:
        return "Competencia como obstáculo al crecimiento"
    if "intensidad de la competencia" in text:
        return "Intensidad de competencia"
    if "sectores con problemas" in text:
        return "Sectores con problemas de competencia"
    return "Obstáculos para hacer negocios"


def build_opinions(scraped: dict[str, list[dict[str, object]]], current: list[dict[str, object]]) -> list[dict[str, object]]:
    latest = [row for row in current if str(row.get("survey_date"))[:10] == "2026-07-31"]
    templates = {(row["source_table_id"], row["forecast_type"], row["target_period"]): row for row in latest}
    rows = []
    for table_id in OPINION_TABLES:
        for item in scraped[table_id]:
            value = number(item["observations"].get(SIE_MONTH))
            group = opinion_group(table_id, item["path"])
            key = (table_id, group, item["label"])
            if key not in templates:
                continue
            row = dict(templates[key])
            is_count = item["label"] in {"Número de respuestas", "Número de analistas que respondieron"}
            row.update({
                "survey_date": SURVEY_DATE.isoformat(),
                "survey_year": SURVEY_DATE.year,
                "survey_month": SURVEY_DATE.month,
                "publication_date": PUBLICATION_DATE,
                "mean": None if is_count else value,
                "n_responses": value if is_count else None,
                "source_series_id": f"SIE-{table_id}-{item['label']}",
                "survey_id": "SURV_202608",
                "forecast_id": f"SURV_202608|{row['indicator_id']}|{row['period_id']}",
            })
            rows.append(row)
    return rows


def column_name(index: int) -> str:
    name = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        name = chr(65 + remainder) + name
    return name


def excel_serial(value: date) -> int:
    return (value - date(1899, 12, 30)).days


def set_cell_value(cell: etree._Element, value: object) -> None:
    for child in list(cell):
        cell.remove(child)
    if value is None:
        cell.attrib.pop("t", None)
        return
    if isinstance(value, datetime):
        value = value.date()
    if isinstance(value, date):
        cell.attrib.pop("t", None)
        etree.SubElement(cell, f"{{{NS}}}v").text = str(excel_serial(value))
    elif isinstance(value, bool):
        cell.set("t", "b")
        etree.SubElement(cell, f"{{{NS}}}v").text = "1" if value else "0"
    elif isinstance(value, (int, float)):
        cell.attrib.pop("t", None)
        etree.SubElement(cell, f"{{{NS}}}v").text = repr(value)
    else:
        cell.set("t", "inlineStr")
        inline = etree.SubElement(cell, f"{{{NS}}}is")
        etree.SubElement(inline, f"{{{NS}}}t").text = str(value)


def sheet_path(parts: dict[str, bytes], sheet_name: str) -> str:
    workbook = etree.fromstring(parts["xl/workbook.xml"])
    rel_id = workbook.xpath(f'//x:sheet[@name="{sheet_name}"]/@r:id', namespaces=XML)[0]
    relationships = etree.fromstring(parts["xl/_rels/workbook.xml.rels"])
    target = relationships.xpath(f'//pr:Relationship[@Id="{rel_id}"]/@Target', namespaces=XML)[0]
    return "xl/" + target.lstrip("/")


def append_rows(parts: dict[str, bytes], sheet_name: str, headers: list[str], rows: list[dict[str, object]]) -> None:
    path = sheet_path(parts, sheet_name)
    document = etree.fromstring(parts[path])
    sheet_data = document.find(f"{{{NS}}}sheetData")
    existing_rows = sheet_data.findall(f"{{{NS}}}row")
    last_row = existing_rows[-1]
    last_index = int(last_row.get("r"))
    styles = {re.match(r"[A-Z]+", cell.get("r")).group(): cell.get("s") for cell in last_row.findall(f"{{{NS}}}c")}
    for offset, values in enumerate(rows, start=1):
        row_index = last_index + offset
        row = etree.SubElement(sheet_data, f"{{{NS}}}row", r=str(row_index))
        for column_index, header in enumerate(headers, start=1):
            column = column_name(column_index)
            attributes = {"r": f"{column}{row_index}"}
            if styles.get(column) is not None:
                attributes["s"] = styles[column]
            cell = etree.SubElement(row, f"{{{NS}}}c", **attributes)
            set_cell_value(cell, values.get(header))
    new_last = last_index + len(rows)
    dimension = document.find(f"{{{NS}}}dimension")
    if dimension is not None:
        start = dimension.get("ref").split(":")[0]
        dimension.set("ref", f"{start}:{column_name(len(headers))}{new_last}")
    parts[path] = etree.tostring(document, xml_declaration=True, encoding="UTF-8", standalone=True)
    extend_sheet_tables(parts, path, new_last)


def extend_sheet_tables(parts: dict[str, bytes], worksheet_path: str, new_last: int) -> None:
    rel_path = str(Path(worksheet_path).parent / "_rels" / (Path(worksheet_path).name + ".rels")).replace("\\", "/")
    if rel_path not in parts:
        return
    relationships = etree.fromstring(parts[rel_path])
    for target in relationships.xpath('//pr:Relationship[contains(@Type, "/table")]/@Target', namespaces=XML):
        table_path = str((Path(worksheet_path).parent / target).resolve()).replace("\\", "/")
        table_path = table_path.split("/xl/", 1)[-1]
        table_path = "xl/" + table_path
        if table_path not in parts:
            table_path = "xl/" + target.replace("../", "")
        if table_path not in parts:
            continue
        table = etree.fromstring(parts[table_path])
        start, end = table.get("ref").split(":")
        end_col = re.match(r"[A-Z]+", end).group()
        table.set("ref", f"{start}:{end_col}{new_last}")
        auto_filter = table.find(f"{{{NS}}}autoFilter")
        if auto_filter is not None:
            auto_filter.set("ref", table.get("ref"))
        parts[table_path] = etree.tostring(table, xml_declaration=True, encoding="UTF-8", standalone=True)


def update_cell(parts: dict[str, bytes], sheet_name: str, address: str, value: object) -> None:
    path = sheet_path(parts, sheet_name)
    document = etree.fromstring(parts[path])
    cells = document.xpath(f'//x:c[@r="{address}"]', namespaces=XML)
    if not cells:
        raise KeyError(f"{sheet_name}!{address}")
    set_cell_value(cells[0], value)
    parts[path] = etree.tostring(document, xml_declaration=True, encoding="UTF-8", standalone=True)


def update_book(book: Path, headers: list[str], rows: list[dict[str, object]], opinion: bool) -> None:
    with zipfile.ZipFile(book, "r") as archive:
        parts = {name: archive.read(name) for name in archive.namelist()}
        infos = {info.filename: info for info in archive.infolist()}
    append_rows(parts, "DATA_RAW", headers, rows)

    survey_headers = ["survey_id", "survey_date", "survey_year", "survey_month", "notes"]
    append_rows(parts, "SURVEY_MAP", survey_headers, [{
        "survey_id": "SURV_202608",
        "survey_date": SURVEY_DATE.isoformat(),
        "survey_year": 2026,
        "survey_month": 8,
        "notes": "Último día del mes de referencia",
    }])
    if opinion:
        update_cell(parts, "README", "B5", "Información histórica disponible hasta agosto de 2026.")
        for row in range(3, 6):
            update_cell(parts, "SERIES_MAP", f"H{row}", "2026-08")
    else:
        update_cell(parts, "README", "B5", "2026-09-04 (actualizado con la encuesta de agosto de 2026, publicada el 2026-09-01).")
        for row in range(3, 16):
            update_cell(parts, "SERIES_MAP", f"H{row}", "2026-08")

    with tempfile.NamedTemporaryFile(dir=book.parent, suffix=".xlsm", delete=False) as temporary:
        temporary_path = Path(temporary.name)
    try:
        with zipfile.ZipFile(temporary_path, "w") as archive:
            for name, content in parts.items():
                info = copy.copy(infos[name])
                archive.writestr(info, content)
        shutil.move(temporary_path, book)
    finally:
        temporary_path.unlink(missing_ok=True)


def validate_rows(forecasts: list[dict[str, object]], opinions: list[dict[str, object]]) -> None:
    forecast_keys = [(row["survey_id"], row["indicator_id"], row["period_id"]) for row in forecasts]
    opinion_keys = [(row["survey_id"], row["indicator_id"], row["forecast_type"], row["period_id"]) for row in opinions]
    if len(forecast_keys) != len(set(forecast_keys)):
        raise RuntimeError("Pronósticos duplicados en el nuevo corte")
    if len(opinion_keys) != len(set(opinion_keys)):
        raise RuntimeError("Opiniones duplicadas en el nuevo corte")
    if len(forecasts) != 35:
        raise RuntimeError(f"Se esperaban 35 pronósticos de agosto y se obtuvieron {len(forecasts)}")
    if len(opinions) != 116:
        raise RuntimeError(f"Se esperaban 116 opiniones de agosto y se obtuvieron {len(opinions)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Escribe los dos libros; sin esta opción solo valida la descarga.")
    args = parser.parse_args()

    scraped = {table: parse_structure(table) for table in FORECAST_TABLES + OPINION_TABLES}
    forecast_headers, current_forecasts = read_data_rows(FORECAST_BOOK)
    opinion_headers, current_opinions = read_data_rows(OPINION_BOOK)
    forecasts = build_forecasts(scraped, current_forecasts)
    opinions = build_opinions(scraped, current_opinions)
    validate_rows(forecasts, opinions)
    print(f"Encuesta {SURVEY_DATE.isoformat()}: {len(forecasts)} pronósticos y {len(opinions)} opiniones")
    print("Indicadores:", sorted({row["indicator_id"] for row in forecasts}))
    if args.apply:
        existing_forecasts = sum(str(row.get("survey_date"))[:10] == SURVEY_DATE.isoformat() for row in current_forecasts)
        existing_opinions = sum(str(row.get("survey_date"))[:10] == SURVEY_DATE.isoformat() for row in current_opinions)
        if existing_forecasts == len(forecasts) and existing_opinions == len(opinions):
            print("El corte ya está incorporado; no se realizaron cambios.")
            return
        if existing_forecasts or existing_opinions:
            raise RuntimeError(
                "Se detectó una carga parcial del corte: "
                f"{existing_forecasts} pronósticos y {existing_opinions} opiniones."
            )
        update_book(FORECAST_BOOK, forecast_headers, forecasts, opinion=False)
        update_book(OPINION_BOOK, opinion_headers, opinions, opinion=True)
        print("Libros maestros actualizados.")
    else:
        print("Validación en seco completada; no se modificaron archivos.")


if __name__ == "__main__":
    main()
