import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { OutputManager, COMPACT_THEME } from "../src/output-manager.js";
import { OperationTracker } from "../src/operation-tracker.js";
import { AnsiUtils } from "../src/ansi-utils.js";

describe('OutputManager Compact Mode', () => {
  let output: OutputManager;
  let originalConsoleLog: typeof console.log;
  let capturedOutput: string[];

  beforeEach(() => {
    // Capture console.log output
    originalConsoleLog = console.log;
    capturedOutput = [];
    console.log = (...args: any[]) => {
      capturedOutput.push(args.map(arg => String(arg)).join(' '));
    };

    // Create output manager in compact mode
    output = new OutputManager({
      outputMode: 'compact',
      useColors: false, // Disable colors for easier testing
      spinnerStyle: 'none', // Disable spinner for testing
      maxLineLength: 80,
      showTimestamps: false,
      showElapsedTime: false,
      verboseMode: false
    });

    // Reset ANSI capabilities cache
    AnsiUtils.refreshCapabilities();
  });

  afterEach(() => {
    // Restore console.log
    console.log = originalConsoleLog;
    
    // Clean up any active operations
    const activeOps = (output as any).activeOperations;
    if (activeOps) {
      for (const [id, operation] of activeOps) {
        if (operation.isRunning()) {
          operation.stop();
        }
      }
      activeOps.clear();
    }
  });

  describe('Mode Configuration', () => {
    test('should initialize in compact mode', () => {
      expect(output.getOutputMode()).toBe('compact');
    });

    test('should switch between modes', () => {
      output.setOutputMode('verbose');
      expect(output.getOutputMode()).toBe('verbose');
      
      output.setOutputMode('compact');
      expect(output.getOutputMode()).toBe('compact');
    });
  });

  describe('Operation Management', () => {
    test('should start and complete operations', () => {
      output.startOperation('test-op', 'Testing operation', 'general');
      
      // Give spinner time to start (if not disabled)
      setTimeout(() => {
        output.completeOperation('test-op', 'Operation completed', 'success');
      }, 10);
    });

    test('should handle operation updates', () => {
      output.startOperation('test-op', 'Initial message', 'general');
      output.updateOperation('test-op', 'Updated message');
      output.completeOperation('test-op', 'Final message', 'success');
    });

    test('should handle operation failures', () => {
      output.startOperation('test-op', 'Failing operation', 'general');
      output.failOperation('test-op', 'Operation failed', 'Detailed error message');
    });

    test('should handle multiple concurrent operations', () => {
      output.startOperation('op1', 'Operation 1', 'git');
      output.startOperation('op2', 'Operation 2', 'github');
      
      output.completeOperation('op1', 'Op 1 completed', 'success');
      output.completeOperation('op2', 'Op 2 completed', 'success');
    });
  });

  describe('Backward Compatibility', () => {
    test('should handle verbose mode fallback for startOperation', () => {
      output.setOutputMode('verbose');
      
      // Should not throw when using compact methods in verbose mode
      expect(() => {
        output.startOperation('test-op', 'Testing operation', 'general');
        output.completeOperation('test-op', 'Operation completed', 'success');
      }).not.toThrow();
    });

    test('should handle traditional logging methods', () => {
      expect(() => {
        output.log('Test info message', 'info');
        output.success('Test success message');
        output.error('Test error message');
        output.warning('Test warning message');
      }).not.toThrow();
    });

    test('should handle sections and groups', () => {
      expect(() => {
        output.startSection('Test Section', 'general');
        output.startGroup('Test Group', 'git');
        output.progress('Test progress');
        output.endGroup();
        output.endSection();
      }).not.toThrow();
    });
  });

  describe('Logging with Compact Options', () => {
    test('should handle log truncation', () => {
      const longMessage = 'This is a very long message that should be truncated when the truncate option is enabled and the max line length is exceeded';
      
      expect(() => {
        output.log(longMessage, 'info', 0, { truncate: true });
      }).not.toThrow();
    });

    test('should handle operation-specific logging', () => {
      expect(() => {
        output.log('Operation message', 'info', 0, { operationId: 'test-op' });
      }).not.toThrow();
    });
  });

  describe('Theme Configuration', () => {
    test('should have valid theme configuration', () => {
      expect(COMPACT_THEME).toBeDefined();
      expect(COMPACT_THEME.states).toBeDefined();
      expect(COMPACT_THEME.operations).toBeDefined();
      expect(COMPACT_THEME.emphasis).toBeDefined();
      
      // Check required states
      expect(COMPACT_THEME.states.loading).toBeDefined();
      expect(COMPACT_THEME.states.success).toBeDefined();
      expect(COMPACT_THEME.states.error).toBeDefined();
      expect(COMPACT_THEME.states.warning).toBeDefined();
      
      // Check required operations
      expect(COMPACT_THEME.operations.git).toBeDefined();
      expect(COMPACT_THEME.operations.github).toBeDefined();
      expect(COMPACT_THEME.operations.stack).toBeDefined();
    });
  });
});

