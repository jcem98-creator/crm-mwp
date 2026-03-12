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

            // Asegurar columnas para Fase 2 (CRM)
            const columns = ["name", "package_interest", "desired_date", "status", "paid_amount"];
            for (const col of columns) {
                try {
                    if (col === "status") {
                        await this.db.exec(`ALTER TABLE leads_status ADD COLUMN status TEXT DEFAULT 'nuevo'`);
                    } else if (col === "paid_amount") {
                        await this.db.exec(`ALTER TABLE leads_status ADD COLUMN paid_amount REAL DEFAULT 0`);
                    } else {
                        await this.db.exec(`ALTER TABLE leads_status ADD COLUMN ${col} TEXT`);
                    }
                } catch (e) {
                    // Columna ya existe, ignorar
                }
            }
        }
    }

    public async addMessage(chatId: string | number, role: string, content: string): Promise<void> {
        await this.initialize();
        await this.db!.run(
            "INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)",
            [String(chatId), role, content]
        );
    }

    public async updateLeadStatus(chatId: string | number, update: { 
        last_bot_at?: boolean, 
        needs_followup?: boolean, 
        reset_count?: boolean, 
        increment_count?: boolean,
        name?: string,
        package?: string,
        date?: string,
        status?: string,
        amount?: number
    }): Promise<void> {
        await this.initialize();
        const { last_bot_at, needs_followup, reset_count, increment_count, name, package: pkg, date, status, amount } = update;
        
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
        if (name !== undefined) {
            await this.db!.run(`UPDATE leads_status SET name = ? WHERE chat_id = ?`, [name, String(chatId)]);
        }
        if (pkg !== undefined) {
            await this.db!.run(`UPDATE leads_status SET package_interest = ? WHERE chat_id = ?`, [pkg, String(chatId)]);
        }
        if (date !== undefined) {
            await this.db!.run(`UPDATE leads_status SET desired_date = ? WHERE chat_id = ?`, [date, String(chatId)]);
        }
        if (status !== undefined) {
            await this.db!.run(`UPDATE leads_status SET status = ? WHERE chat_id = ?`, [status, String(chatId)]);
        }
        if (amount !== undefined) {
            await this.db!.run(`UPDATE leads_status SET paid_amount = ? WHERE chat_id = ?`, [amount, String(chatId)]);
        }
    }

    public async getAllLeads(): Promise<any[]> {
        await this.initialize();
        return await this.db!.all(`SELECT * FROM leads_status ORDER BY last_bot_message_at DESC`);
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
