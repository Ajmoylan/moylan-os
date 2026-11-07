import { agents } from "~/agents/registry";
import { AgentEnvironment } from "~/components/AgentEnvironment";
import { buildMeta } from "~/content/meta";
import type { Route } from "./+types/ai";

const agent = agents.syn;

export const meta: Route.MetaFunction = () =>
  buildMeta({
    title: `${agent.domain} · ${agent.name}`,
    description: agent.summary,
    path: agent.route,
  });

export default function SynEnvironment() {
  return <AgentEnvironment agent={agent} />;
}
