import TelegramBot from 'node-telegram-bot-api';
import { CONFIG } from './config';
import { getTopLeaderboard, getCurrentCompetition, getDepositsCollection } from './database';

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

// Helper to escape MarkdownV2 special characters
function escapeMarkdown(text: string | number): string {
  return String(text).replace(/[_*\[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

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
  
  // Mainnet explorer links
  const walletUrl = `https://suiscan.xyz/mainnet/account/${data.wallet}`;
  const txUrl = `https://suiscan.xyz/mainnet/tx/${data.txDigest}`;
  
  const rankEmoji = data.rank === 1 ? '🥇' : data.rank === 2 ? '🥈' : data.rank === 3 ? '🥉' : '🏅';
  
  return `🚀 *NEW DEPOSIT DETECTED\\!*

👤 *Wallet:* [${escapeMarkdown(shortWallet)}](${walletUrl})
🏊 *Pool:* ${escapeMarkdown(data.poolName)}
💎 *LP Amount:* \`${escapeMarkdown(data.lpAmount)}\`
💰 *USD Value:* *$${escapeMarkdown(data.usdValue.toFixed(2))}*
⏰ *Time:* ${escapeMarkdown(date)} UTC
🔗 [View Transaction](${txUrl})

${rankEmoji} *Current Rank:* \\#${data.rank || '?'}`;
}

export async function formatLeaderboard(): Promise<string> {
  const competition = await getCurrentCompetition();
  
  if (!competition) {
    return `🏆 *SuiDeX Biggest Stake Leaderboard*

⏸️ No active competition

Admin: Use /start to begin\\!`;
  }
  
  const top5 = await getTopLeaderboard(competition.competitionId, 5);
  
  if (top5.length === 0) {
    const endDate = competition.endTime.toISOString().split('T')[0];
    return `🏆 *SuiDeX Biggest Stake Leaderboard*

📊 Competition Active
🏁 Ends: ${escapeMarkdown(endDate)}

💤 No deposits yet\\. Be the first\\!`;
  }
  
  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
  const lines = top5.map((entry, idx) => {
    const shortWallet = `${entry.wallet.slice(0, 6)}...${entry.wallet.slice(-6)}`;
    const walletUrl = `https://suiscan.xyz/mainnet/account/${entry.wallet}`;
    const pools = entry.deposits.map(d => d.pool).join(', ');
    return `${medals[idx]} [${escapeMarkdown(shortWallet)}](${walletUrl}) \\- *$${escapeMarkdown(entry.totalUSD.toFixed(2))}*
   💎 ${escapeMarkdown(pools)}`;
  }).join('\n\n');
  
  const endDate = competition.endTime.toISOString().split('T')[0];
  
  return `🏆 *SuiDeX Biggest Stake Leaderboard*

${lines}

🏁 *Competition ends:* ${escapeMarkdown(endDate)}

💡 _Use /lb anytime to check leaderboard_
💡 _Use /deposits <wallet\\> to see your history_`;
}

export async function formatDepositHistory(wallet: string): Promise<string> {
  const depositsCol = getDepositsCollection();
  const competition = await getCurrentCompetition();
  
  if (!competition) {
    return `📭 *No Active Competition*

Start one with /start`;
  }
  
  const deposits = await depositsCol
    .find({ 
      wallet, 
      competitionId: competition.competitionId 
    })
    .sort({ timestamp: -1 })
    .limit(10)
    .toArray();
  
  if (deposits.length === 0) {
    const shortWallet = `${wallet.slice(0, 6)}...${wallet.slice(-6)}`;
    return `📭 *No Deposits Found*

Wallet: \`${escapeMarkdown(shortWallet)}\`

No deposits in current competition\\.`;
  }
  
  const shortWallet = `${wallet.slice(0, 6)}...${wallet.slice(-6)}`;
  const walletUrl = `https://suiscan.xyz/mainnet/account/${wallet}`;
  const totalUSD = deposits.reduce((sum, d) => sum + d.usdValue, 0);
  
  const depositLines = deposits.map((d, idx) => {
    const date = new Date(d.timestamp * 1000).toISOString().split('T')[0];
    const txUrl = `https://suiscan.xyz/mainnet/tx/${d.txDigest}`;
    return `${idx + 1}\\. *${escapeMarkdown(d.poolName)}* \\- $${escapeMarkdown(d.usdValue.toFixed(2))}
   📅 ${escapeMarkdown(date)} \\| [TX](${txUrl})`;
  }).join('\n\n');
  
  return `📊 *DEPOSIT HISTORY*

👤 [${escapeMarkdown(shortWallet)}](${walletUrl})
💰 *Total:* *$${escapeMarkdown(totalUSD.toFixed(2))}*
📦 *Deposits:* ${deposits.length}

━━━━━━━━━━━━━━━━━━━━

${depositLines}

${deposits.length >= 10 ? '\n_Showing last 10 deposits_' : ''}`;
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
    const walletUrl = `https://suiscan.xyz/mainnet/account/${w.wallet}`;
    const suffix = w.rank === 1 ? 'st' : w.rank === 2 ? 'nd' : w.rank === 3 ? 'rd' : 'th';
    return `${medals[idx]} *${w.rank}${suffix} Place*
[${escapeMarkdown(shortWallet)}](${walletUrl})
💰 $${escapeMarkdown(w.totalUSD.toFixed(2))} → ${escapeMarkdown(w.prize.toLocaleString())} VICTORY`;
  }).join('\n\n');
  
  const totalPrize = winners.reduce((sum, w) => sum + w.prize, 0);
  
  return `🎉 *COMPETITION WINNERS* 🎉

${lines}

━━━━━━━━━━━━━━━━━━━━
🏆 *Total Rewards:* ${escapeMarkdown(totalPrize.toLocaleString())} VICTORY \\(\\~$1,000\\)
⏳ *Vesting:* 30 days \\(daily distribution\\)

📄 CSV exported for reward distribution\\.
🔄 Next competition starts when admin runs /start`;
}

// ============================================
// Send Functions
// ============================================

export async function sendDepositAlert(data: Parameters<typeof formatDepositAlert>[0]) {
  const message = formatDepositAlert(data);
  await bot.sendMessage(CONFIG.CHAT_ID, message, { 
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: true 
  });
}

export async function sendDailyLeaderboard() {
  const message = await formatLeaderboard();
  await bot.sendMessage(CONFIG.CHAT_ID, message, { 
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: true 
  });
}

export async function sendWinnerAnnouncement(winners: Parameters<typeof formatWinnerAnnouncement>[0]) {
  const message = formatWinnerAnnouncement(winners);
  await bot.sendMessage(CONFIG.CHAT_ID, message, { 
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: true 
  });
}

// ============================================
// Admin Check
// ============================================

export function isAdmin(userId: number): boolean {
  return CONFIG.ADMIN_USER_IDS.includes(userId);
}