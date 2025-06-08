import { FritzClient, TimeRemaining } from './FritzClient';
import { SmsService } from './SmsService';
import { DatabaseService } from './DatabaseService';
import { ConfigService, Config, NumberConfig } from './ConfigService';

export class AlertManager {
  private fritzClient: FritzClient;
  private smsService: SmsService;
  private database: DatabaseService;
  private config: Config;

  constructor(
    fritzClient: FritzClient,
    smsService: SmsService,
    database: DatabaseService,
    config: Config
  ) {
    this.fritzClient = fritzClient;
    this.smsService = smsService;
    this.database = database;
    this.config = config;
  }

  /**
   * Main monitoring function - called by cron
   */
  async checkAndAlert(): Promise<void> {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    try {
      this.database.logSystem({
        event: 'check_start',
        message: 'Starting network time check',
        timestamp: now.toISOString(),
        level: 'info'
      });

      // Test Fritz connection first
      const isConnected = await this.fritzClient.testConnection();
      if (!isConnected) {
        await this.handleFritzConnectionError();
        return;
      }

      // Get current time usage
      const timeRemaining = await this.fritzClient.getParentalControlData(
        this.config.fritz.device_name
      );

      this.database.logSystem({
        event: 'time_check',
        message: `Time remaining: ${timeRemaining.remainingMinutes} minutes (${timeRemaining.used}/${timeRemaining.total})`,
        timestamp: now.toISOString(),
        level: 'info'
      });

      // Process alerts for each configured number
      for (const numberConfig of this.config.NumbersToSMS) {
        await this.processAlertsForNumber(numberConfig, timeRemaining, today);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.database.logSystem({
        event: 'check_error',
        message: `Error during check: ${errorMessage}`,
        timestamp: now.toISOString(),
        level: 'error'
      });

      console.error('Error during check and alert:', errorMessage);
      
      // If there's an error fetching from Fritz, notify admins
      await this.handleFritzConnectionError();
    }
  }

  /**
   * Process alerts for a specific phone number
   */
  private async processAlertsForNumber(
    numberConfig: NumberConfig,
    timeRemaining: TimeRemaining,
    today: string
  ): Promise<void> {
    const { remainingMinutes } = timeRemaining;

    // Find appropriate message based on remaining time
    let messageToSend: string | null = null;
    let alertMinutes: number | null = null;

    // Sort messages by minutes descending to check highest threshold first
    const sortedMessages = [...numberConfig.MessageWhenRemainingMins]
      .sort((a, b) => b.minutes - a.minutes);

    for (const messageConfig of sortedMessages) {
      if (remainingMinutes <= messageConfig.minutes) {
        // Check if we already sent this specific alert today
        if (!this.database.wasAlertSentForMinutes(
          numberConfig.number,
          today,
          messageConfig.minutes
        )) {
          messageToSend = messageConfig.message;
          alertMinutes = messageConfig.minutes;
          break;
        }
      }
    }

    // Send alert if we found a message to send
    if (messageToSend && alertMinutes !== null) {
      const success = await this.smsService.sendSms(numberConfig.number, messageToSend);
      
      if (success) {
        this.database.logAlert({
          phoneNumber: numberConfig.number,
          message: messageToSend,
          remainingMinutes: alertMinutes,
          sentAt: new Date().toISOString(),
          date: today
        });

        this.database.logSystem({
          event: 'alert_sent',
          message: `Alert sent to ${numberConfig.number} for ${alertMinutes} minutes remaining`,
          timestamp: new Date().toISOString(),
          level: 'info'
        });
      } else {
        this.database.logSystem({
          event: 'alert_failed',
          message: `Failed to send alert to ${numberConfig.number}`,
          timestamp: new Date().toISOString(),
          level: 'error'
        });
      }
    }
  }

  /**
   * Handle Fritz router connection errors
   */
  private async handleFritzConnectionError(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    
    // Check if we already sent a Fritz error alert today
    const adminNumbers = this.config.NumbersToSMS.filter(n => n.isAdmin);
    
    for (const admin of adminNumbers) {
      if (!this.database.wasAlertSentForMinutes(admin.number, today, -1)) { // -1 for system errors
        const message = "⚠️ Get A Life Alert: Cannot connect to Fritz router. Please check the system.";
        
        const success = await this.smsService.sendSms(admin.number, message);
        
        if (success) {
          this.database.logAlert({
            phoneNumber: admin.number,
            message,
            remainingMinutes: -1, // Special value for system errors
            sentAt: new Date().toISOString(),
            date: today
          });
        }
      }
    }

    this.database.logSystem({
      event: 'fritz_connection_error',
      message: 'Cannot connect to Fritz router',
      timestamp: new Date().toISOString(),
      level: 'error'
    });
  }

  /**
   * Get current status - used by CLI
   */
  async getCurrentStatus(): Promise<{
    timeRemaining: TimeRemaining | null;
    isConnected: boolean;
    error?: string;
  }> {
    try {
      const isConnected = await this.fritzClient.testConnection();
      if (!isConnected) {
        return { timeRemaining: null, isConnected: false, error: 'Cannot connect to Fritz router' };
      }

      const timeRemaining = await this.fritzClient.getParentalControlData(
        this.config.fritz.device_name
      );

      return { timeRemaining, isConnected: true };
    } catch (error) {
      return {
        timeRemaining: null,
        isConnected: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get recent alerts - used by CLI
   */
  getRecentAlerts(limit: number = 10): any[] {
    const stmt = this.database['db'].prepare(`
      SELECT * FROM alert_logs 
      ORDER BY sent_at DESC 
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  /**
   * Get system logs - used by CLI
   */
  getSystemLogs(limit: number = 20): any[] {
    return this.database.getRecentSystemLogs(limit);
  }

  /**
   * Test all components
   */
  async testSystem(): Promise<{
    fritz: boolean;
    sms: boolean;
    database: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];
    let fritzOk = false;
    let smsOk = false;
    let dbOk = true;

    // Test Fritz connection
    try {
      fritzOk = await this.fritzClient.testConnection();
      if (!fritzOk) {
        errors.push('Cannot connect to Fritz router');
      }
    } catch (error) {
      errors.push(`Fritz error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Test SMS (we can't really test without sending, so just check if service is configured)
    try {
      // Just verify the service exists and has required config
      smsOk = this.smsService !== null;
    } catch (error) {
      errors.push(`SMS error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      smsOk = false;
    }

    // Test database
    try {
      this.database.logSystem({
        event: 'system_test',
        message: 'System test performed',
        timestamp: new Date().toISOString(),
        level: 'info'
      });
    } catch (error) {
      errors.push(`Database error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      dbOk = false;
    }

    return {
      fritz: fritzOk,
      sms: smsOk,
      database: dbOk,
      errors
    };
  }