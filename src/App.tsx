import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppBar, Box, Button, Chip, Container, Divider, Drawer,
  FormControl, IconButton, InputLabel, MenuItem, Paper, Select, Stack, Tab, Tabs, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, Toolbar, Typography
} from "@mui/material";
import { ArrowBack, ArrowForward, Close, Download, Home as HomeIcon, RestartAlt } from "@mui/icons-material";
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis, Legend } from "recharts";
import { motion } from "framer-motion";
import { average, effectiveScore, evaluationFor, evaluationTotal, loadData, nearestBoard, scoreEditKey } from "./data";
import { useRadarStore } from "./store";
import { orange } from "./theme";
import type { Evaluation, EvaluationMode, EvaluationSourceMode, Person } from "./types";
import { exportPdf } from "./pdf";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import DecisionsRadar from "./decisions";
import ForecastsRadar from "./forecasts";
import { ShareButton } from "./share-button";
import ExpectationsRadar from "./expectations";

const logoSrc = `${import.meta.env.BASE_URL}logo.png`;

const modeMeta = {
  official: { color: "#33c37d", title: "🟢 Oficial", text: "Visualizando la evaluación oficial del RAdarMonetario." },
  heath: { color: "#4da3ff", title: "🔵 Reconstrucción Heath", text: "Visualizando la reconstrucción de las calificaciones publicadas por Jonathan Heath." },
  custom: { color: orange, title: "🟠 Mi evaluación", text: "Está visualizando una evaluación personalizada." },
} as const;

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("es-MX", { month: "short", year: "numeric", timeZone: "UTC" });
}

function formatLongDate(date: string) {
  return new Date(date).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function formatScore(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "N/D" : value.toFixed(1);
}

const tooltipFormatter = (value: unknown) => {
  if (Array.isArray(value)) return value.map((item) => typeof item === "number" ? item.toFixed(1) : String(item)).join(", ");
  return typeof value === "number" ? value.toFixed(1) : String(value ?? "N/D");
};

export default function App() {
  const [showSplash, setShowSplash] = useState(() => sessionStorage.getItem("radarmonetario-splash") !== "seen");
  useEffect(() => {
    if (!showSplash) return;
    sessionStorage.setItem("radarmonetario-splash", "seen");
    const timer = window.setTimeout(() => setShowSplash(false), 2600);
    return () => window.clearTimeout(timer);
  }, [showSplash]);
  return <>
    {showSplash && <SplashScreen />}
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/experiencia" element={<ExperienceRadar />} />
      <Route path="/decisiones" element={<DecisionsRadar />} />
      <Route path="/pronosticos" element={<ForecastsRadar />} />
      <Route path="/expectativas" element={<ExpectationsRadar />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    <ShareButton />
    <PlatformFooter />
  </>;
}

function PlatformFooter() {
  return <Box component="footer" className="platform-footer"><span>Fuentes: Banco de México · INEGI · Radar Monetario</span><span>v1.1.0</span></Box>;
}

function BrandLogo({ className = "" }: { className?: string }) {
  return <img className={`brand-logo ${className}`} src={logoSrc} alt="RAdarMonetario · Señas y Expectativas" />;
}

function SplashScreen() {
  return <motion.div className="splash" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 1, 0] }} transition={{ duration: 2.6, times: [0, .18, .76, 1] }}><BrandLogo className="splash-logo" /></motion.div>;
}

const modules = [
  { title: "Radar de experiencia · Junta BM", status: "Disponible", description: "Explorador histórico de experiencia profesional de los integrantes de la Junta de Gobierno.", path: "/experiencia", available: true },
  { title: "Radar de decisiones · Junta BM", status: "Disponible", description: "Seguimiento histórico de decisiones, votaciones y disensos de la Junta de Gobierno.", path: "/decisiones", available: true },
  { title: "Pronósticos de Banxico", status: "Disponible", description: "Trayectorias, revisiones y sesgos de pronóstico", path: "/pronosticos", available: true },
  { title: "Expectativas de especialistas", status: "Disponible", description: "Pronósticos, dispersión y opiniones de especialistas privados", path: "/expectativas", available: true },
];

