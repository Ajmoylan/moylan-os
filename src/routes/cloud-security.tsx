import { agents } from "~/agents/registry";
import { AgentEnvironment } from "~/components/AgentEnvironment";
import { buildMeta } from "~/content/meta";
import type { Route } from "./+types/cloud-security";

const agent = agents.cipher;

export const meta: Route.MetaFunction = () =>
  buildMeta({
    title: `${agent.domain} · ${agent.name}`,
    description: agent.summary,
    path: agent.route,
  });

export default function CipherEnvironment() {
  return <AgentEnvironment agent={agent} />;
}
