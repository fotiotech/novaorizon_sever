export interface RenderContext {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  source?: string;
  unsubscribeUrl?: string;
  [key: string]: string | undefined;
}

export function renderTemplate(template: string, ctx: RenderContext): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const v = ctx[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

export function extractVariables(template: string): string[] {
  const found = new Set<string>();
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) found.add(m[1]);
  return Array.from(found);
}

export function wrapHtml(body: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.5;color:#111;max-width:600px;margin:0 auto;padding:24px;">${body}</body></html>`;
}

export function appendUnsubscribe(
  html: string,
  unsubscribeUrl: string,
): string {
  const block = `
    <hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px;" />
    <p style="font-size:12px;color:#888;text-align:center;margin:0;">
      You're receiving this because you subscribed on our site.
      <a href="${unsubscribeUrl}" style="color:#888;text-decoration:underline;">Unsubscribe</a>.
    </p>`;
  return html + block;
}

export function appendSmsOptOut(body: string): string {
  return `${body}\n\nReply STOP to opt out.`;
}
