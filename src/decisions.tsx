import { useEffect, useMemo, useRef, useState } from "react";
import { AppBar, Box, Button, Chip, Container, Divider, FormControl, FormControlLabel, IconButton, InputLabel, MenuItem, Paper, Radio, RadioGroup, Select, Stack, Tab, Tabs, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, TextField, Toolbar, Typography } from "@mui/material";
import { ArrowBack, ArrowForward, Home as HomeIcon } from "@mui/icons-material";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useNavigate, useSearchParams } from "react-router-dom";
import { loadDecisionsData, validVote, voteSymbol, type Decision, type DecisionsData, type GraphPoint, type Person, type Vote } from "./decisions-data";

const logoSrc = `${import.meta.env.BASE_URL}logo.png`;
const fmtDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
const fmtShort = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
const fmtMonthYear = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("es-MX", { month: "short", year: "numeric" });
const fmtRate = (value: number | null) => value == null ? "No disponible" : `${value.toFixed(2)}%`;
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const chartTooltip = { background: "#111", border: "1px solid #f28c28", borderRadius: 2 };

export default function DecisionsRadar() {
  const navigate = useNavigate();
  const [data, setData] = useState<DecisionsData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState(0);
  useEffect(() => { loadDecisionsData().then(setData).catch((e: Error) => setError(e.message)); }, []);
  if (error) return <Container sx={{ py: 10 }}><Typography color="error">{error}</Typography></Container>;
  if (!data) return <Box className="loading">Cargando Radar de Decisiones…</Box>;
  return <Box>
    <AppBar position="sticky" elevation={0} color="transparent" sx={{ backdropFilter: "blur(14px)", borderBottom: "1px solid #282828" }}><Toolbar sx={{ gap: 2 }}>
      <IconButton aria-label="Volver al inicio" onClick={() => navigate("/")}><HomeIcon /></IconButton>
      <Box sx={{ flexGrow: 1 }}><img className="brand-logo header-logo" src={logoSrc} alt="RAdarMonetario · Señas y Expectativas" /></Box>
      <Typography className="decision-module-title">Radar de Decisiones · Junta BM</Typography>
    </Toolbar></AppBar>
    <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" className="tabs decision-tabs"><Tab label="Decisiones" /><Tab label="Integrantes" /><Tab label="Histórico de integrantes" /><Tab label="Metodología" /></Tabs>
    <Container maxWidth={false} sx={{ px: { xs: 1.5, md: 3 }, py: 3 }}>
      {tab === 0 && <DecisionsTab data={data} />}
      {tab === 1 && <MembersTab data={data} />}
      {tab === 2 && <HistoricalMembersTab data={data} />}
      {tab === 3 && <DecisionsMethodology />}
    </Container>
  </Box>;
}

function DecisionChart({ data, activeId, onSelect, member = false }: { data: GraphPoint[]; activeId?: string; onSelect?: (id: string) => void; member?: boolean }) {
  const visible = data.filter(point => point.Tasa_Objetivo > 0);
  return <Paper className="decision-chart"><Typography variant="overline" color="primary">{member ? "HISTORIA DEL INTEGRANTE" : "HISTORIA DE DECISIONES MONETARIAS Y DISENSOS"}</Typography>
    <ResponsiveContainer width="100%" height={330}><ComposedChart data={visible} onClick={(state: unknown) => { const item=(state as {activePayload?:Array<{payload?:GraphPoint}>})?.activePayload?.[0]?.payload; if(item && onSelect) onSelect(item.Decision_ID); }}>
      <CartesianGrid stroke="#262626"/><XAxis dataKey="Fecha" tickFormatter={fmtMonthYear} minTickGap={38}/><YAxis yAxisId="rate" tickFormatter={(v:number)=>`${v}%`}/><YAxis yAxisId="votes" orientation="right" domain={[0, member ? 1 : 2]} allowDecimals={false}/>
      <Tooltip labelFormatter={(v)=>fmtDate(String(v))} contentStyle={chartTooltip}/><Legend/>
      <Bar yAxisId="votes" dataKey="Disensos_Hawk" name="Disensos restrictivos" stackId="votes" fill="#f28c28" />
      <Bar yAxisId="votes" dataKey="Disensos_Dovish" name="Disensos expansivos" stackId="votes" fill="#4da3ff" />
      <Line yAxisId="rate" type="stepAfter" dataKey="Tasa_Objetivo" name="Tasa objetivo" stroke="#e8e8e8" strokeWidth={2.2} dot={(props: {cx?:number;cy?:number;payload?:GraphPoint}) => <circle cx={props.cx} cy={props.cy} r={props.payload?.Decision_ID===activeId?5:1.8} fill={props.payload?.Decision_ID===activeId?"#f28c28":"#e8e8e8"} />}/>
    </ComposedChart></ResponsiveContainer>
  </Paper>;
}

