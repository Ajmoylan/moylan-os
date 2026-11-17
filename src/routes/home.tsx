import { Fragment, lazy, Suspense } from "react";
import { Link } from "react-router";
import { NexGuide } from "~/components/nex/NexGuide";
import { NexSlot } from "~/components/nex/NexSlot";
import { buttonClass as button } from "~/components/ui/ContactActions";
import { buildMeta } from "~/content/meta";
import { site } from "~/content/site";
import { LICENSED_RECORDING } from "~/content/voice";
import type { Route } from "./+types/home";

export const meta: Route.MetaFunction = () => buildMeta({ path: "/" });

/**
 * Very wide screens (80rem+), where NEX's guide sits beside him: the opening keeps NEX fully in
 * view until he docks. Narrower wide screens (64–80rem) put the guide beneath him, so he rides with
 * the page there instead: kept in view, he would move down over his own guide.
 */
const CONTAIN = "(min-width: 80rem)";
/**
 * Phones and tablets: the opening fills the screen, so NEX docks as soon as the visitor scrolls.
 * Riding the opening up would move him from the page's scroll position as JavaScript sees it, in
 * steps of up to 137 px while Safari collapses its toolbar (frames of 26–50 ms), against content
 * Safari scrolls smoothly (measured in iOS 26 Safari in the Simulator, 16 November 2026).
 */
const DOCK_ON_SCROLL = "(max-width: 63.99rem)";

/**
 * NEX's voice controls, only when this build has a recording: the deliberate text-only production
 * configuration ships none of their code (decided at build time; initial-JS budget).
 */
const NexVoice =
  import.meta.env.VITE_NEX_VOICE_PREVIEW || LICENSED_RECORDING
    ? lazy(() => import("~/components/nex/NexVoice").then((m) => ({ default: m.NexVoice })))
    : null;

/**
 * Everything below the opening (pathways, experience, projects, agents, contact). Prerendered into
 * the page's HTML like the rest, so it reads and works without JavaScript; only its code loads
 * separately, after the opening's, so the first screen hydrates first (initial-JS budget).
 */
const HomeSections = lazy(() => import("~/components/home/HomeSections"));

export default function Home() {
  return (
    <div data-agent="nex">
      {/* Opening (Meet Alex): his introduction, NEX and NEX's guide. Very wide screens: three
          columns, the guide beside NEX; wide screens: the guide beneath NEX; phones and tablets:
          name, NEX, guide, then the rest of the introduction. */}
      <section aria-labelledby="hero-title" className="os-hero">
        <div className="os-hero-grid mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="os-hero-name">
            <p className="os-label">MOYLAN//OS · Oslo, Norway</p>
            <h1
              id="hero-title"
              className="mt-2 text-4xl font-semibold tracking-tight text-balance sm:text-6xl lg:mt-3 lg:text-7xl"
            >
              {site.owner}
            </h1>
            <p className="mt-4 font-mono text-sm tracking-[0.12em] text-nex uppercase sm:text-base">
              {site.headline.split(" | ").map((part, index) => (
                <Fragment key={part}>
                  {index > 0 && <span className="sr-only">, </span>}
                  <span className="block">{part}</span>
                </Fragment>
              ))}
            </p>
          </div>

          <div className="os-hero-nex">
            <NexSlot
              id="hero"
              poster
              contain={CONTAIN}
              dockOnScroll={DOCK_ON_SCROLL}
              describedBy="nex-hint"
              className="os-hero-orb mx-auto aspect-square"
            />
            <p id="nex-hint" className="mt-2 text-center text-xs text-text-muted">
              <span className="nex-hint-pointer">Click NEX</span>
              <span className="nex-hint-touch">Tap NEX</span> to open the site menu.
            </p>
          </div>

          <div className="os-hero-guide">
            <NexGuide messageId="nex-intro">
              {NexVoice && (
                <Suspense fallback={null}>
                  <NexVoice />
                </Suspense>
              )}
            </NexGuide>
          </div>

          <div className="os-hero-more">
            <p className="max-w-xl text-lg leading-relaxed text-text">
              Enterprise technology experience across <strong>Microsoft</strong>,{" "}
              <strong>HP</strong> and <strong>Meta</strong>, from partner and reseller enablement to
              customer demonstrations and technical training, now combined with building AI agents,
              applications and practical software.
            </p>
            <p className="mt-3 max-w-xl text-sm text-text-muted">
              BSc (Hons) Computing and IT (Software), completed 2026 · Microsoft Certified: Azure
              Fundamentals (AZ-900)
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/about" className={button.primary}>
                Meet Alex
              </Link>
              <Link to="/experience" className={button.secondary}>
                My experience
              </Link>
              <a href="#work" className={button.secondary}>
                Explore projects
              </a>
            </div>
          </div>
        </div>
      </section>

      <Suspense fallback={null}>
        <HomeSections />
      </Suspense>
    </div>
  );
}
