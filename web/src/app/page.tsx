import type { Metadata } from "next";
import MesaView from "@/components/Desk/MesaView";

export const metadata: Metadata = {
  title: "INONU TRADER, mesa de decisao",
  description: "Mesa de decisao do Inonu: mercado real da OKX, carteira OKX Wallet e ecossistema OnchainOS em uma tela.",
};

export default function Page() {
  return <MesaView />;
}
