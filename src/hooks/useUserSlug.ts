import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useUserSlug(userId?: string) {
  const [slug, setSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("slug")
        .eq("id", userId)
        .maybeSingle();
      if (data?.slug) setSlug(data.slug);
    })();
  }, [userId]);

  return slug;
}
