/**
 * ANSI Utilities - Provides low-level ANSI escape sequence utilities for terminal manipulation
 * 
 * Features:
 * - Cursor movement and positioning
 * - Line clearing and manipulation
 * - Text formatting (bold, italic, colors)
 * - Terminal capability detection
 * - Safe fallbacks for non-TTY environments
 */

export interface TerminalCapabilities {
  supportsCursor: boolean;
  supportsColors: boolean;
  supportsUnicode: boolean;
  isInteractive: boolean;
}

export class AnsiUtils {
  static readonly ESCAPE_CODES = {
    // Cursor movement
    cursorUp: (lines: number): string => `\x1b[${lines}A`,
    cursorDown: (lines: number): string => `\x1b[${lines}B`,
    cursorForward: (cols: number): string => `\x1b[${cols}C`,
    cursorBack: (cols: number): string => `\x1b[${cols}D`,
    cursorToColumn: (col: number): string => `\x1b[${col}G`,
    cursorHome: '\x1b[H',
    
    // Line operations
    clearLine: '\x1b[2K',
    clearLineAfter: '\x1b[0K',
    clearLineBefore: '\x1b[1K',
    clearScreen: '\x1b[2J',
    clearScreenAfter: '\x1b[0J',
    clearScreenBefore: '\x1b[1J',
    
    // Cursor save/restore
    saveCursor: '\x1b[s',
    restoreCursor: '\x1b[u',
    
    // Formatting
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    italic: '\x1b[3m',
    underline: '\x1b[4m',
    blink: '\x1b[5m',
    reverse: '\x1b[7m',
    strikethrough: '\x1b[9m',
    reset: '\x1b[0m',
    
    // Colors - standard 16 colors
    colors: {
      black: '\x1b[30m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m',
      white: '\x1b[37m',
      gray: '\x1b[90m',
      brightRed: '\x1b[91m',
      brightGreen: '\x1b[92m',
      brightYellow: '\x1b[93m',
      brightBlue: '\x1b[94m',
      brightMagenta: '\x1b[95m',
      brightCyan: '\x1b[96m',
      brightWhite: '\x1b[97m'
    },
    
    // Background colors
    bgColors: {
      black: '\x1b[40m',
      red: '\x1b[41m',
      green: '\x1b[42m',
      yellow: '\x1b[43m',
      blue: '\x1b[44m',
      magenta: '\x1b[45m',
      cyan: '\x1b[46m',
      white: '\x1b[47m',
      gray: '\x1b[100m',
      brightRed: '\x1b[101m',
      brightGreen: '\x1b[102m',
      brightYellow: '\x1b[103m',
      brightBlue: '\x1b[104m',
      brightMagenta: '\x1b[105m',
      brightCyan: '\x1b[106m',
      brightWhite: '\x1b[107m'
    }
  };

  private static capabilities: TerminalCapabilities | null = null;

  /**
   * Detect terminal capabilities
   */
  static getTerminalCapabilities(): TerminalCapabilities {
    if (this.capabilities) {
      return this.capabilities;
    }

    const isInteractive = Boolean(process.stdout.isTTY);
    const supportsColors = isInteractive && !process.env.NO_COLOR && (
      process.env.COLORTERM === 'truecolor' ||
      process.env.TERM === 'xterm-256color' ||
      process.env.TERM === 'screen-256color' ||
      Boolean(process.env.FORCE_COLOR)
    );

    this.capabilities = {
      supportsCursor: isInteractive,
      supportsColors,
      supportsUnicode: true, // Most modern terminals support Unicode
      isInteractive
    };

    return this.capabilities;
  }

  /**
   * Check if terminal supports ANSI escape sequences
   */
  static isTerminalSupported(): boolean {
    return this.getTerminalCapabilities().isInteractive;
  }

  /**
   * Check if terminal supports colors
   */
  static supportsColors(): boolean {
    return this.getTerminalCapabilities().supportsColors;
  }

  /**
   * Clear the current line completely
   */
  static clearCurrentLine(): void {
    if (this.isTerminalSupported()) {
      process.stdout.write(this.ESCAPE_CODES.clearLine);
    }
  }

  /**
   * Move cursor to the beginning of the current line
   */
  static moveCursorToStart(): void {
    if (this.isTerminalSupported()) {
      process.stdout.write(this.ESCAPE_CODES.cursorToColumn(1));
    }
  }

