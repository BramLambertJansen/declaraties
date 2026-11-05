export interface ProefPort {
  readonly item: (id: string) => Promise<string | null>;
}
