import { supabase } from "../supabase/client";

type OAuthProvider = "google" | "apple" | "microsoft" | "lovable";
type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

/**
 * Compatibility facade for existing login screens.
 * OAuth is handled directly by this project's Supabase Auth instance;
 * no Lovable-managed authentication or token exchange is involved.
 */
export const lovable = {
  auth: {
    signInWithOAuth: async (provider: OAuthProvider, opts?: SignInOptions) => {
      if (provider === "lovable" || provider === "microsoft") {
        return {
          error: new Error(`OAuth provider "${provider}" is not configured for native Supabase Auth.`),
        };
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: opts?.redirect_uri || window.location.origin,
          queryParams: opts?.extraParams,
        },
      });

      if (error) return { error };
      return { redirected: Boolean(data?.url), data };
    },
  },
};
