# klonk-result

A Proxy-based Result type for TypeScript.

This library implements the Result pattern using ES6 Proxies. It allows property access and method calls to be forwarded directly to the wrapped value. If the result is a failure, these operations are intercepted and the error is propagated.

`klonk-result` powers the type-safe railway-oriented design of [Klonk](https://github.com/klar-web-services/klonk) and [Klonkworks](https://github.com/klar-web-services/klonkworks).

## Implementation Details

The `Result<T>` type is a union of `Ok<T>` and `Err<T>`. A Proxy intercepts operations on the object.

1.  **Ok State:** Operations not belonging to the Result API are forwarded to the underlying value `T`.
2.  **Err State:** Accessing members of `T` returns a function that returns the existing `Err`. This allows chaining to continue without throwing, propagating the initial error.

## Installation

```bash
bun add @fkws/klonk-result
npm install @fkws/klonk-result
```

## Usage

### Basic Wrapper

Create `Result` objects with a success or failure state.

```typescript
import { Result } from '@fkws/klonk-result';

function divide(a: number, b: number): Result<number> {
  if (b === 0) {
    return new Result({ success: false, error: new Error("Division by zero") });
  }
  return new Result({ success: true, data: a / b });
}

const val = divide(10, 2);

if (val.isOk()) {
  console.log("Result:", val.unwrap()); // 5
} else {
  console.error(val.error);
}
```

### Method Forwarding

Methods can be chained directly on the `Result` object. The chain executes if the result is successful. If an error occurs at any point, subsequent calls return the error without execution.

```typescript
class User {
  constructor(public name: string) {}

  updateName(newName: string): Result<User> {
    if (!newName) return new Result({ success: false, error: new Error("Invalid name") });
    return new Result({ success: true, data: new User(newName) });
  }

  save(): Result<void> {
    // Database logic
    return new Result({ success: true, data: undefined });
  }
}

const userResult = new Result({ success: true, data: new User("Alice") });

// The chain continues until an error occurs or the chain ends
const pipeline = userResult
  .updateName("Bob")
  .updateName("") // Returns Err("Invalid name")
  .save();        // Not executed; pipeline remains Err("Invalid name")

if (pipeline.isErr()) {
  console.log("Pipeline failed:", pipeline.error.message);
}
```

### Primitive Values

Primitives are boxed (e.g., `string` to `String`) to allow method access. Methods returning primitives exit the Result wrapper.

```typescript
const strResult = new Result({ success: true, data: "hello world" });

// .toUpperCase() returns a string, not Result<string>
const upper = strResult.toUpperCase(); 

console.log(upper); // "HELLO WORLD"
```

## API

The following members take precedence over the wrapped value.

*   `success` (boolean): Indicates if the result is successful.
*   `isOk()`: Type guard for the Ok state.
*   `isErr()`: Type guard for the Err state.
*   `unwrap()`: Returns `T` if successful; throws `Error` if failed.
*   `error` (Err only): The `Error` object.
*   `throw()` (Err only): Throws the contained error.

## License

Mozilla Public License Version 2.0
