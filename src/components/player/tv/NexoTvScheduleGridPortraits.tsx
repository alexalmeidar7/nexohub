import NexoLoadingImage from "./NexoLoadingImage";
import "./NexoVisualLote9.css";
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Undo2, Clock3 } from "lucide-react";
import "./NexoTvScheduleGridPortraits.css";
import {ReminderToggle} from "./TvProgramReminders";

type Programa = {
  id?: string;
  nome: string;
  descricao?: string|null;
  classificacao_etaria?: string|null;
  horario_inicio?: string | null;
  horario_fim?: string | null;
  dias_semana?: string[] | null;
  ativo?: boolean | null;
  variavel?: boolean | null;
  data_variavel?: string | null;
  estudio?: string | null;
  apresentador_id?: string | null;
  apresentadores_ids?: string[] | null;
  foto?: string | null;
  capa?: string | null;
  thumb?: string | null;
};

type Apresentador = { id?: string; nome?: string; foto?: string | null };

type Props = {
  loading?: boolean;
  programs: Programa[];
  presenters?: Apresentador[];
  studio?: string | null;
  currentProgramId?: string | null;
  onClose: () => void;
};

type Segmento = {
  programa: Programa;
  inicio: number;
  fim: number;
  noAr: boolean;
  fotos: string[];
  chave: string;
};

const INTERVALO = 30;
const DIA_MINUTOS = 24 * 60;
const NOMES_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const NOMES_LONGOS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const DIAS = Array.from({ length: 48 }, (_, index) => index * INTERVALO);

