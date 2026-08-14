import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

const ProductWizard = ({ onComplete }) => {
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        family_id: "",
        group_id: "",
        provider_id: "",
        selectedUnits: [],
        image_url: "",
        is_offer: false,
        variant_separator: " X ",
        stock: 0,
        pdf_format: "1",
        long_description: "",
        show_long_description: false,
        technical_columns: ""
    });

    const [options, setOptions] = useState({
        families: [],
        groups: [],
        providers: [],
        units: []
    });

    const [status, setStatus] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [preview, setPreview] = useState(null);
    const [unit1, setUnit1] = useState("");
    const [unit2, setUnit2] = useState("");
    const [generatedVariants, setGeneratedVariants] = useState([]);
    const [priceLabels, setPriceLabels] = useState({});
    const [margins, setMargins] = useState({
        price_unit: 40,
        price_bulk: 20,
        price_business: 15,
        price_company: 10
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [famRes, grpRes, provRes, unitRes, labelRes, marginRes] = await Promise.all([
                axios.get(`${API_URL}/families`),
                axios.get(`${API_URL}/groups`),
                axios.get(`${API_URL}/providers`),
                axios.get(`${API_URL}/units`),
                axios.get(`${API_URL}/settings/price_labels`).catch(() => ({ data: {} })),
                axios.get(`${API_URL}/settings/price_margins`).catch(() => ({ data: {} }))
            ]);
            setOptions({
                families: famRes.data || [],
                groups: grpRes.data || [],
                providers: provRes.data || [],
                units: unitRes.data || []
            });
            setPriceLabels(labelRes.data || {
                base_price: "Base",
                price_unit: "Minorista",
                price_bulk: "Mayorista",
                price_business: "Empresas",
                price_company: "Distribuidor"
            });
            if (marginRes.data && Object.keys(marginRes.data).length > 0) {
                setMargins(marginRes.data);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (file) {
            setUploading(true);
            setPreview(URL.createObjectURL(file));
            try {
                const formDataImg = new FormData();
                formDataImg.append("image", file);
                const res = await axios.post(`${API_URL}/upload`, formDataImg, {
                    headers: { "Content-Type": "multipart/form-data" }
                });
                setFormData(prev => ({ ...prev, image_url: res.data.publicUrl }));
            } catch (err) {
                console.error("Upload error:", err);
                alert(`Error subiendo imagen: ${err.message || "Error desconocido"}. Asegúrate de haber ejecutado storage_setup.sql en Supabase.`);
            } finally {
                setUploading(false);
            }
        }
    };

    const handleUnitCheckboxChange = (unitId, value) => {
        const selected = [...formData.selectedUnits];
        const idx = selected.findIndex(item => item.unit_id == unitId);
        if (idx > -1) {
            const vals = selected[idx].values;
            if (vals.includes(value)) {
                selected[idx].values = vals.filter(v => v !== value);
                if (selected[idx].values.length === 0) {
                    selected.splice(idx, 1);
                }
            } else {
                selected[idx].values.push(value);
            }
        } else {
            selected.push({ unit_id: unitId, values: [value] });
        }
        setFormData({ ...formData, selectedUnits: selected });
    };

    const generateVariants = () => {
        if (formData.selectedUnits.length === 0) {
            alert("No hay variantes seleccionadas para la matriz.");
            return;
        }
        const selected = formData.selectedUnits;
        const sep = formData.variant_separator || " X ";

        const cartesian = (arr) => {
            const values = arr.map(item => item.values);
            const combine = (a, b) => {
                const result = [];
                a.forEach(x => b.forEach(y => result.push(`${x}${sep}${y}`)));
                return result;
            };
            let res = values[0];
            for (let i = 1; i < values.length; i++) {
                res = combine(res, values[i]);
            }
            return res || [];
        };

        const names = cartesian(selected);
        setGeneratedVariants(names.map(name => ({
            name,
            code: "",
            stock: formData.stock,
            base_price: 0,
            price_unit: 0,
            price_bulk: 0,
            price_business: 0,
            price_company: 0,
            selected: true
        })));
    };

    const updateVariantField = (idx, field, value) => {
        const updated = [...generatedVariants];
        if (field === 'selected') {
            updated[idx].selected = value;
        } else if (field === 'base_price') {
            const val = parseFloat(value) || 0;
            updated[idx].base_price = val;
            updated[idx].price_unit = parseFloat((val * (1 + (margins.price_unit || 40) / 100)).toFixed(2));
            updated[idx].price_bulk = parseFloat((val * (1 + (margins.price_bulk || 20) / 100)).toFixed(2));
            updated[idx].price_business = parseFloat((val * (1 + (margins.price_business || 15) / 100)).toFixed(2));
            updated[idx].price_company = parseFloat((val * (1 + (margins.price_company || 10) / 100)).toFixed(2));
        } else if (field === 'stock' || field === 'price_unit') {
            updated[idx][field] = parseFloat(value) || 0;
        } else {
            updated[idx][field] = value;
        }
        setGeneratedVariants(updated);
    };

    const handleSubmit = async () => {
        if (!formData.name || !formData.family_id) {
            alert("Nombre y Familia son requeridos");
            return;
        }
        const selected = generatedVariants.filter(v => v.selected);
        if (generatedVariants.length > 0 && selected.length === 0) {
            alert("Debes seleccionar al menos una variante de la matriz");
            return;
        }
        setStatus('saving');
        try {
            const productData = {
                name: formData.name,
                description: formData.description,
                family_id: formData.family_id || null,
                group_id: formData.group_id || null,
                provider_id: formData.provider_id || null,
                image_url: formData.image_url,
                is_offer: formData.is_offer,
                variant_separator: formData.variant_separator,
                pdf_format: formData.pdf_format,
                long_description: formData.long_description,
                show_long_description: formData.show_long_description,
                technical_columns: formData.technical_columns,
                stock: Number(formData.stock) || 0
            };
            const variantsToSend = selected.map(({ selected, ...rest }) => rest);
            const res = await axios.post(`${API_URL}/products`, {
                product: productData,
                variants: variantsToSend.length > 0 ? variantsToSend : null
            });
            console.log("Product saved:", res.data);
            alert("¡Producto guardado exitosamente!");
            onComplete();
        } catch (err) {
            console.error("Save error:", err);
            setStatus('error');
            const errMsg = err.response?.data?.message || err.message || "Error desconocido";
            alert(`Error al guardar: ${errMsg}`);
            setTimeout(() => setStatus(null), 3000);
        }
    };

    const renderUnitSelector = (unitId, label) => {
        const unit = options.units.find(u => u.id == unitId);
        if (!unit) return null;
        return (
            <div className="space-y-2">
                <p className="text-[10px] font-black uppercase text-analyst-400 bg-analyst-50 px-2 py-0.5 rounded inline-block">
                    {label}: {unit.name}
                </p>
                <div className="flex flex-wrap gap-1.5">
                    {unit.unit_values?.map(val => {
                        const isChecked = formData.selectedUnits.find(item => item.unit_id == unitId)?.values.includes(val.value);
                        return (
                            <label key={val.id} className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${isChecked ? "bg-primary/5 border-primary text-primary" : "bg-white border-analyst-200 text-analyst-600 hover:border-analyst-400"}`}>
                                <input
                                    type="checkbox"
                                    className="w-3 h-3 text-primary border-analyst-300 rounded"
                                    checked={!!isChecked}
                                    onChange={() => handleUnitCheckboxChange(unitId, val.value)}
                                />
                                <span className="text-[10px] font-bold">{val.value}</span>
                            </label>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-white relative max-h-[85vh]">
            {status === "saving" && (
                <div className="absolute inset-0 bg-white/90 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3"></div>
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest animate-pulse">Sincronizando...</p>
                </div>
            )}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
                <div>
                    <h2 className="text-lg font-black tracking-tight text-slate-900 leading-none uppercase">Configurar Producto</h2>
                    <p className="text-slate-400 text-[9px] font-bold uppercase tracking-wider mt-1">Ingreso técnico de alta densidad</p>
                </div>
                <button onClick={onComplete} className="p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-red-500">
                    <span className="material-symbols-outlined text-xl">close</span>
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                <div className="grid grid-cols-12 gap-6">
                    <div className="col-span-12 lg:col-span-9 space-y-4">
                        <div>
                            <label className="block text-[9px] font-black text-analyst-400 uppercase mb-1.5 tracking-widest">Nombre Descriptivo</label>
                            <input
                                className="w-full h-10 px-4 rounded-xl border-analyst-200 bg-analyst-50/50 text-[11px] font-bold placeholder:text-analyst-300"
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Ej. Tornillo Autoperforante..."
                                autoFocus={true}
                            />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-[9px] font-black text-analyst-400 uppercase mb-1.5 tracking-widest">Familia</label>
                                <select
                                    className="w-full h-10 px-3 rounded-xl border-analyst-200 text-[11px] font-bold"
                                    value={formData.family_id}
                                    onChange={e => setFormData({ ...formData, family_id: e.target.value })}
                                >
                                    <option value="">- ELEGIR -</option>
                                    {options.families.map(f => (
                                        <option key={f.id} value={f.id}>{f.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[9px] font-black text-analyst-400 uppercase mb-1.5 tracking-widest">Grupo</label>
                                <select
                                    className="w-full h-10 px-3 rounded-xl border-analyst-200 text-[11px] font-bold"
                                    value={formData.group_id}
                                    onChange={e => setFormData({ ...formData, group_id: e.target.value })}
                                >
                                    <option value="">- ELEGIR -</option>
                                    {options.groups.filter(g => !formData.family_id || g.family_id == formData.family_id).map(g => (
                                        <option key={g.id} value={g.id}>{g.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[9px] font-black text-analyst-400 uppercase mb-1.5 tracking-widest">Stock Inicial</label>
                                <input
                                    className="w-full h-10 px-4 rounded-xl border-analyst-200 bg-primary/5 text-[11px] font-black text-primary text-center"
                                    type="number"
                                    value={formData.stock}
                                    onChange={e => setFormData({ ...formData, stock: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                    <div className="col-span-12 lg:col-span-3 flex flex-col">
                        <label className="block text-[9px] font-black text-analyst-400 uppercase mb-1.5 tracking-widest">Referencia Visual</label>
                        <input type="file" id="modal-upload" className="hidden" accept="image/*" onChange={handleImageUpload} />
                        <label
                            htmlFor="modal-upload"
                            className={`flex-1 min-h-[100px] border-2 border-dashed border-analyst-200 flex flex-col items-center justify-center p-3 rounded-xl hover:bg-blue-50 transition-all cursor-pointer group relative overflow-hidden ${preview ? "border-none shadow-sm" : ""}`}
                        >
                            {preview ? (
                                <img src={preview} className="absolute inset-0 w-full h-full object-cover" alt="Preview" />
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-2xl text-analyst-300 mb-1 group-hover:text-primary transition-all">add_a_photo</span>
                                    <p className="text-[8px] font-black text-analyst-400 uppercase tracking-tighter">Subir Foto</p>
                                </>
                            )}
                        </label>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-6 bg-analyst-50/20 p-5 rounded-xl border border-analyst-100">
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-analyst-400 uppercase tracking-widest px-1">Formato de Catálogo (PDF)</label>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { id: "1", label: "Mini", desc: "Grilla" },
                                    { id: "2", label: "Medio", desc: "Detalle" },
                                    { id: "3", label: "Full", desc: "Premium" },
                                    { id: "4", label: "Ficha", desc: "Técnica" },
                                    { id: "5", label: "Grilla", desc: "2-Col" },
                                    { id: "6", label: "Técnico", desc: "3-Col" }
                                ].map(item => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setFormData(prev => ({
                                            ...prev,
                                            pdf_format: item.id,
                                            variant_separator: item.id === "4" ? " X " : prev.variant_separator
                                        }))}
                                        className={`p-2 rounded-xl border-2 transition-all flex flex-col items-center gap-1 ${formData.pdf_format === item.id ? "border-primary bg-primary/5" : "border-analyst-100 bg-white hover:border-analyst-200"}`}
                                    >
                                        <span className={`text-[10px] font-black ${formData.pdf_format === item.id ? "text-primary" : "text-analyst-600"}`}>{item.label}</span>
                                        <span className="text-[7px] font-bold text-analyst-400 uppercase">{item.desc}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-analyst-100">
                            <div className="flex flex-col">
                                <span className="text-[9px] font-black text-analyst-600 uppercase">Mostrar Descripción</span>
                                <span className="text-[7px] font-bold text-analyst-400 uppercase italic">Solo formatos 2 y 3</span>
                            </div>
                            <input
                                type="checkbox"
                                checked={formData.show_long_description}
                                onChange={e => setFormData(prev => ({ ...prev, show_long_description: e.target.checked }))}
                                className="w-4 h-4 text-primary rounded border-analyst-300"
                            />
                        </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-black text-analyst-400 uppercase tracking-widest px-1">Descripción Técnica / Larga</label>
                        <textarea
                            className="flex-1 w-full p-3 rounded-xl border-analyst-200 bg-white text-[10px] font-medium resize-none placeholder:italic animate-pulse"
                            placeholder="Describe el producto para el catálogo... (Formatos 2 y 3)"
                            value={formData.long_description}
                            onChange={e => setFormData(prev => ({ ...prev, long_description: e.target.value }))}
                        />
                        {formData.pdf_format === "4" && (
                            <div className="space-y-1.5 pt-2">
                                <label className="text-[9px] font-black text-analyst-400 uppercase tracking-widest px-1">Columnas Técnicas (Separadas por coma)</label>
                                <input
                                    type="text"
                                    className="w-full h-10 px-4 rounded-xl border-analyst-200 bg-white text-[11px] font-bold placeholder:text-analyst-300"
                                    placeholder="LTS:35 LTS, MEDIDAS:2x2"
                                    value={formData.technical_columns}
                                    onChange={e => setFormData(prev => ({ ...prev, technical_columns: e.target.value }))}
                                />
                                <p className="text-[8px] text-analyst-400 italic px-1">Ej: "LTS:35 LTS, MEDIDAS:2x2" (Columna:Valor para la tabla)</p>
                            </div>
                        )}
                    </div>
                </div>
                <div className="pt-6 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-xl">account_tree</span>
                            <h3 className="text-sm font-black text-slate-900 uppercase">Matriz de Combinación</h3>
                        </div>
                        <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 cursor-pointer bg-red-50/50 px-3 py-1.5 rounded-lg border border-red-100 hover:bg-red-50 transition-colors">
                                <input
                                    type="checkbox"
                                    className="w-3 h-3 text-red-500 rounded"
                                    checked={formData.is_offer}
                                    onChange={e => setFormData({ ...formData, is_offer: e.target.checked })}
                                />
                                <span className="text-[8px] font-black text-red-600 uppercase tracking-widest whitespace-nowrap">OFERTA ESPECIAL</span>
                            </label>
                            <div className="flex flex-col">
                                <label className="text-[8px] font-black text-analyst-400 uppercase ml-1">Divisor</label>
                                <input
                                    className="w-12 h-7 text-center bg-analyst-50 border-analyst-200 rounded-lg text-[10px] font-bold"
                                    value={formData.variant_separator}
                                    onChange={e => setFormData({ ...formData, variant_separator: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 bg-analyst-50/30 p-5 rounded-xl border border-analyst-200 mb-6">
                        <div className="space-y-4">
                            <select
                                className="bg-white !h-9 rounded-xl font-bold text-[10px] uppercase w-full px-3"
                                value={unit1}
                                onChange={e => setUnit1(e.target.value)}
                            >
                                <option value="">VARIANTE X</option>
                                {options.units.map(u => (
                                    <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                            </select>
                            {renderUnitSelector(unit1, "X")}
                        </div>
                        <div className="space-y-4">
                            <select
                                className="bg-white !h-9 rounded-xl font-bold text-[10px] uppercase w-full px-3"
                                value={unit2}
                                onChange={e => setUnit2(e.target.value)}
                            >
                                <option value="">VARIANTE Y</option>
                                {options.units.map(u => (
                                    <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                            </select>
                            {renderUnitSelector(unit2, "Y")}
                        </div>
                        <div className="col-span-2 pt-2">
                            <button
                                onClick={generateVariants}
                                className="w-full bg-slate-800 text-white py-2 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all shadow-md flex items-center justify-center gap-2"
                            >
                                <span className="material-symbols-outlined text-sm">auto_fix_high</span>
                                Visualizar Matriz
                            </button>
                        </div>
                    </div>
                    {generatedVariants.length > 0 && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-4 duration-300">
                            <h4 className="text-[10px] font-black text-analyst-400 uppercase tracking-widest flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                                Vista Previa ({generatedVariants.length})
                            </h4>
                            <div className="border border-analyst-100 rounded-xl overflow-hidden shadow-sm">
                                <table className="w-full">
                                    <thead className="bg-analyst-50 text-[9px] font-black uppercase text-analyst-500">
                                        <tr>
                                            <th className="px-4 py-3 text-center w-10">
                                                <input
                                                    type="checkbox"
                                                    checked={generatedVariants.every(v => v.selected)}
                                                    onChange={e => setGeneratedVariants(generatedVariants.map(v => ({ ...v, selected: e.target.checked })))}
                                                    className="w-3 h-3 text-primary rounded"
                                                />
                                            </th>
                                            <th className="px-5 py-3 text-left">Variante</th>
                                            <th className="px-5 py-3 text-center w-32">Código</th>
                                            <th className="px-5 py-3 text-center w-28">Precio Costo (Base)</th>
                                            <th className="px-5 py-3 text-center w-24">Stock</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-analyst-50 bg-white">
                                        {generatedVariants.map((v, idx) => (
                                            <tr
                                                key={idx}
                                                className={`transition-colors ${v.selected ? "hover:bg-blue-50/30" : "opacity-40 grayscale bg-analyst-50/20"}`}
                                            >
                                                <td className="px-4 py-2.5 text-center">
                                                    <input
                                                        type="checkbox"
                                                        className="w-3 h-3 text-primary border-analyst-300 rounded"
                                                        checked={v.selected}
                                                        onChange={e => updateVariantField(idx, "selected", e.target.checked)}
                                                    />
                                                </td>
                                                <td className="px-5 py-2.5 text-[10px] font-bold text-analyst-600 italic">{v.name}</td>
                                                <td className="px-5 py-2.5 text-center">
                                                    <input
                                                        type="text"
                                                        disabled={!v.selected}
                                                        className="w-24 h-8 text-center bg-white border border-analyst-200 rounded-lg text-[10px] font-bold disabled:bg-transparent"
                                                        value={v.code}
                                                        placeholder="SKU..."
                                                        onChange={e => updateVariantField(idx, "code", e.target.value)}
                                                    />
                                                </td>
                                                <td className="px-5 py-2.5 text-center">
                                                    <div className="relative">
                                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-analyst-400">$</span>
                                                        <input
                                                            type="number"
                                                            disabled={!v.selected}
                                                            className="w-20 h-8 pl-5 pr-2 text-right bg-white border border-analyst-200 rounded-lg text-[10px] font-bold disabled:bg-transparent"
                                                            value={v.base_price || 0}
                                                            onChange={e => updateVariantField(idx, "base_price", e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="text-[7px] text-left px-1 mt-1 text-analyst-400 font-bold uppercase leading-none">
                                                        Min: ${(v.price_unit || 0).toFixed(1)} | May: ${(v.price_bulk || 0).toFixed(1)}
                                                    </div>
                                                </td>
                                                <td className="px-5 py-2.5 text-center">
                                                    <input
                                                        type="number"
                                                        disabled={!v.selected}
                                                        className="w-16 h-8 text-center bg-primary/5 border-primary/20 rounded-lg text-[11px] font-black text-primary disabled:opacity-30"
                                                        value={v.stock}
                                                        onChange={e => updateVariantField(idx, "stock", e.target.value)}
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-analyst-50/20 flex justify-end gap-3 shrink-0">
                <button onClick={onComplete} className="px-6 py-2 rounded-xl font-black text-[10px] uppercase text-slate-500 border border-slate-200 hover:bg-white transition-all">Cancelar</button>
                <button
                    onClick={handleSubmit}
                    disabled={status === "saving" || uploading}
                    className={`bg-primary text-white px-8 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg flex items-center gap-2 ${status === "saving" || uploading ? "opacity-50" : ""}`}
                >
                    <span className="material-symbols-outlined text-lg">save</span>
                    {status === "saving" ? "PROCESANDO..." : "GUARDAR"}
                </button>
            </div>
        </div>
    );
};

export default ProductWizard;
