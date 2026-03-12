import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import { config } from "../config.js";

interface Message {
    id?: number;
    role: string;
    content: string;
    timestamp: string;
}

export class SQLiteMemoryDB {
    private db: Database | null = null;

    public async initialize() {
        if (!this.db) {
            this.db = await open({
                filename: config.DB_PATH || "./memory.db",
                driver: sqlite3.Database
            });

            await this.db.exec(`
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    chat_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS leads_status (
                    chat_id TEXT PRIMARY KEY,
                    last_bot_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    followup_count INTEGER DEFAULT 0,
                    needs_followup BOOLEAN DEFAULT 0
                );
            `);
        }
    }

    public async addMessage(chatId: string | number, role: string, content: string): Promise<void> {
        await this.initialize();
        await this.db!.run(
            "INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)",
            [String(chatId), role, content]
        );
    }

    public async updateLeadStatus(chatId: string | number, update: { last_bot_at?: boolean, needs_followup?: boolean, reset_count?: boolean, increment_count?: boolean }): Promise<void> {
        await this.initialize();
        const { last_bot_at, needs_followup, reset_count, increment_count } = update;
        
        // Upsert lead status
        await this.db!.run(
            `INSERT INTO leads_status (chat_id) VALUES (?) ON CONFLICT(chat_id) DO NOTHING`,
            [String(chatId)]
        );

        if (last_bot_at) {
            await this.db!.run(`UPDATE leads_status SET last_bot_message_at = CURRENT_TIMESTAMP WHERE chat_id = ?`, [String(chatId)]);
        }
        if (needs_followup !== undefined) {
            await this.db!.run(`UPDATE leads_status SET needs_followup = ? WHERE chat_id = ?`, [needs_followup ? 1 : 0, String(chatId)]);
        }
        if (reset_count) {
            await this.db!.run(`UPDATE leads_status SET followup_count = 0 WHERE chat_id = ?`, [String(chatId)]);
        }
        if (increment_count) {
            await this.db!.run(`UPDATE leads_status SET followup_count = followup_count + 1 WHERE chat_id = ?`, [String(chatId)]);
        }
    }

    public async getLeadsForFollowup(): Promise<any[]> {
        await this.initialize();
        // SELECT leads that need followup and compare timestamp (SQLite handles CURRENT_TIMESTAMP as UTC)
        // We'll check for 3 hours and 24 hours. 
        // Note: strftime('%s', 'now') gives unix timestamp
        return await this.db!.all(`
            SELECT * FROM leads_status 
            WHERE needs_followup = 1 
            AND followup_count < 2
        `);
    }

    public async getMessages(chatId: string | number, limit: number = 50): Promise<Message[]> {
        await this.initialize();
        const rows = await this.db!.all<Message[]>(
            "SELECT role, content, timestamp FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT ?",
            [String(chatId), limit]
        );
        return rows.reverse();
    }

    public async clearMemory(chatId: string | number): Promise<void> {
        await this.initialize();
        await this.db!.run("DELETE FROM messages WHERE chat_id = ?", [String(chatId)]);
        await this.db!.run("DELETE FROM leads_status WHERE chat_id = ?", [String(chatId)]);
    }
}

export const memoryDb = new SQLiteMemoryDB();
