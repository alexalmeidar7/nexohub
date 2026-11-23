import { countStream } from "../_shared/stream-count.ts";
Deno.serve(req => countStream(req, "audio"));
