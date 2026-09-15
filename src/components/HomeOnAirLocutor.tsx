import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getApresentadores, Apresentador } from "./ApresentadorForm";
import { resolveEffectiveOnAir } from "@/lib/onAirResolver";
import { fetchStationDatabaseData } from "@/lib/stationDatabaseService";
import { findClientAccountById, findClientAccountByEmail } from "@/lib/clientAuthAccounts";
import { getClientHouseMixProgramsSync } from "@/lib/houseMixProgramasService";

interface ProgramaRaw {
  id: string;
  nome: string;
  apresentador_id?: string;
  apresentadorId?: string;
  apresentadores_ids?: string[];
  dias_semana?: string[];
  horario_inicio: string;
  horario_fim: string;
  ativo?: boolean;
}

interface Props {
  effectiveUserId?: string | null;
  visible?: boolean;
}

export default function HomeOnAirLocutor({ effectiveUserId, visible = true }: Props) {
  const { user } = useAuth();
  const [programas, setProgramas] = useState<ProgramaRaw[]>([]);
  const [apresentadores, setApresentadores] = useState<Apresentador[]>([]);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [currentLocutor, setCurrentLocutor] = useState<Apresentador | null>(null);

  const targetUserId = effectiveUserId || user?.id;
  const targetEmail = user?.email;

  // 1. Carregar fuso da empresa
  useEffect(() => {
    if (!targetUserId) return;
    async function loadTimezone() {
      try {
        const { data } = await supabase
          .from("empresa_config")
          .select("timezone")
          .eq("user_id", targetUserId)
          .maybeSingle();
        if (data?.timezone) {
          setTimezone(data.timezone);
        }
      } catch {}
    }
    loadTimezone();
  }, [targetUserId]);

  // 2. Carregar Programas e Apresentadores
  const loadData = useCallback(async () => {
    if (!targetUserId) return;

    try {
      // Apresentadores
      const apList = await getApresentadores(targetUserId, targetEmail);
      setApresentadores(apList || []);

      // Programas
      let progs: ProgramaRaw[] = [];
      const { data: dbProgs } = await supabase
        .from("programas")
        .select("id, nome, apresentador_id, apresentadores_ids, dias_semana, horario_inicio, horario_fim, ativo")
        .eq("user_id", targetUserId)
        .eq("ativo", true);

      if (dbProgs && dbProgs.length > 0) {
        progs = dbProgs.map(p => ({
          ...p,
          apresentador_id: p.apresentador_id || "",
          apresentadores_ids: p.apresentadores_ids || [],
        }));
      } else {
        // Fallback de banco da estação
        const station = await fetchStationDatabaseData(targetUserId || targetEmail);
        if (station?.programas && station.programas.length > 0) {
          progs = station.programas.map(p => ({
            id: p.id,
            nome: p.nome,
            apresentador_id: p.apresentador_id || "",
            apresentadores_ids: p.apresentadores_ids || [],
            dias_semana: p.dias_semana || [],
            horario_inicio: p.horario_inicio,
            horario_fim: p.horario_fim,
          }));
        } else {
          const clientAcc = findClientAccountById(targetUserId) || findClientAccountByEmail(targetEmail);
          const fallback = getClientHouseMixProgramsSync(clientAcc?.id, clientAcc?.email);
          progs = fallback.map(p => ({
            id: p.id,
            nome: p.nome,
            apresentador_id: p.apresentador_id || "",
            apresentadores_ids: p.apresentadores_ids || [],
            dias_semana: p.dias_semana || [],
            horario_inicio: p.horario_inicio,
            horario_fim: p.horario_fim,
          }));
        }
      }
      setProgramas(progs);
    } catch (e) {
      console.warn("HomeOnAirLocutor: Erro ao carregar dados", e);
    }
  }, [targetUserId, targetEmail]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 3. Listener em tempo real para mudanças na grade ou apresentadores
  useEffect(() => {
    if (!targetUserId) return;
    const channel = supabase
      .channel(`home-onair-locutor-${targetUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "programas" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "apresentadores" }, () => loadData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [targetUserId, loadData]);

  // 4. Calcular o programa e locutor no ar a cada 10s
  useEffect(() => {
    if (programas.length === 0) {
      setCurrentLocutor(null);
      return;
    }

    const checkOnAir = () => {
      const { current } = resolveEffectiveOnAir(programas, new Date(), timezone);
      if (!current) {
        setCurrentLocutor(null);
        return;
      }

      const apId = current.apresentador_id || current.apresentadorId || current.apresentadores_ids?.[0];
      if (!apId) {
        const byName = apresentadores.find(a => 
          a.nome && current.nome && (
            current.nome.toLowerCase().includes(a.nome.toLowerCase()) ||
            a.nome.toLowerCase().includes(current.nome.toLowerCase())
          )
        );
        setCurrentLocutor(byName || null);
        return;
      }

      const found = apresentadores.find(a => a.id === apId);
      setCurrentLocutor(found || null);
    };

    checkOnAir();
    const interval = setInterval(checkOnAir, 10000);
    return () => clearInterval(interval);
  }, [programas, apresentadores, timezone]);

  return null;
}
