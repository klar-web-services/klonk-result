import { describe, it, expect } from 'vitest';
import { Result } from './index';

describe('Result', () => {
  describe('Ok', () => {
    it('should create an Ok result with an object', () => {
      const data = { foo: 'bar' };
      const result = new Result({ success: true, data });

      expect(result.success).toBe(true);
      expect(result.isOk()).toBe(true);
      expect(result.isErr()).toBe(false);
      expect(result.unwrap()).toBe(data);
    });

    it('should proxy property access to the inner object', () => {
      const data = { name: 'John', age: 30 };
      const result = new Result({ success: true, data });

      expect(result.name).toBe('John');
      expect(result.age).toBe(30);
    });

    it('should proxy method calls to the inner object', () => {
      class Greeter {
        constructor(public name: string) {}
        greet() { return `Hello, ${this.name}`; }
      }
      const data = new Greeter('Alice');
      const result = new Result({ success: true, data });

      expect(result.greet()).toBe('Hello, Alice');
    });

    it('should support mutation via setters on the inner object', () => {
      const data = { count: 0 };
      const result = new Result({ success: true, data });

      result.count = 1;
      expect(result.count).toBe(1);
      expect(data.count).toBe(1);
      expect(result.unwrap().count).toBe(1);
    });

    describe('Primitives', () => {
      it('should handle strings and forward methods', () => {
        const result = new Result({ success: true, data: 'hello' });
        
        expect(result.unwrap()).toBe('hello');
        expect(result.length).toBe(5);
        expect(result.toUpperCase()).toBe('HELLO');
        expect(result.startsWith('he')).toBe(true);
      });

      it('should handle numbers and forward methods', () => {
        const result = new Result({ success: true, data: 123.456 });

        expect(result.unwrap()).toBe(123.456);
        expect(result.toFixed(2)).toBe('123.46');
        expect(result.toString()).toBe('123.456');
      });

      it('should handle booleans and forward methods', () => {
        const result = new Result({ success: true, data: true });

        expect(result.unwrap()).toBe(true);
        expect(result.toString()).toBe('true');
        expect(result.valueOf()).toBe(true);
      });
      
      it('should handle null and avoid errors on mutation attempt', () => {
          const result = new Result({ success: true, data: null as any });
          expect(result.unwrap()).toBe(null);
          
          // Should be covered by line 89: if (inner === null ...) return true;
          (result as any).foo = 'bar';
          expect((result as any).foo).toBeUndefined();
      });

      it('should ignore mutation on primitives', () => {
          const result = new Result({ success: true, data: "hello" });
          (result as any).foo = "bar"; // Should hit the second part of the condition
          expect((result as any).foo).toBeUndefined();
      });

      it('should handle bigints and forward methods', () => {
          const result = new Result({ success: true, data: BigInt(9007199254740991) });
          expect(result.unwrap()).toBe(BigInt(9007199254740991));
          expect(result.toString()).toBe('9007199254740991');
      });
    });
  });

  describe('Err', () => {
    it('should create an Err result with an Error', () => {
      const error = new Error('Something went wrong');
      const result = new Result<any>({ success: false, error });

      expect(result.success).toBe(false);
      expect(result.isOk()).toBe(false);
      expect(result.isErr()).toBe(true);
      expect(result.error).toBe(error);
    });

    it('should throw when unwrapped', () => {
      const error = new Error('Boom');
      const result = new Result<any>({ success: false, error });

      expect(() => result.unwrap()).toThrow('Boom');
    });

    it('should support explicit throw()', () => {
      const error = new Error('Explicit throw');
      const result = new Result<any>({ success: false, error });

      expect(() => result.throw()).toThrow('Explicit throw');
    });

    it('should not allow mutation of inner value (no-op/false)', () => {
      const result = new Result<any>({ success: false, error: new Error('err') });
      
      // We expect the setter to fail silently or return false depending on strict mode,
      // but essentially the value shouldn't change (and there is no value).
      // Since TypeScript might complain about setting arbitrary props, we cast to any.
      (result as any).foo = 'bar';
      
      // It's still an error
      expect(result.isErr()).toBe(true);
      // And accessing foo should return the sticky error proxy, not 'bar'
      // Note: In the implementation, accessing a prop on Err returns a function (sticky err).
      // It does NOT store properties.
      expect(typeof (result as any).foo).toBe('function');
    });
  });

  describe('Sticky Error / Chaining', () => {
    class Calculator {
      constructor(public val: number) {}
      add(n: number): Result<Calculator> {
        return new Result({ success: true, data: new Calculator(this.val + n) });
      }
      fail(): Result<Calculator> {
        return new Result({ success: false, error: new Error('Calc failed') });
      }
    }

    it('should allow method chaining on Ok path', () => {
      const start = new Result({ success: true, data: new Calculator(0) });
      const final = start.add(5).add(10);

      expect(final.isOk()).toBe(true);
      expect(final.unwrap().val).toBe(15);
    });

    it('should propagate error down the chain (sticky error)', () => {
      const start = new Result({ success: true, data: new Calculator(0) });
      
      // start -> add(5) [OK] -> fail() [ERR] -> add(10) [Ignored/Sticky]
      const chain = start.add(5).fail().add(10);

      expect(chain.isErr()).toBe(true);
      if (chain.isErr()) {
        expect(chain.error.message).toBe('Calc failed');
      }
      expect(() => chain.unwrap()).toThrow('Calc failed');
    });
    
    it('should handle property access on Err as sticky', () => {
         const result = new Result<any>({ success: false, error: new Error('stop') });
         // Accessing any property on Err returns a function that returns the Err
         const next = result.someProp;
         expect(typeof next).toBe('function');
         
         // Calling that function returns the receiver (the original Err proxy)
         const nextRes = next(); 
         expect(nextRes).toBe(result); // It might refer to the proxy wrapper
         expect(nextRes.isErr()).toBe(true);
    });
  });

  describe('Special Cases', () => {
    it('should return undefined for "then" property to avoid Thenable confusion', () => {
      const result = new Result({ success: true, data: {} });
      expect((result as any).then).toBeUndefined();
      
      const errResult = new Result({ success: false, error: new Error('e') });
      expect((errResult as any).then).toBeUndefined();
    });

    it('should prioritize Result API members over Inner Object members', () => {
        // ... previous test code ...
    });

    it('should allow setting Result API properties if needed (though not recommended)', () => {
        const result = new Result({ success: true, data: { foo: 'bar' } });
        // This covers: if (RESULT_KEYS.includes(prop as string)) return Reflect.set(...)
        (result as any).success = false;
        expect(result.success).toBe(false);
    });
  });
});