function Home() {
  const navigate = useNavigate();
  return <Box className="home"><Box className="welcome-grid" /><Container maxWidth="lg" className="home-content">
    <BrandLogo className="home-logo" />
    <Typography variant="overline" color="primary">PLATAFORMA DE ANÁLISIS MONETARIO</Typography>
    <Typography variant="h2" sx={{ mt: 1 }}>Análisis disponibles</Typography>
    <Typography color="text.secondary" sx={{ maxWidth: 720, mb: 4 }}>Radares independientes para explorar señales, perfiles y expectativas de política monetaria.</Typography>
    <Box className="module-grid">{modules.map(module => <Paper className="module-card" key={module.title}>
      <Stack direction="row" justifyContent="space-between" gap={2} alignItems="flex-start"><Typography variant="h5">{module.title}</Typography><Chip size="small" color={module.available ? "success" : "default"} label={module.status} /></Stack>
      <Typography color="text.secondary">{module.description}</Typography>
      <Button variant={module.available ? "contained" : "outlined"} disabled={!module.available} onClick={() => module.path && navigate(module.path)} sx={{ alignSelf: "flex-start", color: module.available ? "#111" : undefined }}>{module.available ? "Abrir análisis" : "Próximamente"}</Button>
    </Paper>)}</Box>
    <Typography variant="overline" color="primary" sx={{ display: "block", mt: 6 }}>PRÓXIMAMENTE</Typography>
    <Box className="upcoming-grid">{["Inflación", "Consenso de analistas", "Calendario Banxico"].map(title => <Paper className="upcoming-card" key={title}><Typography variant="h6">{title}</Typography><Chip size="small" label="Próximamente" /></Paper>)}</Box>
  </Container></Box>;
}

function ExperienceRadar() {
  const navigate = useNavigate();
  const { data, setData, mode, sourceMode, setSourceMode, selectedBoards, activeTab, setActiveTab, edits, evaluationHash, resetEvaluation } = useRadarStore();
  const [person, setPerson] = useState<Person | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { loadData().then(setData).catch((e: Error) => setError(e.message)); }, [setData]);
  if (error) return <Container sx={{ py: 10 }}><Typography color="error">{error}</Typography></Container>;
  if (!data) return <Box className="loading">Cargando Radar de experiencia…</Box>;
  const meta = modeMeta[mode];
  return <Box>
    <AppBar position="sticky" elevation={0} color="transparent" sx={{ backdropFilter: "blur(14px)", borderBottom: "1px solid #282828" }}>
      <Toolbar sx={{ gap: 2 }}>
        <IconButton aria-label="Volver al inicio" onClick={() => navigate("/")}><HomeIcon /></IconButton><Box sx={{ flexGrow: 1 }}><BrandLogo className="header-logo" /></Box>
        <Button startIcon={<Download />} onClick={() => exportPdf(data, selectedBoards, mode, sourceMode, edits, evaluationHash)}>Exportar PDF</Button>
      </Toolbar>
    </AppBar>
    <Box className="status" sx={{ borderColor: meta.color }}>
      <Box className="status-dot" sx={{ bgcolor: meta.color }} /><Box sx={{ flexGrow: 1 }}><b>{meta.title}</b> · {meta.text}</Box>
      <Chip size="small" label={`Hash ${evaluationHash ? evaluationHash.slice(0, 12) : "calculando…"}`} sx={{ borderColor: meta.color, color: meta.color }} variant="outlined" />
      <FormControl size="small" sx={{ minWidth: 220 }}><InputLabel>Origen</InputLabel><Select label="Origen" value={sourceMode} onChange={e => setSourceMode(e.target.value as EvaluationSourceMode)}>
        <MenuItem value="official">Observatorio</MenuItem><MenuItem value="heath">Jonathan Heath</MenuItem>
      </Select></FormControl>
      <Button startIcon={<RestartAlt />} onClick={resetEvaluation}>Restablecer evaluación oficial</Button>
    </Box>
    <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} variant="scrollable" className="tabs">
      <Tab label="Comparador" /><Tab label="Histórico Radar de experiencia" /><Tab label="Experiencia" /><Tab label="Metodología" />
    </Tabs>
    <Container maxWidth={false} sx={{ px: { xs: 1.5, md: 3 }, py: 3 }}>
      {activeTab === 0 && <Comparator onPerson={setPerson} />}
      {activeTab === 1 && <HistoricalChart />}
      {activeTab === 2 && <ExperienceChart />}
      {activeTab === 3 && <Methodology />}
    </Container>
    <PersonDrawer person={person} onClose={() => setPerson(null)} />
  </Box>;
}

