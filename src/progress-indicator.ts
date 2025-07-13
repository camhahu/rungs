/**
 * Progress Indicator - Provides animated spinners and progress displays for CLI operations
 * 
 * Features:
 * - Multiple spinner styles (dots, line, arrow, clock)
 * - Self-replacing text with ANSI escape sequences
 * - Success, error, and warning state transitions
 * - Configurable update intervals and colors
 * - Safe fallbacks for non-TTY environments
 */

import { AnsiUtils } from './ansi-utils.js';

export type SpinnerStyle = 'dots' | 'line' | 'arrow' | 'clock' | 'none';

export interface ProgressOptions {
  style?: SpinnerStyle;
  color?: string;
  interval?: number;
  prefix?: string;
  suffix?: string;
}

export class ProgressIndicator {
  private static readonly SPINNERS = {
    dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
    line: ['|', '/', '-', '\\'],
    arrow: ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'],
    clock: ['🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛'],
    none: ['']
  };

  private intervalId?: Timer;
  private currentFrame = 0;
  private isActive = false;
  private lastText = '';
  
  constructor(
    private text: string,
    private options: ProgressOptions = {}
  ) {
    this.options = {
      style: 'dots',
      color: 'cyan',
      interval: 80,
      prefix: '',
      suffix: '',
      ...options
    };
  }

  /**
   * Start the progress indicator animation
   */
  start(): void {
    if (this.isActive) {
      return;
    }

    this.isActive = true;
    this.currentFrame = 0;

    // If terminal doesn't support cursor manipulation, show static message
    if (!AnsiUtils.isTerminalSupported()) {
      const staticText = this.formatStaticText();
      console.log(staticText);
      return;
    }

    // Start animation loop
    this.intervalId = setInterval(() => {
      this.updateDisplay();
    }, this.options.interval);

    // Show initial frame
    this.updateDisplay();
  }

  /**
   * Stop the progress indicator
   */
  stop(): void {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * Update the progress text without stopping
   */
  updateText(text: string): void {
    this.text = text;
    if (this.isActive && AnsiUtils.isTerminalSupported()) {
      this.updateDisplay();
    }
  }

  /**
   * Complete with success state
   */
  success(message: string, icon: string = '✅'): void {
    this.stop();
    const finalText = this.formatFinalText(message, icon, 'green');
    this.replaceOrPrint(finalText);
  }

  /**
   * Complete with error state
   */
  error(message: string, icon: string = '❌'): void {
    this.stop();
    const finalText = this.formatFinalText(message, icon, 'red');
    this.replaceOrPrint(finalText);
  }

  /**
   * Complete with warning state
   */
  warn(message: string, icon: string = '⚠️'): void {
    this.stop();
    const finalText = this.formatFinalText(message, icon, 'yellow');
    this.replaceOrPrint(finalText);
  }

  /**
   * Complete with info state
   */
  info(message: string, icon: string = 'ℹ️'): void {
    this.stop();
    const finalText = this.formatFinalText(message, icon, 'blue');
    this.replaceOrPrint(finalText);
  }

  /**
   * Check if progress indicator is currently active
   */
  isRunning(): boolean {
    return this.isActive;
  }

  /**
   * Update the display with current frame
   */
  private updateDisplay(): void {
    const spinner = this.getCurrentSpinner();
    const frames = ProgressIndicator.SPINNERS[this.options.style || 'dots'];
    const frame = frames[this.currentFrame % frames.length];
    
    const displayText = this.formatDisplayText(frame);
    
    if (AnsiUtils.isTerminalSupported()) {
      AnsiUtils.replaceCurrentLine(displayText);
    }

    this.lastText = displayText;
    this.currentFrame++;
  }

  /**
   * Get current spinner configuration
   */
  private getCurrentSpinner(): string[] {
    return ProgressIndicator.SPINNERS[this.options.style || 'dots'];
  }

  /**
   * Format text for animated display
   */
  private formatDisplayText(frame: string): string {
    const { prefix = '', suffix = '', color = 'cyan' } = this.options;
    
    let displayText = '';
    
    if (prefix) {
      displayText += prefix + ' ';
    }
    
    if (frame && this.options.style !== 'none') {
      const coloredFrame = AnsiUtils.colorize(frame, color);
      displayText += coloredFrame + ' ';
    }
    
    displayText += this.text;
    
    if (suffix) {
      displayText += ' ' + suffix;
    }
    
    return displayText;
  }

  /**
   * Format text for static (non-animated) display
   */
  private formatStaticText(): string {
    const { prefix = '', suffix = '' } = this.options;
    
    let displayText = '';
    
    if (prefix) {
      displayText += prefix + ' ';
    }
    
    displayText += this.text;
    
    if (suffix) {
      displayText += ' ' + suffix;
    }
    
    return displayText;
  }

  /**
   * Format final completion text
   */
  private formatFinalText(message: string, icon: string, color: string): string {
    const { prefix = '', suffix = '' } = this.options;
    
    let displayText = '';
    
    if (prefix) {
      displayText += prefix + ' ';
    }
    
    const coloredIcon = AnsiUtils.colorize(icon, color);
    displayText += coloredIcon + ' ';
    displayText += AnsiUtils.formatText(message, ['bold']);
    
    if (suffix) {
      displayText += ' ' + suffix;
    }
    
    return displayText;
  }

  /**
   * Replace current line or print new line based on terminal capabilities
   */
  private replaceOrPrint(text: string): void {
    if (AnsiUtils.isTerminalSupported() && this.lastText) {
      AnsiUtils.replaceCurrentLine(text);
      console.log(); // Move to next line
    } else {
      console.log(text);
    }
  }
}

/**
 * Static helper functions for common progress indicator patterns
 */
export class ProgressHelpers {
  /**
   * Create a simple spinner with sensible defaults
   */
  static spinner(text: string, style: SpinnerStyle = 'dots', color: string = 'cyan'): ProgressIndicator {
    return new ProgressIndicator(text, { style, color });
  }

