# CLI Output Improvements Implementation Plan

## Summary

This document outlines the implementation plan for improving the CLI output system to address the verbose output issue. The current system uses multi-line sectioned output with detailed logging. The goal is to create a compact, single-line output mode with self-replacing progress indicators, consistent color coding, and better text formatting.

**Key Requirements:**
- Each discrete step should take up only 1 line of output with self-replacing behavior
- Consistent color coding for loading/completed/error states  
- Better use of bold/italic text formatting for emphasis
- Maintain backward compatibility with verbose mode

## Current System Analysis

### Current Output Manager (`src/output-manager.ts`)
- **Sectioned Output**: Uses `startSection()`/`endSection()` with heavy visual separators
- **Hierarchical Display**: Uses indentation levels and `startGroup()`/`endGroup()`
- **Static Logging**: Each operation logs a new line, no line replacement
- **Rich Formatting**: Icons, colors, timestamps, but verbose presentation
- **Usage Pattern**: Heavily used in `stack-manager.ts` with 15+ calls per operation

### Current Output Example
```
══════════════════════
📚 STACK STATUS
══════════════════════

📤 Discovering Stack from GitHub:
  🔄 Fetching open PRs...
    ℹ️ Found 0 stack PRs out of 0 total open PRs

🔄 Finding New Commits:
  📤 Discovering Stack from GitHub:
    🔄 Fetching open PRs...
      ℹ️ Found 0 stack PRs out of 0 total open PRs
  🔄 Determining base reference...
    ℹ️ Excluding commits from: origin/main
  🔄 Scanning for new commits...
    ℹ️ Falling back to origin/main
  ✅ Found 0 new commits
```

### Target Compact Output Example
```
📚 Discovering stack from GitHub... ✅ Found 0 stack PRs
🔄 Finding new commits... ✅ Found 0 new commits  
📋 Stack Status: 0 active PRs, 0 new commits ready
```

## Technical Implementation Plan

### Phase 1: ANSI Escape Sequence Infrastructure

