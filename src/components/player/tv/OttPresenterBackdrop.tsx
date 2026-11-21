import { useEffect, useState } from "react";

export default function OttPresenterBackdrop({ photos }: { photos: string[] }) {
  const key = photos.join("|");
  return <PresenterLoop key={key} photos={photos} />;
}
function PresenterLoop({ photos }: { photos: string[] }) {
  const [index, setIndex] = useState(0), [phase, setPhase] = useState("enter");
  useEffect(() => {
    if (!photos.length) return;
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    const enter = () => { setPhase("enter"); timer = setTimeout(() => { setPhase("idle"); dwell(); }, 900); };
    const dwell = () => {
      if (photos.length < 2) return;
      timer = setTimeout(() => {
        if (stopped) return;
        setPhase("exit");
        timer = setTimeout(() => { if (stopped) return; setIndex(i => (i + 1) % photos.length); enter(); }, 700);
      }, 6000);
    };
    photos.forEach(url => { const image = new Image(); image.src = url; });
    enter();
    return () => { stopped = true; clearTimeout(timer); };
  }, [photos.join("|")]);
  if (!photos.length) return null;
  return <div className="ott-presenter-backdrop ott-presenter-loop" data-phase={phase} aria-hidden="true"><img key={photos[index]} src={photos[index]} alt="" onError={e=>{e.currentTarget.style.visibility="hidden";}} /></div>;
}
