#!/usr/bin/env bash
# Zet de ruleset `main` op een app-repo (docs/nieuwe-app.md, fase 6.2), volgens framework §10 (`main-dicht` op de template plus
# opgeloste gesprekken en beide CodeQL-checks):
# geen delete of force push, PR-plicht (0 goedkeuringen tot de GitHub App er is, ADR 0006), opgeloste reviewgesprekken,
# merge en squash, en de verplichte checks uit .github/workflows/ (test/scripts/github-ruleset.test.ts houdt die gelijk).
# Draait de eigenaar, met de eigen `gh`-login; opnieuw draaien werkt de bestaande ruleset bij. Wijzigt nooit de zichtbaarheid.
# Gebruik: scripts/github-ruleset.sh <owner>/<repo> [--zonder-codeql]
set -euo pipefail

usage() {
  echo "Gebruik: scripts/github-ruleset.sh <owner>/<repo> [--zonder-codeql]" >&2
  echo "  --zonder-codeql  private repo zonder GitHub Advanced Security: CodeQL draait daar niet (codeql.yml)" >&2
  exit 2
}

repo="${1:-}"
[[ "$repo" =~ ^[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9._-]+$ ]] || usage
codeql=true
case "${2:-}" in
  "") ;;
  --zonder-codeql) codeql=false ;;
  *) usage ;;
esac
(($# <= 2)) || usage

# Job-namen zoals ze op een PR staan. De diff-guard (guard.yml) is tot de GitHub App geen verplichte check (ADR 0017).
checks=(gate:fast gate:slow secrets image check:new-resource osv-scanner)
$codeql && checks+=("codeql (actions)" "codeql (javascript-typescript)")

# 15368 = GitHub Actions: een status van een andere bron telt niet (anders is hij te vervalsen).
status_checks=""
for check in "${checks[@]}"; do
  status_checks+="${status_checks:+, }{ \"context\": \"$check\", \"integration_id\": 15368 }"
done

payload=$(
  cat <<JSON
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true,
        "allowed_merge_methods": ["merge", "squash"]
    } },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [ $status_checks ]
    } }
  ]
}
JSON
)

# gh-fout naar stderr; rulesets op een private repo zonder Pro/Team krijgen een eigen melding.
fail() {
  if [[ "$1" == *"Upgrade to GitHub Pro"* ]]; then
    echo "✗ GitHub weigert rulesets op $repo: een private repo vraagt GitHub Pro of Team." >&2
    echo "  → de eigenaar kiest: Pro, een organisatie met Team, of public. Dit script wijzigt de zichtbaarheid niet." >&2
  else
    printf '✗ gh api faalde:\n%s\n' "$1" >&2
  fi
  exit 1
}

id=$(gh api "repos/$repo/rulesets" --jq '.[] | select(.name == "main") | .id' 2>&1) || fail "$id"
[[ "$id" =~ ^[0-9]*$ ]] || fail "onverwachte uitvoer bij het zoeken naar ruleset main: $id"
if [[ -n "$id" ]]; then
  out=$(gh api -X PUT "repos/$repo/rulesets/$id" --input - <<<"$payload" 2>&1) || fail "$out"
  echo "✓ ruleset main bijgewerkt op $repo (${#checks[@]} verplichte checks)"
else
  out=$(gh api -X POST "repos/$repo/rulesets" --input - <<<"$payload" 2>&1) || fail "$out"
  echo "✓ ruleset main gezet op $repo (${#checks[@]} verplichte checks)"
fi