function Comparator({ onPerson }: { onPerson: (p: Person)=>void }) {
  const { data, mode, sourceMode, edits, selectedBoards, activeBoard, selectBoard } = useRadarStore();
  const boardRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const comparatorReady = useRef(false);
  const boardDates = data?.timeline ?? [];
  const activeIndex = boardDates.indexOf(activeBoard);
  const navigate = (offset: number) => {
    const next = boardDates[activeIndex + offset];
    if (next) selectBoard(next);
  };
  useEffect(() => {
    if (!comparatorReady.current) {
      comparatorReady.current = true;
      return;
    }
    if (activeBoard) boardRefs.current[activeBoard]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeBoard]);
  if (!data) return null;
  return <Stack spacing={3}>
    <Box><Typography variant="overline" color="primary">COMPARADOR HISTÓRICO</Typography><Typography variant="h3">Evolución de la Junta</Typography><Typography color="text.secondary">Compara cortes históricos en vertical. La gráfica, el selector y la Junta activa permanecen sincronizados.</Typography></Box>
    <Paper className="comparator-controls">
      <FormControl size="small" sx={{ minWidth: 240 }}><InputLabel>Junta activa</InputLabel><Select label="Junta activa" value={activeBoard} onChange={e=>selectBoard(e.target.value)}>{boardDates.map(x=><MenuItem key={x} value={x}>{formatLongDate(x)}</MenuItem>)}</Select></FormControl>
      <Button startIcon={<ArrowBack />} disabled={activeIndex <= 0} onClick={()=>navigate(-1)}>Junta anterior</Button>
      <Button endIcon={<ArrowForward />} disabled={activeIndex < 0 || activeIndex >= boardDates.length-1} onClick={()=>navigate(1)}>Junta siguiente</Button>
    </Paper>
    <HistoricalChart embedded />
    <Stack direction="row" gap={1} flexWrap="wrap">{selectedBoards.map((d,i)=><FormControl key={i} size="small" sx={{ minWidth: 190 }}><InputLabel>Comparación {String.fromCharCode(65+i)}</InputLabel><Select label={`Comparación ${String.fromCharCode(65+i)}`} value={d} onChange={e=>selectBoard(e.target.value)}>{boardDates.map(x=><MenuItem key={x} value={x}>{formatDate(x)}</MenuItem>)}</Select></FormControl>)}
    {selectedBoards.length<3 && <Button variant="outlined" onClick={()=>selectBoard(boardDates[Math.max(0,boardDates.length-121)])}>+ Agregar junta</Button>}</Stack>
    <Paper className="comparison-matrix">
      <TableContainer><Table size="small" stickyHeader>
        <TableHead><TableRow>
          <TableCell>Persona</TableCell><TableCell>Cargo</TableCell><TableCell align="right">Total</TableCell>
          {data.criteria.map(c=><TableCell align="right" key={c.id}><span className="column-label">{c.short}</span></TableCell>)}
        </TableRow></TableHead>
        <TableBody>{selectedBoards.map((date,index)=><BoardRows key={date} date={date} label={`Board ${String.fromCharCode(65+index)}`} onPerson={onPerson} mode={mode} sourceMode={sourceMode} edits={edits} active={date===activeBoard} onActivate={()=>selectBoard(date)} rowRef={node=>{boardRefs.current[date]=node}} />)}</TableBody>
      </Table></TableContainer>
    </Paper>
  </Stack>;
}

