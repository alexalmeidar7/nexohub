import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { findClientAccountById, findClientAccountByEmail } from "@/lib/clientAuthAccounts";
import { getClientHouseMixProgramsSync } from "@/lib/houseMixProgramasService";
import { getApresentadores } from "./ApresentadorForm";

interface CurrentProgramInfo {
  id: string;
  nome: string;
  horario_inicio: string;
  horario_fim: string;
  selo?: string | null;
  thumb?: string | null;
  apresentador?: string | null;
  apresentadorFoto?: string | null;
}

export default function CenarioOnAirBadge({ effectiveUserId }: { effectiveUserId?: string | null }) {
  const { user } = useAuth();
  const [currentProgram, setCurrentProgram] = useState<CurrentProgramInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPresenter, setShowPresenter] = useState(false);

  const fetchOnAir = useCallback(async () => {
    try {
      const ownerId = effectiveUserId || user?.id;
      if (!ownerId) return;

      const acc = findClientAccountById(ownerId) || 
                  findClientAccountByEmail(ownerId) || 
                  findClientAccountByEmail(user?.email);
      const stationUid = acc?.id || acc?.parentUserId || ownerId;

      const now = new Date();
      const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
      const today = dayNames[now.getDay()];
      const dateStr = now.toISOString().split("T")[0];
      const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

      const parseTimeToSec = (t: string) => {
        if (!t) return -1;
        const [hh = "0", mm = "0"] = String(t).split(":");
        return Number(hh) * 3600 + Number(mm) * 60;
      };

      const { data: progs } = await supabase
        .from("programas")
        .select("id, nome, horario_inicio, horario_fim, dias_semana, selo, thumb, capa, apresentador_id, apresentadores_ids, tipo_programa, estudio, variavel, data_variavel")
        .in("user_id", Array.from(new Set([ownerId, stationUid].filter(Boolean))))
        .eq("ativo", true);

      let allProgs: any[] = (progs || []).map((p: any) => ({
        id: p.id,
        nome: p.nome,
        horario_inicio: p.horario_inicio,
        horario_fim: p.horario_fim,
        dias_semana: p.dias_semana || [],
        selo: p.selo,
        thumb: p.thumb,
        capa: p.capa,
        apresentador_id: p.apresentador_id,
        apresentadores_ids: p.apresentadores_ids || [],
        tipo_programa: p.tipo_programa,
        estudio: p.estudio || "ESTÚDIO PRINCIPAL (AO VIVO)",
        variavel: p.variavel,
        data_variavel: p.data_variavel,
      }));

      try {
        const hmProgs = getClientHouseMixProgramsSync(acc || stationUid || ownerId, user?.email);
        if (Array.isArray(hmProgs) && hmProgs.length > 0) {
          hmProgs.forEach((hp: any) => {
            if (!allProgs.some((p: any) => p.nome?.trim().toLowerCase() === hp.nome?.trim().toLowerCase())) {
              allProgs.push({
                id: hp.id,
                nome: hp.nome,
                horario_inicio: hp.horario_inicio,
                horario_fim: hp.horario_fim,
                dias_semana: hp.dias_semana || ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"],
                selo: hp.selo || null,
                thumb: hp.thumb || null,
                capa: hp.capa || null,
                apresentador_id: hp.apresentador_id || null,
                apresentadores_ids: hp.apresentadores_ids || [],
                tipo_programa: hp.tipo_programa || null,
                estudio: hp.estudio || "ESTÚDIO PRINCIPAL (AO VIVO)",
                variavel: false,
                data_variavel: null,
              });
            }
          });
        }
      } catch (err) {
        console.warn("Erro ao buscar programas House Mix:", err);
      }

      const candidates = allProgs.filter(p => {
        if (p.variavel && p.data_variavel !== dateStr) return false;
        if (!p.variavel) {
          const dias = (p.dias_semana || []).map((d: string) => String(d).toLowerCase());
          const todayLower = today.toLowerCase();
          const isAllDays = dias.length === 0 || dias.some((d: string) => d.includes("todos") || d.includes("diário") || d.includes("diario"));
          const hasDay = isAllDays || dias.some((d: string) => d.includes(todayLower) || todayLower.includes(d));
          if (!hasDay) return false;
        }
        const start = parseTimeToSec(p.horario_inicio);
        const end = parseTimeToSec(p.horario_fim);
        if (start < 0 || end < 0) return false;
        if (end <= start) {
          return nowSeconds >= start || nowSeconds < end;
        }
        return nowSeconds >= start && nowSeconds < end;
      });

      const mainStudioMatch = candidates.find(p => {
        const est = (p.estudio || "").toLowerCase();
        return est.includes("fm") || est.includes("principal") || est.includes("ao vivo");
      });
      const onAir = mainStudioMatch || (candidates.length > 0 ? candidates[0] : null);

      if (onAir) {
        let apresentadorNome = "";
        let apresentadorFoto = "";
        const apIds = onAir.apresentadores_ids?.length ? onAir.apresentadores_ids : onAir.apresentador_id ? [onAir.apresentador_id] : [];
        if (apIds.length) {
          let aps: any[] | null = null;
          try {
            const { data } = await supabase.from("apresentadores").select("nome, foto").in("id", apIds);
            aps = data;
          } catch {}
          if (!aps || aps.length === 0) {
            const fallbackAps = await getApresentadores(stationUid || ownerId, user?.email);
            aps = fallbackAps.filter(a => apIds.includes(a.id));
          }
          apresentadorNome = aps?.map(a => a.nome).join(", ") || "";
          apresentadorFoto = aps?.[0]?.foto || "";
        }
        setCurrentProgram({
          id: onAir.id,
          nome: onAir.nome,
          horario_inicio: onAir.horario_inicio,
          horario_fim: onAir.horario_fim,
          selo: onAir.selo,
          thumb: onAir.thumb || onAir.capa,
          apresentador: apresentadorNome,
          apresentadorFoto,
        });
      } else {
        setCurrentProgram(null);
      }
    } catch (e) {
      console.error("Erro ao buscar programa no ar:", e);
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId, user?.id, user?.email]);

  useEffect(() => {
    fetchOnAir();
    const interval = setInterval(fetchOnAir, 15000);
    return () => clearInterval(interval);
  }, [fetchOnAir]);

  // Alterna o texto entre programa e apresentador a cada 4 segundos.
  useEffect(() => {
    setShowPresenter(false);
    const interval = setInterval(() => {
      setShowPresenter(current => !current);
    }, 4000);
    return () => clearInterval(interval);
  }, [currentProgram?.id, currentProgram?.nome, currentProgram?.apresentador]);

  if (loading) {
    return null;
  }

  if (!currentProgram) return null;

  return (
    <span className="relative inline-flex h-2.5 w-2.5 shrink-0" title="Programa no ar" aria-label="Programa no ar">
      <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
    </span>
}
