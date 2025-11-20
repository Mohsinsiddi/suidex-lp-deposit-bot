import { createObjectCsvWriter } from 'csv-writer';
import path from 'path';
import {
  getCurrentCompetition,
  createCompetition,
  endCompetition,
  clearLeaderboard,
  getTopLeaderboard,
} from './database';
import { PRIZES ,CONFIG} from './config';
import { sendWinnerAnnouncement, getBot } from './telegram';

export async function startNewCompetition(): Promise<string> {
  const existing = await getCurrentCompetition();
  
  if (existing) {
    return `❌ Competition already active! Ends: ${existing.endTime.toISOString()}`;
  }
  
  const competition = await createCompetition(new Date());
  
  return `🏁 Competition Started!

Competition ID: ${competition.competitionId}
Start: ${competition.startTime.toISOString().split('T')[0]}
End: ${competition.endTime.toISOString().split('T')[0]}

Tracking deposits for 7 days. Good luck! 🚀`;
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

async function processCompetitionEnd(competitionId: string) {
  // Get top 5 winners
  const top5 = await getTopLeaderboard(competitionId, 5);
  
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
  const filepath = path.join(process.cwd(), 'exports', filename);
  
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
