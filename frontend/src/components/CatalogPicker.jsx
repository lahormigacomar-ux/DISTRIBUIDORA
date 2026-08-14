import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

const CatalogPicker = ({ onClose }) => {
    const [data, setData] = useState({ families: [], groups: [], products: [] });
    const [selection, setSelection] = useState({ families: [], groups: [], products: [] });
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [f, g, p] = await Promise.all([
                axios.get(`${API_URL}/families`),
                axios.get(`${API_URL}/groups`),
                axios.get(`${API_URL}/products/variants`) // We use variants but we'll unique by product_id
            ]);

            // Extract unique products from variants
            const uniqueProducts = [];
            const seen = new Set();
            p.data.forEach(v => {
                if (v.products && !seen.has(v.product_id)) {
                    uniqueProducts.push(v.products);
                    seen.add(v.product_id);
                }
            });

            setData({ families: f.data, groups: g.data, products: uniqueProducts });
            setLoading(false);
        } catch (err) { console.error(err); setLoading(false); }
    };

    const toggle = (type, id) => {
        setSelection(prev => {
            const current = prev[type];
            if (current.includes(id)) return { ...prev, [type]: current.filter(item => item !== id) };
            return { ...prev, [type]: [...current, id] };
        });
    };

    const handleExport = async () => {
        try {
            const response = await axios.post(`${API_URL}/catalog/pdf`, {
                selectedFamilies: selection.families,
                selectedGroups: selection.groups,
                selectedProducts: selection.products
            }, { responseType: 'blob' });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'catalogo_personalizado.pdf');
            document.body.appendChild(link);
            link.click();
            onClose();
        } catch (err) { console.error(err); alert("Error al generar el PDF"); }
    };

    const filteredProducts = data.products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full bg-white relative max-h-[85vh] w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl border border-analyst-100 animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-analyst-50 bg-analyst-50/50 flex justify-between items-center">
                <div>
                    <h3 className="font-black text-xs text-analyst-900 uppercase tracking-tight">Exportación Inteligente de Catálogo</h3>
                    <p className="text-[10px] text-analyst-400 font-bold uppercase tracking-wider mt-1">Selecciona qué incluir en el PDF</p>
                </div>
                <button onClick={onClose} className="p-1.5 hover:bg-white rounded-lg transition-all border border-transparent hover:border-analyst-100">
                    <span className="material-symbols-outlined text-analyst-400 text-sm">close</span>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                {/* Families Section */}
                <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-analyst-400 uppercase tracking-widest px-1">Por Familias</h4>
                    <div className="flex flex-wrap gap-2">
                        {data.families.map(f => (
                            <button
                                key={f.id}
                                onClick={() => toggle('families', f.id)}
                                className={`px-4 py-2 rounded-xl border-2 text-[10px] font-bold uppercase transition-all ${selection.families.includes(f.id) ? 'border-primary bg-primary/5 text-primary' : 'border-analyst-50 bg-analyst-50 text-analyst-400 hover:border-analyst-200'}`}
                            >
                                {f.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Groups Section */}
                {selection.families.length > 0 && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                        <h4 className="text-[10px] font-black text-analyst-400 uppercase tracking-widest px-1">Refinar por Grupos</h4>
                        <div className="flex flex-wrap gap-2">
                            {data.groups.filter(g => selection.families.includes(g.family_id)).map(g => (
                                <button
                                    key={g.id}
                                    onClick={() => toggle('groups', g.id)}
                                    className={`px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase transition-all ${selection.groups.includes(g.id) ? 'border-green-600 bg-green-50 text-green-600' : 'border-analyst-100 bg-white text-analyst-400'}`}
                                >
                                    {g.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Individual Products Section */}
                <div className="space-y-3">
                    <div className="flex justify-between items-center px-1">
                        <h4 className="text-[10px] font-black text-analyst-400 uppercase tracking-widest">Selección Individual</h4>
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-xs text-analyst-400">search</span>
                            <input
                                className="pl-7 pr-3 py-1 bg-analyst-50 border-analyst-200 rounded-lg text-[10px] font-bold outline-none focus:bg-white w-48"
                                placeholder="Buscar producto..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar border border-analyst-50 p-2 rounded-xl">
                        {filteredProducts.map(p => (
                            <label key={p.id} className={`flex items-center gap-3 p-2 rounded-xl border transition-all cursor-pointer ${selection.products.includes(p.id) ? 'border-primary bg-primary/5 shadow-sm' : 'border-analyst-50 hover:bg-analyst-50'}`}>
                                <input
                                    type="checkbox"
                                    checked={selection.products.includes(p.id)}
                                    onChange={() => toggle('products', p.id)}
                                    className="w-3.5 h-3.5 text-primary rounded border-analyst-300"
                                />
                                <div className="flex flex-col min-w-0">
                                    <span className="text-[10px] font-black text-analyst-800 uppercase truncate">{p.name}</span>
                                    <span className="text-[8px] font-bold text-analyst-400 uppercase truncate">{p.description || 'Sin descripción'}</span>
                                </div>
                            </label>
                        ))}
                        {filteredProducts.length === 0 && (
                            <div className="col-span-2 py-4 text-center text-[10px] font-bold text-analyst-300 uppercase italic">No se encontraron productos</div>
                        )}
                    </div>
                </div>
            </div>

            <div className="px-6 py-4 bg-analyst-50 border-t border-analyst-100 flex gap-4">
                <button
                    onClick={onClose}
                    className="flex-1 px-4 py-2.5 text-analyst-500 font-black text-[11px] uppercase tracking-widest hover:bg-white rounded-xl transition-all"
                >
                    Cancelar
                </button>
                <button
                    onClick={handleExport}
                    disabled={loading || (selection.families.length === 0 && selection.groups.length === 0 && selection.products.length === 0)}
                    className="flex-[2] bg-primary text-white py-2.5 rounded-xl font-black text-[11px] uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100"
                >
                    Generar Catálogo PDF
                </button>
            </div>
        </div>
    );
};

export default CatalogPicker;
