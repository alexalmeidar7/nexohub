"use strict";
const https = require("node:https");
const { isIP } = require("node:net");
function createLanClient({ endpoint, deviceKey, ca, request = https.request }) {
  const base = new URL(endpoint);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/" ||
      !/^[A-Za-z0-9_-]{32,256}$/.test(deviceKey || "") || !ca) throw new Error("invalid_lan_configuration");
  const host = base.hostname;
  if (isIP(host) !== 4 || !/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(host)) throw new Error("private_lan_address_required");
  function call(method, route, body) {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      if (payload && Buffer.byteLength(payload) > 65536) return reject(new Error("lan_payload_too_large"));
      const req = request(new URL(route, base), { method, ca, rejectUnauthorized: true, minVersion: "TLSv1.2",
        headers: { authorization: "Bearer " + deviceKey, ...(payload ? {"content-type":"application/json","content-length":Buffer.byteLength(payload)} : {}) }
      }, res => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume(); return reject(Object.assign(new Error("lan_http_error"), {statusCode:res.statusCode}));
        }
        let size=0; const chunks=[];
        res.on("error", reject);
        res.on("aborted", () => reject(new Error("lan_response_aborted")));
        res.on("data", chunk => {
          size += chunk.length;
          if(size > 20*1024*1024) { res.destroy(new Error("lan_response_too_large")); return; }
          chunks.push(chunk);
        });
        res.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch(e) { reject(e); } });
      });
      const timer=setTimeout(() => req.destroy(new Error("lan_timeout")),10000);
      req.on("close",()=>clearTimeout(timer));
      req.on("error",reject);
      req.end(payload);
    });
  }
  return Object.freeze({
    identity: () => call("GET","/v1/me"),
    push: event => call("POST","/v1/sync/outbox",event),
    pull: (cursor, limit=100) => {
      if(!Number.isInteger(limit)||limit<1||limit>250|| (cursor != null && (typeof cursor!=="string"||cursor.length>512))) throw new Error("invalid_lan_cursor");
      const params = new URLSearchParams({limit:String(limit)});
      if(cursor) params.set("cursor",cursor);
      return call("GET","/v1/sync/changes?"+params);
    }
  });
}
module.exports={createLanClient};
