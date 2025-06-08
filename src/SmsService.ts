import { Twilio } from 'twilio';

export interface SmsConfig {
  to: string;
  message: string;
}

export class SmsService {
  private client: Twilio;
  private fromNumber: string;

  constructor(accountSid: string, authToken: string, fromNumber: string) {
    this.client = new Twilio(accountSid, authToken);
    this.fromNumber = fromNumber;
  }

  /**
   * Send SMS message
   */
  async sendSms(to: string, message: string): Promise<boolean> {
    try {
      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: to
      });

      console.log(`SMS sent successfully to ${to}. SID: ${result.sid}`);
      return true;
    } catch (error) {
      console.error(`Failed to send SMS to ${to}:`, error);
      return false;
    }
  }

  /**
   * Send multiple SMS messages
   */
  async sendMultipleSms(messages: SmsConfig[]): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    for (const { to, message } of messages) {
      const success = await this.sendSms(to, message);
      if (success) {
        sent++;
      } else {
        failed++;
      }
      
      // Small delay between messages to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return { sent, failed };
  }

  /**
   * Test SMS service by sending a test message
   */
  async testSms(to: string): Promise<boolean> {
    return this.sendSms(to, 'Test message from Get A Life Alert system');
  }
}