function DecisionsTab({ data }: { data: DecisionsData }) {
  const decisions = data.decisions;
  const [params] = useSearchParams();
  const linkedIndex = decisions.findIndex(item=>item.Decision_ID===params.get("decision"));
  const [index, setIndex] = useState(linkedIndex>=0?linkedIndex:decisions.length - 2);
  const decision = decisions[index];
  const selectId = (id: string) => { const next=decisions.findIndex(item=>item.Decision_ID===id); if(next>=0)setIndex(next); };
  const windowStart = Math.max(0, Math.min(index - 5, decisions.length - 11));
  const context = decisions.slice(windowStart, windowStart + 11);
  const participants = data.participation.filter(row => row.Decision_ID === decision.Decision_ID);
  const governorId = decision.Fecha_Decision >= "2022-01-01" ? "P019" : "P014";
  const people = (participants.map(row => data.people.find(person => person.Persona_ID === row.Persona_ID)).filter(Boolean) as Person[]).sort((a,b) => a.Persona_ID === governorId ? -1 : b.Persona_ID === governorId ? 1 : a.Persona_ID.localeCompare(b.Persona_ID));
  const activeDate = new Date(`${decision.Fecha_Decision}T00:00:00`);
  const yearAgo = new Date(activeDate); yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  return <Stack spacing={3}>
    <Selector title="Fecha seleccionada" value={decision.Fecha_Decision} items={decisions.map(d=>({value:d.Fecha_Decision,label:fmtDate(d.Fecha_Decision)}))} onChange={value=>setIndex(decisions.findIndex(d=>d.Fecha_Decision===value))} onPrevious={()=>setIndex(i=>Math.max(0,i-1))} onNext={()=>setIndex(i=>Math.min(decisions.length-1,i+1))} previousDisabled={index===0} nextDisabled={index===decisions.length-1}/>
    <DecisionChart data={data.graph} activeId={decision.Decision_ID} onSelect={selectId}/>
    <SectionTitle>Resumen de la decisión seleccionada</SectionTitle>
    <Box className="decision-summary"><Metric label="Fecha" value={fmtDate(decision.Fecha_Decision)}/><Metric label="Tipo de reunión" value={decision.Tipo_Reunion}/><Metric label="Tasa anterior" value={fmtRate(decision.Tasa_Anterior)}/><Metric label="Movimiento (pb)" value={decision.Cambio_pb == null ? "No disponible" : String(decision.Cambio_pb)}/><Metric label="Nueva tasa" value={fmtRate(decision.Tasa_Nueva)}/><Metric label="Dirección" value={decision.Direccion_Decision}/><Metric label="¿Fue unánime?" value={decision.Decision_Unanime}/><Metric label="Número de disensos" value={decision.Numero_Disensos == null ? "No disponible" : String(decision.Numero_Disensos)}/></Box>
    <SectionTitle>Contexto histórico · cinco decisiones anteriores y cinco posteriores</SectionTitle>
    <TableContainer component={Paper}><Table size="small" className="context-table"><TableHead><TableRow><TableCell>Dato</TableCell>{context.map(d=><TableCell key={d.Decision_ID} className={d.Decision_ID===decision.Decision_ID?"active-context":""}>{fmtShort(d.Fecha_Decision)}</TableCell>)}</TableRow></TableHead><TableBody>
      <TableRow><TableCell>Tasa</TableCell>{context.map(d=><TableCell key={d.Decision_ID}>{fmtRate(d.Tasa_Nueva)}</TableCell>)}</TableRow>
      <TableRow><TableCell>Movimiento</TableCell>{context.map(d=><TableCell key={d.Decision_ID}>{d.Direccion_Decision==="Sube"?"↑":d.Direccion_Decision==="Baja"?"↓":"="}</TableCell>)}</TableRow>
    </TableBody></Table></TableContainer>
    <SectionTitle>Tabla de votación</SectionTitle>
    <TableContainer component={Paper}><Table size="small" className="vote-table"><TableHead><TableRow><TableCell>Integrante</TableCell>{context.map(d=><TableCell key={d.Decision_ID}>{fmtShort(d.Fecha_Decision)}</TableCell>)}</TableRow></TableHead><TableBody>{people.map(person=><TableRow key={person.Persona_ID}><TableCell>{person.Nombre}</TableCell>{context.map(d=>{const part=data.participation.find(p=>p.Decision_ID===d.Decision_ID&&p.Persona_ID===person.Persona_ID);const vote=data.votes.find(v=>v.Decision_ID===d.Decision_ID&&v.Persona_ID===person.Persona_ID);return <TableCell key={d.Decision_ID} className={`vote-symbol vote-${vote?.Tipo_Voto?.toLowerCase().replaceAll(" ","-")??"none"}`}>{voteSymbol(vote,part)}</TableCell>})}</TableRow>)}</TableBody></Table></TableContainer>
    <Typography variant="caption" color="text.secondary">● consenso ▲ disenso restrictivo ▼ disenso expansivo ○ presente sin voto identificable — fuera de la Junta ✕ ausencia documentada ? no verificable</Typography>
    <SectionTitle>Estadísticas de votación hasta la decisión seleccionada</SectionTitle>
    <VotingStats data={data} people={people} until={activeDate} since={yearAgo}/>
  </Stack>;
}

