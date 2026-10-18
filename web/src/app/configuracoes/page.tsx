import type { Metadata } from "next";
import SettingsView from "@/components/Settings/SettingsView";

export const metadata: Metadata = {
  title: "Configuracoes - INONU TRADER",
  description: "Chaves de API e preferencias locais desta maquina.",
};

export default function Page() {
  if (process.env.NEXT_PUBLIC_INONU_DEV === "1") {
    return (
      <main>
        <h1>Configurações indisponíveis no modo dev</h1>
        <p>Esta página é somente leitura. A tela operacional de configurações não será carregada.</p>
      </main>
    );
  }
  return <SettingsView />;
}
