/**
 * Operation Tracker - High-level wrapper for managing CLI operations with automatic progress tracking
 * 
 * Features:
 * - Automatic operation lifecycle management
 * - Success/error state handling with customizable messages
 * - Seamless integration with both verbose and compact output modes
 * - Convenient methods for common operation types (git, github, stack)
 * - Promise-based API with proper error handling
 */

import { OutputManager, OperationType, LogLevel } from './output-manager.js';

export interface OperationOptions {
  successMessage?: (result: any) => string;
  errorMessage?: (error: Error) => string;
  hideResult?: boolean;
  showElapsed?: boolean;
}

export class OperationTracker {
  private operationCounter = 0;

  constructor(private output: OutputManager) {}

  /**
   * Execute an operation with automatic progress tracking
   */
  async executeOperation<T>(
    id: string,
    description: string,
    type: OperationType,
    operation: () => Promise<T>,
    options: OperationOptions = {}
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      // Start the operation
      if (typeof this.output.startOperation === 'function') {
        this.output.startOperation(id, description, type);
      } else {
        console.log(`Starting: ${description}`);
      }
      
      // Execute the operation
      const result = await operation();
      
      // Calculate elapsed time if requested
      let successMessage = options.successMessage ? options.successMessage(result) : description;
      if (options.showElapsed) {
        const elapsed = Date.now() - startTime;
        successMessage += ` (${elapsed}ms)`;
      }
      
      // Complete successfully
      if (typeof this.output.completeOperation === 'function') {
        this.output.completeOperation(id, successMessage, 'success');
      } else {
        console.log(`✅ ${successMessage}`);
      }
      
      return result;
    } catch (error) {
      // Handle error
      const errorMessage = options.errorMessage && error instanceof Error 
        ? options.errorMessage(error)
        : `${description} failed`;
      
      const errorDetail = error instanceof Error ? error.message : String(error);
      
      // Defensive check: ensure failOperation method exists
      if (typeof this.output.failOperation === 'function') {
        this.output.failOperation(id, errorMessage, errorDetail);
      } else {
        // Fallback to basic error logging if failOperation is not available
        console.error(`${errorMessage}: ${errorDetail}`);
      }
      
      throw error;
    }
  }

  /**
   * Execute an operation synchronously with progress tracking
   */
  executeOperationSync<T>(
    id: string,
    description: string,
    type: OperationType,
    operation: () => T,
    options: OperationOptions = {}
  ): T {
    const startTime = Date.now();
    
    try {
      // Start the operation
      if (typeof this.output.startOperation === 'function') {
        this.output.startOperation(id, description, type);
      } else {
        console.log(`Starting: ${description}`);
      }
      
      // Execute the operation
      const result = operation();
      
      // Calculate elapsed time if requested
      let successMessage = options.successMessage ? options.successMessage(result) : description;
      if (options.showElapsed) {
        const elapsed = Date.now() - startTime;
        successMessage += ` (${elapsed}ms)`;
      }
      
      // Complete successfully
      if (typeof this.output.completeOperation === 'function') {
        this.output.completeOperation(id, successMessage, 'success');
      } else {
        console.log(`✅ ${successMessage}`);
      }
      
      return result;
    } catch (error) {
      // Handle error
      const errorMessage = options.errorMessage && error instanceof Error 
        ? options.errorMessage(error)
        : `${description} failed`;
      
      const errorDetail = error instanceof Error ? error.message : String(error);
      
      // Defensive check: ensure failOperation method exists
      if (typeof this.output.failOperation === 'function') {
        this.output.failOperation(id, errorMessage, errorDetail);
      } else {
        // Fallback to basic error logging if failOperation is not available
        console.error(`${errorMessage}: ${errorDetail}`);
      }
      
      throw error;
    }
  }

  /**
   * Create a unique operation ID
   */
  private createOperationId(prefix: string): string {
    return `${prefix}-${++this.operationCounter}-${Date.now()}`;
  }

  /**
   * Convenience method for Git operations
   */
  async gitOperation<T>(
    description: string,
    operation: () => Promise<T>,
    options: OperationOptions = {}
  ): Promise<T> {
    const id = this.createOperationId('git');
    return this.executeOperation(id, description, 'git', operation, options);
  }

  /**
   * Convenience method for GitHub operations
   */
  async githubOperation<T>(
    description: string,
    operation: () => Promise<T>,
    options: OperationOptions = {}
  ): Promise<T> {
    const id = this.createOperationId('github');
    return this.executeOperation(id, description, 'github', operation, options);
  }

  /**
   * Convenience method for stack operations
   */
  async stackOperation<T>(
    description: string,
    operation: () => Promise<T>,
    options: OperationOptions = {}
  ): Promise<T> {
    const id = this.createOperationId('stack');
    return this.executeOperation(id, description, 'stack', operation, options);
  }

  /**
   * Convenience method for config operations
   */
  async configOperation<T>(
    description: string,
    operation: () => Promise<T>,
    options: OperationOptions = {}
  ): Promise<T> {
    const id = this.createOperationId('config');
    return this.executeOperation(id, description, 'config', operation, options);
  }

  /**
   * Convenience method for general operations
   */
  async generalOperation<T>(
    description: string,
    operation: () => Promise<T>,
    options: OperationOptions = {}
  ): Promise<T> {
    const id = this.createOperationId('general');
    return this.executeOperation(id, description, 'general', operation, options);
  }

  /**
   * Synchronous convenience method for Git operations
   */
  gitOperationSync<T>(
    description: string,
    operation: () => T,
    options: OperationOptions = {}
  ): T {
    const id = this.createOperationId('git');
    return this.executeOperationSync(id, description, 'git', operation, options);
  }

  /**
   * Synchronous convenience method for GitHub operations
   */
  githubOperationSync<T>(
    description: string,
    operation: () => T,
    options: OperationOptions = {}
  ): T {
    const id = this.createOperationId('github');
    return this.executeOperationSync(id, description, 'github', operation, options);
  }

  /**
   * Synchronous convenience method for stack operations
   */
  stackOperationSync<T>(
    description: string,
    operation: () => T,
    options: OperationOptions = {}
  ): T {
    const id = this.createOperationId('stack');
    return this.executeOperationSync(id, description, 'stack', operation, options);
  }

  /**
   * Update an active operation's description
   */
  updateOperation(id: string, newDescription: string): void {
    if (typeof this.output.updateOperation === 'function') {
      this.output.updateOperation(id, newDescription);
    } else {
      console.log(`Update: ${newDescription}`);
    }
  }

  /**
   * Manually start an operation (for more granular control)
   */
  startOperation(description: string, type: OperationType = 'general'): string {
    const id = this.createOperationId(type);
    if (typeof this.output.startOperation === 'function') {
      this.output.startOperation(id, description, type);
    } else {
      console.log(`Starting: ${description}`);
    }
    return id;
  }

  /**
   * Manually complete an operation
   */
  completeOperation(id: string, message?: string, level: LogLevel = 'success'): void {
    if (typeof this.output.completeOperation === 'function') {
      this.output.completeOperation(id, message || 'Completed', level);
    } else {
      const icon = level === 'success' ? '✅' : level === 'error' ? '❌' : '⚠️';
      console.log(`${icon} ${message || 'Completed'}`);
    }
  }

  /**
   * Manually fail an operation
   */
  failOperation(id: string, message: string, error?: string): void {
    // Defensive check: ensure failOperation method exists
    if (typeof this.output.failOperation === 'function') {
      this.output.failOperation(id, message, error);
    } else {
      // Fallback to basic error logging if failOperation is not available
      const errorMessage = error ? `${message}: ${error}` : message;
      console.error(errorMessage);
    }
  }

  /**
   * Execute multiple operations in sequence with combined progress tracking
   */
  async executeSequence<T>(
    operations: Array<{
      description: string;
      type: OperationType;
      operation: () => Promise<any>;
      options?: OperationOptions;
    }>
  ): Promise<T[]> {
    const results: T[] = [];
    
    for (const op of operations) {
      const result = await this.executeOperation(
        this.createOperationId(op.type),
        op.description,
        op.type,
        op.operation,
        op.options || {}
      );
      results.push(result);
    }
    
    return results;
  }

  /**
   * Execute multiple operations in parallel with individual progress tracking
   */
  async executeParallel<T>(
    operations: Array<{
      description: string;
      type: OperationType;
      operation: () => Promise<any>;
      options?: OperationOptions;
    }>
  ): Promise<T[]> {
    const promises = operations.map(op =>
      this.executeOperation(
        this.createOperationId(op.type),
        op.description,
        op.type,
        op.operation,
        op.options || {}
      )
    );
    
    return Promise.all(promises);
  }

  /**
   * Get the underlying output manager for direct access if needed
   */
  getOutputManager(): OutputManager {
    return this.output;
  }
}