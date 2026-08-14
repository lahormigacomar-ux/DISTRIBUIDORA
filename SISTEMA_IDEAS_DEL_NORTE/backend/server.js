const express = require('express');
const path = require('path');
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

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Settings Management
app.get('/api/settings/:key', async (req, res) => {
    const { key } = req.params;
    try {
        const { data, error } = await supabase.from('settings').select('*').eq('key', key).single();
        if (error) {
            console.error(`Error fetching setting ${key}:`, error);
            if (error.code === 'PGRST116') return res.json({});
            // Fallback for PGRST205 or other DB issues
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
    try {
        const { error } = await supabase.from('settings').upsert({ key, value, updated_at: new Date() });
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

// Families CRUD
app.get('/api/families', async (req, res) => {
    const { data, error } = await supabase.from('families').select('*').order('name');
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
    const { data, error } = await supabase.from('families').insert([{ name }]).select();
    if (error) return res.status(500).json(error);
    res.json(data[0]);
});

// Groups CRUD
app.get('/api/groups', async (req, res) => {
    const { data, error } = await supabase.from('groups').select('*, families(name)');
    if (error) return res.status(500).json(error);
    res.json(data);
});

app.post('/api/groups', async (req, res) => {
    const { family_id, name } = req.body;
    const { data, error } = await supabase.from('groups').insert([{ family_id, name }]).select();
    if (error) return res.status(500).json(error);
    res.json(data[0]);
});

// Providers CRUD
app.get('/api/providers', async (req, res) => {
    const { data, error } = await supabase.from('providers').select('*');
    if (error) return res.status(500).json(error);
    res.json(data);
});

app.post('/api/providers', async (req, res) => {
    const { name } = req.body;
    const { data, error } = await supabase.from('providers').insert([{ name }]).select();
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

// Products & Variants
app.get('/api/products', async (req, res) => {
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
    const { data, error } = await supabase.from('product_variants')
        .select('*, products(*, families(name), groups(name), providers(name))')
        .order('created_at', { ascending: false });
    if (error) return res.status(500).json(error);
    res.json(data);
});

app.post('/api/products', async (req, res) => {
    const { product, variants } = req.body;
    const { data: pData, error: pError } = await supabase.from('products').insert([product]).select();
    if (pError) return res.status(500).json(pError);

    const productId = pData[0].id;

    if (variants && Array.isArray(variants) && variants.length > 0) {
        const variantsWithId = variants.map(v => ({ ...v, product_id: productId }));
        const { error: vError } = await supabase.from('product_variants').insert(variantsWithId);
        if (vError) return res.status(500).json(vError);
    }

    res.json(pData[0]);
});

app.patch('/api/products/:id', async (req, res) => {
    const { id } = req.params;
    const { product, variants } = req.body;

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
        const variantsWithId = variants.map(v => ({ ...v, product_id: id }));
        const { error: vError } = await supabase.from('product_variants').insert(variantsWithId);
        if (vError) return res.status(500).json(vError);
    }

    res.json({ success: true });
});

app.delete('/api/products/:id', async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) return res.status(500).json(error);
    res.json({ success: true });
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

        const [fRes, pRes, vRes, cRes] = await Promise.all([
            supabase.from('families').select('*').order('name'),
            supabase.from('products').select('*').order('name'),
            supabase.from('product_variants').select('*').order('name'),
            supabase.from('settings').select('*').eq('key', 'catalog_config').single()
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

        const structuredData = families.map(f => ({
            ...f,
            products: products
                .filter(p => p.family_id === f.id && p.is_active !== false)
                .map(p => ({
                    ...p,
                    variants: variants.filter(v => v.product_id === p.id && v.is_active !== false)
                }))
                .filter(p => p.variants.length > 0)
        })).filter(f => f.products.length > 0);

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

        const drawFormat1 = (p, x, y, width, familyColor) => {
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

            // Variants Table
            doc.rect(x, curY, imgSize, 12).fill(COLORS.dark);
            doc.fillColor('#ffffff').fontSize(6).text('COD', x, curY + 3, { width: 30, align: 'center' });
            doc.text('NOMBRE', x + 30, curY + 3, { width: 90, align: 'center' });
            doc.text('PRECIO', x + 120, curY + 3, { width: 40, align: 'center' });

            curY += 12;
            p.variants.forEach(v => {
                doc.fillColor(COLORS.text).fontSize(6).font('Helvetica').text(v.code || '-', x, curY + 3, { width: 30, align: 'center' });
                doc.text(v.name.toUpperCase(), x + 30, curY + 3, { width: 90, align: 'center' });
                doc.fillColor(color).font('Helvetica-Bold').text(`$ ${v.price_unit.toFixed(2)}`, x + 120, curY + 3, { width: 40, align: 'center' });

                // Visible lines
                doc.rect(x, curY, imgSize, 12).lineWidth(0.2).strokeColor('#e2e8f0').stroke();
                curY += 12;
            });

            return curY - y + 10;
        };

        const drawFormat2 = (p, x, y, width, familyColor) => {
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
            doc.text('PRECIO', textX + 160, tableY + 3, { width: textWidth - 160, align: 'center' });

            let curY = tableY + 12;
            p.variants.forEach(v => {
                doc.fillColor(color).rect(textX, curY, 60, 12).fill();
                doc.fillColor('#ffffff').fontSize(7).text(v.code || '-', textX, curY + 3, { width: 60, align: 'center' });
                doc.fillColor(COLORS.text).text(v.name.toUpperCase(), textX + 60, curY + 3, { width: 100, align: 'center' });
                doc.font('Helvetica-Bold').text(`$ ${v.price_unit.toFixed(2)}`, textX + 160, curY + 3, { width: textWidth - 160, align: 'center' });
                doc.rect(textX, curY, textWidth, 12).lineWidth(0.2).strokeColor(COLORS.dark).stroke();
                curY += 12;
            });
            return Math.max(imgSize, curY - y) + 20;
        };

        const drawFormat3 = (p, x, y, width, familyColor) => {
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

            // Bottom Right: Price - Dark Gray
            const price = mainVariant?.price_unit || 0;
            const priceText = `$ ${price.toFixed(2)}`;
            const priceBoxHeight = 28;
            doc.fontSize(18).font('Helvetica-Bold');
            const priceBoxWidth = doc.widthOfString(priceText) + 20;

            const priceX = x + width - priceBoxWidth - 10;
            const priceY = y + containerH - priceBoxHeight - 15;

            doc.roundedRect(priceX, priceY, priceBoxWidth, priceBoxHeight, 6).fill('#334155'); // Dark Gray
            doc.fillColor('#ffffff').text(priceText, priceX, priceY + 6, { width: priceBoxWidth, align: 'center' });

            return containerH;
        };

        const drawFormat5 = (p, x, y, width) => {
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

            // Price Box - Centered
            const priceText = `$ ${(mainVariant?.price_unit || 0).toFixed(2)}`;
            const priceBoxHeight = 22;
            doc.fontSize(14).font('Helvetica-Bold');
            const priceBoxWidth = doc.widthOfString(priceText) + 16;
            const priceX = x + (width - priceBoxWidth) / 2;

            doc.roundedRect(priceX, curY, priceBoxWidth, priceBoxHeight, 4).fill('#334155');
            doc.fillColor('#ffffff').text(priceText, priceX, curY + 5, { width: priceBoxWidth, align: 'center' });

            return containerH;
        };

        const drawFormat6 = (p, x, y, width, familyColor) => {
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
            const col1W = width * 0.25;
            const col2W = width * 0.40;
            const col3W = width * 0.35;

            // Table Border Start
            const tableY = curY;

            // Header
            doc.rect(x, curY, width, rowH).fill('#334155');
            doc.fillColor('#ffffff').fontSize(6).font('Helvetica-Bold');
            doc.text('CODIGO', x, curY + 3, { width: col1W, align: 'center' });
            doc.text('MEDIDA', x + col1W, curY + 3, { width: col2W, align: 'center' });
            doc.text('PRECIO', x + col1W + col2W, curY + 3, { width: col3W, align: 'center' });
            curY += rowH;

            // Rows
            (p.variants || []).forEach(v => {
                // Background for code -> dynamically using primaryColor
                doc.rect(x, curY, col1W, rowH).fill(primaryColor);

                // If primaryColor is very dark, this text might need to be white instead of slate, but we leave it slate for now
                doc.fillColor('#334155').fontSize(6).font('Helvetica-Bold').text(v.code || '-', x, curY + 3, { width: col1W, align: 'center' });

                // Medida & Precio
                doc.fillColor('#000000').font('Helvetica').text(v.name.toUpperCase(), x + col1W, curY + 3, { width: col2W, align: 'center', ellipsis: true });
                doc.font('Helvetica-Bold').text(`$ ${v.price_unit?.toFixed(2)}`, x + col1W + col2W, curY + 3, { width: col3W, align: 'center' });

                // Horizontal line
                doc.moveTo(x, curY + rowH).lineTo(x + width, curY + rowH).lineWidth(0.5).stroke('#334155');
                curY += rowH;
            });

            // Outer border
            doc.rect(x, tableY, width, curY - tableY).lineWidth(0.5).stroke('#334155');

            return (curY - y) + 10;
        };

        const drawFormat4 = (p, x, y, width, familyColor) => {
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
            // Table Box Clipping
            const colWidth = (tableWidth - 140) / (parsedHeaders.length || 1);

            doc.save();
            doc.roundedRect(tableX, curY, tableWidth, tableH, 5).clip();

            // Table Header
            doc.rect(tableX, curY, tableWidth, tableHeaderH).fill('#f8fafc'); // Light background
            doc.fillColor('#1e293b').fontSize(7).font('Helvetica-Bold').text('CODIGO', tableX, curY + 6, { width: 50, align: 'center' });
            parsedHeaders.forEach((col, idx) => {
                doc.text(col.header.toUpperCase(), tableX + 50 + (idx * colWidth), curY + 6, { width: colWidth, align: 'center' });
            });
            doc.text('PRECIO', tableX + tableWidth - 90, curY + 6, { width: 90, align: 'center' });

            // Table Header Border Bottom
            doc.moveTo(tableX, curY + tableHeaderH).lineTo(tableX + tableWidth, curY + tableHeaderH).lineWidth(0.5).strokeColor('#cbd5e1').stroke();

            curY += tableHeaderH;

            // Variants Rows
            p.variants.forEach((v, idx) => {
                const bg = '#ffffff';
                doc.rect(tableX, curY, tableWidth, rowH).fill(bg);

                // Left family color border
                doc.rect(tableX, curY, 2.5, rowH).fill(color);

                doc.fillColor('#475569').fontSize(7).font('Helvetica-Bold').text(v.code || '-', tableX + 3, curY + 4, { width: 47, align: 'center' });

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
                    doc.fillColor('#1e293b').font('Helvetica').text(cellValue, tableX + 50 + (cIdx * colWidth), curY + 4, { width: colWidth, align: 'center' });
                });

                doc.fillColor('#1e293b').font('Helvetica-Bold').text(`$ ${v.price_unit.toFixed(2)}`, tableX + tableWidth - 90, curY + 4, { width: 90, align: 'center' });

                // Border between rows
                if (idx < p.variants.length - 1) {
                    doc.moveTo(tableX, curY + rowH).lineTo(tableX + tableWidth, curY + rowH).lineWidth(0.5).strokeColor('#e2e8f0').stroke();
                }
                curY += rowH;
            });

            // Vertical dividers
            doc.moveTo(tableX + 50, tableY).lineTo(tableX + 50, tableY + tableH).lineWidth(0.5).strokeColor('#cbd5e1').stroke();
            parsedHeaders.forEach((_, cIdx) => {
                const vx = tableX + 50 + ((cIdx + 1) * colWidth);
                doc.moveTo(vx, tableY).lineTo(vx, tableY + tableH).lineWidth(0.5).strokeColor('#cbd5e1').stroke();
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
                yPos = MARGIN + drawGlobalHeader() + 20;
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

                if (yPos + height > 780) { doc.addPage(); drawFooter(); yPos = MARGIN + drawGlobalHeader() + 20; xPos = MARGIN; maxH = 0; }

                if (format === '1' || format === '6') {
                    const colW = 170;
                    const h = (format === '6') ? drawFormat6(p, xPos, yPos, colW - 5, f.color) : drawFormat1(p, xPos, yPos, colW - 5, f.color);
                    maxH = Math.max(maxH, h);
                    xPos += colW;
                    if (xPos > 500) { xPos = MARGIN; yPos += maxH + 10; maxH = 0; }
                } else if (format === '2') {
                    if (xPos > MARGIN) { yPos += maxH + 10; xPos = MARGIN; }
                    const h = drawFormat2(p, xPos, yPos, 515, f.color);
                    yPos += h; maxH = 0;
                } else if (format === '3') {
                    if (xPos > MARGIN) { yPos += maxH + 10; xPos = MARGIN; }
                    const h = drawFormat3(p, xPos, yPos, 515, f.color);
                    yPos += h; maxH = 0;
                } else if (format === '5') {
                    const colW = 515 / 2;
                    const h = drawFormat5(p, xPos, yPos, colW - 5);
                    maxH = Math.max(maxH, h);
                    xPos += colW;
                    if (xPos > 500) { xPos = MARGIN; yPos += maxH + 15; maxH = 0; }
                } else {
                    if (xPos > MARGIN) { yPos += maxH + 10; xPos = MARGIN; }
                    const h = drawFormat4(p, xPos, yPos, 515, f.color);
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
                error: "Error interno al generar PDF",
                details: err.message,
                stack: err.stack
            });
        }
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
    app.get('*', (req, res) => {
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
