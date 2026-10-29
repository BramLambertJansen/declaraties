import { useQuery } from '@tanstack/react-query';
import { meQuery } from '#web/lib/session.ts';

// De huidige rol voor de dev-rolwisselaar: ook op /login (dan 401, geen nieuwe poging; de wisselaar toont dan geen rol).
export function useCurrentRole() {
  return useQuery({ ...meQuery, retry: false }).data?.rol;
}
