import type { UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import type { z } from 'zod';
import { format } from '#core/web/lib/format.ts';
import type { sessionItem } from '#shared/contracts/me.ts';
import { copy } from '#web/copy/ui.ts';
import {
  AsyncView,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  Notice,
  Section,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useErrorText,
} from '#web/ui/index.ts';
import { useRevokeOtherSessions, useRevokeSession } from './queries.ts';

type Session = z.output<typeof sessionItem>;
type Message = { readonly tone: 'info' | 'error'; readonly text: string } | null;

function SessionRow({ session, onRevoke }: { session: Session; onRevoke: (session: Session) => void }) {
  const texts = copy.account.sessions;
  return (
    <TableRow>
      <TableCell>
        <span className="font-medium">{session.apparaat}</span>
        {session.huidig ? <span className="ml-2 text-muted-foreground">{texts.current}</span> : null}
      </TableCell>
      <TableCell>{format.dateTime(session.aangemaakt)}</TableCell>
      <TableCell>{format.dateTime(session.laatstActief)}</TableCell>
      <TableCell>
        {session.huidig ? null : (
          <Button
            variant="outline"
            aria-label={`${texts.revoke} ${session.apparaat}`}
            onClick={() => {
              onRevoke(session);
            }}
          >
            {texts.revoke}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function SessionsTable({ items, onRevoke }: { items: readonly Session[]; onRevoke: (session: Session) => void }) {
  const texts = copy.account.sessions;
  return (
    <Table label={texts.title}>
      <TableHeader>
        <TableRow>
          <TableHead>{texts.device}</TableHead>
          <TableHead>{texts.createdAt}</TableHead>
          <TableHead>{texts.lastActive}</TableHead>
          <TableHead>
            <span className="sr-only">{texts.actions}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((session) => (
          <SessionRow key={session.id} session={session} onRevoke={onRevoke} />
        ))}
      </TableBody>
    </Table>
  );
}

// Spec eigen-account, AC-6 en AC-7: eigen sessies zonder tokens; beëindigen altijd na bevestiging; de eigen sessie heeft geen knop.
export function SessionsSection({ sessions }: { readonly sessions: UseQueryResult<{ readonly items: Session[] }> }) {
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const errorText = useErrorText();
  const [target, setTarget] = useState<Session | null>(null);
  const [othersOpen, setOthersOpen] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const texts = copy.account.sessions;
  const fail = (error: unknown) => {
    setMessage({ tone: 'error', text: errorText(error) });
  };
  const confirmRevoke = (session: Session) => {
    revoke.mutateAsync(session.id).then(() => {
      setTarget(null);
      setMessage({ tone: 'info', text: texts.revokeDialog.done });
    }, fail);
  };
  const confirmOthers = () => {
    revokeOthers.mutateAsync().then(() => {
      setOthersOpen(false);
      setMessage({ tone: 'info', text: texts.revokeOthersDialog.done });
    }, fail);
  };
  return (
    <Section title={texts.title} landmark={false}>
      <Card>
        <CardContent className="flex flex-col gap-4">
          {message === null ? null : <Notice tone={message.tone}>{message.text}</Notice>}
          <AsyncView query={sessions}>
            {(data) => (
              <div className="flex min-w-0 flex-col gap-4">
                <SessionsTable
                  items={data.items}
                  onRevoke={(session) => {
                    setMessage(null);
                    setTarget(session);
                  }}
                />
                <div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setMessage(null);
                      setOthersOpen(true);
                    }}
                  >
                    {texts.revokeOthers}
                  </Button>
                </div>
              </div>
            )}
          </AsyncView>
        </CardContent>
      </Card>
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        title={texts.revokeDialog.title}
        description={texts.revokeDialog.description(target?.apparaat ?? texts.unknownDevice)}
        confirmLabel={texts.revokeDialog.confirm}
        busy={revoke.isPending}
        onConfirm={() => {
          if (target !== null) confirmRevoke(target);
        }}
      />
      <ConfirmDialog
        open={othersOpen}
        onOpenChange={setOthersOpen}
        title={texts.revokeOthersDialog.title}
        description={texts.revokeOthersDialog.description}
        confirmLabel={texts.revokeOthersDialog.confirm}
        busy={revokeOthers.isPending}
        onConfirm={confirmOthers}
      />
    </Section>
  );
}
