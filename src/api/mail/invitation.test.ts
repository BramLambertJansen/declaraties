import { expect, test } from 'vitest';
import { APP_NAME } from '#shared/app.ts';
import { invitationMail } from './invitation.ts';

// Uitnodiging (spec accountbeheer) in de mail-layout: onderwerp, de spectekst en de link in tekst én HTML.
test('uitnodiging: onderwerp, tekst en HTML met de link', () => {
  const mail = invitationMail({
    email: 'ada@example.test',
    name: 'Ada',
    url: 'https://app.example.test/uitnodiging?token=t1',
  });
  expect(mail.to).toBe('ada@example.test');
  expect(mail.subject).toBe(`Uitnodiging voor ${APP_NAME}`);
  expect(mail.text).toContain(`Je bent uitgenodigd voor ${APP_NAME}. Stel via deze link je wachtwoord in:`);
  expect(mail.text.endsWith(APP_NAME)).toBe(true);
  const snapshotText = mail.text.replace(
    `Je bent uitgenodigd voor ${APP_NAME}.`,
    'Je bent uitgenodigd voor App-template.',
  );
  expect(`${snapshotText.slice(0, -APP_NAME.length)}App-template`).toMatchSnapshot();
  expect(mail.html).toContain('href="https://app.example.test/uitnodiging?token=t1"');
  expect(mail.html).toContain('Wachtwoord instellen');
});
