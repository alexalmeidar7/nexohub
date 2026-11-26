import NexoLoadingImage from "./NexoLoadingImage";
import { useState } from "react";
import { UserRound } from "lucide-react";
const visitor = "/avatars/usr-default.png";
export default function OttAvatar({ src }: { src?: string | null }) {
 const [failed,setFailed]=useState<string[]>([]);
 const candidate=[src,visitor].find((url):url is string=>!!url&&!failed.includes(url));
 return candidate ? <NexoLoadingImage style={candidate===visitor?{background:"var(--ott-accent)",borderRadius:"50%"}:undefined} key={candidate} src={candidate} alt="" onError={()=>setFailed(previous=>[...previous,candidate])}/> : <UserRound aria-hidden="true"/>;
}
