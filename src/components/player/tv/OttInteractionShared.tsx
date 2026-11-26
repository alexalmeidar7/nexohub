import { type CSSProperties, type RefObject } from "react";
import OttBattle from "./OttBattle";
import { Swords, History, ListChecks, MessagesSquare, MicVocal, Sparkles, Sun, Undo2 } from "lucide-react";
import OttCommercialSlot, { AdsProgramContext } from "./OttCommercialSlot";
import OttTvChat from "./OttTvChat";
import OttInteractivity from "./OttInteractivity";
import NexoTvHistoryCarousel from "./NexoTvHistoryCarousel";
export const shortcuts = [
 { id: "lyrics", label: "Letra da música", Icon: MicVocal },
 { id: "chat", label: "Chat", Icon: MessagesSquare },
 { id: "poll", label: "Enquete", Icon: ListChecks },
 { id: "weather", label: "Previsão do tempo", Icon: Sun },
 { id: "history", label: "Músicas tocadas", Icon: History },
 { id: "battle", label: "Batalha musical", Icon: Swords },
] as const;
export type Shortcut = typeof shortcuts[number]["id"];


export function OttInteractionCards({shortcutsOpen,activePanel,firstShortcutRef,selectedRef,closePanel,setPanelClosing,setPanel,closeShortcuts,hasActivePoll}:{shortcutsOpen:boolean;activePanel:Shortcut|null;firstShortcutRef:RefObject<HTMLButtonElement>;selectedRef:{current:HTMLButtonElement|null};closePanel:()=>void;setPanelClosing:(v:boolean)=>void;setPanel:(v:Shortcut|null)=>void;closeShortcuts:()=>void;hasActivePoll:boolean}){return (<div id="ott-interactivity-shortcuts" className="ott-interactivity-shortcuts" data-open={shortcutsOpen} data-panel-open={activePanel ? "true" : "false"} style={{ "--ott-shortcut-count": shortcuts.length } as CSSProperties} role="group" aria-label="Atalhos de interatividade" aria-hidden={!shortcutsOpen}>
      {shortcuts.map(({ id, label, Icon }, index) => (
       <button
        key={id}
        ref={index === 0 ? firstShortcutRef : undefined}
        className="ott-interactivity-card"
        type="button"
        disabled={!shortcutsOpen}
        aria-expanded={activePanel === id}
        aria-controls={activePanel === id ? "ott-interactivity-detail" : undefined}
        style={{ "--ott-card-index": index } as CSSProperties}
        onClick={event => {
         selectedRef.current = event.currentTarget;
         if (activePanel === id) closePanel();
         else {
          setPanelClosing(false);
          setPanel(id);
         }
        }}
       >
        <span>{label}</span>
        <Icon aria-hidden="true" strokeWidth={1.35} />
        {id === "poll" && hasActivePoll && <span aria-hidden="true" className="ott-poll-activity-dot" />}
       </button>
      ))}
     

     
      {/* NEXO_ATALHOS_VOLTA_FLAT_20261121 */}
      <button type="button" className="ott-interactivity-back" aria-label="Voltar da interatividade" disabled={!shortcutsOpen} onClick={closeShortcuts}>
       <Undo2 aria-hidden="true" strokeWidth={2.5} />
      </button>
     </div>);}
export function OttInteractionPanel({panel,panelClosing,setPanel,panelBackRef,closePanel,owner,programId,title,artist,canVote,loadHistoryCover}:{panel:Shortcut;panelClosing:boolean;setPanel:(v:Shortcut|null)=>void;panelBackRef:RefObject<HTMLButtonElement>;closePanel:()=>void;owner?:string|null;programId?:string|null;title:string;artist?:string;canVote:boolean;loadHistoryCover?:(artist:string,title:string)=>Promise<string|undefined>}){return (<AdsProgramContext.Provider value={programId}><section
      key={panel}
      id="ott-interactivity-detail"
      className={`ott-interactivity-panel ott-interactivity-panel-${panel}${panel === "battle" ? " ott-interactivity-panel-poll" : ""}${panel === "history" || panel === "weather" ? " ott-interactivity-rail" : ""}`}
      data-phase={panelClosing ? "exit" : "enter"}
      aria-labelledby={panel === "chat" ? undefined : "ott-watch-panel-title"}
      aria-label={panel === "chat" ? "Chat" : undefined}
      aria-hidden={panelClosing || undefined}
      tabIndex={panelClosing || panel !== "lyrics" ? -1 : 0}
      data-ott-scroll={panel === "lyrics" || undefined}
      ref={element => { element?.toggleAttribute("inert", panelClosing); }}
      onAnimationEnd={event => {
       if (panelClosing && event.target === event.currentTarget) setPanel(null);
      }}
     >
      {panel === "chat" ? (
        <OttTvChat radioUserId={owner} onClose={closePanel}/>
      ) : <>
      <header>
       <h2 id="ott-watch-panel-title">{shortcuts.find(shortcut => shortcut.id === panel)?.label}</h2>
       <button ref={panelBackRef} className="ott-standard-back" onClick={closePanel} aria-label="Fechar painel"><Undo2 strokeWidth={2.5}/></button>
      </header>
      {panel === "battle" ? <><OttBattle owner={owner} canVote={canVote}/><OttCommercialSlot radioId={owner} placement="poll_ads"/></> : panel === "history" ? <NexoTvHistoryCarousel owner={owner} loadCover={loadHistoryCover}/> :
       <><OttInteractivity page={panel} owner={owner} canVote={canVote} title={title} artist={artist}/><OttCommercialSlot radioId={owner} placement={panel === "poll" ? "poll_ads" : panel === "weather" ? "weather_ads" : "lyrics_ads"}/></>}
      </>}
     </section></AdsProgramContext.Provider>);}
export function OttInteractionToggle({toggleRef,shortcutsOpen,closeShortcuts,openShortcuts,hasActivePoll}:{toggleRef:RefObject<HTMLButtonElement>;shortcutsOpen:boolean;closeShortcuts:()=>void;openShortcuts:()=>void;hasActivePoll:boolean}){return <button ref={toggleRef} className="ott-interactivity-button" aria-label="Interatividade" title="Interatividade" aria-expanded={shortcutsOpen} aria-controls="ott-interactivity-shortcuts" onClick={()=>shortcutsOpen?closeShortcuts():openShortcuts()}><Sparkles aria-hidden="true" fill="currentColor" strokeWidth={1.4}/>{hasActivePoll&&<span aria-hidden="true" className="ott-poll-activity-dot"/>}</button>;}
