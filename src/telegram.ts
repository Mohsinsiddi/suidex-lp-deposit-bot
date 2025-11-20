import TelegramBot from 'node-telegram-bot-api';
import { CONFIG } from './config';
import { getTopLeaderboard, getCurrentCompetition } from './database';

let bot: TelegramBot;

export function initTelegram(): TelegramBot {
  bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true });
  console.log('✅ Telegram bot initialized');
  return bot;
}

export function getBot(): TelegramBot {
  if (!bot) throw new Error('Bot not initialized');
  return bot;
}

// ============================================
// Message Formatters
// ============================================

export function formatDepositAlert(data: {
  wallet: string;
  poolName: string;
  lpAmount: string;
  usdValue: number;
  timestamp: number;
  txDigest: string;
  rank?: number;
}): string {
  const shortWallet = `${data.wallet.slice(0, 6)}...${data.wallet.slice(-6)}`;
  const date = new Date(data.timestamp * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const shortTx = `${data.txDigest.slice(0, 8)}...${data.txDigest.slice(-8)}`;
  
  return `🔥 New LP Deposit Detected!

Wallet: ${shortWallet}
Pool: ${data.poolName}
Amount: ${data.lpAmount} LP
Value: $${data.usdValue.toFixed(2)}
Time: ${date} UTC
Transaction: ${shortTx}

Current Rank: #${data.rank || '?'}`;
}

export async function formatLeaderboard(): Promise<string> {
  const competition = await getCurrentCompetition();
  
  if (!competition) {
    return `🏆 SuiDeX Biggest Stake Leaderboard

⏸️ No active competition

Use /start to begin a new competition!`;
  }
  
  const top5 = await getTopLeaderboard(competition.competitionId, 5);
  
  if (top5.length === 0) {
    return `🏆 SuiDeX Biggest Stake Leaderboard

📊 Competition Active
🏁 Ends: ${competition.endTime.toISOString().split('T')[0]}

No deposits yet. Be the first!`;
  }
  
  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
  const lines = top5.map((entry, idx) => {
    const shortWallet = `${entry.wallet.slice(0, 6)}...${entry.wallet.slice(-6)}`;
    const poolInfo = entry.deposits.map(d => d.pool).join(', ');
    return `${medals[idx]} ${idx + 1}) $${entry.totalUSD.toFixed(2)} — ${shortWallet} — ${poolInfo}`;
  });
  
  return `🏆 SuiDeX Biggest Stake Leaderboard

${lines.join('\n')}

🏁 Competition ends: ${competition.endTime.toISOString().split('T')[0]}

Use /lb anytime to check the live leaderboard.`;
}

export function formatWinnerAnnouncement(winners: Array<{
  rank: number;
  wallet: string;
  totalUSD: number;
  prize: number;
}>): string {
  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
  
  const lines = winners.map((w, idx) => {
    const shortWallet = `${w.wallet.slice(0, 6)}...${w.wallet.slice(-6)}`;
    return `${medals[idx]} ${w.rank}${getSuffix(w.rank)}: ${shortWallet} — $${w.totalUSD.toFixed(2)} → ${w.prize.toLocaleString()} VICTORY`;
  });
  
  return `🎉 COMPETITION WINNERS ANNOUNCED 🎉

${lines.join('\n')}

Total Rewards: 355,000 VICTORY ($1,000)
Vesting: 30 days (daily distribution)

CSV exported for reward distribution.
Next competition starts when admin runs /start`;
}

function getSuffix(rank: number): string {
  if (rank === 1) return 'st';
  if (rank === 2) return 'nd';
  if (rank === 3) return 'rd';
  return 'th';
}

// ============================================
// Send Functions
// ============================================

export async function sendDepositAlert(data: Parameters<typeof formatDepositAlert>[0]) {
  const message = formatDepositAlert(data);
  await bot.sendMessage(CONFIG.CHAT_ID, message);
}

export async function sendDailyLeaderboard() {
  const message = await formatLeaderboard();
  await bot.sendMessage(CONFIG.CHAT_ID, message);
}

export async function sendWinnerAnnouncement(winners: Parameters<typeof formatWinnerAnnouncement>[0]) {
  const message = formatWinnerAnnouncement(winners);
  await bot.sendMessage(CONFIG.CHAT_ID, message);
}

// ============================================
// Admin Check
// ============================================

export function isAdmin(userId: number): boolean {
  return CONFIG.ADMIN_USER_IDS.includes(userId);
}
