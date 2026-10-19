import type { Role } from '#core/shared/can.ts';

// Nederlandse schermteksten, inclusief toegankelijke namen en validatie. Specs en featurebeschrijvingen leggen het
// bijbehorende gedrag vast.
// Naam per rol: Record<Role, …>, dus een nieuwe rol in ROLES zonder naam is een typefout (accounts, rolwisselaar).
export const roleLabels = { user: 'Gebruiker', admin: 'Beheerder' } as const satisfies Record<Role, string>;

export const copy = {
  login: {
    title: 'Inloggen',
    email: 'E-mailadres',
    passwordLabel: 'Wachtwoord',
    visibilityLabel: 'Wachtwoord tonen',
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
  menu: { account: 'Mijn account', logout: 'Uitloggen' },
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
    statuses: { actief: 'Actief', uitgenodigd: 'Uitgenodigd', geblokkeerd: 'Geblokkeerd' },
    reinvite: 'Opnieuw uitnodigen',
    // Spec accountbeheer-uitbreiding: menu per rij en de blokkeerdialoog.
    rowActions: (naam: string) => `Acties voor ${naam}`,
    block: 'Blokkeren',
    unblock: 'Deblokkeren',
    blockDialog: {
      title: (naam: string) => `${naam} blokkeren?`,
      description: (naam: string) =>
        `${naam} wordt direct overal uitgelogd en kan niet meer inloggen tot je het account deblokkeert.`,
    },
    blocked: (naam: string) => `${naam} is geblokkeerd.`,
    unblocked: (naam: string) => `${naam} is gedeblokkeerd.`,
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
  // Spec eigen-account: /account, letterlijk uit de tabel "Alle zichtbare tekst".
  account: {
    title: 'Mijn account',
    name: {
      title: 'Naam',
      label: 'Naam',
      submit: 'Naam opslaan',
      saved: 'Je naam is opgeslagen.',
    },
    password: {
      title: 'Wachtwoord',
      current: 'Huidig wachtwoord',
      new: 'Nieuw wachtwoord',
      repeat: 'Nieuw wachtwoord herhalen',
      help: 'Minstens 12 tekens. Je wordt op je andere apparaten uitgelogd.',
      submit: 'Wachtwoord wijzigen',
      changed: 'Je wachtwoord is gewijzigd. Je andere sessies zijn beëindigd.',
    },
    sessions: {
      title: 'Sessies',
      device: 'Apparaat',
      createdAt: 'Ingelogd op',
      lastActive: 'Laatst actief',
      current: 'Dit apparaat',
      revoke: 'Beëindigen',
      revokeOthers: 'Alle andere sessies beëindigen',
      unknownDevice: 'Onbekend apparaat',
      // Kop van de kolom met "Beëindigen"; alleen voor schermlezers.
      actions: 'Acties',
      revokeDialog: {
        title: 'Sessie beëindigen?',
        description: (device: string) => `Het apparaat ${device} wordt uitgelogd.`,
        confirm: 'Beëindigen',
        done: 'De sessie is beëindigd.',
      },
      revokeOthersDialog: {
        title: 'Alle andere sessies beëindigen?',
        description: 'Je blijft alleen op dit apparaat ingelogd.',
        confirm: 'Beëindigen',
        done: 'Je andere sessies zijn beëindigd.',
      },
    },
    email: {
      title: 'E-mailadres',
      current: (email: string) => `Huidig e-mailadres: ${email}`,
      label: 'Nieuw e-mailadres',
      submit: 'E-mailadres wijzigen',
      requested: (email: string) =>
        `We hebben een bevestigingslink gestuurd naar ${email}. Daarna volgt een link naar het nieuwe adres.`,
      same: 'Dit is al je e-mailadres.',
    },
    confirmEmail: {
      title: 'E-mailadres bevestigen',
      submit: 'Bevestigen',
      oldDone: 'Gelukt. Open nu de link die we naar je nieuwe e-mailadres hebben gestuurd.',
      newDone: 'Je e-mailadres is gewijzigd.',
      toAccount: 'Naar Mijn account',
    },
  },
} as const;
