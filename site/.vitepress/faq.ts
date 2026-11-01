// One source for the home page FAQ: Faq.vue renders it and config.ts turns the
// same strings into FAQPage JSON-LD, so the markup can never differ from what
// the page shows. Answers state only what the project actually does.
export const FAQ: { q: string; a: string }[] = [
  {
    q: "공식 서비스인가요?",
    a: "아니요. nikke-api는 비공식·비상업적 팬 프로젝트이고 SHIFT UP·Level Infinite와 관련이 없습니다. 게임 데이터의 저작권은 © SHIFT UP / Level Infinite에 있습니다.",
  },
  {
    q: "무료인가요?",
    a: "네. MCP 서버와 REST API 모두 무료이고, 가입이나 인증 없이 주소만 넣으면 쓸 수 있습니다.",
  },
  {
    q: "ChatGPT에서 니케 데이터를 쓰려면 어떻게 하나요?",
    a: "ChatGPT 설정 → 앱 및 커넥터 → 고급 설정에서 개발자 모드를 켜고, 커넥터를 만들어 MCP 서버 주소를 넣은 뒤 인증은 '없음'으로 두면 됩니다. ChatGPT 무료 플랜에서는 커스텀 커넥터를 쓸 수 없습니다.",
  },
  {
    q: "어떤 데이터를 찾을 수 있나요?",
    a: "캐릭터의 스킬·스탯·이격(다른 버전), 메인·이벤트·호감도 스토리 대본과 대사 검색, 이벤트 목록, 스토리 감상 순서, 소장품 데이터를 한국어·영어·일본어·중국어(번체)로 찾을 수 있습니다. 스토리 대본은 한국어만 있습니다.",
  },
  {
    q: "스토리 감상 순서는 어디 기준인가요?",
    a: "아카라이브 니케 채널에서 쓰이는 커뮤니티 가이드 'NIKKE 스토리 감상 순서 가이드'(ssissun)를 기준으로 하고, 다른 가이드와 배치가 갈리는 곳은 메모로 함께 알려 줍니다.",
  },
  {
    q: "데이터는 언제 갱신되나요?",
    a: "공식 위키 도구 BlablaLink의 CDN 데이터를 매일 확인하고, 바뀐 내용이 있으면 반영합니다. 홈 상단의 '데이터 기준일'이 마지막 반영 날짜입니다.",
  },
];
