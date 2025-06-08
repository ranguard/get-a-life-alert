import dotenv from 'dotenv';
import * as cron from 'node-cron';
import * as path from 'path';
import { FritzClient } from './FritzClient';
import { SmsService } from './SmsService';
import { DatabaseService } from './DatabaseService';
import { ConfigService } from './ConfigService';
import { AlertManager } from './AlertManager';

// Load environment variables
dotenv.config();

/**
 * Main application class
 */
class GetALifeAlertApp {
  private alertManager: AlertManager | null = null;
  private cronJob: cron.ScheduledTask | null = null;

  async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing Get A Life Alert system...');

      // Load configuration
      const configPath = process.env.CONFIG_PATH || './config.yaml';
      const configService = new ConfigService(configPath);
      const config = configService.getConfig();

      // Validate required environment variables
      this.validateEnvironment();

      // Initialize Fritz client
      const fritzClient = new FritzClient(
        config.fritz.url,
        process.env.FRITZ_USER!,
        process.env.FRITZ_PASSWD!
      );

      // Initialize SMS service
      const smsService = new SmsService(
        process.env.TWILIO_ACCOUNT_SID!,
        process.env.TWILIO_AUTH_TOKEN!,
        process.env.TWILIO_PHONE_NUMBER!
      );

      // Initialize database
      const dbPath = process.env.DB_PATH || './data/alerts.db';
      const database = new DatabaseService(dbPath);

      // Initialize alert manager
      this.alertManager = new AlertManager(fritzClient, smsService, database, config);

      // Test system components
      console.log('🔧 Testing system components...');
      const testResults = await this.alertManager.testSystem();
      
      if (testResults.errors.length > 0) {
        console.warn('⚠️ System test warnings:');
        testResults.errors.forEach(error => console.warn(`  - ${error}`));
      }

      console.log(`✅ Fritz Router: ${testResults.fritz ? 'OK' : 'FAILED'}`);
      console.log(`✅ SMS Service: ${testResults.sms ? 'OK' : 'FAILED'}`);
      console.log(`✅ Database: ${testResults.database ? 'OK' : 'FAILED'}`);

      // Setup cron job
      this.setupCronJob(configService.getCronSchedule());

      console.log('✅ Get A Life Alert system initialized successfully!');
      console.log(`📅 Monitoring schedule: ${configService.getCronSchedule()}`);
      console.log(`📱 Monitoring ${config.NumbersToSMS.length} phone number(s)`);
      console.log(`🌐 Fritz device: ${config.fritz.device_name}`);
      
    } catch (error) {
      console.error('❌ Failed to initialize Get A Life Alert system:', error);
      process.exit(1);
    }
  }

  /**
   * Validate required environment variables
   */
  private validateEnvironment(): void {
    const required = [
      'FRITZ_USER',
      'FRITZ_PASSWD',
      'TWILIO_ACCOUNT_SID',
      'TWILIO_AUTH_TOKEN',
      'TWILIO_PHONE_NUMBER'
    ];

    const missing = required.filter(env => !process.env[env]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  /**
   * Setup cron job for monitoring
   */
  private setupCronJob(schedule: string): void {
    if (!this.alertManager) {
      throw new Error('Alert manager not initialized');
    }

    this.cronJob = cron.schedule(schedule, async () => {
      console.log(`🔍 Running scheduled check at ${new Date().toISOString()}`);
      try {
        await this.alertManager!.checkAndAlert();
      } catch (error) {
        console.error('Error during scheduled check:', error);
      }
    }, {
      scheduled: false // Don't start immediately
    });

    this.cronJob.start();
    console.log(`⏰ Cron job scheduled: ${schedule}`);
  }

  /**
   * Manual check (for testing)
   */
  async runManualCheck(): Promise<void> {
    if (!this.alertManager) {
      throw new Error('Alert manager not initialized');
    }

    console.log('🔍 Running manual check...');
    await this.alertManager.checkAndAlert();
    console.log('✅ Manual check completed');
  }

  /**
   * Get current status
   */
  async getStatus(): Promise<void> {
    if (!this.alertManager) {
      throw new Error('Alert manager not initialized');
    }

    const status = await this.alertManager.getCurrentStatus();
    
    console.log('\n📊 Current Status:');
    console.log(`🌐 Fritz Connection: ${status.isConnected ? 'Connected' : 'Disconnected'}`);
    
    if (status.timeRemaining) {
      console.log(`⏰ Time Used: ${status.timeRemaining.used}`);
      console.log(`⏱️ Total Allowed: ${status.timeRemaining.total}`);
      console.log(`🕐 Remaining: ${status.timeRemaining.remainingMinutes} minutes`);
      console.log(`🚨 Exhausted: ${status.timeRemaining.isExhausted ? 'Yes' : 'No'}`);
    }
    
    if (status.error) {
      console.log(`❌ Error: ${status.error}`);
    }
  }

  /**
   * Graceful shutdown
   */
  shutdown(): void {
    console.log('\n🛑 Shutting down Get A Life Alert system...');
    
    if (this.cronJob) {
      this.cronJob.stop();
      console.log('⏰ Cron job stopped');
    }
    
    console.log('✅ Shutdown complete');
    process.exit(0);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => app.shutdown());
process.on('SIGINT', () => app.shutdown());

// Start the application
const app = new GetALifeAlertApp();

// Export for CLI usage
export { GetALifeAlertApp };

// If running directly (not imported)
if (require.main === module) {
  app.initialize().catch(error => {
    console.error('Failed to start application:', error);
    process.exit(1);
  });
}