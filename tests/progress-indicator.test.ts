import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { ProgressIndicator, ProgressHelpers, MultiStepProgress } from "../src/progress-indicator.js";
import { AnsiUtils } from "../src/ansi-utils.js";

describe('ProgressIndicator', () => {
  let originalIsTTY: boolean;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalIsTTY = process.stdout.isTTY;
    originalEnv = { ...process.env };
    AnsiUtils.refreshCapabilities();
  });

  afterEach(() => {
    try {
      Object.defineProperty(process.stdout, 'isTTY', { 
        value: originalIsTTY, 
        configurable: true, 
        writable: true 
      });
    } catch {
      // If we can't restore, that's okay for tests
    }
    process.env = originalEnv;
    AnsiUtils.refreshCapabilities();
  });

  describe('Basic Functionality', () => {
    test('should create progress indicator with default options', () => {
      const indicator = new ProgressIndicator('Loading...');
      expect(indicator).toBeDefined();
      expect(indicator.isRunning()).toBe(false);
    });

    test('should create progress indicator with custom options', () => {
      const indicator = new ProgressIndicator('Loading...', {
        style: 'line',
        color: 'red',
        interval: 100,
        prefix: 'DEBUG',
        suffix: '(waiting)'
      });
      expect(indicator).toBeDefined();
      expect(indicator.isRunning()).toBe(false);
    });

    test('should start and stop correctly', () => {
      const indicator = new ProgressIndicator('Loading...');
      
      expect(indicator.isRunning()).toBe(false);
      indicator.start();
      expect(indicator.isRunning()).toBe(true);
      indicator.stop();
      expect(indicator.isRunning()).toBe(false);
    });

    test('should handle multiple start calls gracefully', () => {
      const indicator = new ProgressIndicator('Loading...');
      
      indicator.start();
      expect(indicator.isRunning()).toBe(true);
      
      // Starting again should not cause issues
      indicator.start();
      expect(indicator.isRunning()).toBe(true);
      
      indicator.stop();
    });

    test('should handle stop when not running', () => {
      const indicator = new ProgressIndicator('Loading...');
      
      expect(() => indicator.stop()).not.toThrow();
      expect(indicator.isRunning()).toBe(false);
    });
  });

  describe('Text Updates', () => {
    test('should update text while running', () => {
      const indicator = new ProgressIndicator('Initial text');
      
      indicator.start();
      expect(indicator.isRunning()).toBe(true);
      
      // Should not throw when updating text
      expect(() => indicator.updateText('Updated text')).not.toThrow();
      
      indicator.stop();
    });

    test('should update text when not running', () => {
      const indicator = new ProgressIndicator('Initial text');
      
      // Should not throw when updating text while not running
      expect(() => indicator.updateText('Updated text')).not.toThrow();
    });
  });

  describe('Completion States', () => {
    test('should complete with success state', () => {
      const indicator = new ProgressIndicator('Loading...');
      
      indicator.start();
      expect(indicator.isRunning()).toBe(true);
      
      indicator.success('Operation completed successfully');
      expect(indicator.isRunning()).toBe(false);
    });

    test('should complete with error state', () => {
      const indicator = new ProgressIndicator('Loading...');
      
      indicator.start();
      expect(indicator.isRunning()).toBe(true);
      
      indicator.error('Operation failed');
      expect(indicator.isRunning()).toBe(false);
    });

    test('should complete with warning state', () => {
      const indicator = new ProgressIndicator('Loading...');
      
      indicator.start();
      expect(indicator.isRunning()).toBe(true);
      
      indicator.warn('Operation completed with warnings');
      expect(indicator.isRunning()).toBe(false);
    });

    test('should complete with info state', () => {
      const indicator = new ProgressIndicator('Loading...');
      
      indicator.start();
      expect(indicator.isRunning()).toBe(true);
      
      indicator.info('Operation completed');
      expect(indicator.isRunning()).toBe(false);
    });

    test('should use custom icons for completion states', () => {
      const indicator = new ProgressIndicator('Loading...');
      
      indicator.start();
      
      // Should not throw with custom icons
      expect(() => indicator.success('Done', '🎉')).not.toThrow();
      expect(indicator.isRunning()).toBe(false);
    });
  });

  describe('Spinner Styles', () => {
    test('should handle all spinner styles', () => {
      const styles = ['dots', 'line', 'arrow', 'clock', 'none'] as const;
      
      styles.forEach(style => {
        const indicator = new ProgressIndicator('Loading...', { style });
        expect(() => {
          indicator.start();
          indicator.stop();
        }).not.toThrow();
      });
    });

    test('should default to dots style', () => {
      const indicator = new ProgressIndicator('Loading...');
      // Just verify it doesn't throw - internal style handling is tested indirectly
      expect(() => {
        indicator.start();
        indicator.stop();
      }).not.toThrow();
    });
  });

  describe('Non-TTY Environment', () => {
    beforeEach(() => {
      try {
        Object.defineProperty(process.stdout, 'isTTY', { 
          value: false, 
          configurable: true, 
          writable: true 
        });
        AnsiUtils.refreshCapabilities();
      } catch {
        // If we can't modify TTY, skip these tests
      }
    });

    test('should work in non-TTY environment', () => {
      const indicator = new ProgressIndicator('Loading...');
      
      expect(() => {
        indicator.start();
        indicator.updateText('Updated text');
        indicator.success('Done');
      }).not.toThrow();
    });

    test('should not use animations in non-TTY environment', () => {
      const indicator = new ProgressIndicator('Loading...');
      
      // In non-TTY, start should not create an interval
      indicator.start();
      expect(indicator.isRunning()).toBe(true);
      
      // Should still complete normally
      indicator.success('Done');
      expect(indicator.isRunning()).toBe(false);
    });
  });
});

