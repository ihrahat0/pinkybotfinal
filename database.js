import Database from 'better-sqlite3';
const db = new Database('bot_data.sqlite');

// Initialize the database
export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY,
      wallets TEXT,
      active_wallet_index INTEGER
    )
  `);
}

// Save user data
export function saveUserData(userId, wallets, activeWalletIndex) {
  const stmt = db.prepare('INSERT OR REPLACE INTO users (user_id, wallets, active_wallet_index) VALUES (?, ?, ?)');
  stmt.run(userId, JSON.stringify(wallets), activeWalletIndex);
}

// Load user data
export function loadUserData(userId) {
  const stmt = db.prepare('SELECT * FROM users WHERE user_id = ?');
  const row = stmt.get(userId);
  if (row) {
    return {
      wallets: JSON.parse(row.wallets),
      activeWalletIndex: row.active_wallet_index
    };
  }
  return null;
}