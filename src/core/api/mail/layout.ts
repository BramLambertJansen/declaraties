// Eén basissjabloon voor elke mail (roadmap 3f): platte tekst én HTML met dezelfde inhoud, afzender (app-naam) en
// voettekst. Alle tekst wordt ge-escaped (een naam is invoer van een gebruiker); een actielink moet http(s) zijn.
// HTML met inline stijlen en een tabel als knop: mailprogramma's negeren <style> en moderne CSS.

export interface MailContent {
  readonly appName: string;
  readonly greeting: string;
  readonly paragraphs: readonly string[];
  // De knop; in de tekstversie staat de link op een eigen regel, zodat een mailprogramma hem klikbaar maakt.
  // labelInText: ook in de tekstversie het label van de knop, vóór de link (bevestigingsmails: "Wijziging bevestigen:").
  readonly action?: { readonly label: string; readonly url: string; readonly labelInText?: boolean };
  // Na de knop, bijv. hoe lang de link werkt.
  readonly closing?: readonly string[];
}

export interface RenderedMail {
  readonly text: string;
  readonly html: string;
}

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

// Alleen absolute http(s)-links; de genormaliseerde vorm (geen spaties of regeleinden) komt in de mail.
function safeUrl(url: string): string {
  if (!URL.canParse(url)) throw new Error('mail: alleen absolute http(s)-links');
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`mail: alleen http(s)-links, niet ${parsed.protocol}`);
  }
  return parsed.href;
}

// Een regeleinde in invoer (bijv. een naam) zou in de tekstversie een eigen regel worden, zelfs een nep-link.
function oneLine(text: string): string {
  return text.replace(/[\r\n]+/g, ' ');
}

// Enkele quotes: de stijl staat zelf tussen dubbele quotes in het attribuut.
const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;";
const P = `margin:0 0 16px;font-size:15px;line-height:1.5;color:#1f2933;${FONT}`;
const SMALL = `margin:0 0 16px;font-size:13px;line-height:1.5;color:#52606d;${FONT}`;
const FOOTER = `margin:24px 0 0;font-size:13px;line-height:1.5;color:#52606d;${FONT}`;

function paragraph(text: string): string {
  return `<p style="${P}">${escapeHtml(oneLine(text))}</p>`;
}

function button(label: string, url: string): string {
  const href = escapeHtml(url);
  return [
    // Padding op de cel, niet op de link: Outlook negeert padding op een inline element.
    '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr>',
    '<td style="border-radius:6px;background:#1f2933;padding:12px 20px;">',
    `<a href="${href}" style="font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;${FONT}">`,
    `${escapeHtml(label)}</a></td></tr></table>`,
    `<p style="${SMALL}">Werkt de knop niet? Open dan deze link:<br>`,
    `<a href="${href}" style="color:#1f2933;word-break:break-all;">${href}</a></p>`,
  ].join('');
}

function actionText(label: string, url: string, options: { readonly labelInText?: boolean }): string[] {
  return options.labelInText === true ? [`${oneLine(label)}:`, url, ''] : [url, ''];
}

function renderText(content: MailContent, url: string | undefined): string {
  return [
    oneLine(content.greeting),
    '',
    ...content.paragraphs.flatMap((text) => [oneLine(text), '']),
    ...(content.action === undefined || url === undefined ? [] : actionText(content.action.label, url, content.action)),
    ...(content.closing ?? []).flatMap((text) => [oneLine(text), '']),
    '-- ',
    content.appName,
  ].join('\n');
}

function renderHtml(content: MailContent, url: string | undefined): string {
  const body = [
    paragraph(content.greeting),
    ...content.paragraphs.map(paragraph),
    ...(content.action === undefined || url === undefined ? [] : [button(content.action.label, url)]),
    ...(content.closing ?? []).map(paragraph),
  ].join('');
  const footer = `<p style="${FOOTER}">${escapeHtml(content.appName)}</p>`;
  return [
    '<!doctype html><html lang="nl"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${escapeHtml(content.appName)}</title></head>`,
    '<body style="margin:0;padding:24px;background:#f5f7fa;">',
    // Een tabel met vaste breedte i.p.v. max-width op een div: Outlook negeert max-width.
    '<table role="presentation" width="560" cellpadding="0" cellspacing="0" align="center" ',
    'style="width:100%;max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;"><tr><td style="padding:32px;">',
    body,
    footer,
    '</td></tr></table></body></html>',
  ].join('');
}

export function renderMail(content: MailContent): RenderedMail {
  const url = content.action === undefined ? undefined : safeUrl(content.action.url);
  return { text: renderText(content, url), html: renderHtml(content, url) };
}
