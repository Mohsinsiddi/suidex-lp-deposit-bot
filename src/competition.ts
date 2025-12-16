import { createObjectCsvWriter } from 'csv-writer';
import path from 'path';
import { mkdir } from 'fs/promises';
import {
  getCurrentCompetition,
  createCompetition,
  endCompetition,
  clearLeaderboard,
  getTopLeaderboard,
} from './database';
import { PRIZES, CONFIG } from './config';
import { sendWinnerAnnouncement, getBot } from './telegram';

// Helper to escape MarkdownV2 special characters
function escapeMarkdown(text: string | number): string {
  return String(text).replace(/[_*\[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

// Helper to format date and time
function formatDateTime(date: Date): string {
  return date.toISOString()
    .replace('T', ' ')
    .slice(0, 19) + ' UTC';
}

export async function startNewCompetition(): Promise<string> {
  const existing = await getCurrentCompetition();
  
  if (existing) {
    const endTime = formatDateTime(existing.endTime);
    return `❌ *Competition Already Active\\!*

📅 Ends: ${escapeMarkdown(endTime)}

Use /stop to end it early \\(admin only\\)`;
  }
  
  const competition = await createCompetition(new Date());
  const startTime = formatDateTime(competition.startTime);
  const endTime = formatDateTime(competition.endTime);
  const durationDays = CONFIG.TEST_MODE ? 
    `${CONFIG.TEST_COMPETITION_MINUTES} minutes \\(TEST MODE\\)` : 
    `${CONFIG.COMPETITION_DURATION_DAYS} days`;
  
  return `🏁 *COMPETITION STARTED\\!* 🏁

━━━━━━━━━━━━━━━━━━━━━━━━━━
🆔 *ID:* \`${escapeMarkdown(competition.competitionId)}\`
📅 *Start:* ${escapeMarkdown(startTime)}
🏁 *End:* ${escapeMarkdown(endTime)}
⏱️ *Duration:* ${durationDays}
━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 *TARGET POOLS:*
   • Victory/SUI LP
   • Victory/USDC LP
   • BTC/VICTORY LP

🏆 *TOTAL POOL: 1,000,000 VICTORY*
   🥇 1st: 500,000 VICTORY
   🥈 2nd: 200,000 VICTORY
   🥉 3rd: 125,000 VICTORY
   4️⃣ 4th: 75,000 VICTORY
   5️⃣ 5th: 50,000 VICTORY
   6️⃣ 6th: 10,000 VICTORY
   7️⃣ 7th: 10,000 VICTORY
   8️⃣ 8th: 10,000 VICTORY
   9️⃣ 9th: 10,000 VICTORY
   🔟 10th: 10,000 VICTORY

   🎲 *BONUS:* 2 random BTC/VICTORY stakers win $100 SUITRUMP each\\!

⏳ *Vesting:* 30 days \\(daily distribution\\)

📊 Track progress: /lb
📂 Your history: /deposits \\<wallet\\>
❓ Need help: /help

🚀 *MAY THE BIGGEST STAKER WIN\\!*`;
}

export async function checkCompetitionEnd() {
  const competition = await getCurrentCompetition();
  
  if (!competition) return;
  
  const now = new Date();
  
  if (now >= competition.endTime) {
    console.log('🏁 Competition ended, processing winners...');
    await processCompetitionEnd(competition.competitionId);
  }
}

export async function stopCompetition(): Promise<string> {
  const competition = await getCurrentCompetition();
  
  if (!competition) {
    return '❌ No active competition to stop';
  }
  
  console.log('🛑 Manually stopping competition:', competition.competitionId);
  
  // Process winners immediately
  await processCompetitionEnd(competition.competitionId);
  
  const startTime = formatDateTime(competition.startTime);
  const endTime = formatDateTime(new Date());
  
  return `🛑 *COMPETITION STOPPED\\!*

🆔 ID: \`${escapeMarkdown(competition.competitionId)}\`
📅 Started: ${escapeMarkdown(startTime)}
🏁 Ended: ${escapeMarkdown(endTime)}

✅ Winners have been announced\\!
📊 CSV exported for reward distribution\\.

Use /start to begin a new competition\\.`;
}

async function processCompetitionEnd(competitionId: string) {
  // Get top 5 winners
  const top5 = await getTopLeaderboard(competitionId, 10);
  
  const winners = top5.map((entry, idx) => ({
    rank: idx + 1,
    wallet: entry.wallet,
    totalUSD: entry.totalUSD,
    prize: PRIZES[(idx + 1) as keyof typeof PRIZES],
  }));
  
  // Save to database
  await endCompetition(competitionId, winners);
  
  // Export CSV
  const csvPath = await exportWinnersCSV(competitionId, winners);
  
  // Send announcement
  await sendWinnerAnnouncement(winners);
  
  // Send CSV to Telegram
  const bot = getBot();
  await bot.sendDocument(CONFIG.CHAT_ID, csvPath, {
    caption: `📊 Winners CSV for Competition ${competitionId}`,
  });
  
  // Clear leaderboard (but keep deposit history)
  await clearLeaderboard(competitionId);
  
  console.log(`✅ Competition ${competitionId} ended and processed`);
}

async function exportWinnersCSV(
  competitionId: string,
  winners: Array<{ rank: number; wallet: string; totalUSD: number; prize: number }>
): Promise<string> {
  const filename = `winners_${competitionId}.csv`;
  const exportDir = path.join(process.cwd(), 'exports');
  
  // Create exports directory if it doesn't exist
  await mkdir(exportDir, { recursive: true });
  
  const filepath = path.join(exportDir, filename);
  
  const csvWriter = createObjectCsvWriter({
    path: filepath,
    header: [
      { id: 'rank', title: 'Rank' },
      { id: 'wallet', title: 'Wallet' },
      { id: 'totalUSD', title: 'Total_USD' },
      { id: 'prize', title: 'Prize_Victory' },
    ],
  });
  
  await csvWriter.writeRecords(winners);
  
  console.log(`📄 CSV exported: ${filepath}`);
  return filepath;
}

export async function manualResetLeaderboard(): Promise<string> {
  const competition = await getCurrentCompetition();
  
  if (!competition) {
    return '❌ No active competition to reset';
  }
  
  await clearLeaderboard(competition.competitionId);
  await endCompetition(competition.competitionId, []);
  
  return `✅ Leaderboard reset for competition ${competition.competitionId}`;
}