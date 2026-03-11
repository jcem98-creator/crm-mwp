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

    private async init() {
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
                )
            `);
        }
    }

    public async addMessage(chatId: string | number, role: string, content: string): Promise<void> {
        await this.init();
        await this.db!.run(
            "INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)",
            [String(chatId), role, content]
        );
    }

    public async getMessages(chatId: string | number, limit: number = 50): Promise<Message[]> {
        await this.init();
        const rows = await this.db!.all<Message[]>(
            "SELECT role, content, timestamp FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT ?",
            [String(chatId), limit]
        );
        return rows.reverse();
    }

    public async clearMemory(chatId: string | number): Promise<void> {
        await this.init();
        await this.db!.run("DELETE FROM messages WHERE chat_id = ?", [String(chatId)]);
    }
}

export const memoryDb = new SQLiteMemoryDB();
