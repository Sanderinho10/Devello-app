import { ModulMangler } from "@/components/ModulMangler";
import { harModul } from "@/lib/moduler";
import { selskapetsModular } from "../../moduler";

/** Ordrepunktene i menyen finnes bare med ordremodulen. En direkte adresse sier fra. */
export async function KrevOrdre({ children }: { children: React.ReactNode }) {
  if (!harModul(await selskapetsModular(), "ordre")) return <ModulMangler modul="Ordre" />;
  return <>{children}</>;
}