function BoardRows({date,label,onPerson,mode,sourceMode,edits,active,onActivate,rowRef}:{date:string;label:string;onPerson:(p:Person)=>void;mode:EvaluationMode;sourceMode:EvaluationSourceMode;edits:Record<string,number>;active:boolean;onActivate:()=>void;rowRef:(node:HTMLTableRowElement|null)=>void}) {
  const data=useRadarStore(s=>s.data)!;
  const editScore=useRadarStore(s=>s.editScore);
  const board=nearestBoard(data,date);
  if (!board) return <TableRow ref={rowRef}><TableCell colSpan={13}>Información insuficiente: no existe una composición de Junta vigente para {formatDate(date)}.</TableCell></TableRow>;
  const rows=board.members.map(name=>({name,person:data.people.find(p=>p.name===name),ev:evaluationFor(data,date,name,sourceMode)}));
  const averages=data.criteria.map(c=>average(rows.map(r=>r.ev ? effectiveScore(date,r.ev,c.id,edits) : null)));
  const avgTotal=average(rows.map(r=>r.ev ? evaluationTotal(data,date,r.ev,edits) : null));
  const contextColor=modeMeta[mode].color;
  return <>
    <TableRow ref={rowRef} className={`board-title-row ${active?"board-active":""}`} sx={{"--context-color":contextColor} as React.CSSProperties}>
      <TableCell colSpan={13}><Button className="board-activate" onClick={onActivate}>{label} — {formatLongDate(date)}</Button><strong>Promedio general {formatScore(avgTotal)}</strong></TableCell>
    </TableRow>
    {rows.map(({name,person,ev})=>{const total=ev ? evaluationTotal(data,date,ev,edits) : null;return <TableRow key={name} className="person-row">
      <TableCell><Button className="person-link" onClick={event=>{event.stopPropagation();if(person)onPerson(person)}}>{name}</Button></TableCell>
      <TableCell>{name===board.governor?"Gobernador":"Subgobernador"}</TableCell>
      <TableCell align="right" className="total-cell">{formatScore(total)}</TableCell>
      {data.criteria.map(c=>{const original=ev?.scores[c.id];const key=ev?scoreEditKey(date,ev.id,c.id):"";const edited=key in edits;const value=ev?effectiveScore(date,ev,c.id,edits):null;return <TableCell align="right" key={c.id} className={edited?"modified-score":""}><EditableScore value={value} edited={edited} onCommit={newValue=>ev&&original!=null&&editScore({boardDate:date,evaluationId:ev.id,person:name,criterionId:c.id,criterion:c.name,originalValue:original,newValue})}/></TableCell>})}
    </TableRow>})}
    <TableRow className="board-average-row"><TableCell colSpan={2}>Promedio de la Junta</TableCell><TableCell align="right">{formatScore(avgTotal)}</TableCell>{averages.map((value,index)=><TableCell align="right" key={data.criteria[index].id}>{formatScore(value)}</TableCell>)}</TableRow>
    <TableRow className="board-separator"><TableCell colSpan={13}/></TableRow>
  </>;
}

function EditableScore({value,edited,onCommit}:{value:number|null|undefined;edited:boolean;onCommit:(value:number)=>void}) {
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState("");
  if(value==null)return <>N/D</>;
  const begin=()=>{setDraft(String(value));setEditing(true)};
  const commit=()=>{const next=Number(draft);if(Number.isFinite(next)&&next>=0&&next<=10)onCommit(next);setEditing(false)};
  if(editing)return <input className="score-input" autoFocus type="number" min="0" max="10" step="0.1" value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==="Enter")commit();if(e.key==="Escape")setEditing(false)}} aria-label="Editar calificación"/>;
  return <button className="score-value" onDoubleClick={begin} title="Doble clic para editar">{formatScore(value)}{edited&&<span className="edit-mark" aria-label="Modificada"> ✎</span>}</button>;
}

function HistoricalChart({embedded=false}:{embedded?:boolean}) {
  const {data,mode,sourceMode,edits,selectBoard,activeBoard}=useRadarStore();
  const series=useMemo(()=>data ? data.timeline.map(date=>{const board=nearestBoard(data,date);const evals=board?.members.map(n=>evaluationFor(data,date,n,sourceMode)).filter(Boolean) as Evaluation[]|undefined;const score=average(evals?.map(e=>evaluationTotal(data,date,e,edits))??[]);return {date,label:formatDate(date),score}}) : [],[data,sourceMode,edits]);
  if(!data)return null;
  const color=modeMeta[mode].color;
  return <ChartPanel eyebrow="SERIE HISTÓRICA" title="Evolución de Radar de experiencia" subtitle="Haz clic en cualquier punto para seleccionar y resaltar esa Junta."><ResponsiveContainer width="100%" height={embedded?330:470}><LineChart data={series}><CartesianGrid stroke="#262626"/><XAxis dataKey="label" minTickGap={40}/><YAxis domain={[5,10]} tickFormatter={(v:number)=>v.toFixed(1)}/><ChartTooltip formatter={tooltipFormatter} contentStyle={{background:"#171717",border:`1px solid ${color}`}}/><Line type="monotone" dataKey="score" name="Radar de experiencia" stroke={color} strokeWidth={2.5} dot={({cx,cy,payload})=><g onPointerDown={()=>selectBoard(payload.date)} onClick={()=>selectBoard(payload.date)} style={{cursor:"pointer",pointerEvents:"all"}}><circle cx={cx} cy={cy} r={payload.date===activeBoard?7:2.5} fill={payload.date===activeBoard?"#fff":color} stroke={color} strokeWidth={payload.date===activeBoard?3:0}/><circle cx={cx} cy={cy} r={10} fill="transparent"/></g>} activeDot={{r:7}}/></LineChart></ResponsiveContainer></ChartPanel>;
}

