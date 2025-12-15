import { SuiClient } from '@mysten/sui.js/client';
import { CONFIG, CONTRACTS, PAIRS, DECIMALS } from './config';
import { getRedisClient } from './database';

interface PairReserves {
  reserve0: string;
  reserve1: string;
  totalSupply: string;
}

// ============================================
// Event Listener - POLLING WITH DEDUPLICATION
// ============================================
export class EventListener {
  private client: SuiClient;
  private onStakeCallback?: (event: StakeEvent) => Promise<void>;
  private pollingInterval?: NodeJS.Timeout;
  private seenEvents: Set<string> = new Set();
  private isPolling: boolean = false;
  private botStartTime: number;

  constructor() {
    this.client = new SuiClient({ url: CONFIG.RPC_URL });
    this.botStartTime = Date.now();
  }

  async start(onStake: (event: StakeEvent) => Promise<void>) {
    this.onStakeCallback = onStake;
    console.log('🎧 Starting event listener...');
    console.log(`⏰ Bot start time: ${new Date(this.botStartTime).toLocaleString()}`);
    
    await this.initializeSeenEvents();
    
    console.log('✅ Event listener active (polling every 5 seconds)');
    console.log('\n📋 TARGET POOLS:');
    console.log(`   Victory/SUI LP:  ${PAIRS.VICTORY_SUI.lpType}`);
    console.log(`   Victory/USDC LP: ${PAIRS.VICTORY_USDC.lpType}`);
    console.log(`   BTC/VICTORY LP:  ${PAIRS.BTC_VICTORY.lpType}\n`);
    
    this.pollingInterval = setInterval(async () => {
      await this.pollEvents();
    }, 5000);
  }

  private async initializeSeenEvents() {
    console.log('🔍 Loading recent Staked events to mark as seen...');
    
    try {
      const events = await this.client.queryEvents({
        query: {
          MoveEventType: `${CONTRACTS.PACKAGE_ID}::farm::Staked`
        },
        order: 'descending',
        limit: 50,
      });

      console.log(`   Found ${events.data.length} recent Staked events`);

      for (const event of events.data) {
        const parsedJson = event.parsedJson as any;
        
        const poolTypeObj = parsedJson.pool_type;
        const poolType = typeof poolTypeObj === 'string' ? poolTypeObj : poolTypeObj.name;
        
        if (this.isTargetPool(poolType)) {
          this.seenEvents.add(event.id.txDigest);
        }
      }
      
      console.log(`✅ Marked ${this.seenEvents.size} existing events as seen`);
      
    } catch (error) {
      console.error('❌ Error initializing seen events:', error);
    }
  }

