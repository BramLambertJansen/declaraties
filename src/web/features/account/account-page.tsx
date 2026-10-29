import { copy } from '#web/copy/ui.ts';
import { AsyncView, PageHeader } from '#web/ui/index.ts';
import { useMe } from '../session/queries.ts';
import { EmailSection } from './email-section.tsx';
import { NameSection } from './name-section.tsx';
import { PasswordSection } from './password-section.tsx';
import { useSessions } from './queries.ts';
import { SessionsSection } from './sessions-section.tsx';

// Mijn account (spec eigen-account): secties in de volgorde van de spec; elk formulier verzendt met Enter alleen zichzelf.
export function AccountPage() {
  const me = useMe();
  // Naast `me` gestart. Zolang de lijst nog binnenkomt, toont de pagina één laadmelding in plaats van secties met een eigen
  // loader; een fout blijft daarna beperkt tot de sectie Sessies (AsyncView met opnieuw proberen).
  const sessions = useSessions();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={copy.account.title} />
      <AsyncView query={me}>
        {(data) =>
          sessions.isPending ? (
            <AsyncView query={sessions}>{() => null}</AsyncView>
          ) : (
            <div className="flex flex-col gap-8">
              <NameSection naam={data.naam} />
              <PasswordSection />
              <SessionsSection sessions={sessions} />
              <EmailSection email={data.email} />
            </div>
          )
        }
      </AsyncView>
    </div>
  );
}