function ExperienceChart() {
  const {data,mode,selectBoard}=useRadarStore(); if(!data)return null;
  const handleClick = (state: unknown) => {
    const payload = (state as { activePayload?: Array<{ payload?: { date?: string } }> })?.activePayload?.[0]?.payload;
    if (payload?.date && nearestBoard(data, payload.date)) selectBoard(payload.date);
  };
  const color=modeMeta[mode].color;
  return <ChartPanel eyebrow="CAPITAL PROFESIONAL" title="Experiencia acumulada de la Junta" subtitle="Promedios mensuales de experiencia total, monetaria y fiscal."><ResponsiveContainer width="100%" height={470}><LineChart data={data.experience} onClick={handleClick}><CartesianGrid stroke="#262626"/><XAxis dataKey="date" tickFormatter={formatDate} minTickGap={50}/><YAxis tickFormatter={(v:number)=>v.toFixed(1)}/><Legend/><ChartTooltip formatter={tooltipFormatter} labelFormatter={(label)=>typeof label==="string"?formatDate(label):String(label??"")} contentStyle={{background:"#171717",border:`1px solid ${color}`}}/><Line dot={false} dataKey="total" name="Total" stroke={color} strokeWidth={2.3}/><Line dot={false} dataKey="monetary" name="Monetaria" stroke="#4da3ff" strokeWidth={1.8}/><Line dot={false} dataKey="fiscal" name="Fiscal" stroke="#33c37d" strokeWidth={1.8}/></LineChart></ResponsiveContainer></ChartPanel>;
}

function ChartPanel({eyebrow,title,subtitle,children}:{eyebrow:string;title:string;subtitle:string;children:React.ReactNode}) {return <Paper sx={{p:{xs:2,md:4}}}><Typography variant="overline" color="primary">{eyebrow}</Typography><Typography variant="h3">{title}</Typography><Typography color="text.secondary" sx={{mb:4}}>{subtitle}</Typography>{children}</Paper>}

function Methodology(){const data=useRadarStore(s=>s.data)!;return <Stack spacing={3}>
  <Box><Typography variant="overline" color="primary">METODOLOGÍA Y TRANSPARENCIA</Typography><Typography variant="h3">Cómo leer Radar de experiencia</Typography></Box>
  <Box className="method-grid">
    <Paper sx={{p:3}}><Typography variant="h5">Metodología original</Typography><Typography color="text.secondary" sx={{mt:1}}>Jonathan Heath, economista y subgobernador del Banco de México, publicó criterios para analizar perfiles de integrantes de la Junta de Gobierno. Su propósito y contexto originales corresponden a esas publicaciones y ejercicios públicos, cuyas calificaciones se preservan en el archivo histórico y en los metadatos de cada evaluación.</Typography><Typography color="text.secondary" sx={{mt:1}}>La propuesta original no fue diseñada como una serie mensual exhaustiva ni como una evaluación oficial del Banco de México; su cobertura depende de la información y de los cortes publicados.</Typography></Paper>
    <Paper sx={{p:3}}><Typography variant="h5">Adaptación RAdarMonetario</Typography><Typography color="text.secondary" sx={{mt:1}}>Radar de experiencia adapta esos criterios para consultar y comparar históricamente la integración de las Juntas de Gobierno. La reconstrucción temporal, las ampliaciones, las estimaciones y la aplicación retrospectiva son responsabilidad exclusiva del RAdarMonetario y pueden diferir del propósito original de Jonathan Heath.</Typography></Paper>
    <Paper sx={{p:3}}><Typography variant="h5">Fuentes, supuestos y limitaciones</Typography><Typography color="text.secondary" sx={{mt:1}}>La fuente principal es el libro histórico auditado del RAdarMonetario. Los meses intermedios extienden la última evaluación vigente sólo cuando no existe evidencia de cambio. La disponibilidad de perfiles, fuentes y calificaciones varía por periodo; los valores ausentes no se tratan como cero. Una reconstrucción no sustituye una evaluación publicada y toda incertidumbre debe interpretarse con cautela.</Typography></Paper>
  </Box>
  <Box className="criteria-grid">{data.criteria.map(c=><Paper key={c.id} sx={{p:3}}><Typography color="primary">{String(c.number).padStart(2,"0")}</Typography><Typography variant="h6">{c.name}</Typography><Typography color="text.secondary">{c.definition}</Typography><Chip size="small" label={c.nature} sx={{mt:2}}/></Paper>)}</Box>
  <Paper sx={{p:3}}><Typography variant="overline" color="primary">TRANSPARENCIA</Typography><Typography variant="h5">Uso de inteligencia artificial</Typography><Typography color="text.secondary" sx={{mt:1}}>Se utilizó inteligencia artificial como apoyo para programación, documentación, revisión y validación. La selección de fuentes, las decisiones metodológicas, las calificaciones y la responsabilidad final del contenido corresponden al RAdarMonetario.</Typography><Divider sx={{my:2}}/><Typography variant="h5">Revisión continua</Typography><Typography color="text.secondary" sx={{mt:1}}>La base histórica permanece bajo revisión continua. La aparición de nuevas fuentes puede motivar precisiones o correcciones, que deberán documentarse sin cambios silenciosos.</Typography><Divider sx={{my:2}}/><Typography variant="h5">Changelog</Typography><Typography color="text.secondary" sx={{mt:1}}>RC1: refinamiento del comparador, persistencia del indicador de evaluación, drawer estructurado y ampliación metodológica. Las correcciones futuras se incorporarán aquí con fecha, evidencia y efecto sobre la serie.</Typography></Paper>
</Stack>}

