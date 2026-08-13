import json, re, sys, zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {"m":"http://schemas.openxmlformats.org/spreadsheetml/2006/main","r":"http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
REL_NS = {"p":"http://schemas.openxmlformats.org/package/2006/relationships"}

def inspect_book(book_path: Path):
    with zipfile.ZipFile(book_path) as z:
        names=set(z.namelist())
        wb=ET.fromstring(z.read("xl/workbook.xml"))
        rels=ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        relmap={r.attrib["Id"]:r.attrib["Target"] for r in rels}
        shared=[]
        if "xl/sharedStrings.xml" in names:
            root=ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall("m:si",NS): shared.append("".join(t.text or "" for t in si.iterfind(".//m:t",NS)))
        sheets=[]
        for sh in wb.findall("m:sheets/m:sheet",NS):
            target=relmap[sh.attrib[f"{{{NS['r']}}}id"]].lstrip("/")
            if not target.startswith("xl/"): target="xl/"+target
            xml=ET.fromstring(z.read(target))
            dim=xml.find("m:dimension",NS)
            formulas=[]; samples=[]
            for c in xml.findall(".//m:c",NS):
                f=c.find("m:f",NS); v=c.find("m:v",NS)
                if f is not None and f.text: formulas.append({"cell":c.attrib.get("r"),"formula":f.text})
                if len(samples)<40 and v is not None:
                    val=v.text
                    if c.attrib.get("t")=="s" and val and int(val)<len(shared): val=shared[int(val)]
                    samples.append({"cell":c.attrib.get("r"),"value":val})
            sheets.append({"name":sh.attrib["name"],"state":sh.attrib.get("state","visible"),"range":dim.attrib.get("ref") if dim is not None else None,"formulaCount":len(formulas),"formulaSamples":formulas[:25],"valueSamples":samples})
        return {"file":book_path.name,"size":book_path.stat().st_size,"sheets":sheets,"charts":[n for n in names if n.startswith("xl/charts/chart")],"drawings":[n for n in names if n.startswith("xl/drawings/drawing") and n.endswith(".xml")],"tables":[n for n in names if n.startswith("xl/tables/table")],"connections":"xl/connections.xml" in names,"externalLinks":[n for n in names if n.startswith("xl/externalLinks/") and n.endswith(".xml")],"hasVba":"xl/vbaProject.bin" in names,"vbaSize":len(z.read("xl/vbaProject.bin")) if "xl/vbaProject.bin" in names else 0,"definedNames":[{"name":n.attrib.get("name"),"ref":n.text} for n in wb.findall("m:definedNames/m:definedName",NS)]}

for arg in sys.argv[1:]:
    path=Path(arg)
    result=inspect_book(path)
    out=Path(f"{path.stem}-structure.json")
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
    print(out)
