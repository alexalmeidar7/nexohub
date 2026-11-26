import {useRef,useState,useEffect,type ImgHTMLAttributes} from 'react';
/** Keeps original img geometry and callbacks; a placeholder only for pending pixels. */
export default function NexoLoadingImage(props:ImgHTMLAttributes<HTMLImageElement>){
 const {src,onLoad,onError,...rest}=props;
 const ref=useRef<HTMLImageElement>(null);
 const [status,setStatus]=useState<{url:string|undefined;pending:boolean}>({url:src,pending:false});
 useEffect(()=>{const el=ref.current;if(!src||!el||el.complete)return;
   const timer=window.setTimeout(()=>{if(ref.current&&!ref.current.complete)setStatus({url:src,pending:true});},160);
   const timeout=window.setTimeout(()=>setStatus({url:src,pending:false}),12000);
   return()=>{clearTimeout(timer);clearTimeout(timeout)};
 },[src]);
 return <img {...rest} ref={ref} src={src} data-nexo-image-pending={status.url===src&&status.pending?'true':undefined} onLoad={e=>{setStatus({url:src,pending:false});onLoad?.(e)}} onError={e=>{setStatus({url:src,pending:false});onError?.(e)}}/>;
}
