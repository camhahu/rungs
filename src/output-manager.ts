/**
 * OutputManager - Provides structured, readable output for rungs CLI operations
 * 
 * Features:
 * - Visual separation between operations
 * - Hierarchical display with indentation
 * - Progress indicators and status icons
 * - Consistent formatting across all commands
 * - Support for grouped operations
 */

export type LogLevel = "info" | "success" | "warning" | "error" | "progress";
export type OperationType = "git" | "github" | "stack" | "config" | "general";

interface OutputConfig {
  showTimestamps: boolean;
  useColors: boolean;
  verboseMode: boolean;
}

export class OutputManager {
  private indentLevel: number = 0;
  private currentSection: string | null = null;
  private config: OutputConfig;
  
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

  constructor(config: Partial<OutputConfig> = {}) {
    this.config = {
      showTimestamps: false,
      useColors: true,
      verboseMode: false,
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
  log(message: string, level: LogLevel = "info", indent: number = 0): void {
    const icon = OutputManager.ICONS[level];
    const prefix = this.getPrefix(icon, level);
    const indentation = "  ".repeat(this.indentLevel + indent);
    
    const formattedMessage = `${indentation}${prefix} ${message}`;
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