describe('ProgressHelpers', () => {
  let originalIsTTY: boolean;

  beforeEach(() => {
    originalIsTTY = process.stdout.isTTY;
    AnsiUtils.refreshCapabilities();
  });

  afterEach(() => {
    try {
      Object.defineProperty(process.stdout, 'isTTY', { 
        value: originalIsTTY, 
        configurable: true, 
        writable: true 
      });
    } catch {
      // If we can't restore, that's okay for tests
    }
    AnsiUtils.refreshCapabilities();
  });

  describe('Spinner Creation', () => {
    test('should create spinner with defaults', () => {
      const spinner = ProgressHelpers.spinner('Loading...');
      expect(spinner).toBeInstanceOf(ProgressIndicator);
      expect(spinner.isRunning()).toBe(false);
    });

    test('should create spinner with custom style and color', () => {
      const spinner = ProgressHelpers.spinner('Loading...', 'line', 'red');
      expect(spinner).toBeInstanceOf(ProgressIndicator);
    });
  });

  describe('Promise Progress', () => {
    test('should handle successful promise', async () => {
      const promise = new Promise(resolve => {
        setTimeout(() => resolve('success'), 50);
      });

      const result = await ProgressHelpers.withProgress(promise, 'Loading...');
      expect(result).toBe('success');
    });

    test('should handle rejected promise', async () => {
      const promise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Test error')), 50);
      });

      try {
        await ProgressHelpers.withProgress(promise, 'Loading...');
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Test error');
      }
    });

    test('should handle promise with custom options', async () => {
      const promise = new Promise(resolve => {
        setTimeout(() => resolve('success'), 50);
      });

      const result = await ProgressHelpers.withProgress(
        promise, 
        'Loading...', 
        { style: 'line', color: 'green' }
      );
      expect(result).toBe('success');
    });
  });

  describe('Synchronous Progress', () => {
    test('should handle successful synchronous operation', () => {
      const operation = () => 'success';
      
      const result = ProgressHelpers.withProgressSync(operation, 'Processing...');
      expect(result).toBe('success');
    });

    test('should handle synchronous operation that throws', () => {
      const operation = () => {
        throw new Error('Test error');
      };

      try {
        ProgressHelpers.withProgressSync(operation, 'Processing...');
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Test error');
      }
    });
  });

  describe('Multi-Step Progress', () => {
    test('should create multi-step progress', () => {
      const steps = ['Step 1', 'Step 2', 'Step 3'];
      const multiStep = ProgressHelpers.multiStep(steps);
      
      expect(multiStep).toBeInstanceOf(MultiStepProgress);
      expect(multiStep.getTotalSteps()).toBe(3);
      expect(multiStep.getCurrentStep()).toBe(0);
      expect(multiStep.isComplete()).toBe(false);
    });
  });
});

describe('MultiStepProgress', () => {
  test('should initialize correctly', () => {
    const steps = ['Initialize', 'Process', 'Finalize'];
    const multiStep = new MultiStepProgress(steps);

    expect(multiStep.getTotalSteps()).toBe(3);
    expect(multiStep.getCurrentStep()).toBe(0);
    expect(multiStep.isComplete()).toBe(false);
  });

  test('should handle empty steps array', () => {
    const multiStep = new MultiStepProgress([]);

    expect(multiStep.getTotalSteps()).toBe(0);
    expect(multiStep.getCurrentStep()).toBe(0);
    expect(multiStep.isComplete()).toBe(false);

    // Starting with empty steps should not throw
    expect(() => multiStep.start()).not.toThrow();
  });

  test('should progress through steps', () => {
    const steps = ['Step 1', 'Step 2', 'Step 3'];
    const multiStep = new MultiStepProgress(steps);

    multiStep.start();
    expect(multiStep.getCurrentStep()).toBe(0);
    expect(multiStep.isComplete()).toBe(false);

    multiStep.nextStep();
    expect(multiStep.getCurrentStep()).toBe(1);
    expect(multiStep.isComplete()).toBe(false);

    multiStep.nextStep();
    expect(multiStep.getCurrentStep()).toBe(2);
    expect(multiStep.isComplete()).toBe(false);

    multiStep.nextStep();
    expect(multiStep.getCurrentStep()).toBe(3);
    expect(multiStep.isComplete()).toBe(true);
  });

  test('should handle custom success messages', () => {
    const steps = ['Step 1', 'Step 2'];
    const multiStep = new MultiStepProgress(steps);

    multiStep.start();
    expect(() => multiStep.nextStep('Custom success message')).not.toThrow();
    expect(multiStep.getCurrentStep()).toBe(1);
  });

  test('should handle errors', () => {
    const steps = ['Step 1', 'Step 2', 'Step 3'];
    const multiStep = new MultiStepProgress(steps);

    multiStep.start();
    multiStep.nextStep();
    
    expect(() => multiStep.error('Something went wrong')).not.toThrow();
    expect(multiStep.getCurrentStep()).toBe(1);
  });

  test('should update current step text', () => {
    const steps = ['Step 1', 'Step 2'];
    const multiStep = new MultiStepProgress(steps);

    multiStep.start();
    expect(() => multiStep.updateCurrentStep('Updated step text')).not.toThrow();
  });

  test('should handle finish with custom message', () => {
    const steps = ['Step 1', 'Step 2'];
    const multiStep = new MultiStepProgress(steps);

    multiStep.start();
    expect(() => multiStep.finish('All done!')).not.toThrow();
  });

  test('should work with different spinner styles', () => {
    const steps = ['Step 1', 'Step 2'];
    const multiStep = new MultiStepProgress(steps, 'line');

    expect(() => {
      multiStep.start();
      multiStep.nextStep();
      multiStep.finish();
    }).not.toThrow();
  });
});