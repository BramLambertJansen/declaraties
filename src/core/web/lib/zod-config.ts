import { z } from 'zod';

// Zod probeert bij het aanmaken van het eerste object-schema `new Function`; de CSP (geen unsafe-eval) meldt dat als
// schending, ook al wordt de throw gevangen. `jitless` slaat die probe over. Daarom een eigen module die main.tsx als
// eerste importeert: ESM evalueert die vóór de routes die al bij het laden een `z.object` maken. De sideEffects-lijst
// in package.json bewaart deze initialisatie ook bij het bundelen voor productie.
z.config({ jitless: true });
