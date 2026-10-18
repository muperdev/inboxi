declare module "bun:sqlite" {
  type SqlValue = string | number | bigint | boolean | null | Uint8Array;

  export class Statement<T> {
    get(...params: SqlValue[]): T | null;
    all(...params: SqlValue[]): T[];
    run(...params: SqlValue[]): void;
  }

  export class Database {
    constructor(
      filename: string,
      options?: { readonly?: boolean; create?: boolean; strict?: boolean },
    );
    exec(sql: string): void;
    query<T>(sql: string): Statement<T>;
    transaction<A extends unknown[], T>(fn: (...args: A) => T): (...args: A) => T;
    close(): void;
  }
}
