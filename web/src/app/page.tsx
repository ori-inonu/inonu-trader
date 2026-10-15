import type { Metadata } from "next";
import AgentView from "@/components/Agent/AgentView";

export const metadata: Metadata = {
  title: "INONU TRADER, agente autonomo",
  description: "O agente autonomo do Inonu: o que ele ve, o que decide, o que fez e a prova de que rende.",
};

export default function Page() {
  return <AgentView />;
}
