import { MongoClient, Db, Collection } from 'mongodb';
import { createClient, RedisClientType } from 'redis';
import { CONFIG } from './config';

// ============================================
// MongoDB Setup
// ============================================
let mongoClient: MongoClient;
let db: Db;

export interface Deposit {
  wallet: string;
  poolName: string;
  poolType: string;
  lpAmount: string;
  usdValue: number;
  timestamp: number;
  txDigest: string;
  competitionId: string;
  createdAt: Date;
}

export interface LeaderboardEntry {
  wallet: string;
  totalUSD: number;
  deposits: Array<{ pool: string; usd: number; txDigest: string }>;
  competitionId: string;
  lastUpdated: Date;
}

export interface Competition {
  competitionId: string;
  status: 'NOT_STARTED' | 'ACTIVE' | 'ENDED';
  startTime: Date;
  endTime: Date;
  winners?: Array<{
    rank: number;
    wallet: string;
    totalUSD: number;
    prize: number;
  }>;
  createdAt: Date;
}

export async function connectMongoDB() {
  try {
    mongoClient = new MongoClient(CONFIG.MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db();
    
    // Create indexes
    await db.collection('deposits').createIndex({ wallet: 1, competitionId: 1 });
    await db.collection('deposits').createIndex({ competitionId: 1, timestamp: -1 });
    await db.collection('leaderboard').createIndex({ competitionId: 1, totalUSD: -1 });
    await db.collection('competitions').createIndex({ status: 1 });
    
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    throw error;
  }
}

export function getDB(): Db {
  if (!db) throw new Error('Database not connected');
  return db;
}

export function getDepositsCollection(): Collection<Deposit> {
  return getDB().collection<Deposit>('deposits');
}

export function getLeaderboardCollection(): Collection<LeaderboardEntry> {
  return getDB().collection<LeaderboardEntry>('leaderboard');
}

export function getCompetitionsCollection(): Collection<Competition> {
  return getDB().collection<Competition>('competitions');
}

// ============================================
// Redis Setup
// ============================================
let redisClient: RedisClientType;

export async function connectRedis() {
  try {
    redisClient = createClient({ url: CONFIG.REDIS_URL });
    
    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    
    await redisClient.connect();
    console.log('✅ Redis connected');
  } catch (error) {
    console.error('❌ Redis connection failed:', error);
    throw error;
  }
}

export function getRedisClient(): RedisClientType {
  if (!redisClient) throw new Error('Redis not connected');
  return redisClient;
}

// ============================================
// Helper Functions
// ============================================

export async function addDeposit(deposit: Omit<Deposit, 'createdAt'>): Promise<void> {
  const depositsCol = getDepositsCollection();
  await depositsCol.insertOne({ ...deposit, createdAt: new Date() });
}

export async function updateLeaderboard(
  wallet: string,
  poolName: string,
  usdValue: number,
  txDigest: string,
  competitionId: string
): Promise<number> {
  const leaderboardCol = getLeaderboardCollection();
  
  const existing = await leaderboardCol.findOne({ wallet, competitionId });
  
  if (existing) {
    // Update existing entry
    await leaderboardCol.updateOne(
      { wallet, competitionId },
      {
        $set: {
          totalUSD: existing.totalUSD + usdValue,
          lastUpdated: new Date(),
        },
        $push: {
          deposits: { pool: poolName, usd: usdValue, txDigest },
        },
      }
    );
  } else {
    // Create new entry
    await leaderboardCol.insertOne({
      wallet,
      totalUSD: usdValue,
      deposits: [{ pool: poolName, usd: usdValue, txDigest }],
      competitionId,
      lastUpdated: new Date(),
    });
  }
  
  // Return rank
  const rank = await leaderboardCol.countDocuments({
    competitionId,
    totalUSD: { $gt: existing ? existing.totalUSD + usdValue : usdValue },
  });
  
  return rank + 1;
}

export async function getTopLeaderboard(competitionId: string, limit: number = 5) {
  const leaderboardCol = getLeaderboardCollection();
  return await leaderboardCol
    .find({ competitionId })
    .sort({ totalUSD: -1 })
    .limit(limit)
    .toArray();
}

export async function getCurrentCompetition(): Promise<Competition | null> {
  const competitionsCol = getCompetitionsCollection();
  return await competitionsCol.findOne({ status: 'ACTIVE' });
}

export async function createCompetition(startTime: Date): Promise<Competition> {
  const competitionsCol = getCompetitionsCollection();
  
  const endTime = new Date(startTime);
  endTime.setDate(endTime.getDate() + CONFIG.COMPETITION_DURATION_DAYS);
  
  const competition: Competition = {
    competitionId: `comp_${Date.now()}`,
    status: 'ACTIVE',
    startTime,
    endTime,
    createdAt: new Date(),
  };
  
  await competitionsCol.insertOne(competition);
  return competition;
}

export async function endCompetition(competitionId: string, winners: Competition['winners']) {
  const competitionsCol = getCompetitionsCollection();
  await competitionsCol.updateOne(
    { competitionId },
    { $set: { status: 'ENDED', winners } }
  );
}

export async function clearLeaderboard(competitionId: string) {
  const leaderboardCol = getLeaderboardCollection();
  await leaderboardCol.deleteMany({ competitionId });
}
