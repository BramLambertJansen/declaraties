import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader } from './card.tsx';
import { PageTitle } from './page-title.tsx';

interface CenteredCardProps {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly preview?: boolean;
}

// Voor schermen zonder app-layout: inloggen, verificatiecode, uitnodiging (spec accountbeheer).
export function CenteredCard({ title, description, children, preview = false }: CenteredCardProps) {
  const Container = preview ? 'div' : 'main';
  return (
    <Container
      className={
        preview
          ? 'flex items-center justify-center bg-muted p-4'
          : 'flex min-h-dvh items-center justify-center bg-muted p-4'
      }
    >
      <Card className="w-full max-w-sm">
        <CardHeader>
          {/* De enige h1 van het scherm. */}
          <PageTitle title={title} preview={preview} className="text-2xl leading-none font-semibold" />
          {description === undefined ? null : <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </Container>
  );
}
