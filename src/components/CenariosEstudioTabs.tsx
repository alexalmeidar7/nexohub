import { Suspense, useRef, useEffect } from "react";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { lazyRetry } from "@/lib/lazyRetry";
import { registerAddTemplate } from "./CenariosPage";

const CenariosEstudioPage = lazyRetry(() => import("./CenariosEstudioPage"));
const CenariosEstudioWebPage = lazyRetry(() => import("./CenariosEstudioWebPage"));

type SubTab = "imagens" | "web";

export default function CenariosEstudioTabs({ subTab, effectiveUserId }: { subTab?: SubTab; effectiveUserId?: string | null } = {}) {
  const pageRef = useRef<{ addGrupo: () => void } | null>(null);
  const tab = subTab || "imagens";

  useEffect(() => {
    registerAddTemplate(() => pageRef.current?.addGrupo?.());
  }, []);

  return (
    <Suspense fallback={<ModulePageSkeleton />}>
      {tab === "imagens" ? (
        <CenariosEstudioPage ref={pageRef} effectiveUserId={effectiveUserId} />
      ) : (
        <CenariosEstudioWebPage effectiveUserId={effectiveUserId} />
      )}
    </Suspense>
  );
}
