# 🦾 SuiDeX Biggest Stake Bot

Track the largest LP deposits into Victory/SUI and Victory/USDC pools with weekly competitions and leaderboards.

## Features

- ✅ Real-time deposit tracking (both pools)
- ✅ USD valuation with price caching
- ✅ Per-wallet accumulation (sum of all deposits)
- ✅ Top 5 leaderboard (combined pools)
- ✅ Daily leaderboard posts (00:00 UTC)
- ✅ 7-day competition cycles
- ✅ CSV export with winners
- ✅ Admin commands with authorization
- ✅ MongoDB + Redis for optimal performance

## Installation
```bash
# Install dependencies
npm install

# Build TypeScript
npm run build
```

## Configuration

1. Copy `.env.example` to `.env`
2. Update `MONGODB_URI` and `REDIS_URL` with your database credentials
3. Verify all other settings are correct

## Usage
```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

## Commands

### User Commands
- `/lb` - Show current Top 5 leaderboard

### Admin Commands
- `/start` - Start new 7-day competition
- `/resetlb` - Manually reset leaderboard
- `/addstake <wallet> <pool> <usd>` - Manually add missed deposit

## Competition Flow

1. Admin runs `/start` to begin competition
2. Bot tracks deposits for 7 days
3. Auto-announces winners at end
4. Exports CSV for reward distribution
5. Waits for next `/start` command

## Prize Structure

- 🥇 1st: 200,000 VICTORY
- 🥈 2nd: 75,000 VICTORY
- 🥉 3rd: 50,000 VICTORY
- 4️⃣ 4th: 20,000 VICTORY
- 5️⃣ 5th: 10,000 VICTORY

## Tech Stack

- Node.js 20+
- TypeScript
- Sui blockchain (@mysten/sui.js)
- MongoDB (persistent storage)
- Redis (caching)
- Telegram Bot API
- Node-Cron (scheduled tasks)

## License

MIT
# suidex-lp-deposit-bot
