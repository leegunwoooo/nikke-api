// Reverse proxy: nikke-api.pages.dev -> API edge worker.
const ORIGIN = "https://nikke-api-edge.leegunwoo0325-5e6.workers.dev";

export default {
  fetch(request) {
    const url = new URL(request.url);
    return fetch(new Request(ORIGIN + url.pathname + url.search, request));
  },
};
