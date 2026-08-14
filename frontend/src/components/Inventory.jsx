import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

const Inventory = ({ refreshTrigger }) => {
    const [variants, setVariants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [priceLabels, setPriceLabels] = useState({});
    const [margins, setMargins] = useState({ price_unit: 40, price_bulk: 20, price_business: 15, price_company: 10 });
    const [options, setOptions] = useState({ families: [], groups: [], providers: [] });

    useEffect(() => {
        fetchData();
    }, [refreshTrigger]);

    const fetchData = async () => {
        try {
            const [vRes, sRes, mRes, fRes, gRes, pRes] = await Promise.all([
                axios.get(`${API_URL}/products/variants`).catch(e => ({ data: [] })),
                axios.get(`${API_URL}/settings/price_labels`).catch(e => ({ data: {} })),
                axios.get(`${API_URL}/settings/price_margins`).catch(e => ({ data: {} })),
                axios.get(`${API_URL}/families`).catch(e => ({ data: [] })),
                axios.get(`${API_URL}/groups`).catch(e => ({ data: [] })),
                axios.get(`${API_URL}/providers`).catch(e => ({ data: [] }))
            ]);
            setVariants(vRes.data || []);
            const labels = sRes.data || {};
            // If labels are empty, provide defaults so prices are visible
            if (Object.keys(labels).length === 0) {
                setPriceLabels({ price_unit: 'Precio Base', price_bulk: 'Mayorista' });
            } else {
                setPriceLabels(labels);
            }
            if (mRes.data && Object.keys(mRes.data).length > 0) {
                setMargins(mRes.data);
            }
            setOptions({
                families: fRes.data || [],
                groups: gRes.data || [],
                providers: pRes.data || []
            });
            setLoading(false);
        } catch (err) {
            console.error(err);
            setLoading(false);
        }
    };

    const [statusFilter, setStatusFilter] = useState('all'); // all, active, inactive
    const [editingProduct, setEditingProduct] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [editVariants, setEditVariants] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [preview, setPreview] = useState(null);

    const filteredVariants = variants.filter(v => {
        const matchesSearch = v.products?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            v.code?.toLowerCase().includes(searchTerm.toLowerCase()); // Added SKU search
        const matchesStatus = statusFilter === 'all' ? true :
            statusFilter === 'active' ? v.is_active : !v.is_active;
        return matchesSearch && matchesStatus;
    });

    const openEdit = (v) => {
        if (!v.products) return;
        setEditingProduct(v.products);
        setPreview(v.products.image_url || null);
        setEditForm({
            name: v.products.name,
            description: v.products.description || '',
            image_url: v.products.image_url || '',
            is_offer: v.products.is_offer,
            pdf_format: v.products.pdf_format || '1',
            long_description: v.products.long_description || '',
            show_long_description: v.products.show_long_description || false,
            technical_columns: v.products.technical_columns || '',
            variant_separator: v.products.variant_separator || ' X ',
            provider_id: v.products.provider_id || '',
            family_id: v.products.family_id || '',
            group_id: v.products.group_id || ''
        });

        // Fetch all variants for this product to edit them
        const productVariants = variants.filter(av => av.product_id === v.product_id);
        setEditVariants(productVariants.map(pv => ({ ...pv })));
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploading(true);
        setPreview(URL.createObjectURL(file));
        try {
            const formData = new FormData();
            formData.append('image', file);
            const response = await axios.post(`${API_URL}/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setEditForm(prev => ({ ...prev, image_url: response.data.publicUrl }));
        } catch (error) {
            console.error('Upload error:', error);
            alert(`Error subiendo imagen: ${error.message}`);
        } finally {
            setUploading(false);
        }
    };

    const handleEditChange = (e) => {
        const { name, value, type, checked } = e.target;
        setEditForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const saveProductEdit = async () => {
        try {
            // Clean up variants for save (remove product ref to avoid recursion/size issues)
            const cleanVariants = editVariants.map(({ products, ...rest }) => rest);

            await axios.patch(`${API_URL}/products/${editingProduct.id}`, {
                product: editForm,
                variants: cleanVariants
            });
            alert("¡Producto y variantes guardados correctamente!");
            setEditingProduct(null);
            fetchData();
        } catch (err) {
            console.error(err);
            const errorMsg = err.response?.data?.message || err.response?.data?.details || err.message;
            alert("Error al guardar los cambios: " + errorMsg);
        }
    };

    const toggleStatus = async (v) => {
        try {
            const newStatus = !v.is_active;
            await axios.patch(`${API_URL}/products/variants/${v.id}`, { is_active: newStatus });
            fetchData();
        } catch (err) { console.error(err); }
    };

    const deleteProduct = async (productId) => {
        if (!window.confirm("¿Estás seguro de eliminar este producto y TODAS sus variantes? Esta acción no se puede deshacer.")) return;
        try {
            await axios.delete(`${API_URL}/products/${productId}`);
            alert("¡Producto eliminado exitosamente!");
            fetchData();
        } catch (err) {
            console.error(err);
            const errorMsg = err.response?.data?.message || err.response?.data?.details || err.message;
            alert("Error al eliminar el producto: " + errorMsg);
        }
    };

    return (
        <section className="flex-1 bg-white border border-analyst-200 shadow-sm overflow-hidden rounded-xl flex flex-col min-h-0 min-w-0">
            {/* Table Header / Toolbar */}
            <div className="px-5 py-4 bg-white border-b border-analyst-100 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-xl">table_chart</span>
                    <h3 className="font-bold text-xs text-analyst-900 uppercase tracking-tight">Cruce de Inventario Real-Time</h3>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex bg-analyst-50 p-0.5 rounded-lg border border-analyst-100">
                        {['all', 'active', 'inactive'].map(f => (
                            <button
                                key={f}
                                onClick={() => setStatusFilter(f)}
                                className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase transition-all ${statusFilter === f ? 'bg-white text-primary shadow-sm' : 'text-analyst-400 hover:text-analyst-600'}`}
                            >
                                {f === 'all' ? 'Todos' : f === 'active' ? 'Activos' : 'Inactivos'}
                            </button>
                        ))}
                    </div>
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-analyst-400 text-base">search</span>
                        <input
                            className="pl-9 pr-4 py-0 text-[11px] font-bold bg-analyst-50 border-analyst-200 w-80 h-8 focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary rounded-lg transition-all outline-none"
                            placeholder="Filtrar por nombre, código o atributo..."
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Main Table */}
            <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="min-w-full text-left">
                    <thead className="sticky top-0 z-10">
                        <tr className="bg-analyst-50/80 backdrop-blur-md">
                            <th className="w-14 text-center">ID</th>
                            <th className="w-14 text-center">FOTO</th>
                            <th className="w-32">CÓDIGO (SKU)</th>
                            <th className="min-w-[200px]">DESCRIPCIÓN DEL PRODUCTO</th>
                            <th className="w-32">FAMILIA</th>
                            <th className="w-32">PROVEEDOR</th>
                            {/* Dynamic Headers */}
                            {Object.keys(priceLabels).length > 0 ? Object.keys(priceLabels).map((key, idx) => (
                                <th key={key} className={`w-24 text-right ${idx === Object.keys(priceLabels).length - 1 ? 'text-primary font-black uppercase tracking-tighter' : ''}`}>
                                    {priceLabels[key]}
                                </th>
                            )) : (
                                <th className="w-24 text-right text-primary font-black uppercase tracking-tighter">PRECIO</th>
                            )}
                            <th className="w-20 text-center">STOCK</th>
                            <th className="w-24 text-center">ESTADO</th>
                            <th className="w-20 text-center">ACCIONES</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-analyst-100">
                        {loading ? (
                            Array.from({ length: 15 }).map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    <td colSpan="12" className="h-10 bg-slate-50/50"></td>
                                </tr>
                            ))
                        ) : filteredVariants.length === 0 ? (
                            <tr>
                                <td colSpan="12" className="text-center py-20 text-analyst-400 font-bold uppercase text-[10px] tracking-widest">
                                    No se encontraron registros en el sistema
                                </td>
                            </tr>
                        ) : (
                            filteredVariants.map((v) => (
                                <tr key={v.id} className={`spreadsheet-row group transition-colors ${!v.is_active ? 'opacity-50 grayscale' : ''}`}>
                                    <td className="text-center text-[10px] text-analyst-400 font-bold font-mono">
                                        #{v.id.toString().slice(-4).toUpperCase()}
                                    </td>
                                    <td className="text-center">
                                        <div className="w-8 h-8 mx-auto bg-white rounded border border-analyst-100 overflow-hidden flex items-center justify-center relative shadow-sm">
                                            {v.products?.image_url ? (
                                                <img src={v.products.image_url} className="w-full h-full object-cover" alt="Product" />
                                            ) : (
                                                <span className="material-symbols-outlined text-analyst-200 text-sm">image</span>
                                            )}
                                        </div>
                                    </td>
                                    <td>
                                        <span className="text-[10px] font-black text-primary font-mono bg-blue-50 px-2 py-1 rounded border border-blue-100 uppercase tracking-tighter">
                                            {v.code || 'S/N'}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                                <span className="font-black text-analyst-900 uppercase">{v.products?.name}</span>
                                                {v.products?.is_offer && <span className="text-[8px] bg-red-500 text-white px-1.5 py-0.5 rounded font-black uppercase animate-pulse">OFERTA</span>}
                                            </div>
                                            <span className="text-analyst-400 text-[10px] font-bold uppercase tracking-tighter mt-0.5">{v.name}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-[10px] text-analyst-400">
                                                {v.products?.families?.icon || 'layers'}
                                            </span>
                                            <span className="text-analyst-500 font-bold uppercase text-[9px] bg-analyst-50 px-2 py-0.5 rounded border border-analyst-100 whitespace-nowrap">
                                                {v.products?.families?.name || '-'}
                                            </span>
                                        </div>
                                    </td>
                                    <td>
                                        <span className="text-analyst-500 font-bold uppercase text-[9px] bg-slate-50 px-2 py-0.5 rounded border border-analyst-100 whitespace-nowrap">
                                            {v.products?.providers?.name || '-'}
                                        </span>
                                    </td>
                                    {Object.keys(priceLabels).length > 0 ? Object.keys(priceLabels).map((key, idx) => (
                                        <td key={key} className={`text-right font-mono text-[11px] ${idx === Object.keys(priceLabels).length - 1 ? 'text-primary font-black bg-blue-50/30' : 'text-analyst-700 font-bold'}`}>
                                            ${(v[key] || 0).toFixed(2)}
                                        </td>
                                    )) : (
                                        <td className="text-right font-mono text-[11px] text-primary font-black bg-blue-50/30">
                                            ${(v.price_unit || 0).toFixed(2)}
                                        </td>
                                    )}
                                    <td className="text-center">
                                        <div className={`inline-flex items-center justify-center min-w-[32px] h-6 px-2 rounded font-mono text-[11px] font-black border ${v.stock <= 5 ? 'bg-red-50 text-red-600 border-red-100 animate-pulse' : 'bg-green-50 text-green-600 border-green-100'}`}>
                                            {v.stock || 0}
                                        </div>
                                    </td>
                                    <td className="text-center">
                                        <button
                                            onClick={() => toggleStatus(v)}
                                            className={`text-[9px] px-2 py-0.5 font-black rounded-full uppercase border transition-all ${v.is_active ? 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100' : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'}`}
                                        >
                                            {v.is_active ? 'ACTIVO' : 'INACTIVO'}
                                        </button>
                                    </td>
                                    <td className="text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            <button
                                                onClick={() => openEdit(v)}
                                                className="w-7 h-7 flex items-center justify-center rounded-lg text-primary hover:bg-primary/10 transition-all"
                                                title="Editar Producto"
                                            >
                                                <span className="material-symbols-outlined text-base">edit</span>
                                            </button>
                                            <button
                                                onClick={() => deleteProduct(v.product_id)}
                                                className="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-500 transition-all group/del"
                                                title="Eliminar Producto"
                                            >
                                                <span className="material-symbols-outlined text-base">delete</span>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Footer / Stats bar */}
            <div className="px-5 py-3 bg-analyst-50 border-t border-analyst-200 flex justify-between items-center shrink-0">
                <div className="flex gap-6 items-center">
                    <p className="text-[9px] font-black text-analyst-400 uppercase tracking-widest leading-none">Control Maestro - {filteredVariants.length} Variantes Activas</p>
                    <div className="h-4 w-px bg-analyst-200"></div>
                    <div className="flex gap-4">
                        <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                            <span className="text-[9px] font-black text-analyst-600 uppercase">Sincronizado</span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button className="w-7 h-7 flex items-center justify-center rounded-lg border border-primary bg-primary text-[10px] text-white font-black shadow-md shadow-primary/20 transition-all">1</button>
                    <button className="w-7 h-7 flex items-center justify-center rounded-lg border border-analyst-200 bg-white text-[10px] text-analyst-400 font-bold hover:bg-analyst-50 transition-all">2</button>
                </div>
            </div>

            {/* Edit Modal Overlay */}
            {editingProduct && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-analyst-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-analyst-100 animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-analyst-50 flex justify-between items-center bg-analyst-50/50">
                            <div>
                                <h3 className="font-black text-xs text-analyst-900 uppercase">Editar Producto</h3>
                                <p className="text-[10px] text-analyst-400 font-bold uppercase">ID: {editingProduct.id.slice(0, 8)}</p>
                            </div>
                            <button onClick={() => setEditingProduct(null)} className="p-1.5 hover:bg-white rounded-lg transition-all border border-transparent hover:border-analyst-100">
                                <span className="material-symbols-outlined text-analyst-400 text-sm">close</span>
                            </button>
                        </div>
                        <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-analyst-400 uppercase tracking-widest px-1">Nombre del Producto</label>
                                <input
                                    name="name"
                                    value={editForm.name}
                                    onChange={handleEditChange}
                                    className="w-full px-4 py-2.5 bg-analyst-50 border border-analyst-100 rounded-xl text-xs font-bold focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                />
                            </div>

                            {/* Image Upload UI */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-analyst-400 uppercase tracking-widest px-1">Referencia Visual</label>
                                <div className="flex gap-4 items-center bg-analyst-50 p-2 rounded-xl border border-analyst-100">
                                    <div className="w-16 h-16 rounded-lg overflow-hidden border border-analyst-200 bg-white shadow-sm flex-shrink-0 relative flex items-center justify-center">
                                        {preview ? (
                                            <img src={preview} alt="Vista previa" className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="material-symbols-outlined text-analyst-300 text-2xl">image</span>
                                        )}
                                        {uploading && (
                                            <div className="absolute inset-0 bg-white/70 flex items-center justify-center backdrop-blur-[2px]">
                                                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <input type="file" id="edit-img-upload" accept="image/*" className="hidden" onChange={handleFileUpload} />
                                        <label htmlFor="edit-img-upload" className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-analyst-200 text-[10px] font-black uppercase text-analyst-600 rounded-lg cursor-pointer hover:bg-analyst-50 transition-colors shadow-sm">
                                            <span className="material-symbols-outlined text-sm">upload</span>
                                            {preview ? 'Cambiar Foto' : 'Subir Foto'}
                                        </label>
                                        <p className="text-[8px] font-bold text-analyst-400 uppercase mt-1.5">Formatos: JPG, PNG, WEBP</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-analyst-400 uppercase tracking-widest px-1">Descripción</label>
                                <textarea
                                    name="description"
                                    value={editForm.description}
                                    onChange={handleEditChange}
                                    rows="2"
                                    className="w-full px-4 py-2 bg-analyst-50 border border-analyst-100 rounded-xl text-[11px] font-medium focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none"
                                />
                            </div>

                            {/* Provider, Family & Group Selection Dropdowns */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-analyst-400 uppercase tracking-widest px-1">Proveedor</label>
                                    <select
                                        name="provider_id"
                                        value={editForm.provider_id || ''}
                                        onChange={handleEditChange}
                                        className="w-full px-4 py-2 bg-analyst-50 border border-analyst-100 rounded-xl text-xs font-bold outline-none"
                                    >
                                        <option value="">- SELECCIONAR -</option>
                                        {options.providers.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-analyst-400 uppercase tracking-widest px-1">Familia</label>
                                    <select
                                        name="family_id"
                                        value={editForm.family_id || ''}
                                        onChange={(e) => {
                                            setEditForm(prev => ({ ...prev, family_id: e.target.value, group_id: '' }));
                                        }}
                                        className="w-full px-4 py-2 bg-analyst-50 border border-analyst-100 rounded-xl text-xs font-bold outline-none"
                                    >
                                        <option value="">- SELECCIONAR -</option>
                                        {options.families.map(f => (
                                            <option key={f.id} value={f.id}>{f.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-analyst-400 uppercase tracking-widest px-1">Grupo (Sub-Categoría)</label>
                                <select
                                    name="group_id"
                                    value={editForm.group_id || ''}
                                    onChange={handleEditChange}
                                    className="w-full px-4 py-2 bg-analyst-50 border border-analyst-100 rounded-xl text-xs font-bold outline-none"
                                >
                                    <option value="">- SELECCIONAR -</option>
                                    {options.groups
                                        .filter(g => !editForm.family_id || g.family_id == editForm.family_id)
                                        .map(g => (
                                            <option key={g.id} value={g.id}>{g.name}</option>
                                        ))
                                    }
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-analyst-400 uppercase tracking-widest px-1">Formato PDF</label>
                                    <select
                                        name="pdf_format"
                                        value={editForm.pdf_format}
                                        onChange={handleEditChange}
                                        className="w-full px-4 py-2 bg-analyst-50 border border-analyst-100 rounded-xl text-xs font-bold outline-none"
                                    >
                                        <option value="1">Formato 1 (Mini)</option>
                                        <option value="2">Formato 2 (Medio)</option>
                                        <option value="3">Formato 3 (Full Detail)</option>
                                        <option value="4">Formato 4 (Ficha Técnica)</option>
                                        <option value="5">Formato 5 (Grilla 2-Col)</option>
                                        <option value="6">Formato 6 (Técnico 3-Col)</option>
                                    </select>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-analyst-50 rounded-xl border border-analyst-100">
                                    <span className="text-[10px] font-black text-analyst-600 uppercase">Oferta</span>
                                    <input
                                        type="checkbox"
                                        name="is_offer"
                                        checked={editForm.is_offer}
                                        onChange={handleEditChange}
                                        className="w-4 h-4 text-primary rounded border-analyst-300"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center px-1">
                                    <label className="text-[10px] font-black text-analyst-400 uppercase tracking-widest">Descripción Larga (PDF)</label>
                                    <div className="flex gap-2 items-center">
                                        <span className="text-[9px] font-bold text-analyst-400 uppercase">Mostrar</span>
                                        <input
                                            type="checkbox"
                                            name="show_long_description"
                                            checked={editForm.show_long_description}
                                            onChange={handleEditChange}
                                            className="w-3.5 h-3.5"
                                        />
                                    </div>
                                </div>
                                <textarea
                                    name="long_description"
                                    value={editForm.long_description}
                                    onChange={handleEditChange}
                                    rows="3"
                                    placeholder="Esta descripción aparecerá en los formatos 2 y 3 del catálogo..."
                                    className="w-full px-4 py-2.5 bg-analyst-50 border border-analyst-100 rounded-xl text-[11px] font-medium focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none"
                                />

                                {editForm.pdf_format === '4' && (
                                    <div className="space-y-1.5 pt-2">
                                        <label className="text-[10px] font-black text-analyst-400 uppercase tracking-widest px-1">Columnas Técnicas (Separadas por coma)</label>
                                        <input
                                            name="technical_columns"
                                            value={editForm.technical_columns}
                                            onChange={handleEditChange}
                                            className="w-full px-4 py-2.5 bg-analyst-50 border border-analyst-100 rounded-xl text-xs font-bold focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                            placeholder="Ej: Diámetro, Altura, Capacidad"
                                        />
                                    </div>
                                )}

                                {editVariants.length > 0 && (
                                    <div className="space-y-3 pt-4 border-t border-analyst-100">
                                        <label className="text-[10px] font-black text-analyst-400 uppercase tracking-widest px-1">Edición de Variantes (Código y Precio)</label>
                                        <div className="space-y-2">
                                            {editVariants.map((ev, idx) => (
                                                <div key={idx} className="p-3 bg-white rounded-xl border border-analyst-100 flex items-center gap-3 shadow-sm hover:border-analyst-200 transition-all">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[9px] font-black text-analyst-900 uppercase truncate mb-1">{ev.name}</p>
                                                        <input
                                                            type="text"
                                                            placeholder="Código/SKU"
                                                            value={ev.code || ''}
                                                            onChange={(e) => {
                                                                const updated = [...editVariants];
                                                                updated[idx].code = e.target.value;
                                                                setEditVariants(updated);
                                                            }}
                                                            className="w-full !h-7 text-[10px] font-bold border-analyst-200 bg-analyst-50/50 rounded-lg px-2"
                                                        />
                                                    </div>
                                                    <div className="w-24">
                                                        <p className="text-[8px] font-black text-analyst-400 uppercase text-right mb-1">Costo Base</p>
                                                        <input
                                                            type="number"
                                                            value={ev.base_price || 0}
                                                            onChange={(e) => {
                                                                const val = parseFloat(e.target.value) || 0;
                                                                const updated = [...editVariants];
                                                                updated[idx].base_price = val;
                                                                
                                                                // Recalculate margins
                                                                updated[idx].price_unit = parseFloat((val * (1 + (margins.price_unit || 40) / 100)).toFixed(2));
                                                                updated[idx].price_bulk = parseFloat((val * (1 + (margins.price_bulk || 20) / 100)).toFixed(2));
                                                                updated[idx].price_business = parseFloat((val * (1 + (margins.price_business || 15) / 100)).toFixed(2));
                                                                updated[idx].price_company = parseFloat((val * (1 + (margins.price_company || 10) / 100)).toFixed(2));
                                                                
                                                                setEditVariants(updated);
                                                            }}
                                                            className="w-full !h-7 text-[10px] font-black text-right border-analyst-200 bg-analyst-50/50 rounded-lg px-2"
                                                        />
                                                    </div>
                                                    <div className="w-16">
                                                        <p className="text-[8px] font-black text-analyst-400 uppercase text-right mb-1">Stock</p>
                                                        <input
                                                            type="number"
                                                            value={ev.stock || 0}
                                                            onChange={(e) => {
                                                                const updated = [...editVariants];
                                                                updated[idx].stock = parseInt(e.target.value) || 0;
                                                                setEditVariants(updated);
                                                            }}
                                                            className="w-full !h-7 text-[10px] font-black text-right border-analyst-200 bg-analyst-50/50 rounded-lg px-2"
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-analyst-50/50 border-t border-analyst-50 flex justify-end gap-3">
                            <button onClick={() => setEditingProduct(null)} className="h-10 px-5 rounded-xl text-[10px] font-black uppercase text-analyst-500 hover:bg-white hover:text-analyst-700 transition-colors">Cancelar</button>
                            <button onClick={saveProductEdit} className="h-10 px-6 rounded-xl bg-primary hover:bg-blue-700 text-[10px] text-white font-black uppercase shadow-lg shadow-primary/10 transition-colors">Guardar Cambios</button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
};

export default Inventory;
