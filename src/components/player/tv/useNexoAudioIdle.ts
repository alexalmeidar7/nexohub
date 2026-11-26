import {useLayoutEffect,useRef} from 'react';

const hiddenControls='.ott-watch-back,.ott-transport,.ott-channel-up,.ott-open-schedule,.ott-channel-down,.ott-watch-schedule-button';
const externalDialogs='.nexo-tv-cep-overlay,.nexo-tv-commercial-playback,.nexo-home-commercial-qr,[role="dialog"][aria-modal="true"]';
const IDLE_MS=5000;

/** Only the audio chrome: no state changes to playback, track or profile. */
export function useNexoAudioIdle(getRoot:()=>HTMLDivElement|null,enabled:boolean,channelKey?:string){
 const latest=useRef({getRoot,enabled});latest.current={getRoot,enabled};
 const reset=useRef<()=>void>(()=>{});
 useLayoutEffect(()=>{
  let timer:number|undefined, frame:number|undefined, idle=false, last=0, wasBlocked=false;
  let activeRoot:HTMLDivElement|null=null, previousFocus:HTMLElement|null=null;
  const clear=()=>{if(timer!==undefined)window.clearTimeout(timer);timer=undefined;};
  const hasDialog=()=>!!document.querySelector(externalDialogs);
  const measure=(root:HTMLDivElement)=>{
   const album=root.querySelector<HTMLElement>('.ott-audio-stage .ott-album');
   const program=root.querySelector<HTMLElement>('.ott-watch-footer > .ott-watch-program');
   if(!album||!program||!program.offsetParent)return false;
   // offsetLeft is unaffected by the program's transition. The cover only animates vertically.
   const parent=program.offsetParent as HTMLElement;
   const x=album.getBoundingClientRect().left-(parent.getBoundingClientRect().left+parent.clientLeft+program.offsetLeft);
   if(!Number.isFinite(x))return false;
   root.style.setProperty('--nexo-audio-idle-x',`${x}px`);return true;
  };
  const show=()=>{
   if(activeRoot){activeRoot.removeAttribute('data-nexo-lote15-audio-idle');activeRoot.style.removeProperty('--nexo-audio-idle-x');}
   activeRoot=latest.current.getRoot();idle=false;
   if(activeRoot&&latest.current.enabled&&activeRoot.classList.contains('ott-audio'))activeRoot.setAttribute('data-nexo-lote15-audio-idle','false');
  };
  const arm=(delay=IDLE_MS)=>{clear();if(latest.current.enabled)timer=window.setTimeout(check,delay);};
  function check(){
   timer=undefined;const root=latest.current.getRoot();
   if(!latest.current.enabled||!root||!root.classList.contains('ott-audio')){show();return;}
   if(hasDialog()){wasBlocked=true;if(idle)show();arm(500);return;}
   if(wasBlocked){wasBlocked=false;last=performance.now();arm();return;}
   const remaining=IDLE_MS-(performance.now()-last);if(remaining>0){arm(Math.ceil(remaining));return;}
   if(!measure(root)){arm(500);return;}
   const focused=document.activeElement;
   previousFocus=focused instanceof HTMLElement&&root.contains(focused)&&focused.closest(hiddenControls)?focused:null;
   idle=true;activeRoot=root;root.setAttribute('data-nexo-lote15-audio-idle','true');
  }
  const restart=()=>{show();previousFocus=null;wasBlocked=false;last=performance.now();arm();};
  reset.current=restart;
  const wake=(event:Event)=>{
   if(!latest.current.enabled)return;
   const root=latest.current.getRoot();if(!root||!root.classList.contains('ott-audio'))return;
   const wasIdle=idle;const restore=previousFocus;
   last=performance.now();if(wasIdle)show();
   // Do not reset timers at pointer-event frequency; the pending check uses last.
   if(timer===undefined)arm();
   if(wasIdle&&(event.type==='keydown'||event.type==='nexo:tv-back')&&!hasDialog()){
    event.preventDefault();event.stopImmediatePropagation();
    if(frame!==undefined)cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{frame=undefined;if(!latest.current.enabled)return;const target=restore?.isConnected?restore:root.querySelector<HTMLElement>('.ott-play');target?.focus({preventScroll:true});});
   }
   previousFocus=null;
  };
  const resize=()=>{if(idle&&activeRoot)measure(activeRoot);};
  const visibility=()=>{if(!document.hidden)restart();else clear();};
  // Registered before the existing D-pad/back listeners. First hidden key reveals controls, not an invisible action.
  window.addEventListener('keydown',wake,true);window.addEventListener('nexo:tv-back',wake,true);
  window.addEventListener('pointermove',wake,true);window.addEventListener('mousemove',wake,true);window.addEventListener('pointerdown',wake,true);
  window.addEventListener('resize',resize);document.addEventListener('visibilitychange',visibility);
  restart();
  return()=>{clear();if(frame!==undefined)cancelAnimationFrame(frame);if(activeRoot){activeRoot.removeAttribute('data-nexo-lote15-audio-idle');activeRoot.style.removeProperty('--nexo-audio-idle-x');}window.removeEventListener('keydown',wake,true);window.removeEventListener('nexo:tv-back',wake,true);window.removeEventListener('pointermove',wake,true);window.removeEventListener('mousemove',wake,true);window.removeEventListener('pointerdown',wake,true);window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);reset.current=()=>{};};
 },[]);
 useLayoutEffect(()=>{reset.current();},[enabled,channelKey]);
}
