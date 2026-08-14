const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkSchema() {
    console.log('Checking database tables...');
    const { data, error } = await supabase
        .from('pg_tables')
        .select('tablename')
        .eq('schemaname', 'public');

    if (error) {
        // Fallback: try to select from a known table to see if it works
        console.log('Error listing tables from pg_tables, trying direct select on known tables...');
        const tables = ['families', 'products', 'settings', 'product_variants', 'providers', 'groups', 'units', 'values'];
        for (const table of tables) {
            const { error: tError } = await supabase.from(table).select('count', { count: 'exact', head: true });
            if (tError) {
                console.log(`- ${table}: ERROR (${tError.code} - ${tError.message})`);
            } else {
                console.log(`- ${table}: OK`);
            }
        }
    } else {
        data.forEach(t => console.log(`- ${t.tablename}`));
    }
}

checkSchema();
