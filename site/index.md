---
layout: home
title: nikke-api
titleTemplate: 비공식 NIKKE 데이터 API + MCP 서버
description: 승리의 여신 니케의 캐릭터·스토리·소장품 데이터를 ChatGPT·Claude에서 바로 쓰는 MCP 서버와 REST API. 주소 하나로 연결, 무료·비공식 팬 프로젝트.
---

<div class="nk-home">

<section class="nk-hero" aria-labelledby="hero-heading">
<p class="nk-eyebrow">nikke-api · 비공식 팬 프로젝트</p>
<h1 id="hero-heading">니케 데이터를<br>AI에게 물어보세요</h1>
<p class="nk-lead">승리의 여신: 니케의 캐릭터·스토리·소장품 데이터를 제공하는 MCP 서버이자 REST API입니다. ChatGPT나 Claude에 주소 하나만 넣으면 대화 중에 바로 찾아 줍니다.</p>
<div class="nk-hero-action">
<McpUrl />
</div>
<div class="nk-hero-links">

[연결 방법 보기](#connect) · [API 레퍼런스](/api) · [MCP 연결 가이드](/mcp)

</div>
<LiveStats />
</section>

<TrySection />

<section class="nk-section" id="connect" aria-labelledby="connect-heading">
<div class="nk-section-head">
<p class="nk-eyebrow">연결</p>
<h2 id="connect-heading">ChatGPT·Claude에 연결하기</h2>
<p>MCP 주소를 붙여 넣으면 끝이에요. 설치도, 로그인도 없습니다.</p>
</div>
<McpUrl variant="compact" />
<div class="nk-steps">
<div class="nk-steps-col">
<h3>ChatGPT</h3>

1. **설정 → 앱 및 커넥터 → 고급 설정**에서 개발자 모드를 켭니다.
2. 커넥터 화면에서 **만들기**를 누르고, URL 칸에 MCP 주소를 붙여 넣습니다.
3. 새 대화에서 개발자 모드로 이 커넥터를 켜고 질문합니다.

</div>
<div class="nk-steps-col">
<h3>Claude</h3>

1. **설정 → 커넥터**에서 **커스텀 커넥터 추가**를 누릅니다.
2. 이름을 정하고, URL 칸에 MCP 주소를 붙여 넣습니다.
3. 대화 입력창의 **+** 메뉴에서 커넥터를 켜고 질문합니다.

</div>
</div>
<div class="nk-section-foot">

Claude Code·Cursor·VS Code 설정과 문제 해결은 [MCP 연결 가이드](/mcp)에 있어요. ChatGPT는 유료 플랜에서만 커스텀 커넥터를 지원해요.

</div>
</section>

<section class="nk-section" id="features" aria-labelledby="features-heading">
<div class="nk-section-head">
<p class="nk-eyebrow">기능</p>
<h2 id="features-heading">무엇을 찾아 주나요</h2>
<p>게임 안에서 찾기 번거로운 것들을 대화 한 줄로 물어볼 수 있어요.</p>
</div>
<div class="nk-features">
<div class="nk-feature-list">
<div class="nk-feature">
<h3>스토리 감상 순서</h3>

메인 챕터 사이에 이벤트·사이드·호감도 스토리를 끼워 넣은 커뮤니티 추천 순서로, 지금 위치에서 다음에 볼 스토리를 알려 줍니다.

</div>
<div class="nk-feature">
<h3>대사 검색과 등장 씬</h3>

대사 한 줄이나 화자로 전체 스토리를 검색하고, 캐릭터가 나오는 씬과 이벤트를 대사 수 순으로 찾습니다.

</div>
<div class="nk-feature">
<h3>캐릭터·소장품 데이터</h3>

속성·클래스·버스트로 캐릭터를 찾고 스킬을 비교합니다. 이격(다른 버전)은 원본과 묶어서 함께 찾아 줍니다.

</div>
<div class="nk-feature">
<h3>이벤트 스토리 요약</h3>

이벤트 하나의 대본 전체를 에피소드 순서대로 읽어 와, 요약하거나 다시 들려줍니다.

</div>
</div>
<div class="nk-feature-demo">
<h3>직접 해보기 — 다음 스토리 추천</h3>
<p class="nk-feature-demo-note">진행 위치를 고르면 실제 API가 다음에 볼 스토리를 돌려줍니다.</p>
<StoryNext />
</div>
</div>
</section>

<section class="nk-section" id="developers" aria-labelledby="dev-heading">
<div class="nk-section-head">
<p class="nk-eyebrow">개발자</p>
<h2 id="dev-heading">REST API로도 쓸 수 있어요</h2>
<p>같은 데이터를 JSON으로 제공합니다. 인증 없이 바로 호출할 수 있어요.</p>
</div>
<ApiUrl path="/api/nikkes?q=라피" />
<div class="nk-section-foot">

[API 레퍼런스](/api)에서 모든 엔드포인트를 브라우저에서 바로 호출해 볼 수 있습니다. 소스 코드와 직접 배포 방법은 [GitHub](https://github.com/leegunwoooo/nikke-api)에 있어요.

</div>
</section>

<footer class="nk-notice" aria-label="저작권 고지">

**저작권 고지**

본 프로젝트는 **비공식·비상업적 팬 프로젝트**입니다. 제공되는 모든 게임 데이터의 저작권은 **© SHIFT UP / Level Infinite**에 있으며, SHIFT UP 및 Level Infinite와 아무런 관련이 없습니다. 데이터는 공개된 [BlablaLink](https://www.blablalink.com) CDN 리소스를 그대로 참조합니다.

</footer>

</div>
