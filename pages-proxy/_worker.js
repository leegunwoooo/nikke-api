// Reverse proxy: nikke-api.pages.dev -> API edge worker.
const ORIGIN = "https://nikke-api-edge.leegunwoo0325-5e6.workers.dev";

export default {
  fetch(request) {
    const url = new URL(request.url);
    const fwd = new Request(ORIGIN + url.pathname + url.search, request);
    const h = new Headers(fwd.headers);
    h.set("x-forwarded-host", url.host); // the public host, for building reply URLs
    h.set("x-forwarded-proto", url.protocol.replace(":", ""));
    return fetch(new Request(fwd, { headers: h }));
  },
};
