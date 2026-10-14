import type { Metadata } from "next";
import DoctorView from "@/components/Doctor/DoctorView";

export const metadata: Metadata = {
  title: "Diagnostico - INONU TRADER",
  description: "O que esta funcionando no Inonu Trader instalado nesta maquina.",
};

export default function Page() {
  return <DoctorView />;
}
