import { useState } from "react";
import { Film, Globe, MessageCircle, type LucideIcon } from "lucide-react";
import PreRollPage from "./PreRollPage";
import AdsSitePage from "./AdsSitePage";
import AdsChatbotPage from "./AdsChatbotPage";
import adsBanner from "@/assets/ads-banner.png";

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
      {/* Banner + botões */}
      <div
        className="relative rounded-2xl overflow-hidden mb-5"
        style={{
          background: "#D6F4FB",
          boxShadow: "0 8px 32px rgba(0,0,0,0.10)",
        }}
      >
        <img
          src={adsBanner}
          alt="Como você quer anunciar?"
          style={{ width: "100%", height: "auto", display: "block" }}
        />
        <div className="absolute left-0 right-0 bottom-0 flex items-center justify-center gap-3 px-5 pb-4 pt-3">
          {TABS.map((t) => {
            const active = tab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all"
                style={{
                  background: active ? "#C6F03C" : "rgba(255,255,255,0.95)",
                  color: "#002132",
                  boxShadow: active
                    ? "0 6px 20px rgba(198,240,60,0.45)"
                    : "0 4px 12px rgba(0,0,0,0.15)",
                  transform: active ? "translateY(-1px)" : "none",
                  border: active ? "2px solid #002132" : "2px solid transparent",
                }}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "video" && <PreRollPage />}
      {tab === "site" && <AdsSitePage />}
      {tab === "chatbot" && <AdsChatbotPage />}
    </div>
  );
}