#### 1.1 Create ANSI Helper Module (`src/ansi-utils.ts`)
```typescript
export class AnsiUtils {
  static readonly ESCAPE_CODES = {
    // Cursor movement
    cursorUp: (lines: number) => `\x1b[${lines}A`,
    cursorDown: (lines: number) => `\x1b[${lines}B`,
    cursorForward: (cols: number) => `\x1b[${cols}C`,
    cursorBack: (cols: number) => `\x1b[${cols}D`,
    
    // Line operations
    clearLine: '\x1b[2K',
    clearLineAfter: '\x1b[0K',
    clearLineBefore: '\x1b[1K',
    saveCursor: '\x1b[s',
    restoreCursor: '\x1b[u',
    
    // Formatting
    bold: '\x1b[1m',
    italic: '\x1b[3m',
    dim: '\x1b[2m',
    underline: '\x1b[4m',
    reset: '\x1b[0m',
    
    // Colors (enhanced set)
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
    }
  };

  static clearCurrentLine(): void;
  static moveCursorToStart(): void;
  static replaceCurrentLine(text: string): void;
  static isTerminalSupported(): boolean;
  static formatText(text: string, styles: string[]): string;
}
```

#### 1.2 Create Spinner/Progress Component (`src/progress-indicator.ts`)
```typescript
export type SpinnerStyle = 'dots' | 'line' | 'arrow' | 'clock';

export class ProgressIndicator {
  private static readonly SPINNERS = {
    dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
    line: ['|', '/', '-', '\\'],
    arrow: ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'],
    clock: ['🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛']
  };

  private intervalId?: Timer;
  private currentFrame = 0;
  
  constructor(
    private text: string,
    private style: SpinnerStyle = 'dots',
    private color: string = 'cyan'
  ) {}

  start(): void;
  stop(): void;
  updateText(text: string): void;
  success(message: string, icon: string = '✅'): void;
  error(message: string, icon: string = '❌'): void;
  warn(message: string, icon: string = '⚠️'): void;
}
```

### Phase 2: Compact Output Manager

#### 2.1 Extend Output Manager with Compact Mode (`src/output-manager.ts`)
```typescript
export type OutputMode = 'verbose' | 'compact';

export interface CompactOutputConfig extends OutputConfig {
  outputMode: OutputMode;
  spinnerStyle: SpinnerStyle;
  maxLineLength: number;
  showElapsedTime: boolean;
}

export class OutputManager {
  private activeProgressIndicators: Map<string, ProgressIndicator> = new Map();
  private currentLine = 0;
  private operationStack: string[] = [];

  // New compact mode methods
  startOperation(id: string, message: string, type: OperationType): void;
  updateOperation(id: string, message: string): void;
  completeOperation(id: string, message: string, level: LogLevel): void;
  failOperation(id: string, message: string, error?: string): void;
  
  // Enhanced existing methods to support both modes
  log(message: string, level: LogLevel, options?: CompactLogOptions): void;
  
  // Backward compatibility - delegate to appropriate mode
  progress(message: string, indent?: number): void;
  success(message: string, indent?: number): void;
  error(message: string, indent?: number): void;
}
```

#### 2.2 Color and State Scheme
```typescript
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
```

### Phase 3: Operation Refactoring

#### 3.1 Create Operation Wrapper (`src/operation-tracker.ts`)
```typescript
export class OperationTracker {
  constructor(private output: OutputManager) {}

  async executeOperation<T>(
    id: string,
    description: string,
    type: OperationType,
    operation: () => Promise<T>,
    options?: {
      successMessage?: (result: T) => string;
      errorMessage?: (error: Error) => string;
      hideResult?: boolean;
    }
  ): Promise<T>;

  // Convenience methods for common patterns
  async gitOperation<T>(description: string, operation: () => Promise<T>): Promise<T>;
  async githubOperation<T>(description: string, operation: () => Promise<T>): Promise<T>;
  async stackOperation<T>(description: string, operation: () => Promise<T>): Promise<T>;
}
```

#### 3.2 Refactor Stack Manager Usage
Current pattern:
```typescript
startGroup("Discovering Stack from GitHub", "github");
logProgress("Fetching open PRs...");
// ... operation
logSuccess(`Stack discovered: ${fixedPRs.length} PRs in order`);
endGroup();
```

New compact pattern:
```typescript
const result = await this.operationTracker.githubOperation(
  "Discovering stack from GitHub",
  async () => {
    // ... operation logic
    return { prs: fixedPRs, count: fixedPRs.length };
  }
);
```

### Phase 4: Configuration Integration

#### 4.1 Update Config Manager (`src/config-manager.ts`)
```typescript
export interface RungsConfig {
  // ... existing config
  output: {
    mode: OutputMode;
    verboseOnError: boolean;
    spinnerStyle: SpinnerStyle;
    colorScheme: 'auto' | 'light' | 'dark' | 'none';
    maxLineLength: number;
    showTimestamps: boolean;
    showElapsedTime: boolean;
  };
}
```

#### 4.2 CLI Integration (`src/cli.ts`)
```typescript
// Add CLI flags
const options = {
  quiet: { type: "boolean", short: "q" },
  verbose: { type: "boolean", short: "v" },
  "output-mode": { type: "string" }, // 'compact' | 'verbose'
  "no-color": { type: "boolean" },
  "no-spinner": { type: "boolean" }
};

// Configure output mode
const outputConfig = {
  outputMode: options.quiet ? 'compact' : 
             options.verbose ? 'verbose' : 
             config.output?.mode || 'compact',
  useColors: !options["no-color"],
  spinnerStyle: options["no-spinner"] ? 'none' : config.output?.spinnerStyle || 'dots'
};
```

## Backward Compatibility Strategy

### 4.3 Compatibility Layer
```typescript
// Keep all existing method signatures working
export function startSection(title: string, type: OperationType = "general"): void {
  if (output.getMode() === 'verbose') {
    output.startSection(title, type);
  } else {
    // Convert to compact operation start
    output.startOperation(`section-${Date.now()}`, title, type);
  }
}

export function logProgress(message: string, indent: number = 0): void {
  if (output.getMode() === 'verbose') {
    output.progress(message, indent);
  } else {
    // Update current operation or create ephemeral one
    output.updateCurrentOperation(message);
  }
}
```

### 4.4 Migration Path
1. **Phase 4a**: Add compact mode alongside verbose (default to verbose)
2. **Phase 4b**: Update `stack-manager.ts` to use new operation tracker
3. **Phase 4c**: Switch default to compact mode
4. **Phase 4d**: Update other managers (git, github, config)
5. **Phase 4e**: Deprecate old verbose-only methods (keep for 1 version)

## Testing Strategy

### 5.1 Unit Tests (`tests/output-manager.test.ts`)
```typescript
describe('OutputManager', () => {
  describe('Compact Mode', () => {
    test('should replace lines correctly');
    test('should handle multiple concurrent operations');
    test('should fallback gracefully on non-TTY terminals');
    test('should respect color configuration');
    test('should handle long messages with truncation');
  });

  describe('ANSI Utils', () => {
    test('should generate correct escape sequences');
    test('should detect terminal capabilities');
    test('should handle unsupported terminals');
  });

  describe('Progress Indicators', () => {
    test('should cycle through spinner frames');
    test('should cleanup on completion');
    test('should handle rapid start/stop cycles');
  });
});
```

### 5.2 Integration Tests (`tests/cli-output.test.ts`)
```typescript
describe('CLI Output Integration', () => {
  test('should work in compact mode with real stack operations');
  test('should fallback to verbose on TTY detection failure');
  test('should respect --verbose flag override');
  test('should handle errors gracefully in compact mode');
  test('should maintain output coherence during interrupts');
});
```

### 5.3 Visual Testing Strategy
- **Manual Testing Matrix**: Test on different terminals (iTerm2, Terminal.app, VS Code terminal, SSH sessions)
- **TTY Detection Tests**: Verify behavior in pipes, redirects, non-interactive contexts
- **Color Support Tests**: Test on terminals with different color capabilities
- **Performance Tests**: Ensure no performance regression with rapid updates

## Risk Assessment and Mitigation

### 6.1 High Priority Risks

**Risk: Terminal Compatibility Issues**
- *Impact*: CLI unusable on some terminals/environments
- *Mitigation*: Robust terminal capability detection, graceful fallback to verbose mode
- *Testing*: Comprehensive terminal compatibility testing matrix

**Risk: Performance Degradation**
- *Impact*: Slow CLI response due to frequent terminal updates
- *Mitigation*: Rate-limit updates, batch ANSI operations, performance benchmarks
- *Testing*: Automated performance regression tests

**Risk: Backward Compatibility Breaks**
- *Impact*: Existing scripts/integrations break
- *Mitigation*: Maintain all existing APIs, extensive deprecation warnings
- *Testing*: Integration tests covering all existing usage patterns

### 6.2 Medium Priority Risks

**Risk: Complex State Management**
- *Impact*: Inconsistent output, race conditions with async operations
- *Mitigation*: Clear operation lifecycle, defensive programming
- *Testing*: Stress tests with concurrent operations

**Risk: User Experience Confusion**
- *Impact*: Users confused by new output format
- *Mitigation*: Clear documentation, gradual rollout, easy verbose mode access
- *Testing*: User acceptance testing, feedback collection

### 6.3 Low Priority Risks

**Risk: Color Scheme Accessibility**
- *Impact*: Poor accessibility for color-blind users
- *Mitigation*: Multiple color schemes, icon-based differentiation
- *Testing*: Accessibility testing with different color configurations

## Implementation Phases and Timeline

### Phase 1: Foundation (Week 1)
- [ ] Create `src/ansi-utils.ts` with escape sequence helpers
- [ ] Create `src/progress-indicator.ts` with spinner/progress components
- [ ] Add comprehensive unit tests for ANSI utilities
- [ ] Add terminal capability detection

### Phase 2: Core Output Manager (Week 2)
- [ ] Extend `OutputManager` with compact mode support
- [ ] Implement operation tracking and line replacement
- [ ] Add color scheme and formatting configuration
- [ ] Create backward compatibility layer

### Phase 3: Integration and Refactoring (Week 3)
- [ ] Create `src/operation-tracker.ts` wrapper
- [ ] Refactor `stack-manager.ts` to use new operation patterns
- [ ] Update `config-manager.ts` with output configuration
- [ ] Add CLI flags for output mode control

### Phase 4: Testing and Polish (Week 4)
- [ ] Comprehensive integration testing across commands
- [ ] Terminal compatibility testing matrix
- [ ] Performance optimization and benchmarking
- [ ] Documentation updates and user guides

### Phase 5: Rollout (Week 5)
- [ ] Gradual rollout starting with `stack` command
- [ ] User feedback collection and iteration
- [ ] Update remaining commands (`status`, `merge`, etc.)
- [ ] Final documentation and deprecation notices

## Success Criteria

1. **Output Compactness**: Typical operations use ≤3 lines instead of current 10-15 lines
2. **Visual Clarity**: Clear state differentiation through color/formatting
3. **Performance**: No perceptible latency increase from output changes
4. **Compatibility**: 100% backward compatibility with existing API
5. **Reliability**: Graceful degradation on all tested terminal environments
6. **User Satisfaction**: Positive feedback on improved readability and speed perception

## Files to be Modified

### New Files
- `/Users/camhahu/Documents/Projects/rungs/src/ansi-utils.ts`
- `/Users/camhahu/Documents/Projects/rungs/src/progress-indicator.ts`
- `/Users/camhahu/Documents/Projects/rungs/src/operation-tracker.ts`
- `/Users/camhahu/Documents/Projects/rungs/tests/output-manager.test.ts`
- `/Users/camhahu/Documents/Projects/rungs/tests/cli-output.test.ts`

### Modified Files
- `/Users/camhahu/Documents/Projects/rungs/src/output-manager.ts` - Add compact mode support
- `/Users/camhahu/Documents/Projects/rungs/src/config-manager.ts` - Add output configuration
- `/Users/camhahu/Documents/Projects/rungs/src/cli.ts` - Add CLI flags and output mode setup
- `/Users/camhahu/Documents/Projects/rungs/src/stack-manager.ts` - Refactor to use operation tracker
- `/Users/camhahu/Documents/Projects/rungs/src/git-manager.ts` - Update output calls if needed
- `/Users/camhahu/Documents/Projects/rungs/src/github-manager.ts` - Update output calls if needed

### Documentation Updates
- `/Users/camhahu/Documents/Projects/rungs/README.md` - Document new CLI flags and behavior
- `/Users/camhahu/Documents/Projects/rungs/docs/SPEC.md` - Update CLI specification

---

*This implementation plan provides a structured approach to improving CLI output while maintaining compatibility and ensuring reliability across different terminal environments.*