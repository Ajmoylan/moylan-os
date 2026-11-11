import type { AgentTransports, OrbitTransport } from "../../agents/types";

/**
 * Orbit transport selection (Milestone 2.4b.1b; proposal §6.2, §6.6).
 *
 * The approved uniform transport (`uFrames[]` / `uOrbitFlow[]`) stays the default: 1b introduces
 * the texture transport behind a comparison switch, and the decision to adopt it for NEX's idle
 * rendering is recorded at review, from the parity and performance evidence (proposal §15).
 *
 * The switch is the page URL's `orbits` parameter (`?orbits=texture` or `?orbits=uniforms`),
 * read once when the stage mounts. It is a diagnostic and test switch only: never linked or shown,
 * and both transports draw identical frames. Anything else means the default.
 */
export const DEFAULT_ORBIT_TRANSPORT: OrbitTransport = "uniforms";

export function orbitPreferenceFrom(search: string): OrbitTransport {
  const value = new URLSearchParams(search).get("orbits");
  return value === "texture" || value === "uniforms" ? value : DEFAULT_ORBIT_TRANSPORT;
}

/**
 * The transport an agent's idle renderer uses. The texture transport needs the agent to support
 * it and the context to pass the capability probe (asked lazily, so the probe never runs when it
 * is not wanted). Otherwise the uniform transport, which every 1b agent (NEX) supports.
 */
export function selectOrbitTransport(
  preference: OrbitTransport,
  supported: AgentTransports,
  textureAvailable: () => boolean,
): OrbitTransport {
  if (preference === "texture" && supported.idle.includes("texture") && textureAvailable()) {
    return "texture";
  }
  if (!supported.idle.includes("uniforms")) {
    // Unsupported agents (proposal §6.6) arrive with the specialists; NEX always has uniforms.
    throw new Error("No viable orbit transport for this agent");
  }
  return "uniforms";
}
