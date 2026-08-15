-- MIGRACIÓN V11: PLANIFICADOR DE RUTAS
-- Añade soporte para días de visita en cada negocio.

ALTER TABLE negocios ADD COLUMN IF NOT EXISTS visiting_days JSONB DEFAULT '[]'::jsonb;

-- Recargar caché de PostgREST para que Supabase reconozca la nueva columna de inmediato
NOTIFY pgrst, 'reload schema';