  /**
   * Replace the current line with new text
   */
  static replaceCurrentLine(text: string): void {
    if (this.isTerminalSupported()) {
      this.clearCurrentLine();
      this.moveCursorToStart();
      process.stdout.write(text);
    } else {
      // Fallback: just print the text on a new line
      console.log(text);
    }
  }

  /**
   * Move cursor up by specified number of lines
   */
  static moveCursorUp(lines: number): void {
    if (this.isTerminalSupported() && lines > 0) {
      process.stdout.write(this.ESCAPE_CODES.cursorUp(lines));
    }
  }

  /**
   * Move cursor down by specified number of lines
   */
  static moveCursorDown(lines: number): void {
    if (this.isTerminalSupported() && lines > 0) {
      process.stdout.write(this.ESCAPE_CODES.cursorDown(lines));
    }
  }

  /**
   * Save current cursor position
   */
  static saveCursor(): void {
    if (this.isTerminalSupported()) {
      process.stdout.write(this.ESCAPE_CODES.saveCursor);
    }
  }

  /**
   * Restore previously saved cursor position
   */
  static restoreCursor(): void {
    if (this.isTerminalSupported()) {
      process.stdout.write(this.ESCAPE_CODES.restoreCursor);
    }
  }

  /**
   * Format text with ANSI styles
   */
  static formatText(text: string, styles: string[]): string {
    if (!this.supportsColors() || styles.length === 0) {
      return text;
    }

    const codes: string[] = [];
    
    for (const style of styles) {
      // Check formatting codes
      if (style in this.ESCAPE_CODES && typeof this.ESCAPE_CODES[style as keyof typeof this.ESCAPE_CODES] === 'string') {
        codes.push(this.ESCAPE_CODES[style as keyof typeof this.ESCAPE_CODES] as string);
      }
      // Check color codes
      else if (style in this.ESCAPE_CODES.colors) {
        codes.push(this.ESCAPE_CODES.colors[style as keyof typeof this.ESCAPE_CODES.colors]);
      }
      // Check background color codes
      else if (style in this.ESCAPE_CODES.bgColors) {
        codes.push(this.ESCAPE_CODES.bgColors[style as keyof typeof this.ESCAPE_CODES.bgColors]);
      }
    }

    if (codes.length === 0) {
      return text;
    }

    return `${codes.join('')}${text}${this.ESCAPE_CODES.reset}`;
  }

  /**
   * Apply a single color to text
   */
  static colorize(text: string, color: string): string {
    return this.formatText(text, [color]);
  }

  /**
   * Make text bold
   */
  static bold(text: string): string {
    return this.formatText(text, ['bold']);
  }

  /**
   * Make text italic
   */
  static italic(text: string): string {
    return this.formatText(text, ['italic']);
  }

  /**
   * Make text dimmed
   */
  static dim(text: string): string {
    return this.formatText(text, ['dim']);
  }

  /**
   * Underline text
   */
  static underline(text: string): string {
    return this.formatText(text, ['underline']);
  }

  /**
   * Truncate text to fit within specified width, adding ellipsis if needed
   */
  static truncate(text: string, maxWidth: number, ellipsis: string = '...'): string {
    if (text.length <= maxWidth) {
      return text;
    }
    
    if (maxWidth <= ellipsis.length) {
      return ellipsis.slice(0, maxWidth);
    }
    
    return text.slice(0, maxWidth - ellipsis.length) + ellipsis;
  }

  /**
   * Pad text to specified width
   */
  static pad(text: string, width: number, char: string = ' ', align: 'left' | 'right' | 'center' = 'left'): string {
    if (text.length >= width) {
      return text;
    }
    
    const padding = width - text.length;
    
    switch (align) {
      case 'right':
        return char.repeat(padding) + text;
      case 'center':
        const leftPad = Math.floor(padding / 2);
        const rightPad = padding - leftPad;
        return char.repeat(leftPad) + text + char.repeat(rightPad);
      case 'left':
      default:
        return text + char.repeat(padding);
    }
  }

  /**
   * Get terminal width (columns)
   */
  static getTerminalWidth(): number {
    return process.stdout.columns || 80;
  }

  /**
   * Get terminal height (rows)
   */
  static getTerminalHeight(): number {
    return process.stdout.rows || 24;
  }

  /**
   * Force refresh terminal capabilities detection
   */
  static refreshCapabilities(): void {
    this.capabilities = null;
  }
}