function normalizar(valor: string): string {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function horarioMinutos(valor: string | null | undefined): number | null {
  if (!valor) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(valor);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59 ? h * 60 + m : null;
}

function horario(valor: number): string {
  const minutos = Math.max(0, Math.min(DIA_MINUTOS, valor));
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}

function dataLocal(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

function estaNoDia(programa: Programa, data: Date): boolean {
  if (programa.ativo === false) return false;
  if (programa.variavel) {
    return !!programa.data_variavel && programa.data_variavel.slice(0, 10) === dataLocal(data);
  }
  const dias = programa.dias_semana || [];
  if (!Array.isArray(dias) || dias.length === 0) return true;
  const indice = data.getDay();
  const curto = normalizar(NOMES_CURTOS[indice]);
  const longo = normalizar(NOMES_LONGOS[indice]);
  return dias.some((dia) => {
    const valor = normalizar(String(dia));
    return valor === curto || valor === longo || valor === String(indice);
  });
}

function fotosPrograma(programa: Programa, apresentadores: Map<string, string>): string[] {
  const ids = [
    programa.apresentador_id,
    ...(Array.isArray(programa.apresentadores_ids) ? programa.apresentadores_ids : []),
  ];
  const fotos = Array.from(new Set(ids.filter(Boolean).map(id => String(id))))
    .map(id => apresentadores.get(id))
    .filter((foto): foto is string => !!foto && foto.trim().length > 0);
  if (fotos.length) return Array.from(new Set(fotos)).slice(0, 5);
  return [programa.foto, programa.capa, programa.thumb]
    .filter((foto): foto is string => !!foto && foto.trim().length > 0)
    .slice(0, 1);
}

function montarDia(programas: Programa[], data: Date, indiceDia: number, atual?: string | null, fotos?: Map<string, string>): Segmento[] {
  const anterior = new Date(data);
  anterior.setDate(anterior.getDate() - 1);
  const resultado: Segmento[] = [];
  for (const programa of programas) {
    const inicio = horarioMinutos(programa.horario_inicio);
    const fim = horarioMinutos(programa.horario_fim);
    if (inicio === null || fim === null || inicio === fim) continue;
    const atravessaMeiaNoite = fim < inicio;
    const ativoHoje = estaNoDia(programa, data);
    const ativoOntem = estaNoDia(programa, anterior);
    const retratos = fotosPrograma(programa, fotos || new Map());
    if (ativoHoje) {
      resultado.push({
        programa,
        inicio,
        fim: atravessaMeiaNoite ? DIA_MINUTOS : fim,
        fotos: retratos,
        noAr: indiceDia === 0 && !!atual && programa.id === atual,
        chave: `${dataLocal(data)}-${programa.id || programa.nome}-inicio`,
      });
    }
    if (atravessaMeiaNoite && ativoOntem) {
      resultado.push({
        programa,
        inicio: 0,
        fim,
        fotos: retratos,
        noAr: indiceDia === 0 && !!atual && programa.id === atual,
        chave: `${dataLocal(data)}-${programa.id || programa.nome}-continua`,
      });
    }
  }
  return resultado.sort((a, b) => a.inicio - b.inicio);
}

function NexoTvScheduleGridPortraits({ programs, presenters = [], studio, currentProgramId, onClose, loading=false }: Props) {
  const [details,setDetails]=useState<Segmento|null>(null);
  const trigger=useRef<HTMLButtonElement|null>(null);
  const detailBack=useRef<HTMLButtonElement>(null);
  const [detailClosing,setDetailClosing]=useState(false);
  const detailExitTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const detailRestoreFrame=useRef(0);
  const scrollFrame=useRef(0);
  useEffect(()=>()=>{if(detailExitTimer.current!==null)clearTimeout(detailExitTimer.current);cancelAnimationFrame(detailRestoreFrame.current);cancelAnimationFrame(scrollFrame.current);},[]);
  const closeDetails=()=>{
    if(detailExitTimer.current!==null)return;
    setDetailClosing(true);
    detailExitTimer.current=setTimeout(()=>{detailExitTimer.current=null;setDetails(null);setDetailClosing(false);detailRestoreFrame.current=requestAnimationFrame(()=>trigger.current?.focus({preventScroll:true}));},window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:200);
  };
  useEffect(()=>{if(details)detailBack.current?.focus({preventScroll:true});},[details]);
  const viewport = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // One cancellable scroll animation; repeated D-pad presses replace the target.
  const scrollToProgram=(button:HTMLButtonElement)=>{
    const el=viewport.current;if(!el)return;
    cancelAnimationFrame(scrollFrame.current);
    const r=button.getBoundingClientRect(),v=el.getBoundingClientRect();
    const margin=12;const from=el.scrollTop;
    let to=from;
    if(r.height>v.height-2*margin)to=from+r.top-v.top-margin;
    else if(r.top<v.top+margin)to=from+r.top-v.top-margin;
    else if(r.bottom>v.bottom-margin)to=from+r.bottom-v.bottom+margin;
    to=Math.max(0,Math.min(el.scrollHeight-el.clientHeight,to));
    if(Math.abs(to-from)<1)return;
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){el.scrollTop=to;return;}
    const start=performance.now();
    const tick=(now:number)=>{const t=Math.min(1,(now-start)/200);el.scrollTop=from+(to-from)*(1-Math.pow(1-t,3));if(t<1)scrollFrame.current=requestAnimationFrame(tick);};
    scrollFrame.current=requestAnimationFrame(tick);
  };
  const hoje = useMemo(() => {
    const agora = new Date();
    // O fuso de Brasilia e usado pelo proprio Player para a programacao.
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(agora);
    const valor = (tipo: string) => partes.find(p => p.type === tipo)?.value || "";
    return new Date(Number(valor("year")), Number(valor("month")) - 1, Number(valor("day")), 12);
  }, []);

  const datas = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const data = new Date(hoje);
    data.setDate(hoje.getDate() + index);
    return data;
  }), [hoje]);

  const programasEstudio = useMemo(() => {
    const ativos = programs.filter(p => p.ativo !== false);
    if (!studio) return ativos;
    const correspondentes = ativos.filter(p => !p.estudio || p.estudio === studio);
    return correspondentes.length ? correspondentes : ativos;
  }, [programs, studio]);
  const fotos = useMemo(() => new Map(presenters
    .filter(p => p.id && p.foto)
    .map(p => [String(p.id), String(p.foto)] as const)), [presenters]);
  const colunas = useMemo(() => datas.map((data, index) => montarDia(programasEstudio, data, index, currentProgramId, fotos)),
    [datas, programasEstudio, currentProgramId, fotos]);

  const gridInitialized = useRef(false);
  const navNodes=useRef<HTMLButtonElement[]>([]);
  useEffect(()=>{navNodes.current=Array.from(viewport.current?.querySelectorAll<HTMLButtonElement>(".nexo-grade-programa")||[]);},[colunas]);
  useEffect(() => {
    const target = viewport.current;
    if (!target) return;
    const partes = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date());
    const valor = (tipo: string) => Number(partes.find(p => p.type === tipo)?.value || 0);
    const minutos = valor("hour") * 60 + valor("minute");
    const slot = target.querySelector<HTMLElement>(".nexo-grade-horario");
    const altura = slot?.getBoundingClientRect().height || 48;
    if (!gridInitialized.current) target.scrollTop = Math.max(0, Math.floor(minutos / 30) * altura - target.clientHeight / 2);
    const live = target.querySelector<HTMLButtonElement>(".nexo-grade-programa[data-ao-vivo='true']");
    const active = document.activeElement;
    if (!gridInitialized.current || (live && active === closeRef.current)) {
      (live || closeRef.current)?.focus({ preventScroll: true });
      if (live) live.scrollIntoView({behavior:"instant",block:"nearest",inline:"nearest"});
    }
    gridInitialized.current = true;
  }, [currentProgramId, colunas]);

  const navega = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key))) return;
    const alvo = event.target as HTMLElement;
    const atual = alvo.closest<HTMLButtonElement>(".nexo-grade-programa");
    if (!atual) return;
    const dia = Number(atual.dataset.dia);
    const minuto = Number(atual.dataset.minuto);
    const todos = navNodes.current.length ? navNodes.current : Array.from(viewport.current?.querySelectorAll<HTMLButtonElement>(".nexo-grade-programa") || []);
    let opcoes = todos.filter(button => button !== atual);
    if (event.key === "ArrowUp") opcoes = opcoes.filter(b => Number(b.dataset.dia) === dia && Number(b.dataset.minuto) < minuto);
    if (event.key === "ArrowDown") opcoes = opcoes.filter(b => Number(b.dataset.dia) === dia && Number(b.dataset.minuto) > minuto);
    if (event.key === "ArrowLeft") opcoes = opcoes.filter(b => Number(b.dataset.dia) < dia);
    if (event.key === "ArrowRight") opcoes = opcoes.filter(b => Number(b.dataset.dia) > dia);
    event.preventDefault(); event.stopPropagation();
    if (!opcoes.length) return;
    const pontuacao=(b:HTMLButtonElement)=>Math.abs(Number(b.dataset.dia)-dia)*(event.key==="ArrowUp"||event.key==="ArrowDown"?10000:1440)+Math.abs(Number(b.dataset.minuto)-minuto);
    const next=opcoes.reduce((best,b)=>pontuacao(b)<pontuacao(best)?b:best);
    next.focus({ preventScroll: true });
    scrollToProgram(next);
  };

  const horarioAgora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const horaAtual = Number(horarioAgora.find(p => p.type === "hour")?.value || 0);
  const minutoAtual = Number(horarioAgora.find(p => p.type === "minute")?.value || 0);
  const slotAtual = Math.floor((horaAtual * 60 + minutoAtual) / INTERVALO) * INTERVALO;

  const superficie = { "--nexo-grade-step": "calc(56 * var(--ott-u))" } as CSSProperties;

  return <section className="nexo-grade-agenda" role="dialog" aria-modal="true" aria-label="Grade de programação de sete dias">
    <button ref={closeRef} type="button" className="nexo-grade-voltar ott-standard-back" onClick={onClose} aria-label="Fechar grade de programação">
      <Undo2 aria-hidden="true" strokeWidth={2.5} />
    </button>
    <div className="nexo-grade-moldura" style={superficie} ref={el=>{el?.toggleAttribute("inert",!!details);}}>
      <div className="nexo-grade-cabecalho">
        <div className="nexo-grade-relogio" aria-label="Horários do dia"><Clock3 aria-hidden="true" strokeWidth={1.7}/></div>
        {datas.map((data, indice) => <div key={dataLocal(data)} className="nexo-grade-dia-titulo">
          <strong>{indice === 0 ? "hoje" : NOMES_CURTOS[data.getDay()]}</strong>
          <span>{String(data.getDate()).padStart(2, "0")}/{String(data.getMonth() + 1).padStart(2, "0")}</span>
        </div>)}
      </div>
      <div ref={viewport} className="nexo-grade-rolagem" data-ott-scroll onKeyDown={navega} tabIndex={-1}>
        <div className="nexo-grade-corpo">
          <div className="nexo-grade-escala" aria-label="Horários em intervalos de trinta minutos">
            {DIAS.map(minuto => <div key={minuto} className="nexo-grade-horario" role="gridcell" tabIndex={0} data-atual={minuto === slotAtual ? "true" : "false"}>
              <time>{horario(minuto)}</time>
            </div>)}
          </div>
          {colunas.map((segmentos, dia) => <div key={dataLocal(datas[dia])} className="nexo-grade-coluna">
            {segmentos.map(segmento => <button key={segmento.chave}
              className="nexo-grade-programa"
              type="button"
              data-dia={dia}
              data-minuto={segmento.inicio}
              data-ao-vivo={segmento.noAr ? "true" : "false"}
              data-curto={segmento.fim - segmento.inicio <= 90 ? "true" : "false"}
              data-minimo={segmento.fim - segmento.inicio <= 45 ? "true" : "false"}
              style={{
                top: `calc(${segmento.inicio / 30} * var(--nexo-grade-step))`,
                height: `calc(${Math.max(15, segmento.fim - segmento.inicio) / 30} * var(--nexo-grade-step) - calc(16 * var(--ott-u)))`,
              }}
              onClick={event=>{trigger.current=event.currentTarget;setDetails(segmento);}}
              aria-label={`${segmento.programa.nome}, ${horario(segmento.inicio)} até ${horario(segmento.fim)}, ${NOMES_LONGOS[datas[dia].getDay()]}${segmento.noAr ? ", no ar" : ""}`}>
              <span className="nexo-grade-conteudo">
                <strong>{segmento.programa.nome}</strong>
                {segmento.noAr && <span className="nexo-grade-no-ar">no ar</span>}
                {segmento.fotos.length > 0 && <span className="nexo-grade-apresentadores" aria-label={`${segmento.fotos.length} foto(s) de apresentador(es)`}>
                  {segmento.fotos.map((foto, indice) => <span className="nexo-grade-retrato" key={`${foto}-${indice}`}>
                    <NexoLoadingImage src={foto} alt="" loading="lazy" />
                  </span>)}
                </span>}
                <small>{horario(segmento.inicio)}–{horario(segmento.fim)}</small>
              </span>
            </button>)}
          </div>)}
        </div>
      </div>
      {!programasEstudio.length && (loading ? <div className="nexo-lote14-skeleton-grid" role="status" aria-label="Carregando programação">{Array.from({length:7},(_,i)=><div key={i}>{[0,1,2,3].map(j=><span key={j} className="nexo-lote14-bone"/>)}</div>)}</div> : <p className="nexo-grade-vazia">Nenhum programa cadastrado para esta rádio.</p>)}
    </div>
    {details && <section className="nexo-program-details" data-phase={detailClosing?"exit":"enter"} data-nexo-program-details role="dialog" aria-modal="true" aria-label={details.programa.nome}>
      <div className="nexo-detail-portraits nexo-lote9-portraits" aria-hidden="true">{details.fotos.slice(0,2).map(foto=><NexoLoadingImage key={foto} src={foto} alt=""/>)}</div><div className="nexo-detail-copy"><header><div><h2>{details.programa.nome}</h2><p>{details.programa.horario_inicio?.slice(0,5)} – {details.programa.horario_fim?.slice(0,5)}<br/>{details.programa.variavel?details.programa.data_variavel:(details.programa.dias_semana||[]).join(', ')||'Todos os dias'}</p></div>{details.programa.classificacao_etaria&&<span className="nexo-rating" aria-label={`Classificação etária ${details.programa.classificacao_etaria}`} style={{background:({L:'#07853c','10':'#0076bb','12':'#d7a300','14':'#df7200','16':'#bd202b','18':'#000'} as Record<string,string>)[details.programa.classificacao_etaria]||'#555'}}>{details.programa.classificacao_etaria}</span>}</header>
      <p className="nexo-detail-description" tabIndex={0} data-ott-scroll aria-label="Descrição do programa">{details.programa.descricao||'Descrição não cadastrada.'}</p><footer><ReminderToggle reminder={{id:details.programa.id||details.programa.nome,name:details.programa.nome,start:details.programa.horario_inicio||'',days:details.programa.dias_semana||[],date:details.programa.variavel?details.programa.data_variavel:null}}/><button ref={detailBack} type="button" className="ott-standard-back" onClick={closeDetails} data-nexo-detail-close aria-label="Voltar"><Undo2 strokeWidth={2.5}/></button></footer></div>
    </section>}
  </section>;
}

export default memo(NexoTvScheduleGridPortraits);
