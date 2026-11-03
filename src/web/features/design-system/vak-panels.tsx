import type { ReactNode } from 'react';
import { AsyncAndErrorSections, CenteredCardSection } from './additional-examples.tsx';
import { BulkActionsExample } from './bulk-actions-example.tsx';
import { CollectionExamples } from './collection-examples.tsx';
import { ComboboxExamples } from './combobox-examples.tsx';
import { DataDisplayExamples } from './data-display-examples.tsx';
import { EditableDetailsExample } from './editable-details-example.tsx';
import { FormStateExamples } from './form-state-examples.tsx';
import { BreadcrumbsSection, CopyButtonSection, InputUtilitiesSection } from './input-utilities-examples.tsx';
import {
  ButtonSection,
  CardSection,
  DialogSections,
  DropdownSection,
  FormSection,
  LayoutSection,
  ListToolbarSection,
  NoticeSection,
  PageHeaderSection,
  QrCodeSection,
  TableSection,
  ToastSection,
} from './page-examples.tsx';
import { RefreshExample } from './refresh-example.tsx';
import { TokensExamples } from './tokens-examples.tsx';
import { TypographyExamples } from './typography-examples.tsx';
import { BusyButtonSection, BusyMenuSection, FormControlSections, StatusSections } from './ui-basics-examples.tsx';
import type { VakId } from './vakken.ts';

// Welke voorbeelden in welk tabblad staan (spec designsystem-toolbox). Alle panelen worden altijd gerenderd (Tabs verbergt
// ze met `hidden`), zodat check:catalogus elk voorbeeld vanuit DesignSystemPage blijft vinden.
function Panel({ children }: { readonly children: ReactNode }) {
  return <div className="flex flex-col gap-10 pt-6">{children}</div>;
}

export const vakPanels: Readonly<Record<VakId, ReactNode>> = {
  basis: (
    <Panel>
      <TokensExamples />
    </Panel>
  ),
  acties: (
    <Panel>
      <ButtonSection />
      <BusyButtonSection />
      <DropdownSection />
      <BusyMenuSection />
      <CopyButtonSection />
      <DialogSections />
    </Panel>
  ),
  formulieren: (
    <Panel>
      <FormSection />
      <FormControlSections />
      <FormStateExamples />
      <ComboboxExamples />
      <InputUtilitiesSection />
    </Panel>
  ),
  meldingen: (
    <Panel>
      <NoticeSection />
      <ToastSection />
      <StatusSections />
      <AsyncAndErrorSections />
    </Panel>
  ),
  gegevens: (
    <Panel>
      <TableSection />
      <DataDisplayExamples />
      <CollectionExamples />
      <CardSection />
      <QrCodeSection />
    </Panel>
  ),
  layout: (
    <Panel>
      <LayoutSection />
      <PageHeaderSection />
      <BreadcrumbsSection />
      <CenteredCardSection />
      <TypographyExamples />
    </Panel>
  ),
  patronen: (
    <Panel>
      <ListToolbarSection />
      <BulkActionsExample />
      <EditableDetailsExample />
      <RefreshExample />
    </Panel>
  ),
};
