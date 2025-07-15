import { join } from "path";
import { homedir } from "os";
import { OutputMode, SpinnerStyle } from "./output-manager.js";

export interface RungsConfig {
  userPrefix: string;
  defaultBranch: string;
  draftPRs: boolean;
  autoRebase: boolean;
  branchNaming: "commit-message" | "sequential" | "timestamp";
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

const DEFAULT_CONFIG: RungsConfig = {
  userPrefix: "dev",
  defaultBranch: "main",
  draftPRs: true,
  autoRebase: true,
  branchNaming: "commit-message",
  output: {
    mode: "compact",
    verboseOnError: true,
    spinnerStyle: "dots",
    colorScheme: "auto",
    maxLineLength: 80,
    showTimestamps: false,
    showElapsedTime: false
  }
};

export class ConfigManager {
  private configPath: string;

  constructor(customPath?: string) {
    this.configPath = customPath || join(homedir(), ".config", "rungs", "config.json");
  }

  async ensureConfigDir(): Promise<void> {
    const configDir = this.configPath.split("/").slice(0, -1).join("/");
    try {
      await Bun.$`mkdir -p ${configDir}`;
    } catch (error) {
      throw new Error(`Failed to create config directory: ${error}`);
    }
  }

  async getAll(): Promise<RungsConfig> {
    try {
      const file = Bun.file(this.configPath);
      if (!(await file.exists())) {
        return DEFAULT_CONFIG;
      }
      const content = await file.text();
      const config = JSON.parse(content);
      return { ...DEFAULT_CONFIG, ...config };
    } catch (error) {
      console.warn(`Failed to read config file, using defaults: ${error}`);
      return DEFAULT_CONFIG;
    }
  }

  async get<K extends keyof RungsConfig>(key: K): Promise<RungsConfig[K]> {
    const config = await this.getAll();
    return config[key];
  }

  async set<K extends keyof RungsConfig>(key: K, value: RungsConfig[K]): Promise<void> {
    await this.ensureConfigDir();
    const config = await this.getAll();
    config[key] = value;
    
    try {
      await Bun.write(this.configPath, JSON.stringify(config, null, 2));
    } catch (error) {
      throw new Error(`Failed to write config file: ${error}`);
    }
  }

  async update(updates: Partial<RungsConfig>): Promise<void> {
    await this.ensureConfigDir();
    const config = await this.getAll();
    const newConfig = { ...config, ...updates };
    
    try {
      await Bun.write(this.configPath, JSON.stringify(newConfig, null, 2));
    } catch (error) {
      throw new Error(`Failed to update config file: ${error}`);
    }
  }

  async reset(): Promise<void> {
    await this.ensureConfigDir();
    try {
      await Bun.write(this.configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
    } catch (error) {
      throw new Error(`Failed to reset config file: ${error}`);
    }
  }

  async isUsingDefaults(): Promise<{ userPrefix: boolean; defaultBranch: boolean }> {
    try {
      const file = Bun.file(this.configPath);
      if (!(await file.exists())) {
        return { userPrefix: true, defaultBranch: true };
      }
      
      const content = await file.text();
      const config = JSON.parse(content);
      
      // Check if the critical config values are using defaults
      const userPrefixIsDefault = !config.hasOwnProperty('userPrefix') || config.userPrefix === DEFAULT_CONFIG.userPrefix;
      const defaultBranchIsDefault = !config.hasOwnProperty('defaultBranch') || config.defaultBranch === DEFAULT_CONFIG.defaultBranch;
      
      return { 
        userPrefix: userPrefixIsDefault,
        defaultBranch: defaultBranchIsDefault
      };
    } catch (error) {
      // If we can't read the config, assume defaults are being used
      return { userPrefix: true, defaultBranch: true };
    }
  }
}
