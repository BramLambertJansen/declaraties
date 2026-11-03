# Vervallen normen

Elke R-id die uit `docs/framework.md` verdwijnt, staat hier onder `## docs/framework.md`: `R-id → R-id` als de norm verplaatst
of samengevoegd is, of `R-id → geschrapt: <reden>`. Krimpt een bindend document meer dan 20 % en 1 KB, dan staat onder
`## <pad>` per vervallen norm `<oude norm> → R-id` of `<oude norm> → geschrapt: <reden>`. De lijst groeit alleen; een R-id
wordt nooit opnieuw gebruikt. `check-docs` toetst hem (ADR 0067, spec krimp-op-normen); de reviewer toetst de inhoud.

## docs/framework.md

- R-JOB-01 → geschrapt: verhuisd naar roadmap ST-03 tot de bouw (R-DOC-10)
- R-JOB-03 → geschrapt: verhuisd naar roadmap ST-03 tot de bouw (R-DOC-10)
- R-PRIV-01 → geschrapt: verhuisd naar roadmap ST-05 tot de bouw (R-DOC-10)
- R-LAAG-08, app-uitbreiding src/api/env.ts → geschrapt: de uitbreidingsplek is readEnv() in src/core/api/env.ts (ADR 0040)
- R-PROV-01, fouttracking via reportClientError() → geschrapt: verhuisd naar roadmap ST-08 tot de bouw
- R-OPSL-01, poort FileStorage met contracttestsuite → geschrapt: verhuisd naar roadmap ST-11 tot de bouw
- R-JOB-02, withJob() met eigen pool als app_jobs → geschrapt: verhuisd naar roadmap ST-03 tot de bouw
- R-UIT-02, clientfouten-route zonder login → geschrapt: verhuisd naar roadmap ST-08 tot de bouw
- R-CODE-04, verschil in aantal unsafeCast op de PR → geschrapt: verhuisd naar roadmap-item Geclaimde checks die niet bestaan
- R-CODE-04, assert() meldt aan de fouttracking → geschrapt: verhuisd naar roadmap ST-08 tot de bouw
- R-SEC-04, CAPTCHA-domein in script-src en frame-src → geschrapt: verhuisd naar roadmap ST-10 tot de bouw
- R-PRIV-02, app.delete_account(id) en registratie van verwijderaars → geschrapt: verhuisd naar roadmap ST-05 tot de bouw
- R-DOC-09, bewaartermijn en lees-actie van metingen → geschrapt: staat al als roadmap-item Bewaartermijn van gemeten data
- R-REPO-02, main-protection.json en check-github.mjs → geschrapt: verhuisd naar roadmap ST-01 tot de bouw
- R-CI-06, alleen-templatedocs in docs/template/ → geschrapt: verhuisd naar roadmap-item Vervolg compacte kennisbasis
- R-REL-02, check-release-ci en check-deployment-schema → geschrapt: verhuisd naar roadmap ST-10 tot de bouw
- R-DB-14, grants van app_definer voor app.delete_account → geschrapt: verhuisd naar roadmap ST-05 tot de bouw
- R-DEPLOY-01, readiness-ping als app_jobs → geschrapt: verhuisd naar roadmap ST-03 tot de bouw
