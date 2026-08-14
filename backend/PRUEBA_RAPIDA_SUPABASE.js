const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

console.log('--- DIAGNÓSTICO DE SUPABASE ---');
console.log('URL:', supabaseUrl ? 'Configurada (OK)' : 'FALTA URL');
console.log('Key:', supabaseKey ? 'Configurada (OK)' : 'FALTA KEY');

if (!supabaseUrl || !supabaseKey) {
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
    console.log('Conectando con Supabase...');
    try {
        const { data, error } = await supabase.from('families').select('*').limit(1);
        if (error) {
            console.error('❌ ERROR AL LEER TABLA families:', error.message);
        } else {
            console.log('✅ CONEXIÓN EXITOSA! Se encontró 1 familia de ejemplo.');
        }

        const { data: storage, error: sError } = await supabase.storage.listBuckets();
        if (sError) {
            console.error('❌ ERROR AL LEER STORAGE:', sError.message);
        } else {
            console.log('✅ STORAGE ACCESIBLE! Buckets encontrados:', storage.map(b => b.name).join(', '));
        }

    } catch (err) {
        console.error('❌ ERROR CRÍTICO:', err.message);
    }
}

testConnection();
