-- =========================================================================
-- SCHEMA COMPLETO Y CONSOLIDADO PARA SUPABASE (IDEAS DEL NORTE)
-- =========================================================================
-- Ejecuta este script en el editor de SQL de Supabase (SQL Editor) para 
-- construir toda la base de datos desde cero, incluyendo tablas, valores 
-- iniciales, y políticas de almacenamiento.
-- =========================================================================

-- 1. HABILITAR EXTENSIONES REQUERIDAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. CREACIÓN DE TABLAS EN ORDEN DE DEPENDENCIAS

-- Familias (Categorías principales de productos)
CREATE TABLE IF NOT EXISTS families (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#00bcd4',
    icon TEXT DEFAULT 'construction'
);

-- Grupos (Subcategorías ligadas a familias)
CREATE TABLE IF NOT EXISTS groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_id UUID REFERENCES families(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    UNIQUE(family_id, name)
);

-- Proveedores
CREATE TABLE IF NOT EXISTS providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE
);

-- Unidades de medida (ej. "Medida", "Tamaño", "Color")
CREATE TABLE IF NOT EXISTS units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE
);

-- Valores para las unidades de medida (ej. "5cm", "Rojo")
CREATE TABLE IF NOT EXISTS unit_values (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
    value TEXT NOT NULL,
    UNIQUE(unit_id, value)
);

-- Productos principales
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_id UUID REFERENCES families(id),
    group_id UUID REFERENCES groups(id),
    provider_id UUID REFERENCES providers(id),
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    is_offer BOOLEAN DEFAULT FALSE,
    variant_separator TEXT DEFAULT ' X ',
    pdf_format TEXT DEFAULT '1',
    long_description TEXT,
    show_long_description BOOLEAN DEFAULT FALSE,
    technical_columns TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Configuración general del sistema (Etiquetas dinámicas, etc.)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Variantes de productos con sus respectivos precios y stock
CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- Ej: "5cm X 100u"
    code TEXT, -- Código del artículo
    base_price DECIMAL(12,2) DEFAULT 0,
    price_unit DECIMAL(12,2) DEFAULT 0,
    price_bulk DECIMAL(12,2) DEFAULT 0,
    price_business DECIMAL(12,2) DEFAULT 0,
    price_company DECIMAL(12,2) DEFAULT 0,
    extra_prices JSONB DEFAULT '{}',
    stock INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. INSERTAR DATOS DE CONFIGURACIÓN INICIALES

-- Nombres dinámicos para las columnas de precios
INSERT INTO settings (key, value) VALUES ('price_labels', '{
    "base_price": "Base",
    "price_unit": "Minorista",
    "price_bulk": "Mayorista",
    "price_business": "Empresas",
    "price_company": "Distribuidor"
}') ON CONFLICT (key) DO NOTHING;

-- Configuración por defecto del generador de catálogos en PDF
INSERT INTO settings (key, value) VALUES ('catalog_config', '{
    "headerTitle": "Catálogo de Productos",
    "headerSubtitle": "CATÁLOGO PROFESIONAL",
    "headerUnderlineText": "CATÁLOGO DE PRECIOS",
    "footerLegend": "",
    "footerWebsite": "www.ideasdelnorte.com.ar",
    "primaryColor": "#00bcd4",
    "pageMargin": 40,
    "showPageNumbers": true,
    "fontFamily": "Public Sans"
}') ON CONFLICT (key) DO NOTHING;

-- 4. CONFIGURACIÓN DEL BUCKET DE ALMACENAMIENTO (STORAGE)

-- Crear el bucket de imágenes para productos
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Habilitar políticas de seguridad para el bucket de imágenes
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'product-images' );

DROP POLICY IF EXISTS "Public Upload" ON storage.objects;
CREATE POLICY "Public Upload"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'product-images' );

DROP POLICY IF EXISTS "Public Update" ON storage.objects;
CREATE POLICY "Public Update"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'product-images' );

DROP POLICY IF EXISTS "Public Delete" ON storage.objects;
CREATE POLICY "Public Delete"
ON storage.objects FOR DELETE
USING ( bucket_id = 'product-images' );

-- 5. REFRESCAR LA CACHÉ DE POSTGREST
NOTIFY pgrst, 'reload schema';
