import { defineConfig, type HeadConfig } from "vitepress";

// absolute site root for canonical/OG/sitemap — the GitHub Pages URL unless a
// preview build points it elsewhere (VITE_SITE_URL)
const SITE_URL = (process.env.VITE_SITE_URL || "https://leegunwoooo.github.io/nikke-api/").replace(/\/?$/, "/");
const SITE_NAME = "nikke-api";
const REPO = "https://github.com/leegunwoooo/nikke-api";
const pageUrl = (relativePath: string) =>
  SITE_URL + relativePath.replace(/(^|\/)index\.md$/, "$1").replace(/\.md$/, "");
const ld = (data: object): HeadConfig => ["script", { type: "application/ld+json" }, JSON.stringify(data)];

export default defineConfig({
  lang: "ko-KR",
  title: "nikke-api",
  description: "비공식 NIKKE 데이터 REST API + MCP 서버",
  base: "/nikke-api/",
  appearance: "dark",
  cleanUrls: true,
  // generated raw markdown (scripts/build-llms.ts) is served as-is, not built as pages
  srcExclude: ["public/**"],
  lastUpdated: true,
  sitemap: { hostname: SITE_URL },
  head: [
    ["meta", { name: "theme-color", content: "#c93a53" }],
    ["meta", { property: "og:site_name", content: SITE_NAME }],
    ["meta", { property: "og:locale", content: "ko_KR" }],
    ["meta", { name: "twitter:card", content: "summary" }],
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
        ld({ "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, url: SITE_URL, inLanguage: "ko-KR", description }),
        ld({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: SITE_NAME,
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Any",
          url: SITE_URL,
          description,
          isAccessibleForFree: true,
          offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" },
          codeRepository: REPO,
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
          isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
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
