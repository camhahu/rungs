/**
 * OutputManager - Provides structured, readable output for rungs CLI operations
 * 
 * Features:
 * - Visual separation between operations
 * - Hierarchical display with indentation
 * - Progress indicators and status icons
 * - Consistent formatting across all commands
 * - Support for grouped operations
 * - Compact mode with self-replacing output
 * - ANSI-based animations and progress tracking
 */

import { AnsiUtils } from './ansi-utils.js';
import { ProgressIndicator, SpinnerStyle } from './progress-indicator.js';

export type LogLevel = "info" | "success" | "warning" | "error" | "progress";
export type OperationType = "git" | "github" | "stack" | "config" | "general";
export type OutputMode = "verbose" | "compact";

interface OutputConfig {
  showTimestamps: boolean;
  useColors: boolean;
  verboseMode: boolean;
}

export interface CompactOutputConfig extends OutputConfig {
  outputMode: OutputMode;
  spinnerStyle: SpinnerStyle;
  maxLineLength: number;
  showElapsedTime: boolean;
}

export interface CompactLogOptions {
  operationId?: string;
  replaceLastLine?: boolean;
  truncate?: boolean;
}

/**
 * Theme configuration for compact output mode
 */
export const COMPACT_THEME = {
  states: {
    loading: { color: 'cyan', icon: '⠋', bold: false },
    success: { color: 'green', icon: '✅', bold: true },
    error: { color: 'red', icon: '❌', bold: true },
    warning: { color: 'yellow', icon: '⚠️', bold: true },
    info: { color: 'blue', icon: 'ℹ️', bold: false }
  },
  operations: {
    git: { color: 'blue', icon: '🔄' },
    github: { color: 'magenta', icon: '📤' },
    stack: { color: 'cyan', icon: '📚' },
    config: { color: 'yellow', icon: '⚙️' },
    general: { color: 'white', icon: '💻' }
  },
  emphasis: {
    primary: ['bold'],
    secondary: ['italic'],
    highlight: ['bold', 'brightWhite'],
    muted: ['dim', 'gray']
  }
};

export class OutputManager {
  private indentLevel: number = 0;
  private currentSection: string | null = null;
  private config: CompactOutputConfig;
  private activeOperations: Map<string, ProgressIndicator> = new Map();
  private operationStack: string[] = [];
  private lastOutputWasCompact = false;
  
  // Icons for different operation types and statuses
  private static readonly ICONS = {
    git: "🔄",
    github: "📤", 
    stack: "📚",
    config: "⚙️",
    general: "💻",
    success: "✅",
    error: "❌",
    warning: "⚠️",
    info: "ℹ️",
    progress: "🔄"
  };

