import sqlite3 from 'sqlite3';
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

export interface DbSession {
  id: string;
  title: string;
  timestamp: number;
}

export interface DbLog {
  type: string;
  message: string;
  timestamp: number;
  source: 'agent' | 'gemini';
}

export class DatabaseManager {
  private static db: sqlite3.Database | null = null;

  public static init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const dbPath = path.join(app.getPath('userData'), 'sessions.db');
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('[DatabaseManager] Failed to open SQLite database:', err);
          reject(err);
          return;
        }

        this.db!.run('PRAGMA foreign_keys = ON;', (pragmaErr) => {
          if (pragmaErr) console.error('[DatabaseManager] Foreign keys pragma error:', pragmaErr);
          this.createTables().then(resolve).catch(reject);
        });
      });
    });
  }

  private static createTables(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('DB not initialized'));
      this.db.serialize(() => {
        this.db!.run(`
          CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            timestamp INTEGER NOT NULL
          );
        `, (err) => { if (err) reject(err); });

        this.db!.run(`
          CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            type TEXT NOT NULL,
            message TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            source TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
          );
        `, (err) => {
          if (err) reject(err); else resolve();
        });
      });
    });
  }

  public static getAllSessions(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('DB not initialized'));
      
      const query = `
        SELECT s.id, s.title, s.timestamp, l.type, l.message, l.timestamp as log_timestamp, l.source
        FROM sessions s
        LEFT JOIN logs l ON s.id = l.session_id
        ORDER BY s.timestamp DESC, l.timestamp ASC
      `;

      this.db.all(query, [], (err, rows) => {
        if (err) return reject(err);

        const sessionsMap: Record<string, any> = {};
        
        rows.forEach((row: any) => {
          if (!sessionsMap[row.id]) {
            sessionsMap[row.id] = {
              id: row.id,
              title: row.title,
              timestamp: row.timestamp,
              agentLogs: [],
              geminiLogs: []
            };
          }

          if (row.type && row.message) {
            const log = {
              type: row.type,
              message: row.message,
              timestamp: row.log_timestamp
            };
            if (row.source === 'agent') {
              sessionsMap[row.id].agentLogs.push(log);
            } else {
              sessionsMap[row.id].geminiLogs.push(log);
            }
          }
        });

        resolve(Object.values(sessionsMap));
      });
    });
  }

  public static saveSession(session: { id: string; title: string; timestamp: number; agentLogs: DbLog[]; geminiLogs: DbLog[] }): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('DB not initialized'));

      this.db.serialize(() => {
        this.db!.run('BEGIN TRANSACTION;');

        // 1. Insert or replace session
        const stmtSession = this.db!.prepare('INSERT OR REPLACE INTO sessions (id, title, timestamp) VALUES (?, ?, ?)');
        stmtSession.run([session.id, session.title, session.timestamp], (err) => {
          if (err) {
            this.db!.run('ROLLBACK;');
            reject(err);
            return;
          }
        });
        stmtSession.finalize();

        // 2. Clear old logs and insert new logs
        this.db!.run('DELETE FROM logs WHERE session_id = ?', [session.id], (err) => {
          if (err) {
            this.db!.run('ROLLBACK;');
            reject(err);
            return;
          }

          const stmtLog = this.db!.prepare('INSERT INTO logs (session_id, type, message, timestamp, source) VALUES (?, ?, ?, ?, ?)');
          
          let hasError = false;
          const allLogs = [
            ...session.agentLogs.map(l => ({ ...l, source: 'agent' as const })),
            ...session.geminiLogs.map(l => ({ ...l, source: 'gemini' as const }))
          ];

          for (const log of allLogs) {
            stmtLog.run([session.id, log.type, log.message, log.timestamp, log.source], (logErr) => {
              if (logErr) hasError = true;
            });
          }

          stmtLog.finalize((finErr) => {
            if (finErr || hasError) {
              this.db!.run('ROLLBACK;');
              reject(finErr || new Error('Insert log failed'));
            } else {
              this.db!.run('COMMIT;', (commitErr) => {
                if (commitErr) reject(commitErr); else resolve();
              });
            }
          });
        });
      });
    });
  }

  public static deleteSession(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('DB not initialized'));
      this.db.run('DELETE FROM sessions WHERE id = ?', [id], (err) => {
        if (err) reject(err); else resolve();
      });
    });
  }
}
