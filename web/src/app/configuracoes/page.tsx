import type { Metadata } from "next";
import SettingsView from "@/components/Settings/SettingsView";

export const metadata: Metadata = {
  title: "Configuracoes - INONU TRADER",
  description: "Chaves de API e preferencias locais desta maquina.",
};

export default function Page() {
  return <SettingsView />;
}
