// Bundelbudget van deze app, in kB gzip (test/ui/bundle-budget.test.ts in gate:fast). Het geldt per scherm: wat een browser
// laadt voor één route (de entry plus de chunks van die route), niet de som van alle schermen. Een nieuw scherm krijgt zijn
// eigen chunk en laat de andere dus niet groeien. Dit bestand is van de app: ophogen mag, met de reden in de PR.
// Meting bij invoering (2026-10-22, template met sideEffects): entry 151,1, zwaarste route 225,3 (/admin/accounts),
// /design-system 248,9, /login boven de entry 36,8, grootste chunk 95,2, CSS 6,0. De budgetten zijn die meting plus
// ongeveer 25%; grootste chunk en CSS zijn de budgetten van de eerste invoering (2026-10-10).
export const bundleBudgetKb = {
  // Wat elk scherm laadt, ook het inlogscherm.
  entry: 190,
  // Het zwaarste gewone scherm: entry plus layout plus route.
  zwaarsteRoute: 285,
  // /design-system (alleen admins): de catalogus met alle componenten, apart zodat hij de maat niet bepaalt.
  catalogus: 310,
  // /login bovenop de entry. Krap, zodat de barrel src/web/ui niet weer alle componenten in elk scherm trekt (zonder
  // "sideEffects" in package.json was dat circa 72).
  loginBovenEntry: 45,
  grootsteChunk: 115,
  css: 15,
} as const;
