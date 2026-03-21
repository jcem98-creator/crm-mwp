import pg from "pg";
const { Pool } = pg;
import { config } from "../config.js";

interface Message {
    id?: number;
    role: string;
    content: string;
    timestamp: string;
}

export class PostgresMemoryDB {
    private pool: pg.Pool | null = null;

    public async initialize() {
        if (!this.pool) {
            this.pool = new Pool({
                host: config.PGHOST,
                port: config.PGPORT,
                user: config.PGUSER,
                password: config.PGPASSWORD,
                database: config.PGDATABASE,
                connectionTimeoutMillis: 5000, // 5 segundos de espera máximo
                // SSL suele ser necesario en algunos VPS, pero por ahora lo dejamos opcional
                // ssl: { rejectUnauthorized: false }
            });

            const client = await this.pool.connect();
            try {
                await client.query(`
                    CREATE TABLE IF NOT EXISTS messages (
                        id SERIAL PRIMARY KEY,
                        chat_id TEXT NOT NULL,
                        role TEXT NOT NULL,
                        content TEXT NOT NULL,
                        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                `);

                await client.query(`
                    CREATE TABLE IF NOT EXISTS leads_status (
                        chat_id TEXT PRIMARY KEY,
                        last_bot_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        followup_count INTEGER DEFAULT 0,
                        needs_followup BOOLEAN DEFAULT FALSE,
                        name TEXT,
                        package_interest TEXT,
                        desired_date TEXT,
                        status TEXT DEFAULT 'nuevo',
                        paid_amount REAL DEFAULT 0,
                        notes TEXT
                    );
                `);

                console.log(`[DB] PostgreSQL conectado a ${config.PGHOST} y tablas verificadas.`);
            } finally {
                client.release();
            }
        }
    }

    public async addMessage(chatId: string | number, role: string, content: string): Promise<void> {
        await this.initialize();
        await this.pool!.query(
            "INSERT INTO messages (chat_id, role, content) VALUES ($1, $2, $3)",
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
        amount?: number,
        notes?: string
    }): Promise<void> {
        await this.initialize();
        const { last_bot_at, needs_followup, reset_count, increment_count, name, package: pkg, date, status, amount, notes } = update;
        
        // Upsert lead status (PostgreSQL syntax)
        await this.pool!.query(
            `INSERT INTO leads_status (chat_id) VALUES ($1) ON CONFLICT (chat_id) DO NOTHING`,
            [String(chatId)]
        );

        if (last_bot_at) {
            await this.pool!.query(`UPDATE leads_status SET last_bot_message_at = CURRENT_TIMESTAMP WHERE chat_id = $1`, [String(chatId)]);
        }
        if (needs_followup !== undefined) {
            await this.pool!.query(`UPDATE leads_status SET needs_followup = $1 WHERE chat_id = $2`, [needs_followup, String(chatId)]);
        }
        if (reset_count) {
            await this.pool!.query(`UPDATE leads_status SET followup_count = 0 WHERE chat_id = $1`, [String(chatId)]);
        }
        if (increment_count) {
            await this.pool!.query(`UPDATE leads_status SET followup_count = followup_count + 1 WHERE chat_id = $1`, [String(chatId)]);
        }
        if (name !== undefined) {
            await this.pool!.query(`UPDATE leads_status SET name = $1 WHERE chat_id = $2`, [name, String(chatId)]);
        }
        if (pkg !== undefined) {
            await this.pool!.query(`UPDATE leads_status SET package_interest = $1 WHERE chat_id = $2`, [pkg, String(chatId)]);
        }
        if (date !== undefined) {
            await this.pool!.query(`UPDATE leads_status SET desired_date = $1 WHERE chat_id = $2`, [date, String(chatId)]);
        }
        if (status !== undefined) {
            await this.pool!.query(`UPDATE leads_status SET status = $1 WHERE chat_id = $2`, [status, String(chatId)]);
        }
        if (amount !== undefined) {
            await this.pool!.query(`UPDATE leads_status SET paid_amount = $1 WHERE chat_id = $2`, [amount, String(chatId)]);
        }
        if (notes !== undefined) {
            await this.pool!.query(`UPDATE leads_status SET notes = $1 WHERE chat_id = $2`, [notes, String(chatId)]);
        }
    }

    public async getAllLeads(): Promise<any[]> {
        await this.initialize();
        const res = await this.pool!.query(`SELECT * FROM leads_status ORDER BY last_bot_message_at DESC`);
        return res.rows;
    }

    public async getLeadsForFollowup(): Promise<any[]> {
        await this.initialize();
        const res = await this.pool!.query(`
            SELECT * FROM leads_status 
            WHERE needs_followup = TRUE 
            AND followup_count < 2
        `);
        return res.rows;
    }

    public async getMessages(chatId: string | number, limit: number = 50): Promise<Message[]> {
        await this.initialize();
        const res = await this.pool!.query(
            "SELECT role, content, timestamp FROM messages WHERE chat_id = $1 ORDER BY id DESC LIMIT $2",
            [String(chatId), limit]
        );
        return res.rows.reverse();
    }

    public async clearMemory(chatId: string | number): Promise<void> {
        await this.initialize();
        await this.pool!.query("DELETE FROM messages WHERE chat_id = $1", [String(chatId)]);
        await this.pool!.query("DELETE FROM leads_status WHERE chat_id = $1", [String(chatId)]);
    }

    public async close(): Promise<void> {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
        }
    }
}

export const memoryDb = new PostgresMemoryDB();
