const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function test() {
    console.log('Testing Supabase Settings table...');
    const { data, error } = await supabase.from('settings').select('*');
    if (error) {
        console.error('Error selecting settings:', error);
    } else {
        console.log('Settings found:', data.length);
        data.forEach(d => console.log(`- ${d.key}`));
    }

    console.log('\nTesting direct select for catalog_config...');
    const { data: config, error: configError } = await supabase.from('settings').select('*').eq('key', 'catalog_config').single();
    if (configError) {
        console.error('Error selecting catalog_config:', configError);
    } else {
        console.log('catalog_config value:', JSON.stringify(config.value).slice(0, 100) + '...');
    }
}

test();
