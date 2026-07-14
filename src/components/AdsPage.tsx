import { useState } from "react";
import { Film, Globe, MessageCircle, type LucideIcon } from "lucide-react";
import PreRollPage from "./PreRollPage";
import AdsSitePage from "./AdsSitePage";
import AdsChatbotPage from "./AdsChatbotPage";

type Tab = "video" | "site" | "chatbot";

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "video", label: "Vídeo", icon: Film },
  { id: "site", label: "Site", icon: Globe },
  { id: "chatbot", label: "Chatbot", icon: MessageCircle },
];

export default function AdsPage() {
  const [tab, setTab] = useState<Tab>("video");

  return (
    <div className="nexo-scope animate-fade-in">
      <div
        className="flex items-center gap-2 mb-4 p-1.5 rounded-2xl w-fit"
        style={{
          background: "color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 12%, var(--layout-page-bg, #ffffff) 88%)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
        }}
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
              style={{
                background: active ? "var(--layout-accent-color, #2563eb)" : "transparent",
                color: active ? "#fff" : "var(--layout-page-text, #1a1a1a)",
                opacity: active ? 1 : 0.7,
              }}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "video" && <PreRollPage />}
      {tab === "site" && <AdsSitePage />}
      {tab === "chatbot" && <AdsChatbotPage />}
    </div>
  );
}
