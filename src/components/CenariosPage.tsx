import { lazy, Suspense, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MonitorPlay, Tv } from "lucide-react";
import { Loader2 } from "lucide-react";

const CenarioInterativoPage = lazy(() => import("./CenarioInterativoPage"));
const CenariosEstudioPage = lazy(() => import("./CenariosEstudioPage"));

export default function CenariosPage() {
  const [tab, setTab] = useState<"interativo" | "estudio">("interativo");

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="interativo" className="gap-2">
            <MonitorPlay className="h-4 w-4" /> Cenário Interativo
          </TabsTrigger>
          <TabsTrigger value="estudio" className="gap-2">
            <Tv className="h-4 w-4" /> Cenários Estúdio
          </TabsTrigger>
        </TabsList>
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
            </div>
          }
        >
          <TabsContent value="interativo" className="mt-4">
            <CenarioInterativoPage />
          </TabsContent>
          <TabsContent value="estudio" className="mt-4">
            <CenariosEstudioPage />
          </TabsContent>
        </Suspense>
      </Tabs>
    </div>
  );
}
