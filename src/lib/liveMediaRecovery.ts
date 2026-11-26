/** Recover a live connection without overriding a deliberate user pause. */
export function createLiveMediaRecovery(options:{startupGraceMs?:number;stallGraceMs?:number;recoverMissingSource?:boolean;media:()=>HTMLMediaElement|null;wanted:()=>boolean;reconnect:()=>Promise<unknown>|void}){
 let graceUntil=Date.now()+(options.startupGraceMs||0);
 let stopped=false,busy=false,attempts=0,lastTime=-1,lastProgress=Date.now();
 let retry:ReturnType<typeof setTimeout>|undefined,deadline:ReturnType<typeof setTimeout>|undefined;
 const schedule=()=>{
  if(stopped||busy||retry||!options.wanted())return;
  retry=setTimeout(async()=>{
   retry=undefined;if(stopped||busy||!options.wanted())return;
   busy=true;attempts++;
   try{await Promise.race([options.reconnect(),new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error("Live reconnect timed out")),12000);})]);}catch{/* Next check retries with bounded backoff. */}
   finally{clearTimeout(deadline);busy=false;lastProgress=Date.now();graceUntil=Date.now()+(options.startupGraceMs||0);}
  },Math.min(1000*2**Math.min(attempts,4),15000));
 };
 const tick=()=>{
  const media=options.media();if(stopped||!media||!options.wanted()){clearTimeout(retry);retry=undefined;lastProgress=Date.now();return;}
  if(!media.currentSrc&&!media.getAttribute("src")){
   if(options.recoverMissingSource && Date.now()>=graceUntil)schedule();
   return;
  }
  if(media.currentTime!==lastTime){lastTime=media.currentTime;lastProgress=Date.now();if(media.currentTime>5)attempts=0;if(!media.paused&&!media.ended&&!media.error){clearTimeout(retry);retry=undefined;}}
  if(media.currentTime>0 && !media.paused && media.readyState>=2 && Date.now()-lastProgress<3000)graceUntil=0;
  if(Date.now()<graceUntil&&!media.error)return;
  if(media.paused||media.ended||media.error||Date.now()-lastProgress>(options.stallGraceMs||12000))schedule();
 };
 const timer=setInterval(tick,2000);
 return {stop(){stopped=true;clearInterval(timer);clearTimeout(retry);clearTimeout(deadline);}};
}
