import { expect, test } from 'vitest';
import { escapeHtml, renderMail } from './layout.ts';

// Mail-layout (roadmap 3f): tekst en HTML met dezelfde inhoud; invoer van gebruikers wordt ge-escaped.
const content = {
  appName: 'Mijn App',
  greeting: 'Hallo Ada,',
  paragraphs: ['Je bent uitgenodigd.'],
  action: { label: 'Wachtwoord instellen', url: 'https://app.example.test/uitnodiging?token=abc&x=1' },
  closing: ['De link werkt 7 dagen.'],
};

test('de opmaak ligt vast (tekst en HTML)', () => {
  const mail = renderMail(content);
  expect(mail.text).toMatchSnapshot('tekst');
  expect(mail.html).toMatchSnapshot('html');
});

test('de tekstversie heeft de link op een eigen regel en de app als afzender', () => {
  const lines = renderMail(content).text.split('\n');
  expect(lines).toContain('https://app.example.test/uitnodiging?token=abc&x=1');
  expect(lines.slice(-2)).toEqual(['-- ', 'Mijn App']);
});

test('naam en tekst met HTML worden ge-escaped, ook in de link', () => {
  const { html } = renderMail({
    ...content,
    greeting: 'Hallo <script>alert(1)</script>,',
    action: { label: 'Klik "hier"', url: 'https://app.example.test/?a="><img src=x>' },
  });
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<img');
  expect(html).toContain('Hallo &lt;script&gt;alert(1)&lt;/script&gt;,');
  expect(html).toContain('Klik &quot;hier&quot;');
});

test.each(['javascript:alert(1)', 'data:text/html,hoi', 'mailto:a@b.nl'])('weigert een link met %s', (url) => {
  expect(() => renderMail({ ...content, action: { label: 'x', url } })).toThrow(/alleen http\(s\)-links/);
});

test('zonder actie: geen knop en geen losse link', () => {
  const { text, html } = renderMail({ appName: 'Mijn App', greeting: 'Hallo,', paragraphs: ['Alleen tekst.'] });
  expect(html).not.toContain('<a ');
  expect(text).not.toContain('http');
});

test('escapeHtml', () => {
  expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('een relatieve link geeft een nette fout', () => {
  expect(() => renderMail({ ...content, action: { label: 'x', url: '/uitnodiging' } })).toThrow(
    'mail: alleen absolute http(s)-links',
  );
});

test('spaties en regeleinden in de link worden genormaliseerd, niet letterlijk overgenomen', () => {
  const { text } = renderMail({ ...content, action: { label: 'x', url: 'https://a.test/x y\nBcc: e@x' } });
  expect(text).toContain('https://a.test/x%20yBcc:%20e@x');
  expect(text).not.toContain('Bcc: e@x');
});

test('een regeleinde in een naam wordt een spatie: geen extra regel (of nep-link) in de tekst', () => {
  const { text } = renderMail({ ...content, greeting: 'Hallo Ada\nhttps://kwaad.test/uitnodiging?token=nep,' });
  expect(text.split('\n')[0]).toBe('Hallo Ada https://kwaad.test/uitnodiging?token=nep,');
});

// Een mini-parser in plaats van een DOM (de API-tsconfig kent geen DOM-types): elke tag bestaat alleen uit bekende
// attributen met een waarde tussen dubbele quotes; wat overblijft, is een kapot attribuut (zoals een " in een stijl).
const KNOWN_ATTRIBUTES = new Set([
  'style',
  'href',
  'role',
  'width',
  'cellpadding',
  'cellspacing',
  'align',
  'lang',
  'charset',
  'name',
  'content',
]);

test('de HTML heeft alleen hele, bekende attributen', () => {
  const { html } = renderMail(content);
  const tags = html.match(/<[a-z][^>]*>/g) ?? [];
  const broken = tags.filter((tag) => {
    const attributes = [...tag.matchAll(/\s([a-z-]+)="([^"]*)"/g)];
    const rest = attributes.reduce((left, [whole = '']) => left.replace(whole, ''), tag);
    const unknown = attributes.some(([, name = '']) => !KNOWN_ATTRIBUTES.has(name));
    return unknown || !/^<[a-z0-9]+>$/.test(rest);
  });
  expect(broken).toEqual([]);
});

test('elke alinea heeft het lettertype; hulpregel en voettekst zijn klein', () => {
  const { html } = renderMail(content);
  const paragraphs = [...html.matchAll(/<p style="([^"]*)">([^<]*)/g)];
  expect(paragraphs.every(([, style = '']) => style.includes("'Segoe UI'"))).toBe(true);
  const small = paragraphs.filter(([, style = '']) => style.includes('font-size:13px')).map(([, , text]) => text);
  expect(small).toEqual(['Werkt de knop niet? Open dan deze link:', 'Mijn App']);
});