function MembersTab({ data }: { data: DecisionsData }) {
  const eligible = useMemo(() => data.people.filter(person => data.participation.some(p => p.Persona_ID === person.Persona_ID)).sort((a,b) => a.Nombre.localeCompare(b.Nombre, "es")), [data]);
  const [personId, setPersonId] = useState(eligible.find(p => p.Nombre.includes("Jonathan Heath"))?.Persona_ID ?? eligible[0].Persona_ID);
  const dates = useMemo(() => (data.participation.filter(p => p.Persona_ID === personId).map(p => data.decisions.find(d => d.Decision_ID === p.Decision_ID)).filter(Boolean) as Decision[]).sort((a,b) => a.Fecha_Decision.localeCompare(b.Fecha_Decision)), [data, personId]);
  const person = data.people.find(p => p.Persona_ID === personId)!;
  const start = dates[0].Fecha_Decision;
  const end = dates[dates.length - 1].Fecha_Decision;
  const boardGraph = data.graph.filter(point => point.Fecha >= start && point.Fecha <= end);
  const ownGraph = boardGraph.map(point => {
    const vote = data.votes.find(v => v.Decision_ID === point.Decision_ID && v.Persona_ID === personId);
    return { ...point, Disensos_Hawk: vote?.Tipo_Voto === "Disenso restrictivo" ? 1 : 0, Disensos_Dovish: vote?.Tipo_Voto === "Disenso acomodaticio" ? 1 : 0 };
  });
  const until = new Date(`${end}T00:00:00`);
  const since = new Date(until); since.setFullYear(since.getFullYear() - 1);
  const dissentVotes = data.votes.filter(v => v.Persona_ID === personId && ["Disenso restrictivo", "Disenso acomodaticio"].includes(v.Tipo_Voto)).map(v => ({ vote: v, decision: data.decisions.find(d => d.Decision_ID === v.Decision_ID)! })).filter(item => item.decision && item.decision.Fecha_Decision >= start && item.decision.Fecha_Decision <= end);
  return <Stack spacing={3}>
    <Paper className="member-selector">
      <FormControl size="small" sx={{ minWidth: 280 }}><InputLabel>Integrante</InputLabel><Select label="Integrante" value={personId} onChange={e => setPersonId(e.target.value)}>{eligible.map(p => <MenuItem key={p.Persona_ID} value={p.Persona_ID}>{p.Nombre}</MenuItem>)}</Select></FormControl>
      <Box className="member-period"><Typography variant="caption" color="text.secondary">Periodo en la Junta</Typography><Typography>{fmtDate(start)} — {fmtDate(end)}</Typography></Box>
    </Paper>
    <DecisionChart data={boardGraph} activeId={dates[dates.length - 1].Decision_ID} />
    <DecisionChart data={ownGraph} activeId={dates[dates.length - 1].Decision_ID} member />
    <Box className="member-bottom"><Box><SectionTitle>Disensos del integrante durante su periodo en la Junta</SectionTitle><TableContainer component={Paper}><Table size="small"><TableHead><TableRow><TableCell>Fecha</TableCell><TableCell>Tasa objetivo</TableCell><TableCell>Movimiento (pb)</TableCell><TableCell>Tipo de reunión</TableCell><TableCell>Tipo de disenso</TableCell></TableRow></TableHead><TableBody>{dissentVotes.map(({vote,decision:d}) => <TableRow key={d.Decision_ID}><TableCell>{fmtDate(d.Fecha_Decision)}</TableCell><TableCell>{fmtRate(d.Tasa_Nueva)}</TableCell><TableCell>{d.Cambio_pb}</TableCell><TableCell>{d.Tipo_Reunion}</TableCell><TableCell>{vote.Tipo_Voto}</TableCell></TableRow>)}</TableBody></Table></TableContainer></Box><Box><SectionTitle>Resumen estadístico</SectionTitle><MemberStats data={data} person={person} until={until} since={since} /></Box></Box>
  </Stack>;
}

