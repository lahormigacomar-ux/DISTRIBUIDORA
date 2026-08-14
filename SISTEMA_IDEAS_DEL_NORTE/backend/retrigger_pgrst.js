const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function reload() {
    console.log('Attempting to trigger schema reload...');
    // In PostgREST, NOTIFY pgrst, 'reload schema' triggers a cache refresh
    // We can't run NOTIFY directly easily without a specialized client,
    // but we can try to run any DDL command on the table.

    const { error } = await supabase.rpc('reload_schema'); // if such RPC exists
    if (error) {
        console.log('RPC reload_schema failed, trying DDL rename/rename back...');
        // We can't run raw SQL via the client without an RPC function.
    }
}

// Instead, let's just try to select from a different schema or use a hack
async function hack() {
    console.log('Trying to access settings table through different means...');
    // Sometimes accessing it via a different query structure helps
    const { data, error } = await supabase.from('settings').select('*').limit(1);
    console.log('Select limit 1 result:', { data, error });
}

hack();
