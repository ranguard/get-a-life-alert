import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

export interface AlertLog {
  id?: number;
  phoneNumber: string;
  message: string;
  remainingMinutes: number;
  sentAt: string;
  date: string; // YYYY-MM-DD format
}

export interface SystemLog {
  id?: number;
  event: string;
  message: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
}

export class DatabaseService {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initializeTables();
  }

  /**
   * Initialize database tables
   */
  private initializeTables(): void {
    // Alert logs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS alert_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone_number TEXT NOT NULL,
        message TEXT NOT NULL,
        remaining_minutes INTEGER NOT NULL,
        sent_at TEXT NOT NULL,
        date TEXT NOT NULL
      )
    `);

    // System logs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS system_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL DEFAULT 'info'
      )
    `);

    // Create indexes for better performance
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_alert_logs_date ON alert_logs(date)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_alert_logs_phone ON alert_logs(phone_number)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs(timestamp)');
  }

  /**
   * Log an SMS alert
   */
  logAlert(alert: Omit<AlertLog, 'id'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO alert_logs (phone_number, message, remaining_minutes, sent_at, date)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      alert.phoneNumber,
      alert.message,
      alert.remainingMinutes,
      alert.sentAt,
      alert.date
    );
  }

  /**
   * Log system event
   */
  logSystem(log: Omit<SystemLog, 'id'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO system_logs (event, message, timestamp, level)
      VALUES (?, ?, ?, ?)
    `);
    
    stmt.run(log.event, log.message, log.timestamp, log.level);
  }

  /**
   * Get alerts sent to a phone number on a specific date
   */
  getAlertsForDateAndPhone(phoneNumber: string, date: string): AlertLog[] {
    const stmt = this.db.prepare(`
      SELECT * FROM alert_logs 
      WHERE phone_number = ? AND date = ?
      ORDER BY sent_at DESC
    `);
    
    return stmt.all(phoneNumber, date) as AlertLog[];
  }

  /**
   * Check if an alert was already sent for specific remaining minutes
   */
  wasAlertSentForMinutes(phoneNumber: string, date: string, remainingMinutes: number): boolean {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM alert_logs 
      WHERE phone_number = ? AND date = ? AND remaining_minutes = ?
    `);
    
    const result = stmt.get(phoneNumber, date, remainingMinutes) as { count: number };
    return result.count > 0;
  }

  /**
   * Get recent system logs
   */
  getRecentSystemLogs(limit: number = 100): SystemLog[] {
    const stmt = this.db.prepare(`
      SELECT * FROM system_logs 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    
    return stmt.all(limit) as SystemLog[];
  }

  /**
   * Get alert statistics for a date range
   */
  getAlertStats(startDate: string, endDate: string): { phone_number: string; alert_count: number }[] {
    const stmt = this.db.prepare(`
      SELECT phone_number, COUNT(*) as alert_count
      FROM alert_logs 
      WHERE date BETWEEN ? AND ?
      GROUP BY phone_number
      ORDER BY alert_count DESC
    `);
    
    return stmt.all(startDate, endDate) as { phone_number: string; alert_count: number }[];
  }

  /**
   * Clean up old logs (older than specified days)
   */
  cleanupOldLogs(daysToKeep: number = 30): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffString = cutoffDate.toISOString().split('T')[0];

    const alertStmt = this.db.prepare('DELETE FROM alert_logs WHERE date < ?');
    const systemStmt = this.db.prepare('DELETE FROM system_logs WHERE timestamp < ?');
    
    const alertDeleted = alertStmt.run(cutoffString);
    const systemDeleted = systemStmt.run(cutoffString);

    this.logSystem({
      event: 'cleanup',
      message: `Cleaned up ${alertDeleted.changes} alert logs and ${systemDeleted.changes} system logs older than ${daysToKeep} days`,
      timestamp: new Date().toISOString(),
      level: 'info'
    });
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}