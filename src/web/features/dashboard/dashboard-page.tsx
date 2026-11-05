import { Link } from '@tanstack/react-router';
import { can } from '#shared/permissions.ts';
import { copy } from '#web/copy/ui.ts';
import { actorFromMe } from '#web/lib/session.ts';
import { Button, PageHeader } from '#web/ui/index.ts';
import { useMe } from '../session/queries.ts';

// Dashboard van een admin (spec accounts/AC-3): titel en de link naar de accounts; de link naar de catalogus alleen voor wie
// design-system:read heeft (spec design-system/AC-8).
export function DashboardPage() {
  const me = useMe();
  const showDesignSystem = me.data !== undefined && can(actorFromMe(me.data), 'design-system:read');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={copy.dashboard.title} />
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link to="/admin/accounts">{copy.dashboard.accounts}</Link>
        </Button>
        {showDesignSystem ? (
          <Button asChild variant="outline">
            <Link to="/design-system">{copy.dashboard.designSystem}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
