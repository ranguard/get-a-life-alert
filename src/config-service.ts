import * as yaml from 'js-yaml';
import * as fs from 'fs';

export interface MessageConfig {
  minutes: number;
  message: string;
}

export interface NumberConfig {
  number: string;
  isAdmin: boolean;
  MessageWhenRemainingMins: MessageConfig[];
}

export interface TimeRule {
  start: string;
  end: string;
  max_minutes: number;
}

export interface Config {
  fritz: {
    url: string;
    device_name: string;
  };
  TimeRulesByDay: {
    [key: string]: TimeRule;
  };
  NumbersToSMS: NumberConfig[];
  cron_schedule: string;
  logging: {
    level: string;
    file: string;
  };
}

export class ConfigService {
  private config: Config;

  constructor(configPath: string) {
    this.config = this.loadConfig(configPath);
    this.validateConfig();
  }

  /**
   * Load configuration from YAML file
   */
  private loadConfig(configPath: string): Config {
    try {
      if (!fs.existsSync(configPath)) {
        throw new Error(`Configuration file not found: ${configPath}`);
      }

      const fileContents = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(fileContents) as Config;

      return config;
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate configuration structure and values
   */
  private validateConfig(): void {
    const errors: string[] = [];

    // Validate Fritz configuration
    if (!this.config.fritz) {
      errors.push('Missing fritz configuration');
    } else {
      if (!this.config.fritz.url) {
        errors.push('Missing fritz.url');
      }
      if (!this.config.fritz.device_name) {
        errors.push('Missing fritz.device_name');
      }
    }

    // Validate SMS numbers
    if (!this.config.NumbersToSMS || !Array.isArray(this.config.NumbersToSMS)) {
      errors.push('Missing or invalid NumbersToSMS array');
    } else {
      this.config.NumbersToSMS.forEach((numberConfig, index) => {
        if (!numberConfig.number) {
          errors.push(`Missing number for NumbersToSMS[${index}]`);
        }
        if (typeof numberConfig.isAdmin !== 'boolean') {
          errors.push(`Invalid isAdmin value for NumbersToSMS[${index}]`);
        }
        if (!numberConfig.MessageWhenRemainingMins || !Array.isArray(numberConfig.MessageWhenRemainingMins)) {
          errors.push(`Missing or invalid MessageWhenRemainingMins for NumbersToSMS[${index}]`);
        } else {
          numberConfig.MessageWhenRemainingMins.forEach((msg, msgIndex) => {
            if (typeof msg.minutes !== 'number') {
              errors.push(`Invalid minutes value for NumbersToSMS[${index}].MessageWhenRemainingMins[${msgIndex}]`);
            }
            if (!msg.message) {
              errors.push(`Missing message for NumbersToSMS[${index}].MessageWhenRemainingMins[${msgIndex}]`);
            }
          });
        }
      });

      // Check that at least one admin exists
      const hasAdmin = this.config.NumbersToSMS.some(n => n.isAdmin);
      if (!hasAdmin) {
        errors.push('At least one admin number must be configured');
      }
    }

    // Validate cron schedule
    if (!this.config.cron_schedule) {
      errors.push('Missing cron_schedule');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  /**
   * Get configuration
   */
  getConfig(): Config {
    return this.config;
  }

  /**
   * Get Fritz configuration
   */
  getFritzConfig(): { url: string; device_name: string } {
    return this.config.fritz;
  }

  /**
   * Get SMS configuration
   */
  getSmsConfig(): NumberConfig[] {
    return this.config.NumbersToSMS;
  }

  /**
   * Get admin numbers
   */
  getAdminNumbers(): NumberConfig[] {
    return this.config.NumbersToSMS.filter(n => n.isAdmin);
  }

  /**
   * Get cron schedule
   */
  getCronSchedule(): string {
    return this.config.cron_schedule;
  }

  /**
   * Get time rules for a specific day
   */
  getTimeRulesForDay(day: string): TimeRule | null {
    const dayLower = day.toLowerCase();
    return this.config.TimeRulesByDay[dayLower] || null;
  }

  /**
   * Get time rules for today
   */
  getTodayTimeRules(): TimeRule | null {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = days[new Date().getDay()];
    return this.getTimeRulesForDay(today);
  }

  /**
   * Check if current time is within allowed hours
   */
  isWithinAllowedHours(): boolean {
    const rules = this.getTodayTimeRules();
    if (!rules) return false;

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    return currentTime >= rules.start && currentTime <= rules.end;
  }

  /**
   * Get logging configuration
   */
  getLoggingConfig(): { level: string; file: string } {
    return this.config.logging || { level: 'info', file: 'logs/get-a-life-alert.log' };
  }
}