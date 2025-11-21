import dotenv from 'dotenv';

dotenv.config();

// Validate required env vars
const required = [
  'BOT_TOKEN',
  'CHAT_ID',
  'ADMIN_USER_IDS',
  'RPC_URL',
  'MONGODB_URI',
  'PACKAGE_ID',
  'FARM_ID',
  'VICTORY_SUI_PAIR',
  'VICTORY_USDC_PAIR'
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const CONFIG = {
  // Telegram
  BOT_TOKEN: process.env.BOT_TOKEN!,
  CHAT_ID: process.env.CHAT_ID!,
  ADMIN_USER_IDS: process.env.ADMIN_USER_IDS!.split(',').map(id => parseInt(id.trim())),

  // Blockchain
  RPC_URL: process.env.RPC_URL!,
  PACKAGE_ID: process.env.PACKAGE_ID!,
  FARM_ID: process.env.FARM_ID!,

  // Database
  MONGODB_URI: process.env.MONGODB_URI!,
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  // Settings
  COMPETITION_DURATION_DAYS: parseInt(process.env.COMPETITION_DURATION_DAYS || '7'),
  
  // Test Mode Settings
  TEST_MODE: process.env.TEST_MODE === 'true',
  TEST_COMPETITION_MINUTES: parseInt(process.env.TEST_COMPETITION_MINUTES || '10'),
  TEST_DAILY_UPDATE_MINUTES: parseInt(process.env.TEST_DAILY_UPDATE_MINUTES || '2'),
  
  DAILY_UPDATE_HOUR: parseInt(process.env.DAILY_UPDATE_HOUR || '0'),
  MIN_DEPOSIT_USD: parseFloat(process.env.MIN_DEPOSIT_USD || '1'),
};

export const CONTRACTS = {
  PACKAGE_ID: process.env.PACKAGE_ID!,
  FARM_ID: process.env.FARM_ID!,
  VICTORY_TOKEN: process.env.VICTORY_TOKEN!,
  SUI_TYPE: process.env.SUI_TYPE!,
  USDC_TYPE: process.env.USDC_TYPE!,
};

export const PAIRS = {
  VICTORY_SUI: {
    id: process.env.VICTORY_SUI_PAIR!,
    name: 'Victory/SUI',
    lpType: `${CONTRACTS.PACKAGE_ID}::pair::LPCoin<${CONTRACTS.SUI_TYPE},${CONTRACTS.VICTORY_TOKEN}>`,
    token0: CONTRACTS.SUI_TYPE,
    token1: CONTRACTS.VICTORY_TOKEN,
    token0Symbol: 'SUI',
    token1Symbol: 'VICTORY',
  },
  VICTORY_USDC: {
    id: process.env.VICTORY_USDC_PAIR!,
    name: 'Victory/USDC',
    lpType: `${CONTRACTS.PACKAGE_ID}::pair::LPCoin<${CONTRACTS.VICTORY_TOKEN},${CONTRACTS.USDC_TYPE}>`,
    token0: CONTRACTS.VICTORY_TOKEN,
    token1: CONTRACTS.USDC_TYPE,
    token0Symbol: 'VICTORY',
    token1Symbol: 'USDC',
  },
};

export const DECIMALS = {
  VICTORY: 9,
  SUI: 9,
  USDC: 6,
};

export const PRIZES = {
  1: 200000,
  2: 75000,
  3: 50000,
  4: 20000,
  5: 10000,
};

export const BANNERS = {
  LEADERBOARD: 'https://cryptomischief.mypinata.cloud/ipfs/bafybeicnrxucdkt5jvbpmsdc6y7baljkvit5hsdbg5rou7556mu7aoaqcq/leaderboard.png',
  WINNERS: 'https://cryptomischief.mypinata.cloud/ipfs/bafybeicnrxucdkt5jvbpmsdc6y7baljkvit5hsdbg5rou7556mu7aoaqcq/winners.png',
};