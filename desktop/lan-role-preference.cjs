"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
function filename(root, station) {
  if (typeof station !== "string" || !UUID.test(station)) throw Error("Emissora inválida");
  return path.join(root, "station-roles", station.toLowerCase()+".json");
}
function readStationRole(root, station) {
  let selected = "principal";
  try { const data=JSON.parse(fs.readFileSync(filename(root,station),"utf8"));
    if (data.selected === "secondary") selected = "secondary";
  } catch(e) { if(e.code !== "ENOENT") throw e; }
  return {selected, effective:"cloud", lanActive:false, transport:"not_paired",
    message:selected === "secondary" ?
      "Secundário selecionado. Aguardando conexão LAN segura; a sincronização atual permanece online." :
      "Principal selecionado. A sincronização online atual permanece ativa."};
}
function writeStationRole(root, station, selected) {
  if(!["principal","secondary"].includes(selected)) throw Error("Papel inválido");
  const file=filename(root,station);
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const temp=file+"."+crypto.randomBytes(8).toString("hex")+".tmp";
  try {
    fs.writeFileSync(temp,JSON.stringify({selected,updated_at:new Date().toISOString()}),{encoding:"utf8",mode:0o600,flag:"wx"});
    fs.renameSync(temp,file);
  } finally { try { fs.unlinkSync(temp); } catch {} }
  return readStationRole(root,station);
}
module.exports={readStationRole,writeStationRole};