  // Colors for terminal output (if enabled)
  private static readonly COLORS = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    gray: "\x1b[90m"
  };

  constructor(config: Partial<CompactOutputConfig> = {}) {
    this.config = {
      showTimestamps: false,
      useColors: true,
      verboseMode: false,
      outputMode: 'compact',
      spinnerStyle: 'dots',
      maxLineLength: 80,
      showElapsedTime: false,
      ...config
    };
  }

  /**
   * Start a new major operation section
   */
  startSection(title: string, type: OperationType = "general"): void {
    if (this.currentSection) {
      this.endSection();
    }
    
    const icon = OutputManager.ICONS[type];
    const separator = "═".repeat(Math.max(20, title.length + 10));
    
    console.log();
    console.log(this.colorize(`${separator}`, "cyan"));
    console.log(this.colorize(`${icon} ${title.toUpperCase()}`, "bright"));
    console.log(this.colorize(`${separator}`, "cyan"));
    console.log();
    
    this.currentSection = title;
    this.indentLevel = 0;
  }

  /**
   * End the current section
   */
  endSection(): void {
    if (!this.currentSection) return;
    
    console.log();
    console.log(this.colorize("═".repeat(30), "cyan"));
    console.log();
    
    this.currentSection = null;
    this.indentLevel = 0;
  }

  /**
   * Log a message with appropriate formatting
   */
  log(message: string, level: LogLevel = "info", indent: number = 0, options?: CompactLogOptions): void {
    // In compact mode, ensure we don't interfere with active operations
    if (this.config.outputMode === "compact" && this.lastOutputWasCompact) {
      // Move to a new line if the last output was compact
      console.log();
      this.lastOutputWasCompact = false;
    }

    const icon = OutputManager.ICONS[level];
    const prefix = this.getPrefix(icon, level);
    const indentation = "  ".repeat(this.indentLevel + indent);
    
    let formattedMessage = `${indentation}${prefix} ${message}`;
    
    // Handle truncation in compact mode
    if (this.config.outputMode === "compact" && options?.truncate && this.config.maxLineLength > 0) {
      const maxLength = this.config.maxLineLength - indentation.length - prefix.length - 1;
      if (message.length > maxLength) {
        formattedMessage = `${indentation}${prefix} ${AnsiUtils.truncate(message, maxLength)}`;
      }
    }
    
    console.log(this.colorize(formattedMessage, this.getLevelColor(level)));
  }

  /**
   * Log a progress operation (with spinning icon)
   */
  progress(message: string, indent: number = 0): void {
    this.log(message, "progress", indent);
  }

  /**
   * Log a successful operation
   */
  success(message: string, indent: number = 0): void {
    this.log(message, "success", indent);
  }

  /**
   * Log an error
   */
  error(message: string, indent: number = 0): void {
    this.log(message, "error", indent);
  }

  /**
   * Log a warning
   */
  warning(message: string, indent: number = 0): void {
    this.log(message, "warning", indent);
  }

  /**
   * Log an informational message
   */
  info(message: string, indent: number = 0): void {
    this.log(message, "info", indent);
  }

  /**
   * Start a sub-operation group (increases indentation)
   */
  startGroup(title: string, type: OperationType = "general"): void {
    const icon = OutputManager.ICONS[type];
    const indentation = "  ".repeat(this.indentLevel);
    
    console.log();
    console.log(this.colorize(`${indentation}${icon} ${title}:`, "bright"));
    this.indentLevel++;
  }

  /**
   * End a sub-operation group (decreases indentation)
   */
  endGroup(): void {
    if (this.indentLevel > 0) {
      this.indentLevel--;
    }
    console.log();
  }

  /**
   * Log a list of items with consistent formatting
   */
  logList(items: string[], title?: string, level: LogLevel = "info"): void {
    if (title) {
      this.log(title, level);
    }
    
    items.forEach(item => {
      const indentation = "  ".repeat(this.indentLevel + 1);
      console.log(this.colorize(`${indentation}- ${item}`, this.getLevelColor(level)));
    });
  }

  /**
   * Log command execution (for verbose mode)
   */
  logCommand(command: string): void {
    if (this.config.verboseMode) {
      const indentation = "  ".repeat(this.indentLevel);
      console.log(this.colorize(`${indentation}$ ${command}`, "gray"));
    }
  }

  /**
   * Log a summary of results
   */
  summary(title: string, items: { label: string; value: string | number }[]): void {
    console.log();
    console.log(this.colorize(`📋 ${title}:`, "bright"));
    
    const maxLabelLength = Math.max(...items.map(item => item.label.length));
    
    items.forEach(item => {
      const paddedLabel = item.label.padEnd(maxLabelLength);
      const indentation = "  ".repeat(this.indentLevel + 1);
      console.log(this.colorize(`${indentation}${paddedLabel}: ${item.value}`, "info"));
    });
    
    console.log();
  }

  /**
   * Create a visual separator for related operations
   */
  separator(char: string = "─", length: number = 40): void {
    const indentation = "  ".repeat(this.indentLevel);
    console.log(this.colorize(`${indentation}${char.repeat(length)}`, "gray"));
  }

  /**
   * Enable or disable verbose mode
   */
  setVerbose(verbose: boolean): void {
    this.config.verboseMode = verbose;
  }

  /**
   * Set output mode (verbose or compact)
   */
  setOutputMode(mode: OutputMode): void {
    this.config.outputMode = mode;
  }

  /**
   * Get current output mode
   */
  getOutputMode(): OutputMode {
    return this.config.outputMode;
  }

  /**
   * Start a new operation in compact mode
   */
  startOperation(id: string, message: string, type: OperationType = "general"): void {
    if (this.config.outputMode === "verbose") {
      // Fallback to verbose mode behavior
      this.startGroup(message, type);
      return;
    }

    // Clean up previous operation if exists
    this.completeOperation(id, '', 'success');

    const icon = OutputManager.ICONS[type];
    const displayMessage = `${icon} ${message}`;
    
    const progressIndicator = new ProgressIndicator(displayMessage, {
      style: this.config.spinnerStyle,
      color: this.getTypeColor(type)
    });

    this.activeOperations.set(id, progressIndicator);
    this.operationStack.push(id);
    
    progressIndicator.start();
    this.lastOutputWasCompact = true;
  }

  /**
   * Update an existing operation's message
   */
  updateOperation(id: string, message: string): void {
    if (this.config.outputMode === "verbose") {
      this.progress(message);
      return;
    }

    const operation = this.activeOperations.get(id);
    if (operation && operation.isRunning()) {
      operation.updateText(message);
    }
  }

  /**
   * Complete an operation successfully
   */
  completeOperation(id: string, message: string, level: LogLevel = 'success'): void {
    if (this.config.outputMode === "verbose") {
      if (message) {
        this.log(message, level);
      }
      this.endGroup();
      return;
    }

    const operation = this.activeOperations.get(id);
    if (operation && operation.isRunning()) {
      const finalMessage = message || 'Completed';
      
      switch (level) {
        case 'success':
          operation.success(finalMessage);
          break;
        case 'error':
          operation.error(finalMessage);
          break;
        case 'warning':
          operation.warn(finalMessage);
          break;
        case 'info':
          operation.info(finalMessage);
          break;
        default:
          operation.success(finalMessage);
      }
      
      this.activeOperations.delete(id);
      this.operationStack = this.operationStack.filter(opId => opId !== id);
    }
  }

  /**
   * Fail an operation with error
   */
  failOperation(id: string, message: string, error?: string): void {
    if (this.config.outputMode === "verbose") {
      this.error(message);
      if (error) {
        this.error(error, 1);
      }
      this.endGroup();
      return;
    }

    const operation = this.activeOperations.get(id);
    if (operation && operation.isRunning()) {
      const errorMessage = error ? `${message}: ${error}` : message;
      operation.error(errorMessage);
      
      this.activeOperations.delete(id);
      this.operationStack = this.operationStack.filter(opId => opId !== id);
    }
  }

  /**
   * Get color-coded prefix for log level
   */
  private getPrefix(icon: string, level: LogLevel): string {
    if (this.config.showTimestamps) {
      const timestamp = new Date().toLocaleTimeString();
      return `[${timestamp}] ${icon}`;
    }
    return icon;
  }

  /**
   * Get color for log level
   */
  private getLevelColor(level: LogLevel): string {
    switch (level) {
      case "success": return "green";
      case "error": return "red";
      case "warning": return "yellow";
      case "progress": return "cyan";
      case "info":
      default: return "reset";
    }
  }

  /**
   * Get color for operation type
   */
  private getTypeColor(type: OperationType): string {
    switch (type) {
      case "git": return "blue";
      case "github": return "magenta";
      case "stack": return "cyan";
      case "config": return "yellow";
      case "general":
      default: return "white";
    }
  }

  /**
   * Apply color formatting if enabled
   */
  private colorize(text: string, color: string): string {
    if (!this.config.useColors) {
      return text;
    }
    
    const colorCode = OutputManager.COLORS[color as keyof typeof OutputManager.COLORS];
    if (!colorCode) {
      return text;
    }
    
    return `${colorCode}${text}${OutputManager.COLORS.reset}`;
  }
}