describe('OperationTracker Integration', () => {
  let output: OutputManager;
  let tracker: OperationTracker;
  let originalConsoleLog: typeof console.log;
  let capturedOutput: string[];

  beforeEach(() => {
    // Capture console.log output
    originalConsoleLog = console.log;
    capturedOutput = [];
    console.log = (...args: any[]) => {
      capturedOutput.push(args.map(arg => String(arg)).join(' '));
    };

    output = new OutputManager({
      outputMode: 'compact',
      useColors: false,
      spinnerStyle: 'none',
      maxLineLength: 80,
      showTimestamps: false,
      showElapsedTime: false,
      verboseMode: false
    });
    
    tracker = new OperationTracker(output);
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  describe('Async Operations', () => {
    test('should handle successful async operations', async () => {
      const result = await tracker.executeOperation(
        'test-async',
        'Testing async operation',
        'general',
        async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return 'success';
        }
      );
      
      expect(result).toBe('success');
    });

    test('should handle failed async operations', async () => {
      try {
        await tracker.executeOperation(
          'test-async-fail',
          'Testing async failure',
          'general',
          async () => {
            throw new Error('Test error');
          }
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Test error');
      }
    });

    test('should handle custom success messages', async () => {
      const result = await tracker.executeOperation(
        'test-custom-success',
        'Testing custom success',
        'general',
        async () => {
          return { count: 5, items: ['a', 'b', 'c', 'd', 'e'] };
        },
        {
          successMessage: (result) => `Processed ${result.count} items`,
          showElapsed: true
        }
      );
      
      expect(result.count).toBe(5);
    });
  });

  describe('Convenience Methods', () => {
    test('should handle git operations', async () => {
      const result = await tracker.gitOperation(
        'Testing git operation',
        async () => 'git success'
      );
      
      expect(result).toBe('git success');
    });

    test('should handle github operations', async () => {
      const result = await tracker.githubOperation(
        'Testing github operation',
        async () => 'github success'
      );
      
      expect(result).toBe('github success');
    });

    test('should handle stack operations', async () => {
      const result = await tracker.stackOperation(
        'Testing stack operation',
        async () => 'stack success'
      );
      
      expect(result).toBe('stack success');
    });
  });

  describe('Synchronous Operations', () => {
    test('should handle successful sync operations', () => {
      const result = tracker.executeOperationSync(
        'test-sync',
        'Testing sync operation',
        'general',
        () => 'sync success'
      );
      
      expect(result).toBe('sync success');
    });

    test('should handle failed sync operations', () => {
      try {
        tracker.executeOperationSync(
          'test-sync-fail',
          'Testing sync failure',
          'general',
          () => {
            throw new Error('Sync error');
          }
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Sync error');
      }
    });
  });

  describe('Manual Operation Control', () => {
    test('should handle manual operation lifecycle', () => {
      const id = tracker.startOperation('Manual operation', 'general');
      expect(typeof id).toBe('string');
      
      tracker.updateOperation(id, 'Updated operation');
      tracker.completeOperation(id, 'Manually completed');
    });

    test('should handle manual operation failure', () => {
      const id = tracker.startOperation('Manual failing operation', 'general');
      tracker.failOperation(id, 'Manually failed', 'Error details');
    });
  });

  describe('Batch Operations', () => {
    test('should handle sequential operations', async () => {
      const operations = [
        {
          description: 'First operation',
          type: 'git' as const,
          operation: async () => 'first result'
        },
        {
          description: 'Second operation',
          type: 'github' as const,
          operation: async () => 'second result'
        }
      ];
      
      const results = await tracker.executeSequence(operations);
      expect(results).toEqual(['first result', 'second result']);
    });

    test('should handle parallel operations', async () => {
      const operations = [
        {
          description: 'Parallel operation 1',
          type: 'git' as const,
          operation: async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return 'parallel 1';
          }
        },
        {
          description: 'Parallel operation 2',
          type: 'github' as const,
          operation: async () => {
            await new Promise(resolve => setTimeout(resolve, 5));
            return 'parallel 2';
          }
        }
      ];
      
      const results = await tracker.executeParallel(operations);
      expect(results).toEqual(['parallel 1', 'parallel 2']);
    });
  });
});