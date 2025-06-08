import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';

export interface TimeRemaining {
  used: string;
  total: string;
  remainingMinutes: number;
  isExhausted: boolean;
}

export class FritzClient {
  private axios: AxiosInstance;
  private baseUrl: string;
  private username: string;
  private password: string;
  private sessionId: string | null = null;

  constructor(baseUrl: string, username: string, password: string) {
    this.baseUrl = baseUrl;
    this.username = username;
    this.password = password;
    
    this.axios = axios.create({
      baseURL: baseUrl,
      timeout: 10000,
      headers: {
        'User-Agent': 'get-a-life-alert/1.0'
      }
    });
  }

  /**
   * Get session ID for Fritz router authentication
   */
  async getSessionId(): Promise<string> {
    try {
      // First, get the challenge
      const challengeResponse = await this.axios.get('/login_sid.lua');
      const challengeMatch = challengeResponse.data.match(/<Challenge>(.*?)<\/Challenge>/);
      
      if (!challengeMatch) {
        throw new Error('Could not extract challenge from Fritz router');
      }

      const challenge = challengeMatch[1];
      
      // Create response hash
      const responseString = `${challenge}-${this.password}`;
      const utf16Buffer = Buffer.from(responseString, 'utf16le');
      const md5Hash = crypto.createHash('md5').update(utf16Buffer).digest('hex');
      const response = `${challenge}-${md5Hash}`;

      // Login with username and response
      const loginResponse = await this.axios.post('/login_sid.lua', 
        `username=${encodeURIComponent(this.username)}&response=${response}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const sidMatch = loginResponse.data.match(/<SID>(.*?)<\/SID>/);
      if (!sidMatch || sidMatch[1] === '0000000000000000') {
        throw new Error('Fritz router authentication failed');
      }

      this.sessionId = sidMatch[1];
      return this.sessionId;
    } catch (error) {
      throw new Error(`Failed to authenticate with Fritz router: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fetch parental control data for a specific device
   */
  async getParentalControlData(deviceName: string): Promise<TimeRemaining> {
    try {
      if (!this.sessionId) {
        await this.getSessionId();
      }

      const response = await this.axios.post('/data.lua', 
        `xhr=1&sid=${this.sessionId}&page=kidLis`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': '*/*',
            'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
            'Referer': `${this.baseUrl}/`,
            'Referrer-Policy': 'same-origin'
          }
        }
      );

      return this.parseParentalControlData(response.data, deviceName);
    } catch (error) {
      // If session expired, try to re-authenticate once
      if (error instanceof Error && error.message.includes('session')) {
        this.sessionId = null;
        await this.getSessionId();
        return this.getParentalControlData(deviceName);
      }
      throw new Error(`Failed to fetch parental control data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse the HTML response to extract time information
   */
  private parseParentalControlData(htmlData: string, deviceName: string): TimeRemaining {
    try {
      // Look for the device section
      const deviceRegex = new RegExp(`<[^>]*>${deviceName}<[^>]*>`);
      const deviceMatch = htmlData.match(deviceRegex);
      
      if (!deviceMatch) {
        throw new Error(`Device "${deviceName}" not found in parental control data`);
      }

      // Find the time span after the device name
      const deviceIndex = htmlData.indexOf(deviceMatch[0]);
      const afterDevice = htmlData.substring(deviceIndex);
      
      // Look for time information in span titles
      const spanMatches = [
        afterDevice.match(/<span title="Online time exhausted">/),
        afterDevice.match(/<span title="(\d{2}:\d{2}) of (\d{2}:\d{2}) hours">/),
        afterDevice.match(/<span title="(\d{2}:\d{2}) of (\d{1}:\d{2}) hours">/)
      ];

      for (const match of spanMatches) {
        if (match) {
          if (match[0].includes('exhausted')) {
            return {
              used: 'N/A',
              total: 'N/A',
              remainingMinutes: 0,
              isExhausted: true
            };
          } else {
            const used = match[1];
            const total = match[2];
            const remainingMinutes = this.calculateRemainingMinutes(used, total);
            
            return {
              used,
              total,
              remainingMinutes,
              isExhausted: remainingMinutes <= 0
            };
          }
        }
      }

      throw new Error('Could not parse time information from parental control data');
    } catch (error) {
      throw new Error(`Failed to parse parental control data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate remaining minutes from used/total time strings
   */
  private calculateRemainingMinutes(used: string, total: string): number {
    const parseTime = (timeStr: string): number => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    };

    const usedMinutes = parseTime(used);
    const totalMinutes = parseTime(total);
    
    return Math.max(0, totalMinutes - usedMinutes);
  }

  /**
   * Test connection to Fritz router
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.axios.get('/');
      return response.status === 200;
    } catch {
      return false;
    }
  }
}