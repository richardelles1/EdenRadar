import {
  users, type User, type InsertUser,
  searchHistory, type SearchHistory, type InsertSearchHistory,
  savedAssets, type SavedAsset, type InsertSavedAsset,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getSearchHistory(limit?: number): Promise<SearchHistory[]>;
  createSearchHistory(entry: InsertSearchHistory): Promise<SearchHistory>;

  getSavedAssets(): Promise<SavedAsset[]>;
  getSavedAsset(id: number): Promise<SavedAsset | undefined>;
  createSavedAsset(asset: InsertSavedAsset): Promise<SavedAsset>;
  deleteSavedAsset(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getSearchHistory(limit = 20): Promise<SearchHistory[]> {
    return db.select().from(searchHistory).orderBy(desc(searchHistory.createdAt)).limit(limit);
  }

  async createSearchHistory(entry: InsertSearchHistory): Promise<SearchHistory> {
    const [row] = await db.insert(searchHistory).values(entry).returning();
    return row;
  }

  async getSavedAssets(): Promise<SavedAsset[]> {
    return db.select().from(savedAssets).orderBy(desc(savedAssets.savedAt));
  }

  async getSavedAsset(id: number): Promise<SavedAsset | undefined> {
    const [asset] = await db.select().from(savedAssets).where(eq(savedAssets.id, id));
    return asset;
  }

  async createSavedAsset(asset: InsertSavedAsset): Promise<SavedAsset> {
    const [row] = await db.insert(savedAssets).values(asset).returning();
    return row;
  }

  async deleteSavedAsset(id: number): Promise<void> {
    await db.delete(savedAssets).where(eq(savedAssets.id, id));
  }
}

export const storage = new DatabaseStorage();
