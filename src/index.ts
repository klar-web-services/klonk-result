type ResultParams<T> =
  | { success: true; data: T }
  | { success: false; error: Error };

type AnyFn = (...args: any[]) => any;

/** Values supported by this Result implementation (incl. primitives). */
type ResultValue = any;

/**
 * For primitive Ok-values, we forward member access to the corresponding boxed wrapper
 * so you can call e.g. `toUpperCase()` on `Result<string>`.
 */
type Boxed<T> =
  T extends string ? String :
  T extends number ? Number :
  T extends boolean ? Boolean :
  T extends bigint ? BigInt :
  T extends symbol ? Symbol :
  T extends object ? T :
  {};

/** Shared Result implementation + proxy membrane. */
abstract class _ResultBase<T extends ResultValue> {
  abstract readonly success: boolean;

  isErr(): this is _Err<T> {
    return !this.success;
  }

  isOk(): this is _Ok<T> {
    return this.success;
  }

  abstract unwrap(): T;

  protected static __proxify<R extends _ResultBase<any>>(res: R): R {
    const proxy = new Proxy(res, {
      get(target, prop, receiver) {
        // Avoid being treated like a Promise/thenable
        if (prop === "then") return undefined;

        // 1) Result members win (success / isOk / isErr / unwrap / error / throw ...)
        const RESULT_KEYS = ["success", "isOk", "isErr", "unwrap", "error", "throw"];
        if (RESULT_KEYS.includes(prop as string)) {
          const v = Reflect.get(target as any, prop, target);
          return typeof v === "function" ? (v as AnyFn).bind(target) : v;
        }

        // 2) Sticky Err: touching any "T member" returns a no-op function that yields the same Err result.
        // This lets chains continue until the user explicitly unwraps / throws.
        if (target.isErr()) {
          return (..._args: any[]) => receiver;
        }

        // 3) Ok: forward to inner value (box primitives just for member lookup/calls)
        const inner = target.unwrap() as any;

        const host =
          inner !== null && (typeof inner === "object" || typeof inner === "function")
            ? inner
            : Object(inner); // boxes primitives (String/Number/Boolean/BigInt/Symbol)

        const v = Reflect.get(host, prop, host);

        // Bind methods to the host (boxed primitive or object) so `this` works.
        return typeof v === "function" ? (v as AnyFn).bind(host) : v;
      },

      set(target, prop, value, receiver) {
        // Writes to Result itself if it owns the prop
        const RESULT_KEYS = ["success", "isOk", "isErr", "unwrap", "error", "throw"];
        if (RESULT_KEYS.includes(prop as string)) {
          return Reflect.set(target as any, prop, value, target);
        }

        // Err can't be written-through to inner value
        if (target.isErr()) return true;

        const inner = target.unwrap() as any;

        // Primitives can't be meaningfully mutated through a proxy surface
        if (inner === null || (typeof inner !== "object" && typeof inner !== "function")) {
          return true;
        }

        return Reflect.set(inner, prop, value, inner);
      },
    });

    return proxy;
  }
}

class _Ok<T extends ResultValue> extends _ResultBase<T> {
  readonly success = true as const;

  #data: T;

  constructor(data: T) {
    super();
    this.#data = data;
    return _ResultBase.__proxify(this) as any;
  }

  unwrap(): T {
    return this.#data;
  }
}

class _Err<T extends ResultValue> extends _ResultBase<T> {
  readonly success = false as const;

  /** The error carried by this Err result. Available only after `isErr()` narrowing. */
  readonly error: Error;

  constructor(error: Error) {
    super();
    this.error = error;
    return _ResultBase.__proxify(this) as any;
  }

  unwrap(): T {
    throw this.error;
  }

  /** Only on Err: throw the stored error. */
  throw(): never {
    throw this.error;
  }
}

/**
 * A `Result<T>` is either:
 * - **Ok** (`success: true`) containing a value of type `T`, or
 * - **Err** (`success: false`) containing an `Error`.
 *
 * This `Result` also acts like the wrapped value via a Proxy membrane:
 *
 * - **Result API** (`success`, `isOk()`, `isErr()`, `unwrap()`) is always available.
 * - When **Ok**, accessing a member that isn’t part of the Result API forwards to the inner value.
 * - When **Err**, accessing a member of `T` returns a no-op function that returns the same Err result
 *   (sticky error propagation). The error is only thrown when you explicitly call `unwrap()` or `throw()`.
 *
 * Primitive Ok-values are supported:
 * - For `T` = `string | number | boolean | bigint | symbol`, member access is forwarded to the boxed wrapper
 *   (e.g. `String`) so methods like `toUpperCase()` are available.
 * - Those primitive methods return their normal JS return types (e.g. `toUpperCase(): string`),
 *   which means you can leave “Result-land” when you call them.
 *
 * Name collisions are resolved in favor of `Result`’s own members.
 *
 * @example
 * const ok = new Result({ success: true, data: "hello" });
 * ok.isOk();          // true
 * ok.toUpperCase();   // "HELLO"  (string method forwarded via boxing)
 *
 * @example
 * class A {
 *   constructor(public data: string) {}
 *   changeData(next: string): Result<A> {
 *     return next === "bad"
 *       ? new Result({ success: false, error: new Error("bad") })
 *       : new Result({ success: true, data: new A(next) });
 *   }
 * }
 *
 * const r = new A("start")
 *   .changeData("ok")
 *   .changeData("bad")
 *   .changeData("ignored");
 *
 * if (r.isErr()) r.throw(); // throws "bad"
 */
export type Result<T extends ResultValue> =
  (_Ok<T> | _Err<T>) & Omit<Boxed<T>, keyof _ResultBase<any>>;

/**
 * Construct a {@link Result} from a `{ success: true, data }` or `{ success: false, error }` payload.
 *
 * The returned object is Proxy-backed:
 * - exposes the Result API (`success`, `isOk()`, `isErr()`, `unwrap()`)
 * - forwards unknown members to the Ok value `T` (including boxed primitive members)
 * - propagates Err results “stickily” through chained `T` member calls until you explicitly `unwrap()`/`throw()`.
 *
 * @example
 * const r = new Result({ success: true, data: 42 });
 * r.toFixed(2); // "42.00" (Number method forwarded via boxing)
 *
 * @example
 * const e = new Result({ success: false, error: new Error("boom") });
 * e.isErr(); // true
 * // e.unwrap(); // throws "boom"
 */
export const Result: {
  new <T extends ResultValue>(params: ResultParams<T>): Result<T>;
} = class ResultCtor<T extends ResultValue> {
  constructor(params: ResultParams<T>) {
    if (params.success) {
      return new _Ok(params.data) as any;
    } else {
      return new _Err<T>((params as { success: false; error: Error }).error) as any;
    }
  }
} as any;