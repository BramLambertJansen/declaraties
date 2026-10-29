import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { homeFor, meQuery, safeRedirect } from '#web/lib/session.ts';

// Na een geslaagde stap: de actor opnieuw laden en door naar de terugweg of de start van de rol. Een admin zonder TOTP
// krijgt hier MFA_REQUIRED van /me; het inlogscherm vangt dat op met de stap "instellen".
export function useFinishLogin(redirect: string | undefined) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    queryClient.clear();
    const me = await queryClient.query(meQuery);
    const target = safeRedirect(redirect);
    await (target === null ? navigate({ to: homeFor(me.rol) }) : navigate({ href: target }));
  };
}
