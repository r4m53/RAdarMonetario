from __future__ import annotations
import json, re, zipfile
from datetime import datetime, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'data'/'master'/'Libro_Maestro_Decisiones.xlsx'
OUTPUT=ROOT/'public'/'data'/'radar-decisiones.json'
SHEETS={'decisions':'Decisiones','participation':'Participacion_Junta','votes':'Votaciones','people':'Personas'}
NS={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
RNS={'p':'http://schemas.openxmlformats.org/package/2006/relationships'}
def col(ref):
 result=0
 for char in re.match(r'[A-Z]+',ref).group(0): result=result*26+ord(char)-64
 return result-1
def number(text):
 if text is None or text=='': return None
 value=float(text); return int(value) if value.is_integer() else value
def date(value): return (datetime(1899,12,30)+timedelta(days=float(value))).strftime('%Y-%m-%d')
def strings(z):
 if 'xl/sharedStrings.xml' not in z.namelist(): return []
 root=ET.fromstring(z.read('xl/sharedStrings.xml'))
 return [''.join(n.text or '' for n in item.findall('.//m:t',NS)) for item in root.findall('m:si',NS)]
def paths(z):
 book=ET.fromstring(z.read('xl/workbook.xml')); rels=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
 targets={r.attrib['Id']:r.attrib['Target'] for r in rels.findall('p:Relationship',RNS)}; result={}
 for sheet in book.findall('m:sheets/m:sheet',NS):
  target=targets[sheet.attrib['{%s}id'%NS['r']]].replace('\\','/').lstrip('/')
  result[sheet.attrib['name']]=target if target.startswith('xl/') else 'xl/'+target
 return result
def rows(z,path,shared):
 root=ET.fromstring(z.read(path)); matrix=[]
 for row in root.findall('m:sheetData/m:row',NS):
  values=[]
  for cell in row.findall('m:c',NS):
   index=col(cell.attrib['r'])
   while len(values)<=index: values.append(None)
   kind=cell.attrib.get('t'); raw=cell.findtext('m:v',default=None,namespaces=NS)
   if kind=='inlineStr': value=''.join(n.text or '' for n in cell.findall('.//m:t',NS))
   elif kind=='s' and raw is not None: value=shared[int(raw)]
   elif kind=='str': value=raw
   elif kind=='b': value=raw=='1'
   else: value=number(raw)
   values[index]=value
  if any(v is not None for v in values): matrix.append(values)
 headers=[str(v) for v in matrix[0]]; records=[]
 for row in matrix[1:]:
  record={h:row[i] if i<len(row) else None for i,h in enumerate(headers)}
  for field in ('Fecha_Decision','Fecha'):
   if isinstance(record.get(field),(int,float)): record[field]=date(record[field])
  records.append(record)
 return records
def graph(decisions,votes):
 dissent={}
 for vote in votes:
  decision_id=vote.get('Decision_ID')
  if not decision_id: continue
  counts=dissent.setdefault(decision_id,{'hawk':0,'dovish':0})
  if vote.get('Tipo_Voto')=='Disenso restrictivo': counts['hawk']+=1
  elif vote.get('Tipo_Voto')=='Disenso acomodaticio': counts['dovish']+=1
 result=[]
 for decision in decisions:
  if decision.get('Tasa_Nueva') is None: continue
  counts=dissent.get(decision['Decision_ID'],{'hawk':0,'dovish':0})
  result.append({
   'Fecha':decision.get('Fecha_Decision'),
   'Decision_ID':decision.get('Decision_ID'),
   'Tasa_Objetivo':decision.get('Tasa_Nueva'),
   'Movimiento_pb':decision.get('Cambio_pb'),
   'Disensos_Hawk':counts['hawk'],
   'Disensos_Dovish':counts['dovish'],
  })
 return result
with zipfile.ZipFile(SOURCE) as z:
 shared=strings(z); sheet_paths=paths(z); payload={key:rows(z,sheet_paths[name],shared) for key,name in SHEETS.items()}
 payload['graph']=graph(payload['decisions'],payload['votes'])
 payload['memberGraph']=payload['graph']
OUTPUT.parent.mkdir(parents=True,exist_ok=True)
OUTPUT.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(f"Generated {OUTPUT} with {len(payload['decisions'])} decisions and {len(payload['votes'])} votes")
