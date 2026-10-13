// De enige importbron voor features/ (framework §7): her-exporteert de basiskit uit core. Eigen componenten en afgeleide
// varianten van de app komen hier ook (afleiden uit de basis en variantkaart van core, niet forken).
export { AppShell } from '#core/web/ui/app-shell.tsx';
export { AsyncView } from '#core/web/ui/async-view.tsx';
export { Button, buttonBase, buttonVariantMap, buttonVariants, type ButtonProps } from '#core/web/ui/button.tsx';
export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '#core/web/ui/card.tsx';
export { CenteredCard } from '#core/web/ui/centered-card.tsx';
export { cn } from '#core/web/ui/cn.ts';
export { ConfirmDialog } from '#core/web/ui/confirm-dialog.tsx';
export { Dialog } from '#core/web/ui/dialog.tsx';
export { ErrorTextsProvider, useErrorText } from '#core/web/ui/error-texts.tsx';
export { DropdownMenu, type MenuItem } from '#core/web/ui/dropdown-menu.tsx';
export { Field } from '#core/web/ui/field.tsx';
export { Form, FormField, useZodForm } from '#core/web/ui/form.tsx';
export { Input } from '#core/web/ui/input.tsx';
export { ListToolbar } from '#core/web/ui/list-toolbar.tsx';
export { NavLink } from '#core/web/ui/nav-link.tsx';
export { Notice } from '#core/web/ui/notice.tsx';
export { Toaster, ToastProvider, useToast } from '#core/web/ui/toast.tsx';
export { PageHeader } from '#core/web/ui/page-header.tsx';
export { PageTitle } from '#core/web/ui/page-title.tsx';
export { NotFound, RouteError } from '#core/web/ui/route-error.tsx';
export { QrCode } from '#core/web/ui/qr-code.tsx';
export { Section } from './section.tsx';
export { Select, type SelectOption } from '#core/web/ui/select.tsx';
export { Sidebar, visibleNavItems, type NavItem } from '#core/web/ui/sidebar.tsx';
export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#core/web/ui/table.tsx';
export { ThemeToggle } from '#core/web/ui/theme-toggle.tsx';
export { Topbar } from '#core/web/ui/topbar.tsx';
