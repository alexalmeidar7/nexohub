import { Suspense, useState } from "react";
import { Image as ImageIcon, Globe } from "lucide-react";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { lazyRetry } from "@/lib/lazyRetry";

const CenariosEstudioPage = lazyRetry(() => import("./CenariosEstudioPage"));
const CenariosEstudioWebPage = lazyRetry(() => import("./CenariosEstudioWebPage"));

type SubTab = "imagens" | "web";

const SUB_TABS: { id: SubTab; label: string; icon: typeof ImageIcon }[] = [
  { id: "imagens", label: "Cenário por imagens", icon: ImageIcon },
  { id: "web", label: "Cenário web", icon: Globe },
];

export default function CenariosEstudioTabs({ effectiveUserId }: { effectiveUserId?: string | null } = {}) {
  const [tab, setTab] = useState<SubTab>("imagens");

  return (
    <Suspense fallback={<ModulePageSkeleton />}>
      {tab === "imagens" ? <CenariosEstudioPage effectiveUserId={effectiveUserId} /> : <CenariosEstudioWebPage effectiveUserId={effectiveUserId} />}
    </Suspense>
  );
}