function DecisionsMethodology() {
  return <Stack spacing={3} className="decisions-methodology">
    <Box><Typography variant="overline" color="primary">DOCUMENTACIÓN Y TRANSPARENCIA</Typography><Typography variant="h3">Metodología</Typography><Typography color="text.secondary" sx={{maxWidth:900}}>Referencia documental sobre el origen, tratamiento y alcance de la información presentada en Radar Monetario.</Typography></Box>
    <Box className="methodology-grid">
      <MethodologyCard title="Acerca de Radar Monetario"><Typography>Radar Monetario es una plataforma de análisis de política monetaria diseñada para facilitar la exploración histórica de las decisiones de la Junta de Gobierno del Banco de México.</Typography><Typography>Su objetivo es integrar información pública en herramientas visuales que permitan analizar decisiones, votaciones, experiencia de los integrantes y otros indicadores relevantes para el seguimiento de la política monetaria.</Typography></MethodologyCard>
      <MethodologyCard title="Fuentes de información"><Typography>La plataforma utiliza exclusivamente información pública. No emplea información privada.</Typography><Box component="ul"><li>Banco de México.</li><li>INEGI, cuando corresponda.</li><li>Radar Monetario: integración, clasificación y visualización.</li></Box></MethodologyCard>
      <MethodologyCard title="Frecuencia de actualización"><Typography>La plataforma se actualiza conforme se publica nueva información oficial: decisiones de política monetaria, comunicados y votos individuales cuando son públicos.</Typography><Typography>Versiones futuras incorporarán expectativas, inflación, consenso de analistas y nuevos módulos.</Typography></MethodologyCard>
    </Box>
    <MethodologyCard title="Definiciones metodológicas" wide><Box className="definitions-grid"><Definition term="Consenso">Todos los integrantes votan por la decisión aprobada.</Definition><Definition term="Disenso restrictivo">El integrante votó por una postura más restrictiva que la decisión mayoritaria.</Definition><Definition term="Disenso expansivo">El integrante votó por una postura más expansiva que la decisión mayoritaria.</Definition><Definition term="Voto no identificable">La información pública disponible no permite determinar de forma inequívoca el sentido del voto individual.</Definition></Box><Divider sx={{my:2}}/><Typography color="text.secondary">Los votos no identificables, ausencias, abstenciones y votos desconocidos no forman parte de las estadísticas individuales.</Typography></MethodologyCard>
    <Box className="methodology-grid">
      <MethodologyCard title="Limitaciones"><Typography>Radar Monetario busca reproducir fielmente la información pública disponible. Algunas clasificaciones requieren interpretación a partir de comunicados oficiales y otros documentos publicados por Banco de México.</Typography><Typography>Cuando la evidencia no permite identificar con certeza el sentido de un voto, se clasifica como “No identificable” y no se incorpora a los indicadores individuales. La plataforma permanece en revisión y actualización continua.</Typography></MethodologyCard>
      <MethodologyCard title="Inteligencia artificial"><Typography>El desarrollo de Radar Monetario ha sido asistido mediante herramientas de inteligencia artificial para acelerar tareas de programación, estructuración y validación de información.</Typography><Typography>Todas las metodologías, criterios de clasificación y resultados son revisados antes de su publicación. La responsabilidad sobre la interpretación y presentación final corresponde a Radar Monetario.</Typography></MethodologyCard>
      <MethodologyCard title="Descargo de responsabilidad"><Typography>La información presentada tiene fines informativos y analíticos. Aunque se realizan esfuerzos continuos para mantenerla actualizada y correcta, pueden existir errores u omisiones.</Typography><Typography>En caso de discrepancia, la referencia oficial es siempre la información publicada por Banco de México y las demás instituciones correspondientes.</Typography></MethodologyCard>
    </Box>
    <SectionTitle>Historial de versiones</SectionTitle><TableContainer component={Paper}><Table size="small"><TableHead><TableRow><TableCell>Versión</TableCell><TableCell>Fecha</TableCell><TableCell>Cambios principales</TableCell></TableRow></TableHead><TableBody><TableRow><TableCell>1.0.0</TableCell><TableCell>Julio 2026</TableCell><TableCell>Radar de Experiencia y arquitectura inicial de la plataforma.</TableCell></TableRow><TableRow><TableCell>1.1.0</TableCell><TableCell>Agosto 2026</TableCell><TableCell>Radar de Decisiones, análisis por integrante, histórico comparativo y documentación metodológica.</TableCell></TableRow></TableBody></Table></TableContainer>
  </Stack>;
}
function MethodologyCard({title,children,wide=false}:{title:string;children:React.ReactNode;wide?:boolean}){return <Paper className={`methodology-card ${wide?"methodology-wide":""}`}><Typography variant="overline" color="primary">{title}</Typography><Stack spacing={1.2} color="text.secondary">{children}</Stack></Paper>}
function Definition({term,children}:{term:string;children:React.ReactNode}){return <Box className="definition"><Typography fontWeight={800}>{term}</Typography><Typography color="text.secondary">{children}</Typography></Box>}