function careerCategory(entry: Person["career"][number]) {
  const text=`${entry.institution} ${entry.role} ${entry.description}`.toLowerCase();
  const monetary=/banco de méxico|banxico|monetari|banca central/.test(text);
  const fiscal=/hacienda|shcp|finanzas públicas|presupuesto|fiscal|inversión pública/.test(text);
  if(monetary&&fiscal)return "Ambas";
  if(monetary)return "Política monetaria";
  if(fiscal)return "Finanzas públicas";
  return "No computa";
}

function PersonDrawer({person,onClose}:{person:Person|null;onClose:()=>void}){
  const [tab,setTab]=useState(0);
  useEffect(()=>setTab(0),[person?.id]);
  const academic=useMemo(()=>[...(person?.academic??[])].sort((a,b)=>
    a.order-b.order
    || (a.year==null?1:0)-(b.year==null?1:0)
    || (a.year??0)-(b.year??0)
    || a.sourceOrder-b.sourceOrder
  ),[person?.academic]);
  return <Drawer anchor="right" open={!!person} onClose={onClose} PaperProps={{sx:{width:{xs:"96vw",md:620}}}}>
    <Box className="drawer-head"><Box><Typography className="brand">PERFIL</Typography><Typography variant="h4">{person?.name}</Typography></Box><IconButton onClick={onClose}><Close/></IconButton></Box>
    <Typography color="text.secondary" sx={{px:3,pb:2}}>{person?.biography}</Typography>
    <Tabs value={tab} onChange={(_,value)=>setTab(value)} variant="fullWidth" className="drawer-tabs"><Tab label="Trayectoria profesional"/><Tab label="Formación académica"/></Tabs>
    <Box className="drawer-content">{tab===0?<Stack spacing={2}>{person?.career.map((c,i)=><Box key={i} className="career"><Stack direction="row" justifyContent="space-between" gap={1}><Typography>{c.role}</Typography><Chip size="small" label={careerCategory(c)} className={`career-tag tag-${careerCategory(c).toLowerCase().replaceAll(" ","-")}`}/></Stack><Typography color="primary">{c.institution}</Typography><Typography variant="caption" color="text.secondary">{c.start} — {c.end}</Typography><Typography variant="body2" color="text.secondary">{c.description}</Typography></Box>)}</Stack>:academic.length===0?<Typography variant="body2" color="text.secondary">No existe información académica disponible para este integrante.</Typography>:<Stack spacing={2}>{academic.map((entry,index)=>{const program=/^estudios\b/i.test(entry.originalProgram)?entry.originalProgram:entry.program;return <Box key={`${entry.sourceOrder}-${index}`}><Typography variant="h6">{entry.type}</Typography>{program&&<Box className="academic-row"><span>Programa</span><strong>{program}</strong></Box>}{entry.institution&&<Box className="academic-row"><span>Institución</span><strong>{entry.institution}</strong></Box>}{entry.country&&<Box className="academic-row"><span>País</span><strong>{entry.country}</strong></Box>}{entry.year!=null&&<Box className="academic-row"><span>Año</span><strong>{entry.year}</strong></Box>}{entry.status&&<Box className="academic-row"><span>Estado</span><strong>{entry.status}</strong></Box>}{index<academic.length-1&&<Divider sx={{mt:2}}/>}</Box>})}</Stack>}</Box>
  </Drawer>
}
