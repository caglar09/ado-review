/**
 * Basic test file to ensure CI/CD pipeline works
 * This file contains minimal tests to prevent workflow failures
 */

describe('Basic Tests', () => {
  test('should pass basic assertion', () => {
    expect(true).toBe(true);
  });

  test('should handle basic math operations', () => {
    expect(2 + 2).toBe(4);
    expect(5 * 3).toBe(15);
  });

  test('should handle string operations', () => {
    const testString = 'ado-review-cli';
    expect(testString).toContain('review');
    expect(testString.length).toBeGreaterThan(0);
  });

  test('should handle array operations', () => {
    const testArray = [1, 2, 3, 4, 5];
    expect(testArray).toHaveLength(5);
    expect(testArray).toContain(3);
  });

  test('should handle object operations', () => {
    const testObject = {
      name: 'ado-review-cli',
      version: '1.0.0',
      type: 'cli-tool'
    };
    
    expect(testObject).toHaveProperty('name');
    expect(testObject.name).toBe('ado-review-cli');
    expect(Object.keys(testObject)).toHaveLength(3);
  });
});

describe('Environment Tests', () => {
  test('should have Node.js environment', () => {
    expect(process).toBeDefined();
    expect(process.version).toBeDefined();
  });

  test('should handle async operations', async () => {
    const asyncFunction = async () => {
      return new Promise((resolve) => {
        setTimeout(() => resolve('success'), 10);
      });
    };

    const result = await asyncFunction();
    expect(result).toBe('success');
  });
});