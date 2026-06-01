import { pool } from "../server/db";

async function main() {
  const total = await pool.query("SELECT COUNT(*) FROM industry_profiles");
  console.log("industry_profiles total rows:", total.rows[0].count);

  const subscribed = await pool.query("SELECT COUNT(*) FROM industry_profiles WHERE subscribed_to_digest = true");
  console.log("subscribed rows:", subscribed.rows[0].count);

  const alerts = await pool.query("SELECT COUNT(*) FROM user_alerts");
  console.log("user_alerts total rows:", alerts.rows[0].count);

  const enabled = await pool.query("SELECT id, user_id, name, criteria_type, last_alert_sent_at, cadence FROM user_alerts WHERE enabled = true LIMIT 10");
  console.log("enabled alerts:", enabled.rows);

  await pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
