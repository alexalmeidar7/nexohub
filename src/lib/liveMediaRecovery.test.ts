import { afterEach,expect,it,vi } from "vitest";
import { createLiveMediaRecovery } from "./liveMediaRecovery";
afterEach(()=>vi.useRealTimers());
const media=()=>({currentSrc:"https://station.invalid/live",getAttribute:()=>null,currentTime:0,paused:true,ended:false,error:null} as unknown as HTMLMediaElement);
it("recovers an unexpected pause and preserves the deliberate user pause",async()=>{
 vi.useFakeTimers();let wanted=true;const reconnect=vi.fn().mockResolvedValue(undefined);
 const recovery=createLiveMediaRecovery({media,wanted:()=>wanted,reconnect});
 await vi.advanceTimersByTimeAsync(3000);expect(reconnect).toHaveBeenCalledTimes(1);
 wanted=false;await vi.advanceTimersByTimeAsync(30000);expect(reconnect).toHaveBeenCalledTimes(1);
 recovery.stop();expect(vi.getTimerCount()).toBe(0);
});
it("does not overlap a pending reconnect",async()=>{
 vi.useFakeTimers();let finish!:()=>void;const reconnect=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve}));
 const recovery=createLiveMediaRecovery({media,wanted:()=>true,reconnect});
 await vi.advanceTimersByTimeAsync(3000);await vi.advanceTimersByTimeAsync(8000);expect(reconnect).toHaveBeenCalledTimes(1);
 finish();await vi.advanceTimersByTimeAsync(1);recovery.stop();expect(vi.getTimerCount()).toBe(0);
});
