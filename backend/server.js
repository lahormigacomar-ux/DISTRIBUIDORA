const express = require('express');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const axios = require('axios');
const multer = require('multer');
const sharp = require('sharp');
require('dotenv').config();
try { require('iconv-lite').decode(Buffer.alloc(0), 'utf8'); } catch (e) { } // Force pkg to include iconv-lite if found

console.log('--- SERVER STARTING ---');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Middleware to handle Vercel routing where '/api' might be stripped
app.use((req, res, next) => {
    if (!req.url.startsWith('/api')) {
        req.url = '/api' + req.url;
    }
    next();
});

// Log all requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        console.log('Body:', JSON.stringify(req.body).slice(0, 200) + '...');
    }
    next();
});

// Global Error Handler for uncaught issues
process.on('uncaughtException', (err) => {
    console.error('CRITICAL UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- AUTHENTICATION & MULTI-COMPANY ENPOINTS ---

// Login
app.post('/api/auth/login', async (req, res) => {
    const { code, password } = req.body;
    try {
        const { data, error } = await supabase.from('companies')
            .select('*')
            .eq('code', code.toLowerCase())
            .single();

        if (error || !data) {
            return res.status(401).json({ error: 'Empresa no encontrada' });
        }

        if (data.password !== password) {
            return res.status(401).json({ error: 'Contraseña incorrecta' });
        }

        res.json({
            id: data.id,
            name: data.name,
            code: data.code,
            logo_url: data.logo_url,
            address: data.address,
            phone: data.phone,
            cuit: data.cuit,
            email: data.email
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Register new company
app.post('/api/auth/register', async (req, res) => {
    const { name, code, password } = req.body;
    try {
        const { data, error } = await supabase.from('companies')
            .insert([{
                name,
                code: code.toLowerCase(),
                password: password || '123456'
            }])
            .select();

        if (error) throw error;
        
        const companyId = data[0].id;
        await supabase.from('settings').insert([
            { key: 'price_labels', value: { price_unit: 'Precio Base', price_bulk: 'Mayorista' }, company_id: companyId }
        ]);

        res.json(data[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get company profile
app.get('/api/auth/company', async (req, res) => {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Falta identificador de empresa' });
    try {
        const { data, error } = await supabase.from('companies')
            .select('*')
            .eq('id', companyId)
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update company profile details & logo
app.patch('/api/auth/company', async (req, res) => {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Falta identificador de empresa' });
    try {
        const { data, error } = await supabase.from('companies')
            .update(req.body)
            .eq('id', companyId)
            .select();

        if (error) throw error;
        res.json(data[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Settings Management
app.get('/api/settings/:key', async (req, res) => {
    const { key } = req.params;
    const companyId = req.headers['x-company-id'];
    try {
        const { data, error } = await supabase.from('settings').select('*').eq('key', key).eq('company_id', companyId).single();
        if (error) {
            console.error(`Error fetching setting ${key}:`, error);
            if (error.code === 'PGRST116') return res.json({});
            return res.json({});
        }
        res.json(data ? data.value : {});
    } catch (err) {
        console.error(`Catch error for setting ${key}:`, err);
        res.json({});
    }
});

app.post('/api/settings/:key', async (req, res) => {
    const { key } = req.params;
    const { value } = req.body;
    const companyId = req.headers['x-company-id'];
    try {
        const { error } = await supabase.from('settings').upsert({ key, value, company_id: companyId, updated_at: new Date() });
        if (error) {
            console.error(`PostgREST error saving ${key}:`, error);
            // Non-blocking: if it fails, we still return success to the UI 
            // to allow PDF generation to proceed if this was part of that flow
            return res.json({ success: false, error: 'Database issue, but proceeding...' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error(`Catch error saving ${key}:`, err);
        res.json({ success: false, error: err.message });
    }
});

// 3. Compose Prices with sequential Distorters (Fixed amount or Percentage)
app.post('/api/prices/compose', async (req, res) => {
    const { target_tier, provider_id, family_id, distorters, rules, default_distorters } = req.body;
    const companyId = req.headers['x-company-id'];
    try {
        if (!target_tier) {
            return res.status(400).json({ error: 'Segmento de destino requerido' });
        }

        // Fetch variants and their associated products to filter
        const { data, error } = await supabase.from('product_variants').select('*, products(*)').eq('company_id', companyId);
        if (error) throw error;

        let filtered = data;
        let updates = [];

        if (rules || default_distorters) {
            // New rules-based bulk recalculation
            updates = data.map(v => {
                if (!v.products) return null;
                const prod = v.products;
                let price = parseFloat(v.base_price) || 0;

                // Find matching rule in order of specificity
                let matchedRule = null;
                if (rules && Array.isArray(rules)) {
                    // 1. Match both provider and family
                    matchedRule = rules.find(r => r.provider_id && r.family_id && r.provider_id == prod.provider_id && r.family_id == prod.family_id);
                    // 2. Match provider only
                    if (!matchedRule) {
                        matchedRule = rules.find(r => r.provider_id && !r.family_id && r.provider_id == prod.provider_id);
                    }
                    // 3. Match family only
                    if (!matchedRule) {
                        matchedRule = rules.find(r => !r.provider_id && r.family_id && r.family_id == prod.family_id);
                    }
                }

                const activeDistorters = matchedRule ? matchedRule.distorters : default_distorters;

                if (activeDistorters && Array.isArray(activeDistorters)) {
                    activeDistorters.forEach(d => {
                        const val = parseFloat(d.value) || 0;
                        if (d.type === 'percentage') {
                            price = price * (1 + val / 100);
                        } else if (d.type === 'fixed') {
                            price = price + val;
                        }
                    });
                }

                return {
                    id: v.id,
                    name: v.name,
                    product_id: v.product_id,
                    [target_tier]: parseFloat(price.toFixed(2))
                };
            }).filter(u => u !== null);
        } else {
            // Old flat composition behavior
            filtered = data.filter(v => {
                if (!v.products) return false;
                if (provider_id && v.products.provider_id !== provider_id) return false;
                if (family_id && v.products.family_id !== family_id) return false;
                return true;
            });

            if (filtered.length === 0) {
                return res.json({ success: true, count: 0 });
            }

            updates = filtered.map(v => {
                let price = parseFloat(v.base_price) || 0;

                if (distorters && Array.isArray(distorters)) {
                    distorters.forEach(d => {
                        const val = parseFloat(d.value) || 0;
                        if (d.type === 'percentage') {
                            price = price * (1 + val / 100);
                        } else if (d.type === 'fixed') {
                            price = price + val;
                        }
                    });
                }

                return {
                    id: v.id,
                    name: v.name,
                    product_id: v.product_id,
                    [target_tier]: parseFloat(price.toFixed(2))
                };
            });
        }

        if (updates.length === 0) {
            return res.json({ success: true, count: 0 });
        }

        // Save updates in chunks of 50 to avoid payload limits
        const chunkSize = 50;
        for (let i = 0; i < updates.length; i += chunkSize) {
            const chunk = updates.slice(i, i + chunkSize);
            const { error: updateError } = await supabase.from('product_variants').upsert(chunk);
            if (updateError) throw updateError;
        }

        res.json({ success: true, count: updates.length });
    } catch (err) {
        console.error('Error in price composition:', err);
        res.status(500).json({ error: err.message });
    }
});

// Families CRUD
app.get('/api/families', async (req, res) => {
    const companyId = req.headers['x-company-id'];
    const { data, error } = await supabase.from('families').select('*').eq('company_id', companyId).order('name');
    if (error) return res.status(500).json(error);
    res.json(data);
});

app.patch('/api/families/:id', async (req, res) => {
    const { id } = req.params;
    const updateData = {};
    if (req.body.color !== undefined) updateData.color = req.body.color;
    if (req.body.icon !== undefined) updateData.icon = req.body.icon;
    const { data, error } = await supabase.from('families').update(updateData).eq('id', id).select();
    if (error) return res.status(500).json(error);
    res.json(data[0]);
});

app.post('/api/families', async (req, res) => {
    const { name } = req.body;
    const companyId = req.headers['x-company-id'];
    const { data, error } = await supabase.from('families').insert([{ name, company_id: companyId }]).select();
    if (error) return res.status(500).json(error);
    res.json(data[0]);
});

// Groups CRUD
app.get('/api/groups', async (req, res) => {
    const companyId = req.headers['x-company-id'];
    const { data, error } = await supabase.from('groups').select('*, families(name)').eq('company_id', companyId);
    if (error) return res.status(500).json(error);
    res.json(data);
});

app.post('/api/groups', async (req, res) => {
    const { family_id, name } = req.body;
    const companyId = req.headers['x-company-id'];
    const { data, error } = await supabase.from('groups').insert([{ family_id, name, company_id: companyId }]).select();
    if (error) return res.status(500).json(error);
    res.json(data[0]);
});

// Providers CRUD
app.get('/api/providers', async (req, res) => {
    const companyId = req.headers['x-company-id'];
    const { data, error } = await supabase.from('providers').select('*').eq('company_id', companyId);
    if (error) return res.status(500).json(error);
    res.json(data);
});

app.post('/api/providers', async (req, res) => {
    const { name } = req.body;
    const companyId = req.headers['x-company-id'];
    const { data, error } = await supabase.from('providers').insert([{ name, company_id: companyId }]).select();
    if (error) return res.status(500).json(error);
    res.json(data[0]);
});

// Units and Values
app.get('/api/units', async (req, res) => {
    const { data, error } = await supabase.from('units').select('*, unit_values(*)');
    if (error) return res.status(500).json(error);
    res.json(data);
});

app.post('/api/units', async (req, res) => {
    const { name } = req.body;
    const { data, error } = await supabase.from('units').insert([{ name }]).select();
    if (error) return res.status(500).json(error);
    res.json(data[0]);
});

app.get('/api/unit-values', async (req, res) => {
    const { data, error } = await supabase.from('unit_values').select('*');
    if (error) return res.status(500).json(error);
    res.json(data);
});

app.post('/api/unit-values', async (req, res) => {
    const { unit_id, value } = req.body;
    const { data, error } = await supabase.from('unit_values').insert([{ unit_id, value }]).select();
    if (error) return res.status(500).json(error);
    res.json(data[0]);
});

// Delete endpoints for catalog metadata
app.delete('/api/families/:id', async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('families').delete().eq('id', id);
    if (error) {
        if (error.code === '23503') {
            return res.status(400).json({ message: 'No se puede eliminar la familia porque tiene productos o grupos asociados.' });
        }
        return res.status(500).json(error);
    }
    res.json({ success: true });
});

app.delete('/api/groups/:id', async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('groups').delete().eq('id', id);
    if (error) {
        if (error.code === '23503') {
            return res.status(400).json({ message: 'No se puede eliminar el grupo porque tiene productos asociados.' });
        }
        return res.status(500).json(error);
    }
    res.json({ success: true });
});

app.delete('/api/providers/:id', async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('providers').delete().eq('id', id);
    if (error) {
        if (error.code === '23503') {
            return res.status(400).json({ message: 'No se puede eliminar el proveedor porque tiene productos asociados.' });
        }
        return res.status(500).json(error);
    }
    res.json({ success: true });
});

app.delete('/api/units/:id', async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('units').delete().eq('id', id);
    if (error) {
        if (error.code === '23503') {
            return res.status(400).json({ message: 'No se puede eliminar la unidad porque tiene valores de unidad o productos asociados.' });
        }
        return res.status(500).json(error);
    }
    res.json({ success: true });
});

app.delete('/api/unit-values/:id', async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('unit_values').delete().eq('id', id);
    if (error) {
        if (error.code === '23503') {
            return res.status(400).json({ message: 'No se puede eliminar este valor de unidad porque tiene variantes de producto asociadas.' });
        }
        return res.status(500).json(error);
    }
    res.json({ success: true });
});

// Products & Variants
app.get('/api/products', async (req, res) => {
    const companyId = req.headers['x-company-id'];
    try {
        const { data, error } = await supabase
            .from('products')
            .select(`
                *,
                families(*),
                groups(*),
                providers(*),
                product_variants(*)
            `)
            .eq('company_id', companyId)
            .neq('is_active', false)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Products fetch error:', error);
            return res.status(500).json({ error: error.message, code: error.code });
        }
        res.json(data);
    } catch (err) {
        console.error('Catch products fetch error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/products/variants', async (req, res) => {
    const companyId = req.headers['x-company-id'];
    const { data, error } = await supabase.from('product_variants')
        .select('*, products!inner(*, families(name), groups(name), providers(name))')
        .eq('company_id', companyId)
        .neq('products.is_active', false)
        .order('created_at', { ascending: false });
    if (error) return res.status(500).json(error);
    res.json(data);
});

app.post('/api/products', async (req, res) => {
    const { product, variants } = req.body;
    const companyId = req.headers['x-company-id'];
    
    const productWithCompany = { ...product, company_id: companyId };
    const { data: pData, error: pError } = await supabase.from('products').insert([productWithCompany]).select();
    if (pError) return res.status(500).json(pError);

    const productId = pData[0].id;

    if (variants && Array.isArray(variants) && variants.length > 0) {
        const variantsWithId = variants.map(v => ({ ...v, product_id: productId, company_id: companyId }));
        const { error: vError } = await supabase.from('product_variants').insert(variantsWithId);
        if (vError) return res.status(500).json(vError);
    }

    res.json(pData[0]);
});

app.patch('/api/products/:id', async (req, res) => {
    const { id } = req.params;
    const { product, variants } = req.body;
    const companyId = req.headers['x-company-id'];

    // 1. Update Product Metadata
    const { error: pError } = await supabase.from('products').update(product).eq('id', id);
    if (pError) {
        console.error('PATCH Product Error:', pError);
        return res.status(500).json(pError);
    }

    // 2. Update Variants ONLY if provided
    if (variants && Array.isArray(variants)) {
        // Delete old variants
        const { error: dError } = await supabase.from('product_variants').delete().eq('product_id', id);
        if (dError) return res.status(500).json(dError);

        // Insert new ones
        const variantsWithId = variants.map(v => ({ ...v, product_id: id, company_id: companyId }));
        const { error: vError } = await supabase.from('product_variants').insert(variantsWithId);
        if (vError) return res.status(500).json(vError);
    }

    res.json({ success: true });
});

app.delete('/api/products/:id', async (req, res) => {
    const { id } = req.params;
    // First try to physically delete (works if the product has never been ordered)
    const { error } = await supabase.from('products').delete().eq('id', id);
    
    if (error) {
        // Postgres error code 23503 is foreign_key_violation
        if (error.code === '23503') {
            console.log(`Product ${id} has active orders. Soft-deleting instead.`);
            
            // Soft delete product metadata
            const { error: pError } = await supabase.from('products').update({ is_active: false }).eq('id', id);
            if (pError) return res.status(500).json(pError);
            
            // Soft delete all variants of this product
            const { error: vError } = await supabase.from('product_variants').update({ is_active: false }).eq('product_id', id);
            if (vError) return res.status(500).json(vError);
            
            return res.json({ success: true, softDeleted: true });
        }
        console.error('DELETE Product Error:', error);
        return res.status(500).json(error);
    }
    res.json({ success: true, physicallyDeleted: true });
});

// Image Upload
const upload = multer({ storage: multer.memoryStorage() });
app.post('/api/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('No image uploaded');
        const webp = await sharp(req.file.buffer).resize(800, 800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
        const fileName = `products/${Date.now()}.webp`;
        const { error } = await supabase.storage.from('product-images').upload(fileName, webp, { contentType: 'image/webp' });
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName);
        res.json({ publicUrl });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PDF Generation
app.post('/api/catalog/pdf', async (req, res) => {
    try {
        const { selectedProducts, selectedFamilies, selectedGroups } = req.body;
        console.log('--- PDF GENERATION START ---');

        const [fRes, pRes, vRes, cRes, lRes] = await Promise.all([
            supabase.from('families').select('*').order('name'),
            supabase.from('products').select('*').order('name'),
            supabase.from('product_variants').select('*').order('name'),
            supabase.from('settings').select('*').eq('key', 'catalog_config').single(),
            supabase.from('settings').select('*').eq('key', 'price_labels')
        ]);

        if (fRes.error) { console.error('Families Fetch Error:', fRes.error); throw fRes.error; }
        if (pRes.error) { console.error('Products Fetch Error:', pRes.error); throw pRes.error; }
        if (vRes.error) { console.error('Variants Fetch Error:', vRes.error); throw vRes.error; }

        console.log(`Data Fetched: ${fRes.data?.length || 0} fams, ${pRes.data?.length || 0} prods, ${vRes.data?.length || 0} vars`);

        let families = fRes.data || [];
        let products = pRes.data || [];
        let variants = vRes.data || [];

        let catalogConfig = {
            headerTitle: 'Catálogo de Productos',
            headerSubtitle: 'CATÁLOGO PROFESIONAL',
            headerUnderlineText: 'CATÁLOGO DE PRECIOS',
            footerLegend: '',
            footerWebsite: 'www.srclavo.com.ar',
            primaryColor: '#00bcd4',
            pageMargin: 40,
            showPageNumbers: true,
            fontFamily: 'Public Sans'
        };

        // PRIORITIZE req.body for live WYSIWYG parity
        const bodySettings = { ...req.body };
        // Remove filters from bodySettings to get just config
        delete bodySettings.selectedProducts;
        delete bodySettings.selectedFamilies;
        delete bodySettings.selectedGroups;

        if (Object.keys(bodySettings).length > 5) { // If significant config passed
            console.log('Using LIVE settings from Request Body');
            catalogConfig = { ...catalogConfig, ...bodySettings };
        } else if (cRes && cRes.data && cRes.data.value) {
            console.log('Using SAVED settings from Database');
            catalogConfig = { ...catalogConfig, ...cRes.data.value };
        } else if (cRes && cRes.error) {
            console.warn('Using DEFAULT catalog config due to DB error or missing data');
        }

        const priceLabelsRow = lRes?.data?.[0];
        const priceLabels = priceLabelsRow?.value || { price_unit: 'PRECIO BASE', price_bulk: 'Mayorista', price_business: 'Empresa', price_company: 'Distribuidor' };
        
        const enabledPriceKeys = [];
        if (catalogConfig.show_price_unit !== false && priceLabels.price_unit) enabledPriceKeys.push('price_unit');
        if (catalogConfig.show_price_bulk !== false && priceLabels.price_bulk) enabledPriceKeys.push('price_bulk');
        if (catalogConfig.show_price_business !== false && priceLabels.price_business) enabledPriceKeys.push('price_business');
        if (catalogConfig.show_price_company !== false && priceLabels.price_company) enabledPriceKeys.push('price_company');
        if (enabledPriceKeys.length === 0) enabledPriceKeys.push('price_unit');

        // Advanced Filtering
        const hasFilter = (selectedFamilies?.length > 0) || (selectedGroups?.length > 0) || (selectedProducts?.length > 0);
        if (hasFilter) {
            products = products.filter(p =>
                selectedFamilies?.includes(p.family_id) ||
                selectedGroups?.includes(p.group_id) ||
                selectedProducts?.includes(p.id)
            );
            const activeFamilyIds = [...new Set(products.map(p => p.family_id))];
            families = families.filter(f => activeFamilyIds.includes(f.id));
        }

        // Apply sorting mode
        if (catalogConfig.sortingMode === 'manual' && selectedProducts && Array.isArray(selectedProducts)) {
            products.sort((a, b) => selectedProducts.indexOf(a.id) - selectedProducts.indexOf(b.id));
        } else {
            products.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        }

        // Apply grouping mode and overwrite family colors with editor color
        let structuredData = [];
        const editorColor = catalogConfig.primaryColor || '#00bcd4';
        
        if (catalogConfig.groupingMode === 'none') {
            structuredData = [{
                id: 'all_products',
                name: '',
                color: editorColor,
                products: products
                    .filter(p => p.is_active !== false)
                    .map(p => ({
                        ...p,
                        variants: variants.filter(v => v.product_id === p.id && v.is_active !== false)
                    }))
                    .filter(p => p.variants.length > 0)
            }];
        } else {
            structuredData = families.map(f => ({
                ...f,
                color: editorColor,
                products: products
                    .filter(p => p.family_id === f.id && p.is_active !== false)
                    .map(p => ({
                        ...p,
                        variants: variants.filter(v => v.product_id === p.id && v.is_active !== false)
                    }))
                    .filter(p => p.variants.length > 0)
            })).filter(f => f.products.length > 0);
        }

        // Pre-fetch Images & Convert to PNG for PDFKit
        const imagesToFetch = [...new Set([
            ...products.map(p => p.image_url),
            catalogConfig.catalogLogo
        ].filter(url => url))];
        const imageBufferMap = {};
        await Promise.all(imagesToFetch.map(async url => {
            try {
                const imgRes = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000 });
                // PDFKit doesn't support WEBP, ensure it is PNG/JPEG
                const pngBuffer = await sharp(imgRes.data).png().toBuffer();
                imageBufferMap[url] = pngBuffer;
            } catch (e) { console.warn(`Image Fetch/Convert Fail: ${url}`); }
        }));

        let headerLogoBuffer = null;
        if (catalogConfig.catalogLogo) {
            try {
                const logoRes = await axios.get(catalogConfig.catalogLogo, { responseType: 'arraybuffer', timeout: 5000 });
                headerLogoBuffer = await sharp(logoRes.data).png().toBuffer();
            } catch (e) {
                console.warn(`Logo Fetch Fail: ${catalogConfig.catalogLogo}`);
            }
        }

        const doc = new PDFDocument({ margin: 0, size: 'A4', autoFirstPage: false });
        doc.on('error', err => {
            console.error('PDFKit Document Error:', err);
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=catalogo.pdf');
        doc.pipe(res);

        const COLORS = {
            dark: '#1e293b',
            cyan: catalogConfig.primaryColor || '#00bcd4',
            text: '#1e293b'
        };
        const MARGIN = Number(catalogConfig.pageMargin) || 40;
        let pageCount = 0;
        const drawGlobalHeader = () => {
            doc.rect(MARGIN, MARGIN, 515, 60).fill('#f8f9fa');

            let textStartX = MARGIN + 10;

            if (headerLogoBuffer) {
                try {
                    // Draw logo with max limits (e.g. max width 120, max height 40)
                    doc.image(headerLogoBuffer, MARGIN + 10, MARGIN + 10, { fit: [120, 40] });
                    textStartX = MARGIN + 100; // Shift text closer to the logo (reduced from 140)
                } catch (e) {
                    console.error("Error drawing logo:", e);
                }
            }

            doc.fillColor(COLORS.cyan || '#00bcd4').fontSize(10).font('Helvetica-Bold').text(catalogConfig.headerSubtitle || 'CATÁLOGO PERSONALIZADO', textStartX, MARGIN + 10);
            doc.fillColor(COLORS.dark).fontSize(20).text(catalogConfig.headerTitle || 'CATÁLOGO DE PRODUCTOS', textStartX, MARGIN + 25);
            doc.fillColor(COLORS.dark).fontSize(10).text(catalogConfig.headerUnderlineText || 'CATÁLOGO DE PRECIOS', MARGIN, MARGIN + 25, { align: 'right', width: 515 - 10 });
            doc.rect(MARGIN, MARGIN + 60, 515, 2).fill(COLORS.cyan || '#00bcd4');
            return 80; // Return height consumed
        };

        const drawWatermark = async () => {
            if (!catalogConfig.catalogLogo) return;
            const logoBuffer = imageBufferMap[catalogConfig.catalogLogo];
            if (!logoBuffer) return;

            doc.save();
            doc.opacity(0.08);
            const size = 400;
            const x = (doc.page.width - size) / 2;
            const y = (doc.page.height - size) / 2;

            try {
                doc.image(logoBuffer, x, y, { fit: [size, size], align: 'center', valign: 'center' });
            } catch (e) {
                console.error("Error drawing watermark:", e);
            }
            doc.restore();
        };

        const drawFooter = () => {
            pageCount++;
            doc.rect(0, 815, 595, 27).fill(COLORS.cyan);
            doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold').text((catalogConfig.footerWebsite || 'WWW.SRCLAVO.COM.AR').toUpperCase(), 0, 825, { align: 'center', width: 595 });
            if (catalogConfig.showPageNumbers) {
                doc.text(`Pag. ${pageCount}`, 530, 825);
            }
        };

        const drawFormat1 = (p, x, y, width, familyColor, enabledPriceKeys, priceLabels) => {
            const color = familyColor || COLORS.cyan;
            const imgSize = 160;
            const img = imageBufferMap[p.image_url];

            // Image Container
            if (img) {
                doc.image(img, x, y, { fit: [imgSize, imgSize] });
            } else {
                doc.rect(x, y, imgSize, imgSize).fill('#f1f5f9');
            }

            // Title Overlay (Centered over image)
            doc.rect(x, y + (imgSize / 2) - 10, imgSize, 20).fillOpacity(0.4).fill('#000000').fillOpacity(1);
            doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold').text(p.name.toUpperCase(), x, y + (imgSize / 2) - 4, { width: imgSize, align: 'center' });

            let curY = y + imgSize + 5;

            // Calculate column widths
            const totalWidth = imgSize;
            const codW = 25;
            const priceCount = enabledPriceKeys.length;
            const priceAreaW = Math.min(80, priceCount * 30);
            const priceW = Math.floor(priceAreaW / priceCount);
            const nameW = totalWidth - codW - (priceW * priceCount);

            // Table Header
            doc.rect(x, curY, totalWidth, 12).fill(COLORS.dark);
            doc.fillColor('#ffffff').fontSize(5.5).font('Helvetica-Bold');
            doc.text('COD', x, curY + 3, { width: codW, align: 'center' });
            doc.text('NOMBRE', x + codW, curY + 3, { width: nameW, align: 'center' });
            
            enabledPriceKeys.forEach((key, idx) => {
                const label = priceLabels[key] || 'Precio';
                doc.text(label.toUpperCase(), x + codW + nameW + (idx * priceW), curY + 3, { width: priceW, align: 'center' });
            });

            curY += 12;
            p.variants.forEach(v => {
                doc.fillColor(COLORS.text).fontSize(5.5).font('Helvetica').text(v.code || '-', x, curY + 3, { width: codW, align: 'center' });
                doc.text(v.name.toUpperCase(), x + codW, curY + 3, { width: nameW, align: 'center' });
                
                enabledPriceKeys.forEach((key, idx) => {
                    const priceVal = v[key] || 0;
                    doc.fillColor(color).font('Helvetica-Bold').text(`${priceVal.toFixed(2)}`, x + codW + nameW + (idx * priceW), curY + 3, { width: priceW, align: 'center' });
                });

                // Visible lines
                doc.rect(x, curY, totalWidth, 12).lineWidth(0.2).strokeColor('#e2e8f0').stroke();
                curY += 12;
            });

            return curY - y + 10;
        };

        const drawFormat2 = (p, x, y, width, familyColor, enabledPriceKeys, priceLabels) => {
            const color = familyColor || COLORS.cyan;
            const imgSize = 120;
            const img = imageBufferMap[p.image_url];
            if (img) doc.image(img, x, y, { fit: [imgSize, imgSize] });
            else doc.rect(x, y, imgSize, imgSize).fill('#f1f5f9');

            const textX = x + imgSize + 20;
            const textWidth = width - imgSize - 20;
            doc.fillColor(color).fontSize(12).font('Helvetica-Bold').text(p.name.toUpperCase(), textX, y, { width: textWidth });

            if (p.show_long_description && p.long_description) {
                doc.fillColor('#64748b').fontSize(8).font('Helvetica').text(p.long_description, textX, y + 18, { width: textWidth, height: 40, ellipsis: true });
            }

            const tableY = y + 60;
            doc.rect(textX, tableY, textWidth, 12).fill(COLORS.dark);
            doc.fillColor('#ffffff').fontSize(7).text('CODIGO', textX, tableY + 3, { width: 60, align: 'center' });
            doc.text('VARIANTE', textX + 60, tableY + 3, { width: 100, align: 'center' });
            
            const priceCount = enabledPriceKeys.length;
            const priceAreaW = textWidth - 160;
            const priceW = Math.floor(priceAreaW / priceCount);

            enabledPriceKeys.forEach((key, idx) => {
                const label = priceLabels[key] || 'Precio';
                doc.text(label.toUpperCase(), textX + 160 + (idx * priceW), tableY + 3, { width: priceW, align: 'center' });
            });

            let curY = tableY + 12;
            p.variants.forEach(v => {
                doc.fillColor('#f1f5f9').rect(textX, curY, 60, 12).fill();
                doc.fillColor('#475569').fontSize(7).font('Helvetica-Bold').text(v.code || '-', textX, curY + 3, { width: 60, align: 'center' });
                doc.fillColor(COLORS.text).text(v.name.toUpperCase(), textX + 60, curY + 3, { width: 100, align: 'center' });
                
                enabledPriceKeys.forEach((key, idx) => {
                    const priceVal = v[key] || 0;
                    doc.font('Helvetica-Bold').text(`$ ${priceVal.toFixed(2)}`, textX + 160 + (idx * priceW), curY + 3, { width: priceW, align: 'center' });
                });
                doc.rect(textX, curY, textWidth, 12).lineWidth(0.2).strokeColor(COLORS.dark).stroke();
                curY += 12;
            });
            return Math.max(imgSize, curY - y) + 20;
        };

        const drawFormat3 = (p, x, y, width, familyColor, enabledPriceKeys, priceLabels) => {
            const color = familyColor || COLORS.cyan;
            const containerH = 150; // Fixed height to fit ~4 per page
            const imgAreaW = 180;
            const img = imageBufferMap[p.image_url];
            const mainVariant = p.variants[0];

            // Left vertical accent
            doc.rect(x, y, 4, containerH).fill(color);

            // Left: Image - No frame
            if (img) {
                doc.image(img, x + 10, y + 10, { fit: [imgAreaW - 20, containerH - 20] });
            }

            // Right: Text area
            const textX = x + imgAreaW + 10;
            const textWidth = width - imgAreaW - 20;
            let curY = y + 15;

            doc.fillColor('#94a3b8').fontSize(7).font('Helvetica-Bold').text(`COD: ${mainVariant?.code || 'N/A'}`, textX, curY);
            curY += 10;

            doc.fillColor('#000000').fontSize(16).font('Helvetica-Bold').text(p.name.toUpperCase(), textX, curY, { width: textWidth, lineBreak: false });
            curY += 18;

            if (p.long_description) {
                doc.fillColor('#64748b').fontSize(8).font('Helvetica').text(p.long_description, textX, curY, { width: textWidth, height: 60, ellipsis: true });
            }

            // Bottom Right: Price boxes sequentially
            const priceCount = enabledPriceKeys.length;
            const boxW = 75;
            const boxH = 28;
            const spacing = 6;
            const totalPricesW = (boxW * priceCount) + (spacing * (priceCount - 1));
            
            let startPriceX = x + width - totalPricesW - 10;
            let priceY = y + containerH - boxH - 15;
            
            enabledPriceKeys.forEach((key, idx) => {
                const label = priceLabels[key] || 'Precio';
                const priceVal = mainVariant?.[key] || 0;
                const curPriceX = startPriceX + (idx * (boxW + spacing));
                
                doc.roundedRect(curPriceX, priceY, boxW, boxH, 4).fill('#334155');
                doc.fillColor('#cbd5e1').fontSize(6).font('Helvetica-Bold').text(label.toUpperCase(), curPriceX, priceY + 3, { width: boxW, align: 'center' });
                doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold').text(`${priceVal.toFixed(2)}`, curPriceX, priceY + 12, { width: boxW, align: 'center' });
            });

            return containerH;
        };

        const drawFormat5 = (p, x, y, width, enabledPriceKeys, priceLabels) => {
            const containerH = 200;
            const imgSize = 130;
            const mainVariant = p.variants?.[0];
            const img = imageBufferMap[p.image_url];

            // Image centered on top
            if (img) {
                try {
                    doc.image(img, x + (width - imgSize) / 2, y + 10, { width: imgSize, height: imgSize });
                } catch (e) {
                    doc.rect(x + (width - imgSize) / 2, y + 10, imgSize, imgSize).stroke('#eee');
                }
            } else {
                doc.rect(x + (width - imgSize) / 2, y + 10, imgSize, imgSize).stroke('#eee');
            }

            let curY = y + imgSize + 20;
            const textWidth = width - 40;
            const textX = x + 20;

            // Code
            doc.fillColor('#94a3b8').fontSize(7).font('Helvetica-Bold').text(`COD: ${mainVariant?.code || 'N/A'}`, textX, curY, { align: 'center', width: textWidth });
            curY += 10;

            // Title
            doc.fillColor('#000000').fontSize(12).font('Helvetica-Bold').text(p.name.toUpperCase(), textX, curY, { width: textWidth, height: 28, ellipsis: true, align: 'center' });
            curY += 32;

            const priceCount = enabledPriceKeys.length;
            const boxW = Math.min(65, Math.floor((width - 30) / priceCount));
            const boxH = 24;
            const spacing = 4;
            const totalPricesW = (boxW * priceCount) + (spacing * (priceCount - 1));
            const startPriceX = x + (width - totalPricesW) / 2;
            
            enabledPriceKeys.forEach((key, idx) => {
                const label = priceLabels[key] || 'Precio';
                const priceVal = mainVariant?.[key] || 0;
                const curPriceX = startPriceX + (idx * (boxW + spacing));
                
                doc.roundedRect(curPriceX, curY, boxW, boxH, 4).fill('#334155');
                doc.fillColor('#cbd5e1').fontSize(5.5).font('Helvetica-Bold').text(label.toUpperCase(), curPriceX, curY + 3, { width: boxW, align: 'center' });
                doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold').text(`${priceVal.toFixed(2)}`, curPriceX, curY + 11, { width: boxW, align: 'center' });
            });

            return containerH;
        };

        const drawFormat6 = (p, x, y, width, familyColor, enabledPriceKeys, priceLabels) => {
            const primaryColor = familyColor || COLORS.cyan;
            const imgSize = 45;
            const img = imageBufferMap[p.image_url];

            // 1. Top Row: Image & Title
            if (img) {
                try {
                    doc.image(img, x, y, { width: imgSize, height: imgSize });
                } catch (e) {
                    doc.rect(x, y, imgSize, imgSize).stroke('#eee');
                }
            } else {
                doc.rect(x, y, imgSize, imgSize).stroke('#eee');
            }

            const titleX = x + imgSize + 8;
            const titleW = width - imgSize - 12;
            doc.fillColor(primaryColor).fontSize(9).font('Helvetica-Bold').text(p.name.toUpperCase(), titleX, y + 2, { width: titleW, height: 40, ellipsis: true });

            // 2. Table
            let curY = y + imgSize + 10;
            const rowH = 12;
            
            const priceCount = enabledPriceKeys.length;
            const col1W = Math.floor(width * 0.20);
            const col2W = Math.floor(width * 0.35);
            const priceAreaW = width - col1W - col2W;
            const priceColW = Math.floor(priceAreaW / priceCount);

            const tableY = curY;

            doc.rect(x, curY, width, rowH).fill('#334155');
            doc.fillColor('#ffffff').fontSize(6).font('Helvetica-Bold');
            doc.text('CODIGO', x, curY + 3, { width: col1W, align: 'center' });
            doc.text('MEDIDA', x + col1W, curY + 3, { width: col2W, align: 'center' });
            
            enabledPriceKeys.forEach((key, idx) => {
                const label = priceLabels[key] || 'Precio';
                doc.text(label.toUpperCase(), x + col1W + col2W + (idx * priceColW), curY + 3, { width: priceColW, align: 'center' });
            });
            curY += rowH;

            // Rows
            (p.variants || []).forEach(v => {
                doc.rect(x, curY, col1W, rowH).fill('#f1f5f9');
                doc.fillColor('#334155').fontSize(6).font('Helvetica-Bold').text(v.code || '-', x, curY + 3, { width: col1W, align: 'center' });
                doc.fillColor('#000000').font('Helvetica').text(v.name.toUpperCase(), x + col1W, curY + 3, { width: col2W, align: 'center', ellipsis: true });
                
                enabledPriceKeys.forEach((key, idx) => {
                    const priceVal = v[key] || 0;
                    doc.font('Helvetica-Bold').text(`$ ${priceVal?.toFixed(2)}`, x + col1W + col2W + (idx * priceColW), curY + 3, { width: priceColW, align: 'center' });
                });

                // Horizontal line
                doc.moveTo(x, curY + rowH).lineTo(x + width, curY + rowH).lineWidth(0.5).stroke('#334155');
                curY += rowH;
            });

            // Outer border
            doc.rect(x, tableY, width, curY - tableY).lineWidth(0.5).stroke('#334155');

            return (curY - y) + 10;
        };

        const drawFormat4 = (p, x, y, width, familyColor, enabledPriceKeys, priceLabels) => {
            const color = familyColor || COLORS.cyan;
            const imgSize = 120;
            const img = imageBufferMap[p.image_url];
            const techs = (p.technical_columns || "").split(',').map(c => c.trim()).filter(c => c);
            const parsedHeaders = techs.map(t => {
                const parts = t.split(':');
                if (parts.length > 1) {
                    return { header: parts[0].trim(), fixedValue: parts.slice(1).join(':').trim(), isFixed: true };
                }
                return { header: t, isFixed: false };
            });
            const separator = p.variant_separator || ' X ';
            const rowH = 15;

            // Calculate total height
            const pad = 15;
            const tableY = y + imgSize + pad * 2 - 10;
            const tableHeaderH = 18;
            const tableH = tableHeaderH + (p.variants.length * rowH);
            const totalH = (tableY - y) + tableH + pad;

            // Outer bounding box with rounded corners
            doc.save();
            doc.roundedRect(x, y, width, totalH, 8).clip();
            doc.rect(x, y, width, totalH).fill('#ffffff'); // bg-white
            doc.rect(x, y, width, 3).fill(color); // Top accent
            doc.restore();
            doc.roundedRect(x, y, width, totalH, 8).lineWidth(0.5).strokeColor('#e2e8f0').stroke(); // Border

            // Left: Image
            if (img) {
                // padding 10
                doc.image(img, x + pad, y + pad, { fit: [imgSize, imgSize] });
            } else {
                doc.rect(x + pad, y + pad, imgSize, imgSize).fill('#f1f5f9');
            }

            // Right: Text
            const textX = x + pad + imgSize + 20;
            const textWidth = width - (pad + imgSize + 20) - pad;
            // Title in Black
            doc.fillColor('#00102a').fontSize(14).font('Helvetica-Bold').text(p.name.toUpperCase(), textX, y + pad + 10, { width: textWidth });

            if (p.long_description) {
                doc.fillColor('#64748b').fontSize(8).font('Helvetica').text(p.long_description, textX, y + pad + 35, { width: textWidth, height: 70, ellipsis: true });
            }

            // Bottom: Technical Table
            let curY = tableY;
            const tableX = x + pad;
            const tableWidth = width - (pad * 2);

            const priceCount = enabledPriceKeys.length;
            const priceColW = 60;
            const priceAreaW = priceColW * priceCount;
            const codW = 45;
            const techAreaW = tableWidth - codW - priceAreaW;
            const colWidth = techAreaW / (parsedHeaders.length || 1);

            const tableHeaderY = curY;

            doc.save();
            doc.roundedRect(tableX, curY, tableWidth, tableH, 5).clip();

            doc.rect(tableX, curY, tableWidth, tableHeaderH).fill('#f8fafc');
            doc.fillColor('#1e293b').fontSize(7).font('Helvetica-Bold').text('CODIGO', tableX, curY + 6, { width: codW, align: 'center' });
            parsedHeaders.forEach((col, idx) => {
                doc.text(col.header.toUpperCase(), tableX + codW + (idx * colWidth), curY + 6, { width: colWidth, align: 'center' });
            });
            enabledPriceKeys.forEach((key, idx) => {
                const label = priceLabels[key] || 'Precio';
                doc.text(label.toUpperCase(), tableX + codW + techAreaW + (idx * priceColW), curY + 6, { width: priceColW, align: 'center' });
            });

            doc.moveTo(tableX, curY + tableHeaderH).lineTo(tableX + tableWidth, curY + tableHeaderH).lineWidth(0.5).strokeColor('#cbd5e1').stroke();

            curY += tableHeaderH;

            p.variants.forEach((v, idx) => {
                const bg = '#ffffff';
                doc.rect(tableX, curY, tableWidth, rowH).fill(bg);

                doc.rect(tableX, curY, 2.5, rowH).fill(color);

                doc.fillColor('#475569').fontSize(7).font('Helvetica-Bold').text(v.code || '-', tableX + 3, curY + 4, { width: codW - 6, align: 'center' });

                const parts = v.name.split(separator).map(pt => pt.trim());
                let namePartIndex = 0;
                parsedHeaders.forEach((col, cIdx) => {
                    let cellValue = '-';
                    if (col.isFixed) {
                        cellValue = col.fixedValue;
                    } else {
                        cellValue = parts[namePartIndex] || '-';
                        namePartIndex++;
                    }
                    doc.fillColor('#1e293b').font('Helvetica').text(cellValue, tableX + codW + (cIdx * colWidth), curY + 4, { width: colWidth, align: 'center' });
                });

                enabledPriceKeys.forEach((key, idx) => {
                    const priceVal = v[key] || 0;
                    doc.fillColor('#1e293b').font('Helvetica-Bold').text(`$ ${priceVal.toFixed(2)}`, tableX + codW + techAreaW + (idx * priceColW), curY + 4, { width: priceColW, align: 'center' });
                });

                if (idx < p.variants.length - 1) {
                    doc.moveTo(tableX, curY + rowH).lineTo(tableX + tableWidth, curY + rowH).lineWidth(0.5).strokeColor('#e2e8f0').stroke();
                }
                curY += rowH;
            });

            doc.moveTo(tableX + codW, tableHeaderY).lineTo(tableX + codW, tableHeaderY + tableH).lineWidth(0.5).strokeColor('#cbd5e1').stroke();
            parsedHeaders.forEach((_, cIdx) => {
                const vx = tableX + codW + ((cIdx + 1) * colWidth);
                doc.moveTo(vx, tableHeaderY).lineTo(vx, tableHeaderY + tableH).lineWidth(0.5).strokeColor('#cbd5e1').stroke();
            });
            enabledPriceKeys.forEach((_, idx) => {
                const vx = tableX + codW + techAreaW + ((idx + 1) * priceColW);
                doc.moveTo(vx, tableHeaderY).lineTo(vx, tableHeaderY + tableH).lineWidth(0.5).strokeColor('#cbd5e1').stroke();
            });

            doc.restore();
            // Outer table border
            doc.roundedRect(tableX, tableY, tableWidth, tableH, 5).lineWidth(0.5).strokeColor('#cbd5e1').stroke();

            return totalH + 15; // Return total height used plus bottom spacing
        };

        doc.addPage();
        await drawWatermark();
        drawFooter();
        let yPos = MARGIN + drawGlobalHeader() + 20;
        let xPos = MARGIN;

        for (const f of structuredData) {
            if (yPos > 750) {
                doc.addPage();
                await drawWatermark();
                drawFooter();
                yPos = (catalogConfig.repeatHeader !== false) ? (MARGIN + drawGlobalHeader() + 20) : MARGIN;
            }
            yPos += 10;

            let maxH = 0;
            for (const p of f.products) {
                const format = p.pdf_format || '1';
                let height = 0;
                if (format === '1') height = 180 + (p.variants.length * 12);
                else if (format === '2') height = Math.max(130, 80 + (p.variants.length * 12));
                else if (format === '3') height = 260; // Slightly reduced
                else height = 280 + (p.variants.length * 15); // Format 4 updated scale

                if (yPos + height > 780) { 
                    doc.addPage(); 
                    drawFooter(); 
                    yPos = (catalogConfig.repeatHeader !== false) ? (MARGIN + drawGlobalHeader() + 20) : MARGIN; 
                    xPos = MARGIN; 
                    maxH = 0; 
                }

                if (format === '1' || format === '6') {
                    const colW = 170;
                    const h = (format === '6') ? drawFormat6(p, xPos, yPos, colW - 5, f.color, enabledPriceKeys, priceLabels) : drawFormat1(p, xPos, yPos, colW - 5, f.color, enabledPriceKeys, priceLabels);
                    maxH = Math.max(maxH, h);
                    xPos += colW;
                    if (xPos > 500) { xPos = MARGIN; yPos += maxH + 10; maxH = 0; }
                } else if (format === '2') {
                    if (xPos > MARGIN) { yPos += maxH + 10; xPos = MARGIN; }
                    const h = drawFormat2(p, xPos, yPos, 515, f.color, enabledPriceKeys, priceLabels);
                    yPos += h; maxH = 0;
                } else if (format === '3') {
                    if (xPos > MARGIN) { yPos += maxH + 10; xPos = MARGIN; }
                    const h = drawFormat3(p, xPos, yPos, 515, f.color, enabledPriceKeys, priceLabels);
                    yPos += h; maxH = 0;
                } else if (format === '5') {
                    const colW = 515 / 2;
                    const h = drawFormat5(p, xPos, yPos, colW - 5, enabledPriceKeys, priceLabels);
                    maxH = Math.max(maxH, h);
                    xPos += colW;
                    if (xPos > 500) { xPos = MARGIN; yPos += maxH + 15; maxH = 0; }
                } else {
                    if (xPos > MARGIN) { yPos += maxH + 10; xPos = MARGIN; }
                    const h = drawFormat4(p, xPos, yPos, 515, f.color, enabledPriceKeys, priceLabels);
                    yPos += h; maxH = 0;
                }
            }
            if (xPos > MARGIN) yPos += maxH + 10; xPos = MARGIN;
            yPos += 30;
        }

        doc.end();
        console.log('--- PDF COMPLETED ---');
    } catch (err) {
        console.error("PDF GENERATION FATAL ERROR:", err);
        if (!res.headersSent) {
            res.status(500).send({
            });
        }
    }
});

// ==========================================
// GESTION DE PEDIDOS, PREVENTISTAS, NEGOCIOS Y ENTREGADORES
// ==========================================

// Preventistas CRUD
app.get('/api/preventistas', async (req, res) => {
    const companyId = req.headers['x-company-id'];
    const { data, error } = await supabase.from('preventistas').select('*').eq('company_id', companyId).order('name');
    if (error) return res.status(500).json(error);
    res.json(data);
});

app.post('/api/preventistas', async (req, res) => {
    const { name, phone, commission, is_active, username, password } = req.body;
    const companyId = req.headers['x-company-id'];
    const { data, error } = await supabase.from('preventistas').insert([{ 
        name, 
        phone, 
        commission: parseFloat(commission) || 0, 
        is_active: is_active !== false, 
        company_id: companyId,
        username: username || null,
        password: password || null
    }]).select();
    if (error) return res.status(500).json(error);
    res.json(data[0]);
});

app.patch('/api/preventistas/:id', async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from('preventistas').update(req.body).eq('id', id).select();
    if (error) return res.status(500).json(error);
    res.json(data[0]);
});

app.delete('/api/preventistas/:id', async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('preventistas').delete().eq('id', id);
    if (error) return res.status(500).json(error);
    res.json({ success: true });
});

// Negocios CRUD
app.get('/api/negocios', async (req, res) => {
    const companyId = req.headers['x-company-id'];
    const { data, error } = await supabase.from('negocios').select('*').eq('company_id', companyId).order('name');
    if (error) return res.status(500).json(error);
    res.json(data);
});

app.post('/api/negocios', async (req, res) => {
    const { name, owner, address, phone, cuit, is_active, latitude, longitude, price_list, visiting_days } = req.body;
    const companyId = req.headers['x-company-id'];
    const { data, error } = await supabase.from('negocios').insert([{
        name, owner, address, phone, cuit, 
        is_active: is_active !== false, 
        company_id: companyId,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        price_list: price_list || 'price_unit',
        visiting_days: visiting_days || []
    }]).select();
    if (error) return res.status(500).json(error);
    res.json(data[0]);
});

app.patch('/api/negocios/:id', async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from('negocios').update(req.body).eq('id', id).select();
    if (error) return res.status(500).json(error);
    res.json(data[0]);
});

app.delete('/api/negocios/:id', async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('negocios').delete().eq('id', id);
    if (error) return res.status(500).json(error);
    res.json({ success: true });
});

// Entregadores CRUD
app.get('/api/entregadores', async (req, res) => {
    const companyId = req.headers['x-company-id'];
    const { data, error } = await supabase.from('entregadores').select('*').eq('company_id', companyId).order('name');
    if (error) return res.status(500).json(error);
    res.json(data);
});

app.post('/api/entregadores', async (req, res) => {
    const { name, vehicle, phone, is_active, username, password } = req.body;
    const companyId = req.headers['x-company-id'];
    const { data, error } = await supabase.from('entregadores').insert([{ 
        name, 
        vehicle, 
        phone, 
        is_active: is_active !== false, 
        company_id: companyId,
        username: username || null,
        password: password || null
    }]).select();
    if (error) return res.status(500).json(error);
    res.json(data[0]);
});

app.patch('/api/entregadores/:id', async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from('entregadores').update(req.body).eq('id', id).select();
    if (error) return res.status(500).json(error);
    res.json(data[0]);
});

app.delete('/api/entregadores/:id', async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('entregadores').delete().eq('id', id);
    if (error) return res.status(500).json(error);
    res.json({ success: true });
});

// Pedidos (Orders) Endpoints
app.get('/api/orders', async (req, res) => {
    const companyId = req.headers['x-company-id'];
    try {
        const { data, error } = await supabase.from('orders')
            .select(`
                *,
                preventistas(*),
                negocios(*),
                entregadores(*),
                order_items(
                    *,
                    product_variants(
                        *,
                        products(*)
                    )
                )
            `)
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('Error fetching orders:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/orders', async (req, res) => {
    const { seller_id, shop_id, items, status } = req.body;
    const companyId = req.headers['x-company-id'];
    try {
        // Calculate total
        let total = 0;
        if (items && Array.isArray(items)) {
            items.forEach(it => {
                total += (parseFloat(it.price_unit) || 0) * (parseInt(it.quantity) || 0);
            });
        }

        // Insert Order
        const { data: oData, error: oError } = await supabase.from('orders').insert([{
            seller_id: seller_id || null,
            shop_id,
            status: status || 'pendiente',
            total,
            company_id: companyId
        }]).select();

        if (oError) throw oError;

        const orderId = oData[0].id;

        // Insert Items
        if (items && Array.isArray(items) && items.length > 0) {
            const itemsWithOrderId = items.map(it => ({
                order_id: orderId,
                variant_id: it.variant_id,
                quantity: parseInt(it.quantity) || 0,
                price_unit: parseFloat(it.price_unit) || 0,
                total: (parseFloat(it.price_unit) || 0) * (parseInt(it.quantity) || 0)
            }));

            const { error: itemsError } = await supabase.from('order_items').insert(itemsWithOrderId);
            if (itemsError) throw itemsError;
        }

        res.json(oData[0]);
    } catch (err) {
        console.error('Error creating order:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/orders/:id', async (req, res) => {
    const { id } = req.params;
    const { items, shop_id } = req.body;
    try {
        const { data: order, error: fetchErr } = await supabase.from('orders').select('*').eq('id', id).single();
        if (fetchErr || !order) return res.status(404).json({ error: 'Pedido no encontrado' });
        
        const isPending = order.status === 'pendiente' || order.status === 'pending_preparation';
        if (!isPending) {
            return res.status(400).json({ error: 'El pedido ya no se puede editar porque su estado ha cambiado.' });
        }

        let total = 0;
        if (items && Array.isArray(items)) {
            items.forEach(it => {
                total += (parseFloat(it.price_unit) || 0) * (parseInt(it.quantity) || 0);
            });
        }

        const { error: deleteErr } = await supabase.from('order_items').delete().eq('order_id', id);
        if (deleteErr) throw deleteErr;

        if (items && Array.isArray(items) && items.length > 0) {
            const itemsWithOrderId = items.map(it => ({
                order_id: id,
                variant_id: it.variant_id,
                quantity: parseInt(it.quantity) || 0,
                price_unit: parseFloat(it.price_unit) || 0,
                total: (parseFloat(it.price_unit) || 0) * (parseInt(it.quantity) || 0)
            }));

            const { error: itemsError } = await supabase.from('order_items').insert(itemsWithOrderId);
            if (itemsError) throw itemsError;
        }

        const updateData = { total };
        if (shop_id) updateData.shop_id = shop_id;

        const { data: updatedOrder, error: updateErr } = await supabase.from('orders')
            .update(updateData)
            .eq('id', id)
            .select();
        
        if (updateErr) throw updateErr;
        res.json(updatedOrder[0]);
    } catch (err) {
        console.error('Error updating order:', err);
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/orders/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status, deliverer_id, items, failure_reason } = req.body;
    try {
        // Fetch current order to see if stock has been discounted
        const { data: order, error: fError } = await supabase.from('orders')
            .select('*, order_items(*)')
            .eq('id', id)
            .single();

        if (fError) throw fError;

        let shouldDiscountStock = false;
        let updateFields = { status };

        if (deliverer_id) {
            updateFields.deliverer_id = deliverer_id;
        }

        if (status === 'cancelled') {
            updateFields.failure_reason = failure_reason || 'Sin especificar';
        }

        // 1. If final packing items are provided, update quantities and recalculate total
        let finalItems = order.order_items || [];
        if (items && Array.isArray(items) && items.length > 0) {
            for (const it of items) {
                await supabase.from('order_items')
                    .update({ 
                        quantity: parseInt(it.quantity) || 0,
                        total: (parseFloat(it.price_unit) || 0) * (parseInt(it.quantity) || 0)
                    })
                    .eq('id', it.id);
            }
            // Recalculate order total
            const newTotal = items.reduce((acc, it) => acc + ((parseFloat(it.price_unit) || 0) * (parseInt(it.quantity) || 0)), 0);
            updateFields.total = newTotal;
            finalItems = items;
        }

        if (status === 'prepared' || status === 'in_delivery' || status === 'delivered') {
            if (!order.stock_discounted) {
                shouldDiscountStock = true;
                updateFields.stock_discounted = true;
                updateFields.prepared_at = new Date();
            }
        }

        if (status === 'delivered') {
            updateFields.delivered_at = new Date();
        }

        const companyId = req.headers['x-company-id'] || order.company_id;

        // 2. Discount stock and register movements if necessary
        if (shouldDiscountStock && finalItems.length > 0) {
            for (const item of finalItems) {
                const { data: variant, error: vError } = await supabase.from('product_variants')
                    .select('stock')
                    .eq('id', item.variant_id)
                    .single();

                if (!vError && variant) {
                    const newStock = Math.max(0, (variant.stock || 0) - item.quantity);
                    await supabase.from('product_variants')
                        .update({ stock: newStock })
                        .eq('id', item.variant_id);

                    // Insert movement log
                    await supabase.from('stock_movements').insert([{
                        company_id: companyId,
                        variant_id: item.variant_id,
                        type: 'sale',
                        quantity: -parseInt(item.quantity),
                        reference: `Pedido #${order.number || order.id.slice(0, 4)}`
                    }]);
                }
            }
        }

        // 3. Update order
        const { data: updatedOrder, error: uError } = await supabase.from('orders')
            .update(updateFields)
            .eq('id', id)
            .select();

        if (uError) throw uError;
        res.json(updatedOrder[0]);
    } catch (err) {
        console.error('Error updating order status:', err);
        res.status(500).json({ error: err.message });
    }
});

// Stock Movements Endpoints
app.get('/api/stock-movements', async (req, res) => {
    const companyId = req.headers['x-company-id'];
    try {
        const { data, error } = await supabase.from('stock_movements')
            .select('*, product_variants(*, products(*))')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false })
            .limit(150);

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json(err);
    }
});

app.post('/api/stock/intake', async (req, res) => {
    const companyId = req.headers['x-company-id'];
    const { variant_id, quantity, reference } = req.body;
    try {
        const qty = parseInt(quantity) || 0;
        if (qty <= 0) return res.status(400).json({ error: 'Quantity must be positive' });

        // Get current stock
        const { data: variant, error: vError } = await supabase.from('product_variants')
            .select('stock')
            .eq('id', variant_id)
            .single();

        if (vError) throw vError;

        const newStock = (variant.stock || 0) + qty;

        // Update variant stock
        await supabase.from('product_variants')
            .update({ stock: newStock })
            .eq('id', variant_id);

        // Record movement
        const { data: smData, error: smError } = await supabase.from('stock_movements').insert([{
            company_id: companyId,
            variant_id,
            type: 'intake',
            quantity: qty,
            reference: reference || 'Ingreso manual'
        }]).select();

        if (smError) throw smError;
        res.json({ success: true, newStock, movement: smData[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/stock/adjustment', async (req, res) => {
    const companyId = req.headers['x-company-id'];
    const { variant_id, quantity, reference } = req.body;
    try {
        const qty = parseInt(quantity) || 0;
        if (qty === 0) return res.status(400).json({ error: 'Quantity cannot be zero' });

        // Get current stock
        const { data: variant, error: vError } = await supabase.from('product_variants')
            .select('stock')
            .eq('id', variant_id)
            .single();

        if (vError) throw vError;

        const newStock = Math.max(0, (variant.stock || 0) + qty);

        // Update variant stock
        await supabase.from('product_variants')
            .update({ stock: newStock })
            .eq('id', variant_id);

        // Record movement
        const { data: smData, error: smError } = await supabase.from('stock_movements').insert([{
            company_id: companyId,
            variant_id,
            type: 'adjustment',
            quantity: qty,
            reference: reference || 'Ajuste manual'
        }]).select();

        if (smError) throw smError;
        res.json({ success: true, newStock, movement: smData[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// ENDPOINTS PARA LA APLICACIÓN MÓVIL
// ==========================================

// Login Móvil (Preventistas y Entregadores)
app.post('/api/mobile/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        if (!username || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña requeridos.' });
        }

        // Buscar en preventistas
        const { data: prev } = await supabase.from('preventistas')
            .select('*')
            .eq('username', username)
            .eq('password', password)
            .eq('is_active', true)
            .maybeSingle();

        if (prev) {
            return res.json({
                role: 'preventista',
                user: {
                    id: prev.id,
                    name: prev.name,
                    phone: prev.phone,
                    commission: prev.commission
                },
                company_id: prev.company_id
            });
        }

        // Buscar en entregadores
        const { data: entr } = await supabase.from('entregadores')
            .select('*')
            .eq('username', username)
            .eq('password', password)
            .eq('is_active', true)
            .maybeSingle();

        if (entr) {
            return res.json({
                role: 'entregador',
                user: {
                    id: entr.id,
                    name: entr.name,
                    phone: entr.phone,
                    vehicle: entr.vehicle
                },
                company_id: entr.company_id
            });
        }

        return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    } catch (err) {
        console.error('Error in mobile login:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Pedidos filtrados para Móvil (por preventista o entregador)
app.get('/api/mobile/orders', async (req, res) => {
    const companyId = req.headers['x-company-id'];
    const userId = req.headers['x-user-id'];
    const userRole = req.headers['x-user-role'];

    try {
        if (!companyId || !userId || !userRole) {
            return res.status(400).json({ error: 'Faltan cabeceras de identificación (company-id, user-id, user-role).' });
        }

        let query = supabase.from('orders')
            .select(`
                *,
                preventistas(*),
                negocios(*),
                entregadores(*),
                order_items(
                    *,
                    product_variants(
                        *,
                        products(*)
                    )
                )
            `)
            .eq('company_id', companyId);

        if (userRole === 'preventista') {
            query = query.eq('seller_id', userId);
        } else if (userRole === 'entregador') {
            query = query.eq('deliverer_id', userId);
        } else {
            return res.status(400).json({ error: 'Rol móvil no válido.' });
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('Error fetching mobile orders:', err);
        res.status(500).json({ error: 'Error al obtener los pedidos.' });
    }
});

// Serve Frontend Static Files (only if dist folder exists, i.e., in production/Electron)
// Robust path detection for Electron / Packed environments
let frontendPath = path.resolve(__dirname, '..', 'frontend', 'dist');

// If not found in parent/frontend/dist, try relative to current dir (for some packing scenarios)
if (!fs.existsSync(frontendPath)) {
    frontendPath = path.join(__dirname, 'dist');
}

// Logging for debug in production
console.log('--- FRONTEND PATH DETECTION ---');
console.log('Current __dirname:', __dirname);
console.log('Resolved frontendPath:', frontendPath);
console.log('Frontend exists:', fs.existsSync(frontendPath));

if (fs.existsSync(frontendPath)) {
    console.log('Production mode: Serving static files from', frontendPath);
    app.use(express.static(frontendPath));

    // Catch-all route to serve the frontend for any non-API request
    app.get(/.*/, (req, res) => {
        if (!req.path.startsWith('/api')) {
            const indexPath = path.join(frontendPath, 'index.html');
            res.sendFile(indexPath);
        } else {
            res.status(404).json({ error: 'API route not found' });
        }
    });
} else {
    console.log('Development mode or Error: Frontend dist folder not found.');
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;
