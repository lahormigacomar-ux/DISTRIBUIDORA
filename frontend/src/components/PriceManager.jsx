import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

const PriceManager = () => {
    // Dropdown options
    const [options, setOptions] = useState({ families: [], groups: [], providers: [] });
    const [priceLabels, setPriceLabels] = useState({});
    
    // Product variants list for display
    const [variants, setVariants] = useState([]);
    const [loadingVariants, setLoadingVariants] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showOnlyAffected, setShowOnlyAffected] = useState(false);

    // Composer State
    const [targetTier, setTargetTier] = useState('price_unit');
    const [activeTab, setActiveTab] = useState('general'); // 'general' or 'conditional'
    const [formulas, setFormulas] = useState({});

    // Price rules states
    const [defaultDistorters, setDefaultDistorters] = useState([{ label: 'Márgen Base', type: 'percentage', value: 40 }]);
    const [specialRules, setSpecialRules] = useState([]);

    // UI Statuses
    const [status, setStatus] = useState(null);

    useEffect(() => {
        fetchOptions();
        fetchPriceLabels();
        fetchVariants();
        fetchFormulas();
    }, []);

    const fetchOptions = async () => {
        try {
            const [f, g, p] = await Promise.all([
                axios.get(`${API_URL}/families`),
                axios.get(`${API_URL}/groups`),
                axios.get(`${API_URL}/providers`)
            ]);
            setOptions({ families: f.data, groups: g.data, providers: p.data });
        } catch (err) { console.error(err); }
    };

    const fetchPriceLabels = async () => {
        try {
            const { data } = await axios.get(`${API_URL}/settings/price_labels`);
            setPriceLabels(data || {});
        } catch (err) {
            console.warn("Settings table missing, using defaults.");
            setPriceLabels({ base_price: 'Base/Costo', price_unit: 'PRECIO BASE', price_bulk: 'Mayorista', price_business: 'Empresa', price_company: 'Distribuidor' });
        }
    };

    const loadTierFormulas = (tier, formulasData) => {
        const formulaObj = formulasData[tier];
        if (Array.isArray(formulaObj)) {
            setDefaultDistorters(formulaObj);
            setSpecialRules([]);
        } else if (formulaObj && typeof formulaObj === 'object') {
            setDefaultDistorters(formulaObj.default_distorters || []);
            setSpecialRules(formulaObj.rules || []);
        } else {
            const defaultMargs = {
                price_unit: [{ label: 'Márgen Base', type: 'percentage', value: 40 }],
                price_bulk: [{ label: 'Márgen Mayorista', type: 'percentage', value: 20 }],
                price_business: [{ label: 'Márgen Empresa', type: 'percentage', value: 15 }],
                price_company: [{ label: 'Márgen Distribuidor', type: 'percentage', value: 10 }]
            };
            setDefaultDistorters(defaultMargs[tier] || [{ label: 'Márgen', type: 'percentage', value: 0 }]);
            setSpecialRules([]);
        }
    };

    const fetchFormulas = async () => {
        try {
            const { data } = await axios.get(`${API_URL}/settings/price_formulas`);
            if (data && Object.keys(data).length > 0) {
                setFormulas(data);
                loadTierFormulas(targetTier, data);
            }
        } catch (err) {
            console.warn("Settings table missing or formulas empty.");
        }
    };

    const handleTargetTierChange = (newTier) => {
        setTargetTier(newTier);
        loadTierFormulas(newTier, formulas);
    };

    const fetchVariants = async () => {
        setLoadingVariants(true);
        try {
            const { data } = await axios.get(`${API_URL}/products/variants`);
            setVariants(data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingVariants(false);
        }
    };

    // General Distorters Handlers
    const addDefaultDistorter = () => {
        setDefaultDistorters([...defaultDistorters, { label: '', type: 'percentage', value: 0 }]);
    };
    const removeDefaultDistorter = (idx) => {
        const updated = [...defaultDistorters];
        updated.splice(idx, 1);
        setDefaultDistorters(updated);
    };
    const updateDefaultDistorter = (idx, field, val) => {
        const updated = [...defaultDistorters];
        updated[idx][field] = field === 'value' ? parseFloat(val) || 0 : val;
        setDefaultDistorters(updated);
    };

    // Special Rules Handlers
    const addSpecialRule = () => {
        const newRule = {
            id: 'rule_' + Date.now(),
            name: 'REGLA ESPECIAL #' + (specialRules.length + 1),
            provider_id: '',
            family_id: '',
            distorters: [{ label: 'Márgen', type: 'percentage', value: 10 }]
        };
        setSpecialRules([...specialRules, newRule]);
    };
    const removeSpecialRule = (ruleId) => {
        setSpecialRules(specialRules.filter(r => r.id !== ruleId));
    };
    const updateSpecialRuleHeader = (ruleId, field, val) => {
        setSpecialRules(specialRules.map(r => {
            if (r.id !== ruleId) return r;
            return { ...r, [field]: val };
        }));
    };
    const addDistorterToRule = (ruleId) => {
        setSpecialRules(specialRules.map(r => {
            if (r.id !== ruleId) return r;
            return { ...r, distorters: [...r.distorters, { label: 'Márgen', type: 'percentage', value: 0 }] };
        }));
    };
    const removeDistorterFromRule = (ruleId, dIdx) => {
        setSpecialRules(specialRules.map(r => {
            if (r.id !== ruleId) return r;
            const updated = [...r.distorters];
            updated.splice(dIdx, 1);
            return { ...r, distorters: updated };
        }));
    };
    const updateDistorterInRule = (ruleId, dIdx, field, val) => {
        setSpecialRules(specialRules.map(r => {
            if (r.id !== ruleId) return r;
            const updated = [...r.distorters];
            updated[dIdx] = { ...updated[dIdx], [field]: field === 'value' ? parseFloat(val) || 0 : val };
            return { ...r, distorters: updated };
        }));
    };

    // Apply rules-based pricing in bulk
    const handleApplyComposition = async () => {
        const confirmMsg = `¿Estás seguro de recalcular y sincronizar toda la lista de precios "${priceLabels[targetTier]}" aplicando las reglas generales y condicionales?\nSe procesará sobre los precios de costo (Base) de todas las variantes.`;
        if (!window.confirm(confirmMsg)) return;

        setStatus('loading');
        try {
            const newFormulaConfig = {
                default_distorters: defaultDistorters,
                rules: specialRules
            };
            const updatedFormulas = { ...formulas, [targetTier]: newFormulaConfig };
            setFormulas(updatedFormulas);
            await axios.post(`${API_URL}/settings/price_formulas`, { value: updatedFormulas });

            const res = await axios.post(`${API_URL}/prices/compose`, {
                target_tier: targetTier,
                rules: specialRules,
                default_distorters: defaultDistorters
            });
            alert(`¡Reglas de precios aplicadas y sincronizadas con éxito! Se actualizaron ${res.data.count} variantes.`);
            setStatus('success');
            setTimeout(() => setStatus(null), 2000);
            fetchVariants(); // Refresh table grid
        } catch (err) {
            console.error(err);
            setStatus('error');
            alert("Error al aplicar las reglas: " + (err.response?.data?.error || err.message));
        }
    };

    // Filter grid variants based on search term
    const displayVariants = variants.filter(v => {
        if (!v.products) return false;
        if (showOnlyAffected) {
            // Highlight products that match at least one special rule
            const prod = v.products;
            const matchesRule = specialRules.some(r => {
                if (r.provider_id && r.family_id) return r.provider_id == prod.provider_id && r.family_id == prod.family_id;
                if (r.provider_id) return r.provider_id == prod.provider_id;
                if (r.family_id) return r.family_id == prod.family_id;
                return false;
            });
            if (!matchesRule) return false;
        }
        const desc = `${v.products?.name || ''} ${v.name || ''} ${v.code || ''}`.toLowerCase();
        return desc.includes(searchTerm.toLowerCase());
    });

    return (
        <div className="grid grid-cols-12 gap-6 h-[calc(100vh-140px)] min-h-0 overflow-hidden">
            {/* LEFT COLUMN: Price Composer (col-span-7) */}
            <div className="col-span-12 lg:col-span-6 bg-white border border-analyst-200 rounded-2xl p-6 shadow-sm relative overflow-hidden flex flex-col justify-between h-full min-h-0">
                <div className="absolute top-0 left-0 w-2.5 h-full bg-primary"></div>
                
                <div className="flex flex-col flex-1 min-h-0 space-y-4">
                    {/* Header Title */}
                    <div className="flex items-center justify-between pb-3 border-b border-analyst-100 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-blue-50 text-primary rounded-xl">
                                <span className="material-symbols-outlined text-xl font-bold">query_stats</span>
                            </div>
                            <div>
                                <h3 className="font-black text-xs uppercase tracking-[0.1em] text-analyst-900 leading-tight">Esquema Jerárquico de Precios</h3>
                                <p className="text-[10px] text-analyst-400 font-bold uppercase tracking-tighter mt-0.5">Define y aplica sub-precios por proveedor/familia</p>
                            </div>
                        </div>
                    </div>

                    {/* Target List Selector */}
                    <div className="flex items-center gap-4 bg-analyst-50/50 p-3 rounded-xl border border-analyst-100 shrink-0">
                        <div className="flex flex-col gap-1 w-full">
                            <label className="text-[9px] font-black text-analyst-400 uppercase tracking-widest px-1">Seleccionar Lista de Destino</label>
                            <select 
                                className="bg-white !h-9 border-analyst-200 text-[11px] font-bold uppercase rounded-xl pl-3 focus:ring-2 focus:ring-primary/20 outline-none"
                                value={targetTier}
                                onChange={(e) => handleTargetTierChange(e.target.value)}
                            >
                                {Object.keys(priceLabels).map(key => {
                                    if (key === 'base_price') return null;
                                    return <option key={key} value={key}>{priceLabels[key].toUpperCase()}</option>
                                })}
                            </select>
                        </div>
                    </div>

                    {/* Rules Tabs */}
                    <div className="flex border-b border-analyst-100 shrink-0">
                        <button
                            onClick={() => setActiveTab('general')}
                            className={`flex-1 py-2 text-center text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${
                                activeTab === 'general'
                                    ? 'border-primary text-primary'
                                    : 'border-transparent text-analyst-400 hover:text-analyst-600'
                            }`}
                        >
                            Regla General (Default)
                        </button>
                        <button
                            onClick={() => setActiveTab('conditional')}
                            className={`flex-1 py-2 text-center text-[10px] font-black uppercase tracking-widest border-b-2 transition-all flex justify-center items-center gap-2 ${
                                activeTab === 'conditional'
                                    ? 'border-primary text-primary'
                                    : 'border-transparent text-analyst-400 hover:text-analyst-600'
                            }`}
                        >
                            Reglas Especiales ({specialRules.length})
                        </button>
                    </div>

                    {/* Active Tab Content Area */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-1 min-h-0 space-y-4">
                        {activeTab === 'general' ? (
                            <div className="space-y-3">
                                <div className="flex justify-between items-center px-1 shrink-0">
                                    <span className="text-[9px] font-black text-analyst-400 uppercase tracking-widest">Secuencia de Margen / Descuento</span>
                                    <button 
                                        onClick={addDefaultDistorter}
                                        className="text-[9px] font-black text-primary uppercase bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 transition-all flex items-center gap-1.5"
                                    >
                                        <span className="material-symbols-outlined text-xs">add</span>
                                        Añadir Modificador
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    {defaultDistorters.map((d, index) => (
                                        <div key={index} className="flex gap-2 items-center bg-white border border-analyst-100 p-2.5 rounded-xl shadow-sm hover:border-analyst-200 transition-all">
                                            <input 
                                                type="text"
                                                className="bg-analyst-50 !h-8 border-analyst-100 text-[10px] font-bold uppercase rounded-lg w-28 px-2 focus:bg-white transition-all outline-none"
                                                value={d.label || ''}
                                                onChange={(e) => updateDefaultDistorter(index, 'label', e.target.value)}
                                                placeholder={`Modificador #${index + 1}`}
                                            />
                                            
                                            <select 
                                                className="bg-analyst-50 !h-8 border-analyst-100 text-[10px] font-bold uppercase rounded-lg w-32 outline-none"
                                                value={d.type}
                                                onChange={(e) => updateDefaultDistorter(index, 'type', e.target.value)}
                                            >
                                                <option value="percentage">PORCENTAJE (%)</option>
                                                <option value="fixed">MONTO FIJO ($)</option>
                                            </select>

                                            <div className="relative w-24">
                                                <input 
                                                    type="number"
                                                    className="w-full bg-analyst-50 !h-8 pl-2 pr-6 font-black text-analyst-800 border-analyst-100 rounded-lg text-xs outline-none"
                                                    value={d.value}
                                                    onChange={(e) => updateDefaultDistorter(index, 'value', e.target.value)}
                                                    placeholder="0"
                                                />
                                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-black text-analyst-400">
                                                    {d.type === 'percentage' ? '%' : '$'}
                                                </span>
                                            </div>

                                            <button 
                                                onClick={() => removeDefaultDistorter(index)}
                                                disabled={defaultDistorters.length <= 1}
                                                className="text-red-400 hover:text-red-600 disabled:opacity-30 p-1 rounded-lg hover:bg-red-50 transition-all ml-auto"
                                            >
                                                <span className="material-symbols-outlined text-sm">delete</span>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center px-1">
                                    <span className="text-[9px] font-black text-analyst-400 uppercase tracking-widest">Sub-reglas condicionales</span>
                                    <button 
                                        onClick={addSpecialRule}
                                        className="text-[9px] font-black text-white bg-slate-800 hover:bg-slate-900 px-4 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
                                    >
                                        <span className="material-symbols-outlined text-xs">add</span>
                                        Nueva Regla Condicional
                                    </button>
                                </div>

                                {specialRules.length === 0 ? (
                                    <div className="text-center py-10 border border-dashed border-analyst-200 rounded-2xl text-[10px] text-analyst-400 font-bold uppercase tracking-wider">
                                        No hay reglas condicionales para esta lista de precios
                                    </div>
                                ) : (
                                    specialRules.map((rule) => (
                                        <div key={rule.id} className="bg-analyst-50/30 border border-analyst-200 rounded-xl p-4 space-y-3 relative shadow-sm hover:border-primary/20 transition-all">
                                            {/* Header fields */}
                                            <div className="grid grid-cols-12 gap-3 items-center">
                                                <div className="col-span-5">
                                                    <input
                                                        type="text"
                                                        className="w-full bg-white !h-8 border-analyst-200 text-[10px] font-black uppercase rounded-lg px-2"
                                                        value={rule.name}
                                                        onChange={(e) => updateSpecialRuleHeader(rule.id, 'name', e.target.value)}
                                                    />
                                                </div>
                                                <div className="col-span-3">
                                                    <select
                                                        className="w-full bg-white !h-8 border-analyst-200 text-[9px] font-bold uppercase rounded-lg"
                                                        value={rule.provider_id || ''}
                                                        onChange={(e) => updateSpecialRuleHeader(rule.id, 'provider_id', e.target.value)}
                                                    >
                                                        <option value="">- PROVEEDOR -</option>
                                                        {options.providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                    </select>
                                                </div>
                                                <div className="col-span-3">
                                                    <select
                                                        className="w-full bg-white !h-8 border-analyst-200 text-[9px] font-bold uppercase rounded-lg"
                                                        value={rule.family_id || ''}
                                                        onChange={(e) => updateSpecialRuleHeader(rule.id, 'family_id', e.target.value)}
                                                    >
                                                        <option value="">- FAMILIA -</option>
                                                        {options.families.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                                    </select>
                                                </div>
                                                <div className="col-span-1 text-right">
                                                    <button
                                                        onClick={() => removeSpecialRule(rule.id)}
                                                        className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all"
                                                    >
                                                        <span className="material-symbols-outlined text-base">delete_forever</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Distorters nested list */}
                                            <div className="border-t border-analyst-100 pt-2 space-y-2">
                                                <div className="flex justify-between items-center px-1">
                                                    <span className="text-[8px] font-black text-analyst-400 uppercase tracking-widest">Modificadores secuenciales</span>
                                                    <button
                                                        onClick={() => addDistorterToRule(rule.id)}
                                                        className="text-[8px] font-black text-primary uppercase hover:underline"
                                                    >
                                                        + Añadir Modificador
                                                    </button>
                                                </div>

                                                <div className="space-y-1.5">
                                                    {rule.distorters.map((d, dIdx) => (
                                                        <div key={dIdx} className="flex gap-2 items-center bg-white border border-analyst-100 p-1.5 rounded-lg shadow-sm">
                                                            <input
                                                                type="text"
                                                                className="bg-analyst-50 !h-7 border-analyst-100 text-[9px] font-bold uppercase rounded w-24 px-1.5 outline-none"
                                                                value={d.label || ''}
                                                                onChange={(e) => updateDistorterInRule(rule.id, dIdx, 'label', e.target.value)}
                                                                placeholder={`Modificador #${dIdx + 1}`}
                                                            />
                                                            <select
                                                                className="bg-analyst-50 !h-7 border-analyst-100 text-[9px] font-bold uppercase rounded w-28 outline-none"
                                                                value={d.type}
                                                                onChange={(e) => updateDistorterInRule(rule.id, dIdx, 'type', e.target.value)}
                                                            >
                                                                <option value="percentage">PORCENTAJE (%)</option>
                                                                <option value="fixed">MONTO FIJO ($)</option>
                                                            </select>
                                                            <div className="relative w-20">
                                                                <input
                                                                    type="number"
                                                                    className="w-full bg-analyst-50 !h-7 pl-1.5 pr-5 font-black text-analyst-800 border-analyst-100 rounded text-[10px] outline-none"
                                                                    value={d.value}
                                                                    onChange={(e) => updateDistorterInRule(rule.id, dIdx, 'value', e.target.value)}
                                                                    placeholder="0"
                                                                />
                                                                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] font-black text-analyst-400">
                                                                    {d.type === 'percentage' ? '%' : '$'}
                                                                </span>
                                                            </div>
                                                            <button
                                                                onClick={() => removeDistorterFromRule(rule.id, dIdx)}
                                                                disabled={rule.distorters.length <= 1}
                                                                className="text-red-400 hover:text-red-600 disabled:opacity-30 p-0.5 rounded transition-all ml-auto"
                                                            >
                                                                <span className="material-symbols-outlined text-xs">close</span>
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Bottom Actions Row */}
                <div className="mt-4 pt-3 border-t border-analyst-100 flex items-center justify-between shrink-0">
                    <div className="flex flex-col">
                        <span className="text-[8px] font-black text-analyst-400 uppercase tracking-widest">Base de Datos</span>
                        <span className="text-[10px] font-black text-primary leading-none mt-1">
                            {variants.length} variantes globales
                        </span>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowOnlyAffected(!showOnlyAffected)}
                            className={`h-9 px-4 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 border ${
                                showOnlyAffected 
                                    ? 'bg-blue-50 border-primary text-primary shadow-sm' 
                                    : 'bg-white border-analyst-200 text-analyst-600 hover:bg-analyst-50'
                            }`}
                        >
                            <span className="material-symbols-outlined text-sm">
                                {showOnlyAffected ? 'visibility' : 'filter_alt'}
                            </span>
                            {showOnlyAffected ? 'Ver Todos' : 'Ver Condicionales'}
                        </button>
                        <button
                            onClick={handleApplyComposition}
                            disabled={status === 'loading'}
                            className="bg-primary text-white h-9 px-6 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-2"
                        >
                            {status === 'loading' ? (
                                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-base">science</span>
                                    Recalcular y Aplicar Todo
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* RIGHT COLUMN: Real-Time Price Grid (col-span-5) */}
            <div className="col-span-12 lg:col-span-6 bg-white border border-analyst-200 shadow-sm overflow-hidden rounded-2xl flex flex-col h-full min-h-0">
                {/* Search Bar Toolbar */}
                <div className="px-5 py-4 bg-white border-b border-analyst-100 flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0">
                    <div className="flex items-center gap-2 shrink-0">
                        <span className="material-symbols-outlined text-primary text-xl">table_rows</span>
                        <h3 className="font-bold text-xs text-analyst-900 uppercase tracking-tight">Hoja de Control de Precios</h3>
                    </div>
                    
                    <div className="relative w-full sm:w-64">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-analyst-400 text-base">search</span>
                        <input
                            className="pl-9 pr-4 py-0 text-[11px] font-bold bg-analyst-50 border-analyst-200 w-full h-8 focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary rounded-lg transition-all outline-none"
                            placeholder="Buscar en la grilla..."
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Table Layout */}
                <div className="flex-1 overflow-y-auto overflow-x-auto custom-scrollbar min-h-0">
                    <table className="min-w-full text-left">
                        <thead>
                            <tr className="bg-analyst-50 text-[9px] font-black uppercase text-analyst-500 sticky top-0 z-10 border-b border-analyst-100">
                                <th className="px-4 py-3 w-24">Código</th>
                                <th className="px-4 py-3 min-w-[150px]">Producto/Variante</th>
                                <th className="px-3 py-3 w-24 text-right bg-slate-50">Costo (Base)</th>
                                {Object.keys(priceLabels).map(key => {
                                    if (key === 'base_price') return null;
                                    return (
                                        <th key={key} className={`px-4 py-3 w-24 text-right font-black ${key === targetTier ? 'text-primary bg-blue-50/20' : 'text-analyst-500'}`}>
                                            {priceLabels[key]}
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-analyst-100 bg-white">
                            {loadingVariants ? (
                                Array.from({ length: 12 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={4 + Object.keys(priceLabels).length} className="h-10 bg-slate-50/50"></td>
                                    </tr>
                                ))
                            ) : displayVariants.length === 0 ? (
                                <tr>
                                    <td colSpan={4 + Object.keys(priceLabels).length} className="text-center py-12 text-analyst-400 font-bold uppercase text-[9px] tracking-widest">
                                        No se encontraron variantes en el sistema
                                    </td>
                                </tr>
                            ) : (
                                displayVariants.map(v => (
                                    <tr key={v.id} className="hover:bg-analyst-50/40 transition-colors text-[10px]">
                                        <td className="px-4 py-3 font-mono font-black text-primary uppercase">
                                            {v.code || '-'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="font-black text-analyst-900 uppercase leading-snug">
                                                {v.products?.name}
                                            </div>
                                            <div className="text-analyst-400 font-bold mt-0.5 uppercase">
                                                {v.name}
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 text-right font-mono font-black text-analyst-800 bg-slate-50/30">
                                            ${(v.base_price || 0).toFixed(2)}
                                        </td>
                                        {Object.keys(priceLabels).map(key => {
                                            if (key === 'base_price') return null;
                                            return (
                                                <td key={key} className={`px-4 py-3 text-right font-mono font-black ${key === targetTier ? 'text-primary bg-blue-50/5' : 'text-analyst-700'}`}>
                                                    ${(v[key] || 0).toFixed(2)}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer status counter */}
                <div className="px-5 py-2.5 bg-analyst-50 border-t border-analyst-100 flex justify-between items-center text-[9px] font-black uppercase text-analyst-400 tracking-widest shrink-0">
                    <span>Grilla de Auditoría Activa</span>
                    <span>Total: {displayVariants.length} variantes</span>
                </div>
            </div>
        </div>
    );
};

export default PriceManager;
