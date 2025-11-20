import cron from 'node-cron';
import {
  connectMongoDB,
  connectRedis,
  addDeposit,
  updateLeaderboard,
  getCurrentCompetition,
} from './database';
import { EventListener, PriceOracle, StakeEvent } from './blockchain';
import {
  initTelegram,
  sendDepositAlert,
  sendDailyLeaderboard,
  isAdmin,
  formatLeaderboard,
  formatDepositHistory,
} from './telegram';
import {
  startNewCompetition,
  checkCompetitionEnd,
  manualResetLeaderboard,
} from './competition';
import { CONFIG } from './config';

// ============================================
// Main Application
// ============================================

let eventListener: EventListener;
let priceOracle: PriceOracle;

async function main() {
  console.log('🚀 Starting SuiDeX Biggest Stake Bot...\n');
  
  try {
    // Connect databases
    await connectMongoDB();
    await connectRedis();
    
    // Initialize services
    const bot = initTelegram();
    priceOracle = new PriceOracle();
    eventListener = new EventListener();
    
    // Setup Telegram commands
    setupCommands(bot);
    
    // Start event listener
    await eventListener.start(handleStakeEvent);
    
    // Setup cron jobs
    setupCronJobs();
    
    console.log('\n✅ Bot is running!');
    console.log('📊 Monitoring Victory/SUI and Victory/USDC pools');
    console.log('🎯 Commands: /lb, /deposits <wallet>, /start, /resetlb, /addstake');
    
  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

// ============================================
// Event Handler
// ============================================

async function handleStakeEvent(event: StakeEvent) {
  try {
    console.log(`\n🔄 Processing deposit: ${event.staker.slice(0, 8)}...`);
    
    // Calculate USD value
    const lpAmountBigInt = BigInt(event.lpAmount);
    const usdValue = await priceOracle.calculateLPValue(event.poolType, lpAmountBigInt);
    
    if (usdValue < CONFIG.MIN_DEPOSIT_USD) {
      console.log(`⏭️  Skipping small deposit: $${usdValue.toFixed(2)}`);
      return;
    }
    
    // Get current competition (or use 'tracking_only' if none active)
    const competition = await getCurrentCompetition();
    const competitionId = competition?.competitionId || 'tracking_only';
    
    // Store deposit
    await addDeposit({
      wallet: event.staker,
      poolName: event.poolName,
      poolType: event.poolType,
      lpAmount: event.lpAmount,
      usdValue,
      timestamp: event.timestamp,
      txDigest: event.txDigest,
      competitionId,
    });
    
    // Update leaderboard (only if competition active)
    let rank: number | undefined;
    if (competition) {
      rank = await updateLeaderboard(
        event.staker,
        event.poolName,
        usdValue,
        event.txDigest,
        competitionId
      );
    }
    
    console.log(`✅ Deposit processed: $${usdValue.toFixed(2)} - Rank: ${rank || 'N/A'}`);
    
    // Send Telegram alert
    await sendDepositAlert({
      wallet: event.staker,
      poolName: event.poolName,
      lpAmount: (Number(lpAmountBigInt) / 1e9).toFixed(4),
      usdValue,
      timestamp: event.timestamp,
      txDigest: event.txDigest,
      rank,
    });
    
  } catch (error) {
    console.error('❌ Error processing deposit:', error);
  }
}

// ============================================
// Telegram Commands
// ============================================

function setupCommands(bot: any) {
  // /lb - Show leaderboard (anyone can use)
  bot.onText(/\/lb/, async (msg: any) => {
    try {
      const message = await formatLeaderboard();
      await bot.sendMessage(msg.chat.id, message, { 
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true 
      });
    } catch (error) {
      console.error('Error showing leaderboard:', error);
      await bot.sendMessage(msg.chat.id, '❌ Error fetching leaderboard');
    }
  });
  
  // /deposits <wallet> - Show user deposit history (anyone can use)
  bot.onText(/\/deposits(?:\s+(.+))?/, async (msg: any, match: any) => {
    try {
      const wallet = match[1]?.trim();
      
      if (!wallet) {
        await bot.sendMessage(
          msg.chat.id, 
          '📋 *Usage:* /deposits <wallet\\_address>\n\n' +
          '_Example:_ `/deposits 0xabc123\\.\\.\\.`',
          { parse_mode: 'MarkdownV2' }
        );
        return;
      }
      
      // Validate wallet format
      if (!wallet.startsWith('0x') || wallet.length < 10) {
        await bot.sendMessage(msg.chat.id, '❌ Invalid wallet address format');
        return;
      }
      
      const message = await formatDepositHistory(wallet);
      await bot.sendMessage(msg.chat.id, message, { 
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true 
      });
    } catch (error) {
      console.error('Error showing deposits:', error);
      await bot.sendMessage(msg.chat.id, '❌ Error fetching deposit history');
    }
  });
  
  // /start - Start competition (admin only)
  bot.onText(/\/start/, async (msg: any) => {
    if (!isAdmin(msg.from.id)) {
      return bot.sendMessage(msg.chat.id, '❌ Admin only command');
    }
    
    try {
      const result = await startNewCompetition();
      await bot.sendMessage(msg.chat.id, result);
    } catch (error) {
      console.error('Error starting competition:', error);
      await bot.sendMessage(msg.chat.id, '❌ Error starting competition');
    }
  });
  
  // /resetlb - Reset leaderboard (admin only)
  bot.onText(/\/resetlb/, async (msg: any) => {
    if (!isAdmin(msg.from.id)) {
      return bot.sendMessage(msg.chat.id, '❌ Admin only command');
    }
    
    try {
      const result = await manualResetLeaderboard();
      await bot.sendMessage(msg.chat.id, result);
    } catch (error) {
      console.error('Error resetting leaderboard:', error);
      await bot.sendMessage(msg.chat.id, '❌ Error resetting leaderboard');
    }
  });
  
  // /addstake - Manually add stake (admin only)
  // Format: /addstake <wallet> <pool> <usd_value>
  bot.onText(/\/addstake (.+) (.+) (.+)/, async (msg: any, match: any) => {
    if (!isAdmin(msg.from.id)) {
      return bot.sendMessage(msg.chat.id, '❌ Admin only command');
    }
    
    try {
      const [, wallet, pool, usdValueStr] = match;
      const usdValue = parseFloat(usdValueStr);
      
      if (isNaN(usdValue)) {
        return bot.sendMessage(msg.chat.id, '❌ Invalid USD value');
      }
      
      const competition = await getCurrentCompetition();
      if (!competition) {
        return bot.sendMessage(msg.chat.id, '❌ No active competition');
      }
      
      const rank = await updateLeaderboard(
        wallet,
        pool,
        usdValue,
        'manual_entry',
        competition.competitionId
      );
      
      await bot.sendMessage(
        msg.chat.id,
        `✅ Manually added stake:\nWallet: ${wallet}\nPool: ${pool}\nUSD: $${usdValue}\nRank: #${rank}`
      );
    } catch (error) {
      console.error('Error adding manual stake:', error);
      await bot.sendMessage(msg.chat.id, '❌ Error adding stake');
    }
  });
}

// ============================================
// Cron Jobs
// ============================================

function setupCronJobs() {
  // Daily leaderboard update at configured hour (default 00:00 UTC)
  const cronExpression = `0 ${CONFIG.DAILY_UPDATE_HOUR} * * *`;
  cron.schedule(cronExpression, async () => {
    console.log('📊 Running daily leaderboard update...');
    
    const competition = await getCurrentCompetition();
    if (competition) {
      await sendDailyLeaderboard();
    }
  });
  
  console.log(`⏰ Daily updates scheduled for ${CONFIG.DAILY_UPDATE_HOUR}:00 UTC`);
  
  // Check for competition end every hour
  cron.schedule('0 * * * *', async () => {
    await checkCompetitionEnd();
  });
  
  console.log('⏰ Competition end check scheduled (hourly)');
}

// ============================================
// Graceful Shutdown
// ============================================

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  if (eventListener) {
    await eventListener.stop();
  }
  
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled rejection:', error);
});

// Start the bot
main();