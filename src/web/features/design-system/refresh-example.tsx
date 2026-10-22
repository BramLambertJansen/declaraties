import { AsyncView, Button, Section } from '#web/ui/index.ts';
import { useRefreshExampleQuery } from './queries.ts';

export function RefreshExample() {
  const { query, finish } = useRefreshExampleQuery();
  return (
    <Section id="example-refresh" title="Verversen met behoud van inhoud">
      <p>Start verversen en rond af met succes of fout. De bestaande invoer en gegevens blijven beschikbaar.</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void query.refetch()}>Verversen</Button>
        <Button
          variant="outline"
          onClick={() => {
            finish(false);
          }}
        >
          Verversen afronden
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            finish(true);
          }}
        >
          Verversen laten mislukken
        </Button>
      </div>
      <AsyncView
        query={query}
        refresh={{
          refreshingLabel: 'Gegevens verversen…',
          staleLabel: 'De getoonde gegevens zijn mogelijk verouderd.',
        }}
      >
        {(data) => (
          <ul>
            {data.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </AsyncView>
    </Section>
  );
}
