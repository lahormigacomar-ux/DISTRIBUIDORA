-- Families and Groups
CREATE TABLE families (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_id UUID REFERENCES families(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    UNIQUE(family_id, name)
);

-- Providers
CREATE TABLE providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE
);

-- Units and Values
CREATE TABLE units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE -- e.g. "Medida", "Tamaño"
);

CREATE TABLE unit_values (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
    value TEXT NOT NULL,
    UNIQUE(unit_id, value)
);

-- Products
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_id UUID REFERENCES families(id),
    group_id UUID REFERENCES groups(id),
    provider_id UUID REFERENCES providers(id),
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    is_offer BOOLEAN DEFAULT FALSE,
    variant_separator TEXT DEFAULT ' X ',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Settings table for dynamic price labels
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initial Price Labels
INSERT INTO settings (key, value) VALUES ('price_labels', '{
    "base_price": "Base",
    "price_unit": "Minorista",
    "price_bulk": "Mayorista",
    "price_business": "Empresas",
    "price_company": "Distribuidor"
}') ON CONFLICT (key) DO NOTHING;

-- Product Variants
CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g. "5cm x 1\""
    base_price DECIMAL(12,2) DEFAULT 0,
    price_unit DECIMAL(12,2) DEFAULT 0,
    price_bulk DECIMAL(12,2) DEFAULT 0,
    price_business DECIMAL(12,2) DEFAULT 0,
    price_company DECIMAL(12,2) DEFAULT 0,
    extra_prices JSONB DEFAULT '{}',
    stock INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
