import { PassThrough } from "node:stream";

import { createReadableStreamFromReadable } from "@react-router/node";
import { renderToPipeableStream } from "react-dom/server";
import type { EntryContext } from "react-router";
import { ServerRouter } from "react-router";

/**
 * Build-time HTML for every prerendered page (the site has no runtime server: `ssr: false`).
 *
 * React Router's default entry waits for all content only for bots and SPA mode, and otherwise
 * streams: anything still loading behind a Suspense boundary (the homepage's lazily loaded
 * sections) would be written into hidden containers and revealed by inline scripts, so readers
 * without JavaScript (and crawlers treated as browsers) would never see it. Static pages are
 * always rendered whole instead (`onAllReady`, and no outlined boundaries): every section is in
 * the HTML, in place. (React Router also passes a load context, unused here: no runtime server.)
 */
export const streamTimeout = 10_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, { status: responseStatusCode, headers: responseHeaders });
  }

  return new Promise<Response>((resolve, reject) => {
    let allReady = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => abort(),
      streamTimeout + 1000,
    );

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} />,
      {
        // Never outline a finished section to be moved in by script (React does that for large
        // boundaries by default): the static HTML keeps everything in place.
        progressiveChunkSize: Number.POSITIVE_INFINITY,
        onAllReady() {
          allReady = true;
          const body = new PassThrough({
            final(callback) {
              clearTimeout(timeoutId);
              timeoutId = undefined;
              callback();
            },
          });
          responseHeaders.set("Content-Type", "text/html");
          pipe(body);
          resolve(
            new Response(createReadableStreamFromReadable(body), {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          if (allReady) console.error(error);
        },
      },
    );
  });
}
