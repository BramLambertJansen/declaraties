// Meldhook "melding" (framework §8): een bureaubladmelding als Claude Code op de eigenaar wacht (Notification-event).
// Puur: welke opdracht er draait, beslist deze module; rails/hooks/melding.mjs start hem. Titel en tekst komen uit de payload
// en gaan nooit in de argumenten van een shell (onder WSL via de omgeving en WSLENV), zodat een bericht niets kan uitvoeren.

const MAX = 200;
const STANDAARD_TITEL = 'Claude Code';
const STANDAARD_TEKST = 'Claude wacht op je';
const DOORGEVEN = 'KIT_MELDING_TITEL/u:KIT_MELDING_TEKST/u';

// Windows-toast zonder module; de AppUserModelID van PowerShell, omdat Windows een toast van een onbekende app niet toont.
const TOAST = [
  "$ErrorActionPreference = 'Stop'",
  '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
  '$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)',
  "$regels = $xml.GetElementsByTagName('text')",
  '[void]$regels.Item(0).AppendChild($xml.CreateTextNode($env:KIT_MELDING_TITEL))',
  '[void]$regels.Item(1).AppendChild($xml.CreateTextNode($env:KIT_MELDING_TEKST))',
  "$app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'",
  '[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($xml))',
].join('; ');

/**
 * @typedef {{ env: Record<string, string | undefined>, heeft: (programma: string) => boolean }} Omgeving
 * @typedef {{ command: string, args: string[], env: Record<string, string> }} Opdracht
 */

/** @param {unknown} payload @param {string} sleutel @param {string} standaard */
function tekstVan(payload, sleutel, standaard) {
  const waarde = typeof payload === 'object' && payload !== null ? Object.entries(payload).find(([naam]) => naam === sleutel)?.[1] : undefined;
  return typeof waarde === 'string' && waarde !== '' ? waarde.slice(0, MAX) : standaard;
}

/** @param {Record<string, string | undefined>} env */
function isWsl(env) {
  return Boolean(env['WSL_DISTRO_NAME']) || Boolean(env['WSL_INTEROP']);
}

/**
 * De opdracht voor de melding, of null (uitgezet met KIT_MELDING=uit, of geen manier om te melden).
 * @param {unknown} payload
 * @param {Omgeving} omgeving
 * @returns {Opdracht | null}
 */
export function meldingOpdracht(payload, { env, heeft }) {
  if (env['KIT_MELDING'] === 'uit') return null;
  const titel = tekstVan(payload, 'title', STANDAARD_TITEL);
  const tekst = tekstVan(payload, 'message', STANDAARD_TEKST);
  if (isWsl(env)) {
    const wslenv = env['WSLENV'];
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-Command', TOAST],
      env: {
        KIT_MELDING_TITEL: titel,
        KIT_MELDING_TEKST: tekst,
        WSLENV: wslenv === undefined || wslenv === '' ? DOORGEVEN : `${wslenv}:${DOORGEVEN}`,
      },
    };
  }
  if (heeft('notify-send')) return { command: 'notify-send', args: ['--app-name=Claude Code', '--', titel, tekst], env: {} };
  return null;
}
