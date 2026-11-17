import { playerSupabase } from "@/integrations/supabase/playerClient";
import { getTvAppLoginPath } from "@/lib/playerTvApp";

const RESULT_KEY = "nexohub:player:oauth-popup-result";
const CHANNEL_NAME = "nexohub-player-oauth";

/** Starts Google OAuth in a popup and resolves with the authenticated Player user id. */
export async function startPlayerGoogleLogin(): Promise<string> {
  if (window.houseMixDesktop) return startDesktopPlayerGoogleLogin();
  const tvSlug = window.location.pathname.match(/^\/(?:user\/)?([^/]+)\/(?:nexohub\/)?player(?:\/|$)/)?.[1];
  const tvLogin = getTvAppLoginPath(tvSlug);
  if (tvLogin) {
    window.location.assign(tvLogin);
    return await new Promise<string>(() => {});
  }

  const flowId = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const width = 500;
  const height = 650;
  const left = Math.max(0, Math.round((window.screen.width - width) / 2));
  const top = Math.max(0, Math.round((window.screen.height - height) / 2));
  const popup = window.open("about:blank", "nexohub-player-google-login", `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);
  if (!popup) throw new Error("Permita pop-ups para entrar com o Google.");

  try { localStorage.removeItem(RESULT_KEY); } catch { /* optional signal */ }
  const { data, error } = await playerSupabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/popup-callback?flow=${encodeURIComponent(flowId)}`,
      queryParams: { prompt: "select_account" },
      skipBrowserRedirect: true,
    },
  });
  if (error || !data.url) {
    popup.close();
    throw new Error(error?.message || "Não foi possível iniciar o login Google.");
  }
  popup.location.href = data.url;

  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      channel?.close();
    };
    const finish = async (success: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      try { popup.close(); } catch { /* already closed */ }
      if (!success) return reject(new Error("Login cancelado ou não concluído."));
      const { data: sessionData, error: sessionError } = await playerSupabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (sessionError || !userId) return reject(new Error("A sessão do Player não foi carregada após o login."));
      resolve(userId);
    };
    const matches = (result: any) => result?.flowId === flowId && result?.type === "nexohub:player:oauth-result";
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== popup || !matches(event.data)) return;
      void finish(Boolean(event.data.success));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== RESULT_KEY || !event.newValue) return;
      try { const result = JSON.parse(event.newValue); if (matches(result)) void finish(Boolean(result.success)); } catch { /* ignore */ }
    };
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => { if (matches(event.data)) void finish(Boolean(event.data.success)); };
    } catch { /* postMessage/storage still work */ }
    window.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);
    const poll = window.setInterval(() => { if (popup.closed) void finish(false); }, 400);
    const timeout = window.setTimeout(() => void finish(false), 120_000);
  });
}

async function startDesktopPlayerGoogleLogin(): Promise<string> {
  const desktop = window.houseMixDesktop;
  if (!desktop) throw new Error("Login externo indisponível.");

  const redirectTo = "housemix://desktop/oauth-callback";
  const { data, error } = await playerSupabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: { prompt: "select_account" },
      skipBrowserRedirect: true,
    },
  });
  if (error || !data.url) throw new Error(error?.message || "Não foi possível iniciar o login Google.");

  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    let unsubscribe: (() => void) | undefined;
    const timeout = window.setTimeout(() => finish(new Error("Tempo esgotado no login Google.")), 120_000);
    const finish = (error?: Error, userId?: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      unsubscribe?.();
      if (error) reject(error);
      else if (userId) resolve(userId);
      else reject(new Error("A sessão do Player não foi carregada após o login."));
    };
    unsubscribe = desktop.onPlayerOAuthCallback((rawUrl) => {
      let callbackUrl: URL;
      try { callbackUrl = new URL(rawUrl); } catch { return; }
      if (callbackUrl.protocol !== "housemix:" || callbackUrl.hostname !== "desktop" || callbackUrl.pathname !== "/oauth-callback") return;
      const code = callbackUrl.searchParams.get("code");
      if (!code) return finish(new Error("O Google não retornou o código de autenticação."));
      void playerSupabase.auth.exchangeCodeForSession(code).then(({ data: sessionData, error: exchangeError }) => {
        const userId = sessionData.session?.user?.id;
        if (exchangeError || !userId) return finish(new Error(exchangeError?.message || "Não foi possível concluir o login do Player."));
        finish(undefined, userId);
      }).catch((exchangeError) => finish(new Error(exchangeError?.message || "Falha ao concluir o login Google.")));
    });
    void desktop.openExternal(data.url).then((opened) => {
      if (!opened) finish(new Error("Não foi possível abrir o navegador padrão."));
    }).catch(() => finish(new Error("Não foi possível abrir o navegador padrão.")));
  });
}
