const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function inspect() {
    console.log('Inspecting settings content...');
    const { data, error } = await supabase.from('settings').select('*');
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Data found:', JSON.stringify(data, null, 2));
    }
}

inspect();
