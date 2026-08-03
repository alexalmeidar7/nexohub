/**
 * Logout do Player.
 *
 * Além de encerrar a sessão do backend, faz um "best effort" para encerrar a
 * sessão do Google no navegador (iframe oculto no endpoint de logout do Google),
 * garantindo que o próximo acesso volte a pedir a escolha da conta.
 * Ao final, leva o usuário de volta à tela de login do Player.
 */

const GOOGLE_LOGOUT_URLS = [
  "https://accounts.google.com/Logout",
  "https://accounts.google.com/logout",
];

/** Dispara o logout do Google em iframes ocultos (sem sair da página). */
export function signOutGoogleSession(timeoutMs = 900): Promise<void> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve();
    const frames: HTMLIFrameElement[] = [];
    try {
      for (const url of GOOGLE_LOGOUT_URLS) {
        const iframe = document.createElement("iframe");
        iframe.setAttribute("aria-hidden", "true");
        iframe.style.position = "fixed";
        iframe.style.width = "0";
        iframe.style.height = "0";
        iframe.style.border = "0";
        iframe.style.opacity = "0";
        iframe.style.pointerEvents = "none";
        iframe.src = url;
        document.body.appendChild(iframe);
        frames.push(iframe);
      }
    } catch {
      /* ignore */
    }
    window.setTimeout(() => {
      frames.forEach((f) => {
        try { f.remove(); } catch { /* ignore */ }
      });
      resolve();
    }, timeoutMs);
  });
}

/** Limpa resíduos locais de sessão/perfil do player. */
function clearPlayerLocalState() {
  try {
    localStorage.removeItem("nexohub_backup_session");
    localStorage.setItem("nexohub_keep_connected", "false");
    Object.keys(localStorage)
      .filter((k) => k.startsWith("player_profile") || k.startsWith("nexo_player_"))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/**
 * Executa o logout completo do Player.
 * @param signOut função signOut do useAuth
 * @param loginPath rota de login do player para onde voltar (ex: "/player")
 */
export async function playerSignOut(
  signOut: (options?: { redirect?: boolean }) => Promise<void>,
  loginPath?: string,
) {
  try {
    await signOut({ redirect: false });
  } catch {
    /* ignore */
  }
  clearPlayerLocalState();
  await signOutGoogleSession();
  if (loginPath) {
    window.location.href = loginPath;
  }
}
