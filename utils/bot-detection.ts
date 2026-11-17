const BOT_UA_PATTERNS = [
  /bot/i,
  /crawler/i,
  /spider/i,
  /crawling/i,
  /googlebot/i,
  /bingbot/i,
  /yandex/i,
  /baidu/i,
  /slurp/i,
  /duckduckbot/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /linkedinbot/i,
  /pinterest/i,
  /slackbot/i,
  /discordbot/i,
  /whatsapp/i,
  /telegrambot/i,
  /applebot/i,
  /ahrefsbot/i,
  /semrushbot/i,
  /mj12bot/i,
  /dotbot/i,
  /petalbot/i,
  /uptimerobot/i,
  /pingdom/i,
  /headlesschrome/i,
  /phantomjs/i,
  /selenium/i,
  /puppeteer/i,
  /lighthouse/i,
];

export function isBot(userAgent: string | undefined | null): boolean {
  if (!userAgent) return false;
  return BOT_UA_PATTERNS.some((re) => re.test(userAgent));
}

export function detectDevice(
  userAgent: string | undefined | null,
): "mobile" | "tablet" | "desktop" | "unknown" {
  if (!userAgent) return "unknown";
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet|kindle|playbook|silk/.test(ua)) return "tablet";
  if (
    /mobile|iphone|ipod|android.*mobile|blackberry|opera mini|iemobile/.test(ua)
  )
    return "mobile";
  return "desktop";
}
