import { defineConfig, type HeadConfig } from "vitepress";
import { FAQ } from "./faq";

// absolute site root for canonical/OG/sitemap — the Cloudflare Pages URL unless
// a build points it elsewhere (VITE_SITE_URL; CI passes the repo's DOCS_SITE_URL)
const SITE_URL = (process.env.VITE_SITE_URL || "https://nikke-api-docs.pages.dev/").replace(/\/?$/, "/");
const SITE_NAME = "nikke-api";
// head links are not rewritten for base, so prefix them ourselves
const BASE = process.env.VITE_BASE || "/";
const REPO = "https://github.com/leegunwoooo/nikke-api";
const pageUrl = (relativePath: string) =>
  SITE_URL + relativePath.replace(/(^|\/)index\.md$/, "$1").replace(/\.md$/, "");
// stable entity ids so every page points at the same site/app/game nodes
const ID = { site: `${SITE_URL}#website`, app: `${SITE_URL}#app`, org: `${SITE_URL}#project` };
const GAME = {
  "@type": "VideoGame",
  name: "승리의 여신: 니케",
  alternateName: "GODDESS OF VICTORY: NIKKE",
  publisher: { "@type": "Organization", name: "Level Infinite" },
  author: { "@type": "Organization", name: "SHIFT UP" },
};
const ld = (data: object): HeadConfig => ["script", { type: "application/ld+json" }, JSON.stringify(data)];

export default defineConfig({
  lang: "ko-KR",
  title: "nikke-api",
  description: "비공식 NIKKE 데이터 REST API + MCP 서버",
  // served from a domain root on Cloudflare Pages; set VITE_BASE for a subpath host
  base: BASE,
  appearance: "dark",
  cleanUrls: true,
  // generated raw markdown (scripts/build-llms.ts) is served as-is, not built as pages
  srcExclude: ["public/**"],
  lastUpdated: true,
  sitemap: { hostname: SITE_URL },
  head: [
    ["meta", { name: "theme-color", content: "#c93a53" }],
    ["link", { rel: "icon", href: `${BASE}favicon.ico`, sizes: "48x48" }],
    ["link", { rel: "icon", href: `${BASE}favicon.svg`, type: "image/svg+xml" }],
    ["link", { rel: "apple-touch-icon", href: `${BASE}apple-touch-icon.png` }],
    ["meta", { property: "og:image", content: `${SITE_URL}og.png` }],
    ["meta", { property: "og:image:width", content: "1200" }],
    ["meta", { property: "og:image:height", content: "630" }],
    ["meta", { property: "og:image:alt", content: "nikke-api — 니케 데이터를 AI에게 물어보세요" }],
    ["meta", { name: "twitter:image", content: `${SITE_URL}og.png` }],
    ["meta", { property: "og:site_name", content: SITE_NAME }],
    ["meta", { property: "og:locale", content: "ko_KR" }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["link", { rel: "alternate", type: "text/plain", title: "llms.txt", href: `${SITE_URL}llms.txt` }],
  ],
  // per-page canonical, OG and JSON-LD — only facts the page itself shows
  transformHead({ pageData, title, description }) {
    const url = pageUrl(pageData.relativePath);
    const head: HeadConfig[] = [
      ["link", { rel: "canonical", href: url }],
      ["meta", { property: "og:type", content: pageData.relativePath === "index.md" ? "website" : "article" }],
      ["meta", { property: "og:title", content: title }],
      ["meta", { property: "og:description", content: description }],
      ["meta", { property: "og:url", content: url }],
      ["meta", { name: "twitter:title", content: title }],
      ["meta", { name: "twitter:description", content: description }],
    ];
    if (pageData.relativePath === "index.md") {
      head.push(
        ld({
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "Organization", "@id": ID.org, name: SITE_NAME, url: REPO, description: "비공식·비상업적 NIKKE 팬 프로젝트" },
            { "@type": "WebSite", "@id": ID.site, name: SITE_NAME, url: SITE_URL, inLanguage: "ko-KR", description, publisher: { "@id": ID.org } },
            {
              "@type": "SoftwareApplication",
              "@id": ID.app,
              name: SITE_NAME,
              applicationCategory: "DeveloperApplication",
              operatingSystem: "Any",
              url: SITE_URL,
              description,
              isAccessibleForFree: true,
              offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" },
              publisher: { "@id": ID.org },
              about: GAME,
            },
            {
              "@type": "FAQPage",
              "@id": `${SITE_URL}#faq`,
              isPartOf: { "@id": ID.site },
              mainEntity: FAQ.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
            },
          ],
        }),
      );
    } else {
      head.push(
        ld({
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: pageData.title,
          description,
          inLanguage: "ko-KR",
          url,
          ...(pageData.lastUpdated ? { dateModified: new Date(pageData.lastUpdated).toISOString() } : {}),
          isPartOf: { "@id": ID.site },
          publisher: { "@id": ID.org },
          about: { "@id": ID.app },
        }),
      );
    }
    return head;
  },
  themeConfig: {
    nav: [
      { text: "홈", link: "/" },
      { text: "MCP 연결", link: "/mcp" },
      { text: "API 레퍼런스", link: "/api" },
      {
        text: "GitHub",
        link: "https://github.com/leegunwoooo/nikke-api",
      },
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/leegunwoooo/nikke-api" },
    ],
    outline: { label: "이 페이지" },
    docFooter: { prev: "이전", next: "다음" },
    darkModeSwitchLabel: "테마",
    sidebarMenuLabel: "메뉴",
    returnToTopLabel: "맨 위로",
    search: {
      provider: "local",
      options: {
        locales: {
          root: {
            translations: {
              button: { buttonText: "검색", buttonAriaLabel: "검색" },
              modal: {
                noResultsText: "결과를 찾을 수 없습니다",
                resetButtonTitle: "검색 초기화",
                backButtonTitle: "닫기",
                displayDetails: "자세한 목록 표시",
                footer: {
                  selectText: "선택",
                  navigateText: "이동",
                  closeText: "닫기",
                },
              },
            },
          },
        },
      },
    },
  },
});
