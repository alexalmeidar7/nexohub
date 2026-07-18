import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isPrivateOrLocalUrl } from "../_shared/auth.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Map Portuguese day names to JS getDay() numbers */
const DAY_MAP: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terça: 2, "terca": 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sábado: 6, "sabado": 6,
};

function matchesDay(diasSemana: string[] | null, jsDay: number): boolean {
  if (!diasSemana || diasSemana.length === 0) return true; // no restriction = every day
  return diasSemana.some((d) => {
    const normalized = d.toLowerCase().replace(/[-.,]/g, "").trim();
    for (const [key, val] of Object.entries(DAY_MAP)) {
      if (normalized.startsWith(key)) return val === jsDay;
    }
    return false;
  });
}

function matchesTime(horario: string, nowHH: string, nowMM: string): boolean {
  if (!horario) return false;
  const parts = horario.split(":");
  return parts[0]?.padStart(2, "0") === nowHH && parts[1]?.padStart(2, "0") === nowMM;
}

async function executeVmixCommands(
  vmixBaseUrl: string,
  vmixUser: string | null,
  vmixPass: string | null,
  commands: any[],
): Promise<{ executed: number; ok: boolean }> {
  const fetchHeaders: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (compatible; VmixScheduler/1.0)",
    Accept: "application/xml, text/xml, text/html, */*",
  };

  if (vmixUser) {
    const credentials = btoa(`${vmixUser}:${vmixPass || ""}`);
    fetchHeaders.Authorization = `Basic ${credentials}`;
  }

  const baseUrl = vmixBaseUrl.replace(/\/+$/, "");
  let executed = 0;

  for (const cmd of commands) {
    const fn = cmd.fn || "";
    const input = cmd.input || "";
    const value = cmd.extraValue
      ? cmd.value ? `${cmd.value},${cmd.extraValue}` : cmd.extraValue
      : cmd.value || "";

    let path = `/api/?Function=${encodeURIComponent(fn)}`;
    if (input) path += `&Input=${encodeURIComponent(input)}`;
    if (value) path += `&Value=${encodeURIComponent(value)}`;

    try {
      const response = await fetch(baseUrl + path, {
        method: "GET",
        headers: fetchHeaders,
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) executed++;
      console.log(`[scheduler] ${fn} → ${response.status}`);
    } catch (err) {
      console.error(`[scheduler] ${fn} failed:`, err);
    }

    // delay between commands
    if (commands.indexOf(cmd) < commands.length - 1) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  return { executed, ok: executed > 0 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Current time in Brasília (UTC-3)
    const now = new Date();
    const brasiliaOffset = -3 * 60;
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const brasiliaDate = new Date(utcMs + brasiliaOffset * 60000);

    const nowHH = String(brasiliaDate.getHours()).padStart(2, "0");
    const nowMM = String(brasiliaDate.getMinutes()).padStart(2, "0");
    const jsDay = brasiliaDate.getDay();

    console.log(`[scheduler] Checking at ${nowHH}:${nowMM} (day ${jsDay})`);

    const results: string[] = [];

    // ── 1. Program presets ──
    const { data: presets } = await supabase
      .from("preset_commands")
      .select("id, user_id, programa_id, commands, custom_horario");

    if (presets && presets.length > 0) {
      // Get all related programs
      const programaIds = [...new Set(presets.map((p: any) => p.programa_id))];
      const { data: programas } = await supabase
        .from("programas")
        .select("id, nome, horario_inicio, dias_semana")
        .in("id", programaIds);

      const programaMap = new Map((programas || []).map((p: any) => [p.id, p]));

      for (const preset of presets) {
        const programa = programaMap.get(preset.programa_id);
        if (!programa) continue;

        const horario = preset.custom_horario || programa.horario_inicio;
        const diasSemana = programa.dias_semana;

        if (!matchesTime(horario, nowHH, nowMM)) continue;
        if (!matchesDay(diasSemana, jsDay)) continue;

        const cmds = preset.commands;
        if (!cmds || !Array.isArray(cmds) || cmds.length === 0) continue;

        // Get user's vMix settings
        const { data: settings } = await supabase
          .from("user_settings")
          .select("vmix_url, vmix_user, vmix_pass")
          .eq("user_id", preset.user_id)
          .maybeSingle();

        if (!settings?.vmix_url) continue;
        if (isPrivateOrLocalUrl(settings.vmix_url)) { console.log(`[scheduler] skip preset (private URL) user=${preset.user_id}`); continue; }



        console.log(`[scheduler] Executing preset for "${programa.nome}" (user: ${preset.user_id})`);
        const result = await executeVmixCommands(
          settings.vmix_url,
          settings.vmix_user,
          settings.vmix_pass,
          cmds,
        );
        results.push(`Preset "${programa.nome}": ${result.executed}/${cmds.length} cmds`);
      }
    }

    // ── 2. Custom buttons ──
    const { data: buttons } = await supabase
      .from("custom_vmix_buttons")
      .select("id, user_id, nome, commands, horario, dias_semana");

    if (buttons && buttons.length > 0) {
      for (const btn of buttons) {
        if (!btn.horario || !btn.dias_semana || btn.dias_semana.length === 0) continue;
        if (!matchesTime(btn.horario, nowHH, nowMM)) continue;
        if (!matchesDay(btn.dias_semana, jsDay)) continue;

        const cmds = btn.commands;
        if (!cmds || !Array.isArray(cmds) || (cmds as any[]).length === 0) continue;

        const { data: settings } = await supabase
          .from("user_settings")
          .select("vmix_url, vmix_user, vmix_pass")
          .eq("user_id", btn.user_id)
          .maybeSingle();

        if (!settings?.vmix_url) continue;
        if (isPrivateOrLocalUrl(settings.vmix_url)) { console.log(`[scheduler] skip button (private URL) user=${btn.user_id}`); continue; }



        console.log(`[scheduler] Executing button "${btn.nome}" (user: ${btn.user_id})`);
        const result = await executeVmixCommands(
          settings.vmix_url,
          settings.vmix_user,
          settings.vmix_pass,
          cmds as any[],
        );
        results.push(`Button "${btn.nome}": ${result.executed}/${(cmds as any[]).length} cmds`);
      }
    }

    console.log(`[scheduler] Done. ${results.length} executions.`);

    return new Response(
      JSON.stringify({ success: true, time: `${nowHH}:${nowMM}`, day: jsDay, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[scheduler] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Scheduler error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