type HistoricalMetric = "dissentRate" | "hawkRate" | "doveRate";
type HistoricalWindow = "all" | "12m" | "5y" | "10y" | "custom";
type HistoricalRow = { personId:string; name:string; valid:number; dissent:number; hawk:number; dove:number; dissentRate:number; hawkRate:number; doveRate:number; first:string; last:string };
type HistoricalSort = keyof Pick<HistoricalRow,"name"|"valid"|"dissent"|"hawk"|"dove"|"dissentRate"|"hawkRate"|"doveRate"|"first"|"last">;

const metricLabels: Record<HistoricalMetric,string> = { dissentRate:"% Disensos totales", hawkRate:"% Disensos restrictivos", doveRate:"% Disensos expansivos" };
const windowLabels: Record<HistoricalWindow,string> = { all:"Toda la historia", "12m":"Últimos 12 meses", "5y":"Últimos 5 años", "10y":"Últimos 10 años", custom:"Periodo personalizado" };

function HistoricalMembersTab({ data }: { data: DecisionsData }) {
  const latest = data.decisions.reduce((max,item)=>item.Fecha_Decision>max?item.Fecha_Decision:max, data.decisions[0].Fecha_Decision);
  const earliest = data.decisions.reduce((min,item)=>item.Fecha_Decision<min?item.Fecha_Decision:min, data.decisions[0].Fecha_Decision);
  const [metric,setMetric]=useState<HistoricalMetric>("dissentRate");
  const [window,setWindow]=useState<HistoricalWindow>("all");
  const [order,setOrder]=useState<"desc"|"asc">("desc");
  const [customStart,setCustomStart]=useState(earliest);
  const [customEnd,setCustomEnd]=useState(latest);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [tableSort,setTableSort]=useState<HistoricalSort>("dissentRate");
  const [tableDirection,setTableDirection]=useState<"desc"|"asc">("desc");
  const rowRefs=useRef<Record<string,HTMLTableRowElement|null>>({});
  const range=useMemo(()=>{
    if(window==="all")return {start:earliest,end:latest};
    if(window==="custom")return {start:customStart,end:customEnd};
    const end=new Date(`${latest}T00:00:00`);const start=new Date(end);
    if(window==="12m")start.setFullYear(start.getFullYear()-1);
    if(window==="5y")start.setFullYear(start.getFullYear()-5);
    if(window==="10y")start.setFullYear(start.getFullYear()-10);
    return {start:start.toISOString().slice(0,10),end:latest};
  },[window,customStart,customEnd,earliest,latest]);
  const rows=useMemo(()=>data.people.map(person=>{
    const votes=data.votes.filter(v=>v.Persona_ID===person.Persona_ID&&validVote(v)).map(v=>({vote:v,decision:data.decisions.find(d=>d.Decision_ID===v.Decision_ID)})).filter(item=>item.decision&&item.decision.Fecha_Decision>=range.start&&item.decision.Fecha_Decision<=range.end);
    if(!votes.length)return null;
    const hawk=votes.filter(item=>item.vote.Tipo_Voto==="Disenso restrictivo").length;
    const dove=votes.filter(item=>item.vote.Tipo_Voto==="Disenso acomodaticio").length;
    const dates=votes.map(item=>item.decision!.Fecha_Decision).sort();
    return {personId:person.Persona_ID,name:person.Nombre,valid:votes.length,dissent:hawk+dove,hawk,dove,dissentRate:(hawk+dove)/votes.length,hawkRate:hawk/votes.length,doveRate:dove/votes.length,first:dates[0],last:dates[dates.length-1]};
  }).filter(Boolean) as HistoricalRow[],[data,range]);
  const ranked=useMemo(()=>[...rows].sort((a,b)=>(a[metric]-b[metric])*(order==="desc"?-1:1)||a.name.localeCompare(b.name,"es")),[rows,metric,order]);
  const tableRows=useMemo(()=>[...rows].sort((a,b)=>{const av=a[tableSort],bv=b[tableSort];const cmp=typeof av==="number"?(av as number)-(bv as number):String(av).localeCompare(String(bv),"es");return cmp?(cmp*(tableDirection==="desc"?-1:1)):a.name.localeCompare(b.name,"es")}),[rows,tableSort,tableDirection]);
  useEffect(()=>{if(selectedId)rowRefs.current[selectedId]?.scrollIntoView({behavior:"smooth",block:"center"})},[selectedId]);
  const sortBy=(field:HistoricalSort)=>{if(tableSort===field)setTableDirection(d=>d==="asc"?"desc":"asc");else{setTableSort(field);setTableDirection(field==="name"||field==="first"||field==="last"?"asc":"desc")}};
  const period=`${fmtDate(range.start)} — ${fmtDate(range.end)}`;
  const header=(label:string,field:HistoricalSort)=><TableSortLabel active={tableSort===field} direction={tableSort===field?tableDirection:"asc"} onClick={()=>sortBy(field)}>{label}</TableSortLabel>;
  return <Stack spacing={3}>
    <Paper className="history-filters"><Box><Typography variant="overline" color="primary">MÉTRICA</Typography><RadioGroup value={metric} onChange={e=>{const value=e.target.value as HistoricalMetric;setMetric(value);setTableSort(value);setTableDirection(order)}}>{Object.entries(metricLabels).map(([value,label])=><FormControlLabel key={value} value={value} control={<Radio size="small"/>} label={label}/>)}</RadioGroup></Box>
      <Box><Typography variant="overline" color="primary">VENTANA TEMPORAL</Typography><FormControl size="small" fullWidth><Select value={window} onChange={e=>setWindow(e.target.value as HistoricalWindow)}>{Object.entries(windowLabels).map(([value,label])=><MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl>{window==="custom"&&<Stack direction={{xs:"column",sm:"row"}} gap={1} mt={1}><TextField size="small" label="Fecha inicial" type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)} InputLabelProps={{shrink:true}} inputProps={{max:customEnd}}/><TextField size="small" label="Fecha final" type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)} InputLabelProps={{shrink:true}} inputProps={{min:customStart,max:latest}}/></Stack>}</Box>
      <Box><Typography variant="overline" color="primary">ORDEN</Typography><RadioGroup value={order} onChange={e=>{const value=e.target.value as "asc"|"desc";setOrder(value);setTableSort(metric);setTableDirection(value)}}><FormControlLabel value="desc" control={<Radio size="small"/>} label="Mayor a menor"/><FormControlLabel value="asc" control={<Radio size="small"/>} label="Menor a mayor"/></RadioGroup></Box></Paper>
    <Paper className="history-ranking"><Stack direction={{xs:"column",sm:"row"}} justifyContent="space-between" gap={1}><Box><Typography variant="overline" color="primary">RANKING HISTÓRICO</Typography><Typography variant="h4">{metricLabels[metric]}</Typography></Box><Chip label={period} variant="outlined"/></Stack>
      <ResponsiveContainer width="100%" height={Math.max(360,ranked.length*34+50)}><BarChart data={ranked} layout="vertical" margin={{top:18,right:72,bottom:10,left:30}}><CartesianGrid stroke="#262626" horizontal={false}/><XAxis type="number" domain={[0,1]} tickFormatter={(v:number)=>pct(v)}/><YAxis type="category" dataKey="name" width={205} tick={{fontSize:11}}/><Tooltip content={<HistoryTooltip metric={metric} period={period}/>}/><Bar dataKey={metric} name={metricLabels[metric]} minPointSize={2} onClick={(entry)=>setSelectedId((entry as unknown as {payload:HistoricalRow}).payload.personId)} isAnimationActive={false}>{ranked.map(row=><Cell key={row.personId} fill={row.personId===selectedId?"#fff":"#f28c28"} stroke={row.personId===selectedId?"#f28c28":"none"} strokeWidth={2}/>)}<LabelList dataKey={metric} position="right" formatter={(value:unknown)=>pct(Number(value))} fill="#f4f4f4" fontSize={11}/></Bar></BarChart></ResponsiveContainer>
    </Paper>
    <SectionTitle>Tabla completa</SectionTitle><TableContainer component={Paper} className="history-table"><Table size="small" stickyHeader><TableHead><TableRow><TableCell>{header("Integrante","name")}</TableCell><TableCell>{header("Votos válidos","valid")}</TableCell><TableCell>{header("Disensos","dissent")}</TableCell><TableCell>{header("Restrictivos","hawk")}</TableCell><TableCell>{header("Expansivos","dove")}</TableCell><TableCell>{header("% Disensos","dissentRate")}</TableCell><TableCell>{header("% Restrictivos","hawkRate")}</TableCell><TableCell>{header("% Expansivos","doveRate")}</TableCell><TableCell>{header("Primera participación","first")}</TableCell><TableCell>{header("Última participación","last")}</TableCell></TableRow></TableHead><TableBody>{tableRows.map(row=><TableRow key={row.personId} ref={node=>{rowRefs.current[row.personId]=node}} hover selected={row.personId===selectedId} onClick={()=>setSelectedId(row.personId)} className="history-row"><TableCell>{row.name}</TableCell><TableCell>{row.valid}</TableCell><TableCell>{row.dissent}</TableCell><TableCell>{row.hawk}</TableCell><TableCell>{row.dove}</TableCell><TableCell>{pct(row.dissentRate)}</TableCell><TableCell>{pct(row.hawkRate)}</TableCell><TableCell>{pct(row.doveRate)}</TableCell><TableCell>{fmtDate(row.first)}</TableCell><TableCell>{fmtDate(row.last)}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
  </Stack>;
}

function HistoryTooltip({active,payload,metric,period}:{active?:boolean;payload?:Array<{payload:HistoricalRow}>;metric:HistoricalMetric;period:string}){if(!active||!payload?.[0])return null;const row=payload[0].payload;return <Paper className="history-tooltip"><Typography fontWeight={800}>{row.name}</Typography><Typography variant="caption" color="text.secondary">{period}</Typography><Divider sx={{my:1}}/><Typography>Votos válidos: {row.valid}</Typography><Typography>Disensos: {row.dissent}</Typography><Typography>Restrictivos: {row.hawk} ({pct(row.hawkRate)})</Typography><Typography>Expansivos: {row.dove} ({pct(row.doveRate)})</Typography><Typography color="primary">{metricLabels[metric]}: {pct(row[metric])}</Typography></Paper>}

function Selector({title,value,items,onChange,onPrevious,onNext,previousDisabled,nextDisabled}:{title:string;value:string;items:{value:string;label:string}[];onChange:(v:string)=>void;onPrevious:()=>void;onNext:()=>void;previousDisabled:boolean;nextDisabled:boolean}) {return <Paper className="decision-selector"><FormControl size="small" sx={{minWidth:230}}><InputLabel>{title}</InputLabel><Select label={title} value={value} onChange={e=>onChange(e.target.value)}>{items.map(item=><MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}</Select></FormControl><Button startIcon={<ArrowBack/>} onClick={onPrevious} disabled={previousDisabled}>Anterior</Button><Button endIcon={<ArrowForward/>} onClick={onNext} disabled={nextDisabled}>Siguiente</Button></Paper>}
function SectionTitle({children}:{children:React.ReactNode}){return <Typography className="decision-section-title">{children}</Typography>}
function Metric({label,value}:{label:string;value:string}){return <Paper className="decision-metric"><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h6">{value}</Typography></Paper>}

function stats(votes:Vote[]){const valid=votes.filter(validVote),hawk=valid.filter(v=>v.Tipo_Voto==="Disenso restrictivo").length,dove=valid.filter(v=>v.Tipo_Voto==="Disenso acomodaticio").length;return {valid:valid.length,dissent:hawk+dove,hawk,dove}}
function rowsFor(data:DecisionsData,personId:string,until:Date,since?:Date){return data.votes.filter(v=>v.Persona_ID===personId&&validVote(v)).filter(v=>{const d=data.decisions.find(x=>x.Decision_ID===v.Decision_ID);if(!d)return false;const date=new Date(`${d.Fecha_Decision}T00:00:00`);return date<=until&&(!since||date>=since)})}
function VotingStats({data,people,until,since}:{data:DecisionsData;people:Person[];until:Date;since:Date}){return <TableContainer component={Paper}><Table size="small"><TableHead><TableRow><TableCell>Integrante</TableCell><TableCell>Votos válidos</TableCell><TableCell>% Disenso</TableCell><TableCell>% Restrictivo</TableCell><TableCell>% Expansivo</TableCell><TableCell>Votos válidos (12m)</TableCell><TableCell>% Disenso (12m)</TableCell><TableCell>% Restrictivo (12m)</TableCell><TableCell>% Expansivo (12m)</TableCell></TableRow></TableHead><TableBody>{people.map(p=>{const all=stats(rowsFor(data,p.Persona_ID,until)),last=stats(rowsFor(data,p.Persona_ID,until,since));const ratio=(n:number,d:number)=>d?pct(n/d):"0.0%";return <TableRow key={p.Persona_ID}><TableCell>{p.Nombre}</TableCell><TableCell>{all.valid}</TableCell><TableCell>{ratio(all.dissent,all.valid)}</TableCell><TableCell>{ratio(all.hawk,all.valid)}</TableCell><TableCell>{ratio(all.dove,all.valid)}</TableCell><TableCell>{last.valid}</TableCell><TableCell>{ratio(last.dissent,last.valid)}</TableCell><TableCell>{ratio(last.hawk,last.valid)}</TableCell><TableCell>{ratio(last.dove,last.valid)}</TableCell></TableRow>})}</TableBody></Table></TableContainer>}
function MemberStats({data,person,until,since}:{data:DecisionsData;person:Person;until:Date;since:Date}){const all=stats(rowsFor(data,person.Persona_ID,until)),last=stats(rowsFor(data,person.Persona_ID,until,since));const ratio=(n:number,d:number)=>d?pct(n/d):"0.0%";const labels:[string,(s:ReturnType<typeof stats>)=>string][]=[["Votos válidos",s=>String(s.valid)],["Disensos",s=>String(s.dissent)],["Disensos restrictivos",s=>String(s.hawk)],["Disensos expansivos",s=>String(s.dove)],["% Disenso",s=>ratio(s.dissent,s.valid)],["% Disenso restrictivo",s=>ratio(s.hawk,s.valid)],["% Disenso expansivo",s=>ratio(s.dove,s.valid)]];return <TableContainer component={Paper}><Table size="small"><TableHead><TableRow><TableCell>Indicador</TableCell><TableCell>Histórico</TableCell><TableCell>Últimos doce meses</TableCell></TableRow></TableHead><TableBody>{labels.map(([label,get])=><TableRow key={label}><TableCell>{label}</TableCell><TableCell>{get(all)}</TableCell><TableCell>{get(last)}</TableCell></TableRow>)}</TableBody></Table></TableContainer>}
