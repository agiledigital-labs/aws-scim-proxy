export type ScimUser = {
  id: string;
};

export type ScimResponse<T> = {
  Resources: ReadonlyArray<T>;
};

export type ScimPatchOperation = {
  schemas: ReadonlyArray<string>;
  Operations: ReadonlyArray<{
    op: 'add' | 'replace' | 'remove';
    path?: string;
    value:
      | unknown
      | Record<string, unknown>
      | ReadonlyArray<Record<string, unknown>>;
  }>;
};

export type ScimPutOperation = {
  id: string;
  schemas: string[];
} & Record<string, string | number | ReadonlyArray<{ value: string | number }>>;

export type ScimGroupOperations = ScimPutOperation | ScimPatchOperation;
