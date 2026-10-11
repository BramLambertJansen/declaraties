import type { Role } from '#core/shared/can.ts';

// Zichtbare teksten van de schermen, letterlijk uit de spec accountbeheer (ook de rij "Aanvullend": toegankelijke namen
// en validatie).
// Naam per rol: Record<Role, …>, dus een nieuwe rol in ROLES zonder naam is een typefout (accounts, rolwisselaar).
export const roleLabels = { user: 'Gebruiker', admin: 'Beheerder' } as const satisfies Record<Role, string>;

export const copy = {
  login: {
    title: 'Inloggen',
    email: 'E-mailadres',
    passwordLabel: 'Wachtwoord',
    submit: 'Inloggen',
    passwordSet: 'Je wachtwoord is ingesteld. Log in om verder te gaan.',
    sessionExpired: 'Je sessie is verlopen. Log opnieuw in.',
  },
  totp: {
    title: 'Verificatiecode',
    explanation: 'Voer de 6-cijferige code uit je authenticator-app in.',
    code: 'Code',
    submit: 'Bevestigen',
  },
  totpSetup: {
    title: 'Tweestapsverificatie instellen',
    explanation: 'Scan de QR-code met je authenticator-app en voer daarna de code in.',
    showKey: 'Kan je niet scannen? Toon de sleutel',
    code: 'Code',
    submit: 'Activeren',
    // Toegankelijke naam van de QR-code en het label van de sleutel.
    qrLabel: 'QR-code voor je authenticator-app',
    keyLabel: 'Sleutel',
  },
  invitation: {
    title: 'Wachtwoord instellen',
    passwordLabel: 'Wachtwoord',
    repeat: 'Wachtwoord herhalen',
    help: 'Minstens 12 tekens.',
    submit: 'Wachtwoord instellen',
  },
  nav: { home: 'Home', dashboard: 'Dashboard' },
  menu: { logout: 'Uitloggen' },
  home: { title: 'Home' },
  dashboard: { title: 'Dashboard', accounts: 'Accounts', designSystem: 'Design system' },
  // Spec design-system: de paginatitel; de voorbeeldteksten staan bij de catalogus.
  designSystem: { title: 'Design system' },
  accounts: {
    title: 'Accounts',
    name: 'Naam',
    email: 'E-mailadres',
    role: 'Rol',
    status: 'Status',
    // Kop van de kolom met "Opnieuw uitnodigen"; alleen voor schermlezers.
    actions: 'Acties',
    roles: roleLabels,
    statuses: { actief: 'Actief', uitgenodigd: 'Uitgenodigd' },
    reinvite: 'Opnieuw uitnodigen',
    invite: 'Account uitnodigen',
    empty: 'Nog geen accounts.',
    more: 'Meer laden',
    // Spec lijstpagina: alle zichtbare tekst van zoeken, filteren en sorteren.
    search: 'Zoeken',
    searchHint: 'Zoek op naam of e-mailadres.',
    allRoles: 'Alle rollen',
    allStatuses: 'Alle statussen',
    sort: 'Sorteren',
    sorts: {
      nieuwste: 'Nieuwste eerst',
      oudste: 'Oudste eerst',
      'naam-az': 'Naam A–Z',
      'naam-za': 'Naam Z–A',
    },
    emptyFiltered: 'Geen accounts gevonden. Pas je zoekopdracht of filters aan.',
    loading: 'Bezig met laden…',
    shown: (count: number, more: boolean) => `${String(count)} accounts getoond.${more ? ' Er zijn er meer.' : ''}`,
  },
  inviteDialog: {
    title: 'Account uitnodigen',
    name: 'Naam',
    email: 'E-mailadres',
    role: 'Rol',
    submit: 'Uitnodiging versturen',
    cancel: 'Annuleren',
    sent: (email: string) => `Uitnodiging verstuurd naar ${email}.`,
    exists: 'Er bestaat al een account met dit e-mailadres.',
  },
} as const;