  private async pollEvents() {
    if (this.isPolling) return;
    
    this.isPolling = true;
    
    try {
      const events = await this.client.queryEvents({
        query: {
          MoveEventType: `${CONTRACTS.PACKAGE_ID}::farm::Staked`
        },
        order: 'descending',
        limit: 50,
      });

      if (events.data.length === 0) {
        this.isPolling = false;
        return;
      }

      events.data.reverse();

      let newEventsCount = 0;
      let alreadySeenCount = 0;
      let oldEventsSkipped = 0;
      let processedSuccessfully = 0;

      for (const event of events.data) {
        const digest = event.id.txDigest;
        const eventTimestamp = parseInt(event.timestampMs!);

        if (this.seenEvents.has(digest)) {
          alreadySeenCount++;
          continue;
        }

        this.seenEvents.add(digest);
        newEventsCount++;

        if (eventTimestamp <= this.botStartTime) {
          oldEventsSkipped++;
          continue;
        }

        const processed = await this.handleEvent(event);
        if (processed) {
          processedSuccessfully++;
        }
      }

      if (newEventsCount > 0 || alreadySeenCount > 0) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] New: ${newEventsCount} | Processed: ${processedSuccessfully} | Already seen: ${alreadySeenCount} | Old: ${oldEventsSkipped} | Tracked: ${this.seenEvents.size}`);
      }

      if (this.seenEvents.size > 1000) {
        const sortedDigests = Array.from(this.seenEvents);
        const keep = sortedDigests.slice(-500);
        this.seenEvents.clear();
        keep.forEach(d => this.seenEvents.add(d));
        console.log(`🧹 Cleaned up seen set: ${this.seenEvents.size} events kept`);
      }

    } catch (error) {
      console.error('❌ Error polling events:', error);
    } finally {
      this.isPolling = false;
    }
  }

  private async handleEvent(event: any): Promise<boolean> {
    try {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`🔍 NEW STAKED EVENT`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`TX Digest: ${event.id.txDigest}`);

      const parsedJson = event.parsedJson as any;
      const staker = parsedJson.staker;
      
      const poolTypeObj = parsedJson.pool_type;
      const poolType = typeof poolTypeObj === 'string' ? poolTypeObj : poolTypeObj.name;
      
      const amount = parsedJson.amount;
      const timestamp = parsedJson.timestamp;

      console.log(`\n📊 Event Details:`);
      console.log(`   Staker:    ${staker}`);
      console.log(`   Pool Type: ${poolType}`);
      console.log(`   Amount:    ${amount}`);
      console.log(`   Timestamp: ${timestamp}`);

      console.log(`\n🎯 Checking Pool Match...`);

      if (!this.isTargetPool(poolType)) {
        console.log(`   ❌ Not a target pool`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
        return false;
      }

      const poolName = this.getPoolName(poolType);
      console.log(`\n✅ TARGET POOL MATCHED: ${poolName}`);
      console.log(`🔥 NEW DEPOSIT: ${staker.slice(0, 6)}...${staker.slice(-4)}`);

      if (this.onStakeCallback) {
        console.log(`📤 Sending Telegram alert...`);
        await this.onStakeCallback({
          staker,
          poolType,
          poolName,
          lpAmount: amount,
          timestamp: parseInt(timestamp),
          txDigest: event.id.txDigest,
        });
        console.log(`✅ Alert sent successfully!`);
      } else {
        console.log(`⚠️  WARNING: No callback registered!`);
      }

      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
      return true;
    } catch (error) {
      console.error('❌ Error handling event:', error);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
      return false;
    }
  }

  private isTargetPool(poolType: string): boolean {
    const normalizeType = (type: string) => {
      return type
        .replace(/0x/g, '')
        .replace(/\b0+(\d+)\b/g, '$1');
    };
    
    const normalizedPoolType = normalizeType(poolType);
    const normalizedVictorySUI = normalizeType(PAIRS.VICTORY_SUI.lpType);
    const normalizedVictoryUSDC = normalizeType(PAIRS.VICTORY_USDC.lpType);
    const normalizedBtcVictory = normalizeType(PAIRS.BTC_VICTORY.lpType);
    
    return (
      normalizedPoolType === normalizedVictorySUI ||
      normalizedPoolType === normalizedVictoryUSDC ||
      normalizedPoolType === normalizedBtcVictory
    );
  }

  private getPoolName(poolType: string): string {
    const normalizeType = (type: string) => {
      return type
        .replace(/0x/g, '')
        .replace(/\b0+(\d+)\b/g, '$1');
    };
    
    const normalizedPoolType = normalizeType(poolType);
    const normalizedVictorySUI = normalizeType(PAIRS.VICTORY_SUI.lpType);
    const normalizedVictoryUSDC = normalizeType(PAIRS.VICTORY_USDC.lpType);
    const normalizedBtcVictory = normalizeType(PAIRS.BTC_VICTORY.lpType);
    
    if (normalizedPoolType === normalizedVictorySUI) return PAIRS.VICTORY_SUI.name;
    if (normalizedPoolType === normalizedVictoryUSDC) return PAIRS.VICTORY_USDC.name;
    if (normalizedPoolType === normalizedBtcVictory) return PAIRS.BTC_VICTORY.name;
    return 'Unknown Pool';
  }

  async stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      console.log('🛑 Event listener stopped');
    }
  }
}

export interface StakeEvent {
  staker: string;
  poolType: string;
  poolName: string;
  lpAmount: string;
  timestamp: number;
  txDigest: string;
}

// ============================================
// Price Oracle
// ============================================
export class PriceOracle {
  private client: SuiClient;

  constructor() {
    this.client = new SuiClient({ url: CONFIG.RPC_URL });
  }

  async calculateLPValue(poolType: string, lpAmount: bigint): Promise<number> {
    const pool = this.getPoolConfig(poolType);
    const reserves = await this.getPoolReservesDirect(pool.id);
    
    const [token0Price, token1Price] = await Promise.all([
      this.getTokenPrice(pool.token0),
      this.getTokenPrice(pool.token1),
    ]);

    const reserve0Decimal = Number(reserves.reserve0) / Math.pow(10, this.getDecimals(pool.token0));
    const reserve1Decimal = Number(reserves.reserve1) / Math.pow(10, this.getDecimals(pool.token1));
    
    const token0Value = reserve0Decimal * token0Price;
    const token1Value = reserve1Decimal * token1Price;
    const totalPoolValue = token0Value + token1Value;

    const totalSupplyDecimal = Number(reserves.totalSupply) / 1e9;
    const lpTokenPrice = totalPoolValue / totalSupplyDecimal;
    
    const lpAmountDecimal = Number(lpAmount) / 1e9;
    const depositUSD = lpAmountDecimal * lpTokenPrice;

    console.log(`💰 ${pool.name} = $${depositUSD.toFixed(2)}`);
    return depositUSD;
  }

  private async getPoolReservesDirect(pairId: string): Promise<PairReserves> {
    const redis = getRedisClient();
    const cacheKey = `reserves:${pairId}`;
    
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const pair = await this.client.getObject({
      id: pairId,
      options: { showContent: true },
    });

    if (!pair.data?.content || pair.data.content.dataType !== 'moveObject') {
      throw new Error(`Failed to fetch pair ${pairId}`);
    }

    const fields = pair.data.content.fields as any;
    
    const reserves: PairReserves = {
      reserve0: fields.reserve0,
      reserve1: fields.reserve1,
      totalSupply: fields.total_supply,
    };

    await redis.setEx(cacheKey, 10, JSON.stringify(reserves));
    return reserves;
  }

  private async getTokenPrice(tokenType: string): Promise<number> {
    const redis = getRedisClient();
    const cacheKey = `price:${this.getTokenSymbol(tokenType)}`;
    
    const cached = await redis.get(cacheKey);
    if (cached) {
      return parseFloat(cached);
    }

    let price: number;

    if (tokenType === CONTRACTS.SUI_TYPE) {
      price = await this.getSUIPriceFromCoinGecko();
    } else if (tokenType === CONTRACTS.USDC_TYPE) {
      price = 1.0;
    } else if (tokenType === CONTRACTS.VICTORY_TOKEN) {
      price = await this.getVictoryPrice();
    } else if (tokenType === CONTRACTS.WBTC_TYPE) {
      price = await this.getBTCPriceFromCoinGecko();
    } else {
      throw new Error(`Unknown token type: ${tokenType}`);
    }

    await redis.setEx(cacheKey, 60, price.toString());
    return price;
  }

  private async getVictoryPrice(): Promise<number> {
    const reserves = await this.getPoolReservesDirect(PAIRS.VICTORY_USDC.id);
    const victoryReserve = Number(reserves.reserve0) / Math.pow(10, DECIMALS.VICTORY);
    const usdcReserve = Number(reserves.reserve1) / Math.pow(10, DECIMALS.USDC);
    return usdcReserve / victoryReserve;
  }

  private async getSUIPriceFromCoinGecko(): Promise<number> {
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=sui&vs_currencies=usd',
        { signal: AbortSignal.timeout(5000) }
      );
      const data: any = await response.json();
      console.log(`💲 SUI Price from CoinGecko: $${data.sui?.usd}`);
      return data.sui?.usd || 3.5;
    } catch (error) {
      console.warn('⚠️  CoinGecko API failed, using fallback $3.50');
      return 3.5;
    }
  }

  private async getBTCPriceFromCoinGecko(): Promise<number> {
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
        { signal: AbortSignal.timeout(5000) }
      );
      const data: any = await response.json();
      console.log(`💲 BTC Price from CoinGecko: $${data.bitcoin?.usd}`);
      return data.bitcoin?.usd || 100000;
    } catch (error) {
      console.warn('⚠️  CoinGecko API failed, using fallback $100,000');
      return 100000;
    }
  }

  private getPoolConfig(poolType: string) {
    const normalizeType = (type: string) => {
      return type
        .replace(/0x/g, '')
        .replace(/\b0+(\d+)\b/g, '$1');
    };
    
    const normalizedPoolType = normalizeType(poolType);
    const normalizedVictorySUI = normalizeType(PAIRS.VICTORY_SUI.lpType);
    const normalizedVictoryUSDC = normalizeType(PAIRS.VICTORY_USDC.lpType);
    const normalizedBtcVictory = normalizeType(PAIRS.BTC_VICTORY.lpType);
    
    if (normalizedPoolType === normalizedVictorySUI) return PAIRS.VICTORY_SUI;
    if (normalizedPoolType === normalizedVictoryUSDC) return PAIRS.VICTORY_USDC;
    if (normalizedPoolType === normalizedBtcVictory) return PAIRS.BTC_VICTORY;
    throw new Error(`Unknown pool type: ${poolType}`);
  }

  private getDecimals(tokenType: string): number {
    if (tokenType === CONTRACTS.SUI_TYPE) return DECIMALS.SUI;
    if (tokenType === CONTRACTS.USDC_TYPE) return DECIMALS.USDC;
    if (tokenType === CONTRACTS.VICTORY_TOKEN) return DECIMALS.VICTORY;
    if (tokenType === CONTRACTS.WBTC_TYPE) return DECIMALS.WBTC;
    throw new Error(`Unknown token decimals: ${tokenType}`);
  }

  private getTokenSymbol(tokenType: string): string {
    if (tokenType === CONTRACTS.SUI_TYPE) return 'SUI';
    if (tokenType === CONTRACTS.USDC_TYPE) return 'USDC';
    if (tokenType === CONTRACTS.VICTORY_TOKEN) return 'VICTORY';
    if (tokenType === CONTRACTS.WBTC_TYPE) return 'BTC';
    return 'UNKNOWN';
  }
}