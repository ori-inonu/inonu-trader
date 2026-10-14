import type { Metadata } from "next";
import RastreadorView from "@/components/Rastreador/RastreadorView";

export const metadata: Metadata = {
  title: "Rastreador - INONU TRADER",
  description: "Pares spot e perpetuos da OKX em uma tabela com filtros, visoes e telas salvas.",
};

export default function Page() {
  return <RastreadorView />;
}