  /**
   * Show a brief loading indicator for a promise
   */
  static async withProgress<T>(
    promise: Promise<T>,
    text: string,
    options?: ProgressOptions
  ): Promise<T> {
    const indicator = new ProgressIndicator(text, options);
    
    try {
      indicator.start();
      const result = await promise;
      indicator.success(text);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Operation failed';
      indicator.error(errorMessage);
      throw error;
    }
  }

  /**
   * Show a loading indicator for a synchronous operation
   */
  static withProgressSync<T>(
    operation: () => T,
    text: string,
    options?: ProgressOptions
  ): T {
    const indicator = new ProgressIndicator(text, options);
    
    try {
      indicator.start();
      const result = operation();
      indicator.success(text);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Operation failed';
      indicator.error(errorMessage);
      throw error;
    }
  }

  /**
   * Create a multi-step progress indicator
   */
  static multiStep(steps: string[], style: SpinnerStyle = 'dots'): MultiStepProgress {
    return new MultiStepProgress(steps, style);
  }
}

/**
 * Multi-step progress indicator for operations with multiple phases
 */
export class MultiStepProgress {
  private currentStep = 0;
  private indicators: ProgressIndicator[] = [];
  private activeIndicator?: ProgressIndicator;

  constructor(
    private steps: string[],
    private style: SpinnerStyle = 'dots'
  ) {
    this.indicators = steps.map(step => 
      new ProgressIndicator(step, { style, color: 'cyan' })
    );
  }

  /**
   * Start the first step
   */
  start(): void {
    if (this.steps.length === 0) return;
    
    this.currentStep = 0;
    this.activeIndicator = this.indicators[0];
    this.activeIndicator.start();
  }

  /**
   * Move to the next step
   */
  nextStep(successMessage?: string): void {
    if (this.activeIndicator) {
      this.activeIndicator.success(successMessage || this.steps[this.currentStep]);
    }

    this.currentStep++;
    
    if (this.currentStep < this.steps.length) {
      this.activeIndicator = this.indicators[this.currentStep];
      this.activeIndicator.start();
    } else {
      this.activeIndicator = undefined;
    }
  }

  /**
   * Complete current step with error
   */
  error(errorMessage: string): void {
    if (this.activeIndicator) {
      this.activeIndicator.error(errorMessage);
      this.activeIndicator = undefined;
    }
  }

  /**
   * Update current step text
   */
  updateCurrentStep(text: string): void {
    if (this.activeIndicator) {
      this.activeIndicator.updateText(text);
    }
  }

  /**
   * Complete all remaining steps successfully
   */
  finish(finalMessage?: string): void {
    if (this.activeIndicator) {
      this.activeIndicator.success(finalMessage || this.steps[this.currentStep]);
    }
  }

  /**
   * Get current step index
   */
  getCurrentStep(): number {
    return this.currentStep;
  }

  /**
   * Get total number of steps
   */
  getTotalSteps(): number {
    return this.steps.length;
  }

  /**
   * Check if all steps are completed
   */
  isComplete(): boolean {
    return this.steps.length > 0 && this.currentStep >= this.steps.length;
  }
}