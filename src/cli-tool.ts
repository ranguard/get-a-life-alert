#!/usr/bin/env node

import { Command } from 'commander';
import dotenv from 'dotenv';
import { FritzClient } from './FritzClient';
import { SmsService } from './SmsService';
import { DatabaseService } from './DatabaseService';
import { ConfigService } from './ConfigService';
import { AlertManager } from './AlertManager';

// Load environment variables
dotenv.config();

const program = new Command();

program
  .name('get-a-life-alert')
  .description('Monitor network time usage and send SMS alerts')
  .version('1.0.0');

/**
 * Initialize services for CLI commands
 */
async function initializeServices() {
  const configPath = process.env.CONFIG_PATH || './config.yaml';
  const configService = new ConfigService(configPath);
  const config = configService.getConfig();

  const fritzClient = new FritzClient(
    config.fritz.url,
    process.env.FRITZ_USER!,
    process.env.FRITZ_PASSWD!
  );

  const smsService = new SmsService(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!,
    process.env.TWILIO_PHONE_NUMBER!
  );

  const dbPath = process.env.DB_PATH || './data/alerts.db';
  const database = new DatabaseService(dbPath);

  const alertManager = new AlertManager(fritzClient, smsService, database, config);

  return { alertManager, config, database };
}

/**
 * Status command - show current network usage
 */
program
  .command('status')
  .description('Show current network time usage status')
  .action(async () => {
    try {
      const { alertManager } = await initializeServices();
      const status = await alertManager.getCurrentStatus();

      console.log('\n📊 Get A Life Alert - Current Status');
      console.log('=' .repeat(40));
      
      if (status.isConnected) {
        console.log('🌐 Fritz Router: ✅ Connected');
        
        if (status.timeRemaining) {
          const { timeRemaining } = status;
          console.log(`⏰ Time Used: ${timeRemaining.used}`);
          console.log(`⏱️ Total Allowed: ${timeRemaining.total}`);
          console.log(`🕐 Remaining: ${timeRemaining.remainingMinutes} minutes`);
          
          if (timeRemaining.isExhausted) {
            console.log('🚨 Status: ❌ Time Exhausted');
          } else if (timeRemaining.remainingMinutes <= 15) {
            console.log('🚨 Status: ⚠️ Low Time Remaining');
          } else {
            console.log('🚨 Status: ✅ Time Available');
          }
        }
      } else {
        console.log('🌐 Fritz Router: ❌ Disconnected');
        if (status.error) {
          console.log(`❌ Error: ${status.error}`);
        }
      }
      
      console.log('');
    } catch (error) {
      console.error('❌ Error getting status:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Check command - run manual check and alert process
 */
program
  .command('check')
  .description('Run manual check and send alerts if needed')
  .action(async () => {
    try {
      console.log('🔍 Running manual check...');
      const { alertManager } = await initializeServices();
      await alertManager.checkAndAlert();
      console.log('✅ Manual check completed');
    } catch (error) {
      console.error('❌ Error during check:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Test command - test all system components
 */
program
  .command('test')
  .description('Test all system components')
  .action(async () => {
    try {
      console.log('🔧 Testing system components...');
      const { alertManager } = await initializeServices();
      const results = await alertManager.testSystem();

      console.log('\n🧪 Get A Life Alert - System Test Results');
      console.log('=' .repeat(45));
      console.log(`🌐 Fritz Router: ${results.fritz ? '✅ OK' : '❌ FAILED'}`);
      console.log(`📱 SMS Service: ${results.sms ? '✅ OK' : '❌ FAILED'}`);
      console.log(`💾 Database: ${results.database ? '✅ OK' : '❌ FAILED'}`);

      if (results.errors.length > 0) {
        console.log('\n⚠️ Issues found:');
        results.errors.forEach(error => console.log(`  - ${error}`));
      }

      console.log('');
      
      if (!results.fritz || !results.sms || !results.database) {
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Error during system test:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Logs command - show recent logs
 */
program
  .command('logs')
  .description('Show recent system and alert logs')
  .option('-n, --number <number>', 'Number of logs to show', '20')
  .option('-t, --type <type>', 'Log type: alerts, system, or all', 'all')
  .action(async (options) => {
    try {
      const { alertManager } = await initializeServices();
      const limit = parseInt(options.number);

      console.log(`\n📋 Get A Life Alert - Recent Logs (${options.type})`);
      console.log('=' .repeat(50));

      if (options.type === 'alerts' || options.type === 'all') {
        console.log('\n📱 Alert Logs:');
        const alerts = alertManager.getRecentAlerts(limit);
        
        if (alerts.length === 0) {
          console.log('  No recent alerts');
        } else {
          alerts.forEach((alert: any) => {
            const date = new Date(alert.sent_at).toLocaleString();
            console.log(`  [${date}] ${alert.phone_number} - ${alert.remaining_minutes}min - ${alert.message}`);
          });
        }
      }

      if (options.type === 'system' || options.type === 'all') {
        console.log('\n🔧 System Logs:');
        const systemLogs = alertManager.getSystemLogs(limit);
        
        if (systemLogs.length === 0) {
          console.log('  No recent system logs');
        } else {
          systemLogs.forEach((log: any) => {
            const date = new Date(log.timestamp).toLocaleString();
            const level = log.level.toUpperCase();
            console.log(`  [${date}] ${level}: ${log.event} - ${log.message}`);
          });
        }
      }

      console.log('');
    } catch (error) {
      console.error('❌ Error getting logs:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Send test SMS command
 */
program
  .command('test-sms')
  .description('Send a test SMS to verify Twilio configuration')
  .requiredOption('-t, --to <number>', 'Phone number to send test SMS to')
  .action(async (options) => {
    try {
      console.log(`📱 Sending test SMS to ${options.to}...`);
      
      const smsService = new SmsService(
        process.env.TWILIO_ACCOUNT_SID!,
        process.env.TWILIO_AUTH_TOKEN!,
        process.env.TWILIO_PHONE_NUMBER!
      );

      const success = await smsService.testSms(options.to);
      
      if (success) {
        console.log('✅ Test SMS sent successfully!');
      } else {
        console.log('❌ Failed to send test SMS');
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Error sending test SMS:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Configuration validation command
 */
program
  .command('validate-config')
  .description('Validate configuration file')
  .action(async () => {
    try {
      const configPath = process.env.CONFIG_PATH || './config.yaml';
      console.log(`🔧 Validating configuration: ${configPath}`);
      
      const configService = new ConfigService(configPath);
      const config = configService.getConfig();
      
      console.log('✅ Configuration is valid!');
      console.log(`📱 ${config.NumbersToSMS.length} phone number(s) configured`);
      console.log(`👥 ${config.NumbersToSMS.filter(n => n.isAdmin).length} admin(s) configured`);
      console.log(`🌐 Fritz device: ${config.fritz.device_name}`);
      console.log(`⏰ Cron schedule: ${config.cron_schedule}`);
      
    } catch (error) {
      console.error('❌ Configuration validation failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();

// If no command specified, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}