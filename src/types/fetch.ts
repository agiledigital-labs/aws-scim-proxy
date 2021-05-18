export type FetchGroupMembers = () => Promise<
  ReadonlyArray<{
    userId: string;
    group: unknown;
  }>
>;
