import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

const StockManager = () => {
    const [variants, setVariants] = useState([]);
    const [movements, setMovements] = useState([]);
    const [loading, setLoading] = useState(true);

    // Form state
    const [form, setForm] = useState({
        variant_id: '',
        type: 'intake', // 'intake', 'adjustment'
        quantity: '',
        reference: '',
        adjustmentType: 'add' // 'add' (suma), 'subtract' (resta) for adjustments
    });

    // Filters state
    const [filters, setFilters] = useState({
        search: '',
        type: 'all',
        dateFrom: '',
        dateTo: ''
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [vRes, mRes] = await Promise.all([
                axios.get(`${API_URL}/products/variants`).catch(() => ({ data: [] })),
                axios.get(`${API_URL}/stock-movements`).catch(() => ({ data: [] }))
            ]);
            setVariants(vRes.data || []);
            setMovements(mRes.data || []);
        } catch (e) {
            console.error('Error fetching stock data:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        if (!form.variant_id || !form.quantity) {
            alert('Por favor complete los campos obligatorios.');
            return;
        }

        let qty = parseInt(form.quantity) || 0;
        if (qty <= 0) {
            alert('La cantidad debe ser un número entero positivo.');
            return;
        }

        // If it's a subtraction adjustment, store as negative quantity
        if (form.type === 'adjustment' && form.adjustmentType === 'subtract') {
            qty = -qty;
        }

        try {
            if (form.type === 'intake') {
                await axios.post(`${API_URL}/stock/intake`, {
                    variant_id: form.variant_id,
                    quantity: qty,
                    reference: form.reference || 'Ingreso manual'
                });
            } else {
                await axios.post(`${API_URL}/stock/adjustment`, {
                    variant_id: form.variant_id,
                    quantity: qty,
                    reference: form.reference || 'Ajuste manual'
                });
            }

            alert('Movimiento de stock registrado con éxito.');
            setForm({
                variant_id: '',
                type: 'intake',
                quantity: '',
                reference: '',
                adjustmentType: 'add'
            });
            fetchData();
        } catch (error) {
            console.error(error);
            alert('Error al registrar el movimiento de stock.');
        }
    };

    // Filter movements list
    const filteredMovements = movements.filter(m => {
        // Search text matching product name, variant name, code, reference
        const query = filters.search.toLowerCase();
        const matchesSearch = !query || 
            (m.product_variants?.products?.name || '').toLowerCase().includes(query) ||
            (m.product_variants?.name || '').toLowerCase().includes(query) ||
            (m.product_variants?.code || '').toLowerCase().includes(query) ||
            (m.reference || '').toLowerCase().includes(query);

        // Type filter
        let matchesType = true;
        if (filters.type !== 'all') {
            matchesType = m.type === filters.type;
        }

        // Date range filter
        let matchesDate = true;
        const movementDate = new Date(m.created_at);
        if (filters.dateFrom) {
            const fromDate = new Date(filters.dateFrom);
            fromDate.setHours(0, 0, 0, 0);
            matchesDate = matchesDate && movementDate >= fromDate;
        }
        if (filters.dateTo) {
            const toDate = new Date(filters.dateTo);
            toDate.setHours(23, 59, 59, 999);
            matchesDate = matchesDate && movementDate <= toDate;
        }

        return matchesSearch && matchesType && matchesDate;
    });

    // Calculations for summary stats
    const totalIntakeQty = movements.filter(m => m.type === 'intake').reduce((a, c) => a + (c.quantity || 0), 0);
    const totalSaleQty = movements.filter(m => m.type === 'sale').reduce((a, c) => a + Math.abs(c.quantity || 0), 0);
    const totalAdjQty = movements.filter(m => m.type === 'adjustment').reduce((a, c) => a + (c.quantity || 0), 0);

    return (
        <div className="flex-1 bg-white border border-analyst-200 shadow-sm rounded-xl flex flex-col min-h-0 overflow-hidden">
            {/* Header / Summary Metrics */}
            <div className="px-6 py-4 bg-slate-50 border-b border-analyst-100 grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
                <div className="bg-white border border-analyst-150 p-3.5 rounded-xl shadow-sm flex items-center gap-3">
                    <div className="p-2 bg-green-50 text-green-600 rounded-lg"><span className="material-symbols-outlined font-black">add_circle</span></div>
                    <div>
                        <p className="text-[8.5px] font-black text-analyst-400 uppercase tracking-widest leading-none">Ingresos Totales</p>
                        <p className="text-sm font-black text-slate-800 mt-1">+{totalIntakeQty} u.</p>
                    </div>
                </div>
                <div className="bg-white border border-analyst-150 p-3.5 rounded-xl shadow-sm flex items-center gap-3">
                    <div className="p-2 bg-red-50 text-red-500 rounded-lg"><span className="material-symbols-outlined font-black">remove_circle</span></div>
                    <div>
                        <p className="text-[8.5px] font-black text-analyst-400 uppercase tracking-widest leading-none">Ventas / Egresos</p>
                        <p className="text-sm font-black text-slate-800 mt-1">-{totalSaleQty} u.</p>
                    </div>
                </div>
                <div className="bg-white border border-analyst-150 p-3.5 rounded-xl shadow-sm flex items-center gap-3">
                    <div className="p-2 bg-amber-50 text-amber-500 rounded-lg"><span className="material-symbols-outlined font-black">handshake</span></div>
                    <div>
                        <p className="text-[8.5px] font-black text-analyst-400 uppercase tracking-widest leading-none">Ajustes Neto</p>
                        <p className="text-sm font-black text-slate-800 mt-1">{totalAdjQty >= 0 ? `+${totalAdjQty}` : totalAdjQty} u.</p>
                    </div>
                </div>
                <div className="bg-white border border-analyst-150 p-3.5 rounded-xl shadow-sm flex items-center gap-3">
                    <div className="p-2 bg-primary/10 text-primary rounded-lg"><span className="material-symbols-outlined font-black">history</span></div>
                    <div>
                        <p className="text-[8.5px] font-black text-analyst-400 uppercase tracking-widest leading-none">Total Transacciones</p>
                        <p className="text-sm font-black text-slate-800 mt-1">{movements.length} movs.</p>
                    </div>
                </div>
            </div>

            {/* Main Content split */}
            <div className="flex-1 flex flex-col lg:flex-row gap-6 p-6 min-h-0 overflow-hidden bg-slate-50/20">
                {/* Left Column: Register movement form */}
                <div className="lg:w-[30%] bg-white border border-slate-200 rounded-2xl p-5 shadow-sm shrink-0 flex flex-col">
                    <h4 className="text-[11px] font-black uppercase text-slate-800 pb-2 border-b border-slate-100 mb-4 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm text-primary">add_to_photos</span>
                        Registrar Movimiento stock
                    </h4>

                    <form onSubmit={handleFormSubmit} className="space-y-4 text-[10px] font-bold flex-1 flex flex-col justify-between">
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Tipo de Operación</label>
                                <select
                                    value={form.type}
                                    onChange={(e) => setForm(prev => ({ ...prev, type: e.target.value }))}
                                    className="w-full border-slate-200 bg-slate-50 rounded-lg text-xs font-bold"
                                >
                                    <option value="intake">Ingreso de Mercadería</option>
                                    <option value="adjustment">Ajuste / Auditoría / Roturas</option>
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Producto / Variante</label>
                                <select
                                    required
                                    value={form.variant_id}
                                    onChange={(e) => setForm(prev => ({ ...prev, variant_id: e.target.value }))}
                                    className="w-full border-slate-200 bg-slate-50 rounded-lg text-xs font-bold"
                                >
                                    <option value="">- SELECCIONAR VARIANTES -</option>
                                    {variants.map(v => (
                                        <option key={v.id} value={v.id}>
                                            {String(v.code || '').toUpperCase()} - {String(v.products?.name || '').toUpperCase()} ({String(v.name || '').toUpperCase()}) [STOCK: {v.stock}]
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {form.type === 'adjustment' && (
                                <div className="space-y-1 bg-amber-50/50 p-2.5 rounded-xl border border-amber-100">
                                    <label className="text-[8px] font-black text-amber-700 uppercase tracking-wider block mb-1">Acción del Ajuste</label>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setForm(prev => ({ ...prev, adjustmentType: 'add' }))}
                                            className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all border ${form.adjustmentType === 'add' ? 'bg-amber-500 border-amber-500 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-500'}`}
                                        >
                                            Sumar Stock
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setForm(prev => ({ ...prev, adjustmentType: 'subtract' }))}
                                            className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all border ${form.adjustmentType === 'subtract' ? 'bg-red-500 border-red-500 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-500'}`}
                                        >
                                            Restar Stock
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-1">
                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Cantidad de Unidades</label>
                                <input
                                    type="number"
                                    min="1"
                                    required
                                    value={form.quantity}
                                    onChange={(e) => setForm(prev => ({ ...prev, quantity: parseInt(e.target.value) || '' }))}
                                    className="w-full border-slate-200 bg-slate-50 rounded-lg text-xs"
                                    placeholder="Ej: 20"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Referencia (Factura / Remito / Motivo)</label>
                                <input
                                    type="text"
                                    required
                                    value={form.reference}
                                    onChange={(e) => setForm(prev => ({ ...prev, reference: e.target.value }))}
                                    className="w-full border-slate-200 bg-slate-50 rounded-lg text-xs"
                                    placeholder={form.type === 'intake' ? 'Ej: Factura A-2022' : 'Ej: Rotura de empaque o Auditoría'}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="w-full py-2.5 bg-slate-800 hover:bg-black text-white rounded-xl text-[10px] font-black uppercase transition-all shadow mt-6"
                        >
                            Registrar Operación stock
                        </button>
                    </form>
                </div>

                {/* Right Column: General History Table with Filters */}
                <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col min-h-0 overflow-hidden">
                    {/* Filters Header bar */}
                    <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3 shrink-0">
                        <div className="flex flex-col md:flex-row gap-3">
                            <div className="flex-1 relative">
                                <input
                                    type="text"
                                    placeholder="Buscar por producto, variante, código o factura..."
                                    value={filters.search}
                                    onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                                    className="w-full border-slate-250 bg-white rounded-xl text-[10px] font-bold py-2 px-3 focus:ring-primary"
                                />
                            </div>
                            <div className="w-full md:w-44">
                                <select
                                    value={filters.type}
                                    onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}
                                    className="w-full border-slate-250 bg-white rounded-xl text-[10px] font-bold py-2 focus:ring-primary"
                                >
                                    <option value="all">TODOS LOS MOVIMIENTOS</option>
                                    <option value="intake">INGRESOS DE MERCADERÍA</option>
                                    <option value="sale">VENTAS / PEDIDOS</option>
                                    <option value="adjustment">AJUSTES / CORRECCIONES</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-3 items-center text-[10px] font-bold text-slate-500 uppercase">
                            <span className="shrink-0 text-[8px] font-black tracking-widest text-slate-400">Filtrar por Fecha:</span>
                            <div className="flex items-center gap-2">
                                <input
                                    type="date"
                                    value={filters.dateFrom}
                                    onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                                    className="border-slate-250 rounded-xl text-[9px] py-1 px-2 font-bold"
                                />
                                <span>Hasta</span>
                                <input
                                    type="date"
                                    value={filters.dateTo}
                                    onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                                    className="border-slate-250 rounded-xl text-[9px] py-1 px-2 font-bold"
                                />
                            </div>
                            <button
                                onClick={() => setFilters({ search: '', type: 'all', dateFrom: '', dateTo: '' })}
                                className="ml-auto py-1 px-3 border border-slate-200 rounded-lg hover:bg-white text-[9px] font-black uppercase text-slate-600 transition-all flex items-center gap-1"
                            >
                                <span className="material-symbols-outlined text-xs">filter_alt_off</span>
                                Limpiar Filtros
                            </button>
                        </div>
                    </div>

                    {/* Table Body Area */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-900 text-white text-[8px] font-black uppercase tracking-wider sticky top-0 z-10">
                                    <th className="px-4 py-2 w-32">FECHA Y HORA</th>
                                    <th className="px-4 py-2">PRODUCTO / VARIANTE</th>
                                    <th className="px-4 py-2 text-center w-28">TIPO</th>
                                    <th className="px-4 py-2 text-center w-24">CANTIDAD</th>
                                    <th className="px-4 py-2">REFERENCIA DE CONTROL</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-[10px] font-bold">
                                {loading ? (
                                    <tr>
                                        <td colSpan="5" className="text-center py-20 text-slate-300">
                                            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                                            Cargando movimientos...
                                        </td>
                                    </tr>
                                ) : filteredMovements.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="text-center py-20 text-[9px] font-black text-slate-400 uppercase tracking-widest">Sin registros coincidentes</td>
                                    </tr>
                                ) : (
                                    filteredMovements.map(m => (
                                        <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-4 py-2 font-mono text-slate-400">
                                                {new Date(m.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                                            </td>
                                            <td className="px-4 py-2">
                                                <p className="uppercase text-slate-800 font-black leading-tight">{m.product_variants?.products?.name}</p>
                                                <p className="text-[8.5px] text-slate-400 uppercase font-mono mt-0.5">{m.product_variants?.code} - {m.product_variants?.name}</p>
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                                <span className={`px-2.5 py-0.5 rounded font-black text-[8px] uppercase ${
                                                    m.type === 'intake' ? 'bg-green-50 text-green-600 border border-green-200' :
                                                    m.type === 'sale' ? 'bg-red-50 text-red-500 border border-red-200' :
                                                    'bg-amber-50 text-amber-600 border border-amber-200'
                                                }`}>
                                                    {m.type === 'intake' ? 'INGRESO' : m.type === 'sale' ? 'VENTA' : 'AJUSTE'}
                                                </span>
                                            </td>
                                            <td className={`px-4 py-2 text-center font-black ${m.quantity > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                {m.quantity > 0 ? `+${m.quantity}` : m.quantity} u.
                                            </td>
                                            <td className="px-4 py-2 text-slate-600 uppercase font-mono">{m.reference || '-'}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StockManager;
