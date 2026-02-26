import fs from 'fs';
import pg from 'pg';

const { Client } = pg;

const client = new Client({
    connectionString: 'postgres://postgres.wwhxnjxrdntxoznjyvls:fammum-kEnfyb-8dohvo@aws-0-ap-south-1.pooler.supabase.com:5432/postgres'
});

async function runSQL() {
    try {
        await client.connect();
        const sql = fs.readFileSync('/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website/supabase/migrations/20260224_apply_early_bird_sale_map.sql', 'utf8');
        const res = await client.query(sql);
        console.log("Migration executed successfully!");
        console.table(res.rows);
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await client.end();
    }
}

runSQL();