// Global output manager instance
export const output = new OutputManager();

// Convenience functions for common operations
export function startSection(title: string, type: OperationType = "general"): void {
  output.startSection(title, type);
}

export function endSection(): void {
  output.endSection();
}

export function logProgress(message: string, indent: number = 0): void {
  output.progress(message, indent);
}

export function logSuccess(message: string, indent: number = 0): void {
  output.success(message, indent);
}

export function logError(message: string, indent: number = 0): void {
  output.error(message, indent);
}

export function logWarning(message: string, indent: number = 0): void {
  output.warning(message, indent);
}

export function logInfo(message: string, indent: number = 0): void {
  output.info(message, indent);
}

export function startGroup(title: string, type: OperationType = "general"): void {
  output.startGroup(title, type);
}

export function endGroup(): void {
  output.endGroup();
}

export function logList(items: string[], title?: string): void {
  output.logList(items, title);
}

export function logSummary(title: string, items: { label: string; value: string | number }[]): void {
  output.summary(title, items);
}

export function setVerbose(verbose: boolean): void {
  output.setVerbose(verbose);
}

// New convenience functions for compact mode
export function setOutputMode(mode: OutputMode): void {
  output.setOutputMode(mode);
}

export function startOperation(id: string, message: string, type: OperationType = "general"): void {
  output.startOperation(id, message, type);
}

export function updateOperation(id: string, message: string): void {
  output.updateOperation(id, message);
}

export function completeOperation(id: string, message: string, level: LogLevel = 'success'): void {
  output.completeOperation(id, message, level);
}

export function failOperation(id: string, message: string, error?: string): void {
  output.failOperation(id, message, error);
}
