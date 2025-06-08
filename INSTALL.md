# Get-A-Life-Alert - Installation & Setup Guide

## Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn package manager
- Python 3.x (for better-sqlite3 compilation if needed)

## macOS Installation

### 1. Install System Dependencies

For better-sqlite3 to compile properly on macOS, ensure you have:

```bash
# Install Xcode Command Line Tools (if not already installed)
xcode-select --install

# Install Python (if not already installed)
brew install python3

# Optional: Install build tools explicitly
npm install -g node-gyp
```

### 2. Clone and Install

```bash
git clone https://github.com/ranguard/get-a-life-alert.git
cd get-a-life-alert

# Install dependencies
npm install

# Or with yarn
yarn install
```

### 3. Handle better-sqlite3 Installation Issues

If better-sqlite3 fails to install on macOS, try these solutions:

#### Option A: Force Rebuild
```bash
npm rebuild better-sqlite3
```

#### Option B: Install with Specific Node Version
```bash
# If using nvm
nvm use 18
npm install better-sqlite3
```

#### Option C: Install from Source
```bash
npm install better-sqlite3 --build-from-source
```

#### Option D: Use Prebuilt Binaries
```bash
npm install better-sqlite3 --verbose
```

### 4. Environment Setup

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Fritz Router Credentials
FRITZ_USER=your_username
FRITZ_PASSWD=your_password
FRITZ_URL=http://192.168.178.1

# Twilio Credentials
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+1234567890

# Logging
LOG_LEVEL=info
LOG_FILE=logs/app.log

# Database
DB_PATH=./data/alerts.db
```

### 5. Configuration

Create or update `config.yaml`:

```yaml
device:
  name: "Leos-11"
  
timeRulesByDay:
  monday: "14:00-20:00"
  tuesday: "14:00-20:00"
  wednesday: "14:00-20:00"
  thursday: "14:00-20:00"
  friday: "14:00-22:00"
  saturday: "10:00-22:00"
  sunday: "10:00-20:00"

numbersToSMS:
  - number: "+1234567890"
    isAdmin: true
    messageWhenRemainingMins:
      60: "1 hour remaining"
      30: "30 minutes remaining"
      15: "15 minutes remaining"
      5: "5 minutes remaining"
      0: "Time's up!"
```

## Build and Run

```bash
# Build the project
npm run build

# Run in development mode
npm run dev

# Run built version
npm start

# Run tests
npm test
```

## Cron Setup

Add to your crontab to run every 5 minutes:

```bash
# Edit crontab
crontab -e

# Add this line (adjust path as needed)
*/5 * * * * cd /path/to/get-a-life-alert && npm start >> /var/log/get-a-life-alert.log 2>&1
```

## Troubleshooting

### better-sqlite3 Issues on macOS

1. **Apple Silicon (M1/M2) Macs:**
   ```bash
   # Install Rosetta 2 if needed
   softwareupdate --install-rosetta
   
   # Use x86_64 architecture
   arch -x86_64 npm install better-sqlite3
   ```

2. **Python Version Issues:**
   ```bash
   # Set Python version explicitly
   npm config set python python3
   npm install better-sqlite3
   ```

3. **Node Version Issues:**
   ```bash
   # Use a stable Node.js version
   nvm install 18.19.0
   nvm use 18.19.0
   npm install
   ```

### Permission Issues

```bash
# Fix permissions for log directory
mkdir -p logs
chmod 755 logs

# Fix permissions for data directory
mkdir -p data
chmod 755 data
```

### Network Issues

- Ensure your Fritz router is accessible at the configured URL
- Check that your device is on the same network as the Fritz router
- Verify Fritz router credentials in `.env`

## CLI Usage

```bash
# Check current status
npm start -- --status

# Test SMS functionality
npm start -- --test-sms

# Dry run (no actual SMS sent)
npm start -- --dry-run

# Check specific device
npm start -- --device "Device-Name"
```

## Dependencies Update Notes

### Key Updates Made:

1. **better-sqlite3**: Updated to v11.3.0 with proper macOS support
2. **twilio**: Updated to v5.3.4 for latest API features
3. **typescript**: Updated to v5.6.3 for latest TypeScript features
4. **node-fetch**: Using v3.3.2 for ESM compatibility
5. **Added prebuild-install**: Helps with better-sqlite3 installation

### macOS Specific Fixes:

- Added `prebuild-install` as optional dependency
- Updated package overrides for better-sqlite3
- Compatible with both Intel and Apple Silicon Macs
- Proper Node.js version constraints (>=18.0.0)

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Type checking
npm run type-check

# Linting
npm run lint
npm run lint:fix
```