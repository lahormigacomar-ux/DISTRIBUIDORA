import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

const CatalogEditor = () => {
    const [settings, setSettings] = useState({
        headerTitle: 'Catálogo de Productos 2024',
        headerSubtitle: 'CATÁLOGO PERSONALIZADO',
        headerUnderlineText: 'CATÁLOGO DE PRECIOS',
        footerLegend: 'Precios sujetos a cambio sin previo aviso',
        footerWebsite: 'WWW.SRCLAVO.COM.AR',
        primaryColor: '#ec5b13',
        fontFamily: 'Public Sans',
        pageMargin: 24,
        showPageNumbers: true,
        numberFormat: 'Page X',
        catalogLogo: '',
        logoGallery: [],
        activeLogo: '',
        groupingMode: 'family',
        sortingMode: 'alphabetical'
    });

    const [priceLabels, setPriceLabels] = useState({ price_unit: 'PRECIO BASE', price_bulk: 'Mayorista', price_business: 'Empresa', price_company: 'Distribuidor' });

    const [allProducts, setAllProducts] = useState([]);
    const [allFamilies, setAllFamilies] = useState([]);
    const [allGroups, setAllGroups] = useState([]);
    const [previewProducts, setPreviewProducts] = useState([]);
    const [activeTab, setActiveTab] = useState('styles');
    const [selectionMode, setSelectionMode] = useState('manual'); // 'manual', 'family', 'group'
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState(null);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Native Drag and Drop State
    const [draggedIndex, setDraggedIndex] = useState(null);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [sRes, pRes, fRes, gRes, lRes] = await Promise.all([
                axios.get(`${API_URL}/settings/catalog_config`).catch(e => ({ data: {} })),
                axios.get(`${API_URL}/products`).catch(e => {
                    throw new Error("Error de conexión con el servidor (productos).");
                }),
                axios.get(`${API_URL}/families`).catch(e => ({ data: [] })),
                axios.get(`${API_URL}/groups`).catch(e => ({ data: [] })),
                axios.get(`${API_URL}/settings/price_labels`).catch(e => ({ data: {} }))
            ]);

            if (sRes.data && Object.keys(sRes.data).length > 0) {
                setSettings(prev => ({ ...prev, ...sRes.data }));
            }

            if (lRes.data && Object.keys(lRes.data).length > 0) {
                setPriceLabels(lRes.data);
            }

            const families = fRes.data || [];
            setAllFamilies(families);

            const groups = gRes.data || [];
            setAllGroups(groups);

            const products = pRes.data || [];
            const activeProducts = products.filter(p => {
                if (p.is_active === false) return false;
                if (!p.product_variants || p.product_variants.length === 0) return false;
                return p.product_variants.some(v => v.is_active !== false);
            });

            setAllProducts(activeProducts);
            if (previewProducts.length === 0) {
                setPreviewProducts(activeProducts.slice(0, 4));
            }
            setLoading(false);
        } catch (err) {
            setError(err.message || "Error al cargar datos.");
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleSave = async () => {
        try {
            await axios.post(`${API_URL}/settings/catalog_config`, { value: settings });
            alert('Configuración guardada correctamente');
        } catch (err) {
            alert('Error al guardar la configuración');
        }
    };

    const handleLogoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const gallery = settings.logoGallery || [];
        if (gallery.length >= 5) {
            alert("Máximo 5 logos en la galería. Borra uno para subir otro.");
            return;
        }

        setUploadingLogo(true);
        try {
            const formData = new FormData();
            formData.append('image', file);
            const response = await axios.post(`${API_URL}/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            const newUrl = response.data.publicUrl;
            setSettings(prev => ({
                ...prev,
                logoGallery: [...(prev.logoGallery || []), newUrl],
                activeLogo: newUrl,
                catalogLogo: newUrl
            }));
        } catch (error) {
            console.error('Logo upload error:', error);
            alert(`Error subiendo logo: ${error.message}`);
        } finally {
            setUploadingLogo(false);
        }
    };

    const handleDeleteLogo = (url) => {
        setSettings(prev => {
            const newGallery = prev.logoGallery.filter(u => u !== url);
            let nextActive = prev.activeLogo;
            if (prev.activeLogo === url) {
                nextActive = newGallery.length > 0 ? newGallery[0] : '';
            }
            return {
                ...prev,
                logoGallery: newGallery,
                activeLogo: nextActive,
                catalogLogo: nextActive
            };
        });
    };

    const handleSelectLogo = (url) => {
        setSettings(prev => ({
            ...prev,
            activeLogo: url,
            catalogLogo: url
        }));
    };

    const handleExport = async () => {
        if (previewProducts.length === 0) {
            alert("Selecciona al menos un producto para exportar.");
            return;
        }
        if (exporting) return;
        setExporting(true);
        try {
            await axios.post(`${API_URL}/settings/catalog_config`, { value: settings });

            // Sort products by allProducts order for exportation consistency
            const orderedPreviewIds = previewProducts
                .sort((a, b) => allProducts.findIndex(p => p.id === a.id) - allProducts.findIndex(p => p.id === b.id))
                .map(p => p.id);

            const response = await axios.post(`${API_URL}/catalog/pdf`, {
                ...settings,
                selectedProducts: orderedPreviewIds,
                selectedFamilies: [],
                selectedGroups: []
            }, {
                responseType: 'blob',
                timeout: 120000
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'catalogo_editor.pdf');
            document.body.appendChild(link);
            link.click();
            link.remove();
            setExporting(false);
        } catch (err) {
            console.error(err);
            const detail = err.response?.data?.details || err.response?.statusText || err.message;
            alert("Error al generar el PDF: " + detail);
            setExporting(false);
        }
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setSettings(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleTextEdit = (name, value) => {
        setSettings(prev => ({ ...prev, [name]: value }));
    };

    const toggleProductVisibility = (product) => {
        if (previewProducts.some(p => p.id === product.id)) {
            setPreviewProducts(previewProducts.filter(p => p.id !== product.id));
        } else {
            setPreviewProducts([...previewProducts, product]);
        }
    };

    const toggleCategoryProducts = (key, categoryId) => {
        const categoryProducts = allProducts.filter(p => p[key] === categoryId);
        const selectedInCategory = categoryProducts.filter(p => previewProducts.some(pp => pp.id === p.id));
        if (selectedInCategory.length === categoryProducts.length) {
            setPreviewProducts(previewProducts.filter(p => p[key] !== categoryId));
        } else {
            const newProducts = [...previewProducts];
            categoryProducts.forEach(p => {
                if (!newProducts.some(pp => pp.id === p.id)) {
                    newProducts.push(p);
                }
            });
            setPreviewProducts(newProducts);
        }
    };

    // Native HTML5 drag and drop handlers
    const handleDragStart = (e, index) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.style.opacity = '0.5';
    };

    const handleDragOver = (e, index) => {
        e.preventDefault();
    };

    const handleDragEnd = (e) => {
        e.currentTarget.style.opacity = '1';
        setDraggedIndex(null);
    };

    const handleDrop = (e, index) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;

        const reordered = [...allProducts];
        const draggedItem = reordered[draggedIndex];
        
        reordered.splice(draggedIndex, 1);
        reordered.splice(index, 0, draggedItem);
        
        setAllProducts(reordered);
        
        // Auto sort previewProducts to mirror this new order
        setPreviewProducts(prev => {
            return [...prev].sort((a, b) => {
                return reordered.findIndex(p => p.id === a.id) - reordered.findIndex(p => p.id === b.id);
            });
        });
    };

    // Pagination heights math
    const paginateProducts = (products) => {
        const pages = [];
        let currentPageNum = 1;
        let currentPageItems = [];
        
        let yPos = 140; 
        let xPos = 40;  
        let maxH = 0;

        let productsList = [...products];
        if (settings.sortingMode === 'manual') {
            // Sort by their position in allProducts (which was manually dragged to sort)
            productsList.sort((a, b) => {
                return allProducts.findIndex(p => p.id === a.id) - allProducts.findIndex(p => p.id === b.id);
            });
        } else {
            productsList.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        }

        if (settings.groupingMode === 'none') {
            for (const p of productsList) {
                const format = p.pdf_format || '1';
                const varsCount = (p.product_variants || []).filter(v => v.is_active !== false).length || 1;
                let height = 0;
                if (format === '1') height = Math.max(65, 20 + (varsCount * (p.show_long_description && p.long_description ? 22 : 12)));
                else if (format === '2') height = Math.max(130, 80 + (varsCount * 12));
                else if (format === '3') height = 260;
                else if (format === '5') height = 200;
                else if (format === '6') height = 180 + (varsCount * 12);
                else height = 280 + (varsCount * 15);

                if (yPos + height > 780) {
                    pages.push({ pageNum: currentPageNum, items: currentPageItems });
                    currentPageNum++;
                    currentPageItems = [];
                    yPos = (currentPageNum === 1 || settings.repeatHeader !== false) ? 140 : 40;
                    xPos = 40;
                    maxH = 0;
                }

                if (format === '6') {
                    const colW = 165;
                    currentPageItems.push({ product: p, x: xPos, y: yPos, width: colW, height });
                    maxH = Math.max(maxH, height);
                    xPos += 170;
                    if (xPos > 500) {
                        xPos = 40;
                        yPos += maxH + 10;
                        maxH = 0;
                    }
                } else {
                    if (xPos > 40) {
                        yPos += maxH + 10;
                        xPos = 40;
                    }
                    currentPageItems.push({ product: p, x: xPos, y: yPos, width: 515, height });
                    yPos += height + 10;
                    maxH = 0;
                }
            }
        } else {
            const groupedByFamily = allFamilies
                .filter(f => productsList.some(p => p.family_id === f.id))
                .map(f => ({
                    family: f,
                    products: productsList.filter(p => p.family_id === f.id)
                }));

            for (const group of groupedByFamily) {
                for (const p of group.products) {
                    const format = p.pdf_format || '1';
                    const varsCount = (p.product_variants || []).filter(v => v.is_active !== false).length || 1;
                    let height = 0;
                    if (format === '1') height = Math.max(65, 20 + (varsCount * (p.show_long_description && p.long_description ? 22 : 12)));
                    else if (format === '2') height = Math.max(130, 80 + (varsCount * 12));
                    else if (format === '3') height = 260;
                    else if (format === '5') height = 200;
                    else if (format === '6') height = 180 + (varsCount * 12);
                    else height = 280 + (varsCount * 15);

                    if (yPos + height > 780) {
                        pages.push({ pageNum: currentPageNum, items: currentPageItems });
                        currentPageNum++;
                        currentPageItems = [];
                        yPos = (currentPageNum === 1 || settings.repeatHeader !== false) ? 140 : 40;
                        xPos = 40;
                        maxH = 0;
                    }

                    if (format === '6') {
                        const colW = 165;
                        currentPageItems.push({ product: p, x: xPos, y: yPos, width: colW, height });
                        maxH = Math.max(maxH, height);
                        xPos += 170;
                        if (xPos > 500) {
                            xPos = 40;
                            yPos += maxH + 10;
                            maxH = 0;
                        }
                    } else {
                        if (xPos > 40) {
                            yPos += maxH + 10;
                            xPos = 40;
                        }
                        currentPageItems.push({ product: p, x: xPos, y: yPos, width: 515, height });
                        yPos += height + 10;
                        maxH = 0;
                    }
                }
                if (xPos > 40) {
                    yPos += maxH + 10;
                    xPos = 40;
                    maxH = 0;
                }
                yPos += 20; 
            }
        }

        if (currentPageItems.length > 0) {
            pages.push({ pageNum: currentPageNum, items: currentPageItems });
        }

        return pages;
    };

    const previewPages = paginateProducts(previewProducts);

    // Format Components inside catalog
    const ProductFormat1 = ({ product }) => {
        const familyColor = settings.primaryColor;
        return (
            <div className="bg-white p-2.5 rounded-xl border border-analyst-100 shadow-sm relative overflow-hidden flex gap-4 w-full min-h-[65px] items-center">
                {/* 1. Image on the left */}
                <div className="w-12 h-12 rounded-lg bg-slate-50 overflow-hidden border border-analyst-100 flex items-center justify-center shrink-0">
                    {product.image_url ? (
                        <img src={product.image_url} className="w-full h-full object-cover" alt={product.name} />
                    ) : (
                        <span className="material-symbols-outlined text-2xl text-analyst-200">image</span>
                    )}
                </div>

                {/* 2. Unified Table on the right */}
                <div className="flex-1 border border-analyst-100 rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-200 text-slate-700 text-[6px] font-black uppercase">
                                <th className="py-1 px-1.5 w-14">COD</th>
                                <th className="py-1 px-1.5">PRODUCTO / VARIANTE</th>
                                {Object.keys(priceLabels).map(key => {
                                    if (key === 'base_price') return null;
                                    if (settings[`show_${key}`] === false) return null;
                                    return <th key={key} className="py-1 px-1.5 text-center w-14">{priceLabels[key]}</th>;
                                })}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-analyst-100">
                            {(product.product_variants || []).filter(v => v.is_active !== false).map((v, i) => (
                                <tr key={v.id} className={`text-[6.5px] ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/55'}`}>
                                    <td className="py-0.5 px-1.5 font-mono font-bold text-slate-500">{v.code || '-'}</td>
                                    <td className="py-0.5 px-1.5 font-bold text-slate-700 uppercase">
                                        <div>{product.name} - {v.name}</div>
                                        {product.show_long_description && product.long_description && (
                                            <div className="text-[5.5px] text-slate-400 font-medium normal-case mt-0.5">{product.long_description}</div>
                                        )}
                                    </td>
                                    {Object.keys(priceLabels).map(key => {
                                        if (key === 'base_price') return null;
                                        if (settings[`show_${key}`] === false) return null;
                                        return <td key={key} className="py-0.5 px-1.5 font-black text-center" style={{ color: familyColor }}>${(v[key] || 0).toFixed(1)}</td>;
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const ProductFormat2 = ({ product }) => {
        const familyColor = settings.primaryColor;
        return (
            <div className="w-full flex bg-white p-4 rounded-2xl border border-analyst-100 shadow-sm relative overflow-hidden gap-4">
                <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 border border-analyst-100 relative bg-slate-50 flex items-center justify-center">
                    {product.image_url ? (
                        <img src={product.image_url} className="w-full h-full object-cover" alt={product.name} />
                    ) : (
                        <span className="material-symbols-outlined text-3xl text-analyst-200">image</span>
                    )}
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                        <h4 className="text-xs font-black uppercase text-analyst-900 truncate tracking-tight">{product.name}</h4>
                        {product.description && <p className="text-[9px] font-bold text-analyst-400 mt-1 uppercase truncate">{product.description}</p>}
                    </div>

                    <div className="overflow-hidden rounded-lg border border-analyst-150 mt-2">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-analyst-900 text-white text-[6.5px] font-black uppercase">
                                    <th className="px-2 py-1 w-12 text-center">CODIGO</th>
                                    <th className="px-2 py-1 text-left">VARIANTE</th>
                                    {Object.keys(priceLabels).map(key => {
                                        if (key === 'base_price') return null;
                                        if (settings[`show_${key}`] === false) return null;
                                        return <th key={key} className="px-2 py-1 text-right w-16">{priceLabels[key]}</th>;
                                    })}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-analyst-100">
                                {(product.product_variants || []).filter(v => v.is_active !== false).map((v) => (
                                    <tr key={v.id} className="text-[7px]">
                                        <td className="px-2 py-1 text-center font-bold text-analyst-500 bg-slate-50 border-r border-analyst-150">{v.code || '-'}</td>
                                        <td className="px-2 py-1 font-bold text-analyst-700 uppercase truncate max-w-[120px]">{v.name}</td>
                                        {Object.keys(priceLabels).map(key => {
                                            if (key === 'base_price') return null;
                                            if (settings[`show_${key}`] === false) return null;
                                            return <td key={key} className="px-2 py-1 text-right font-black" style={{ color: familyColor }}>${(v[key] || 0).toFixed(2)}</td>;
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    const ProductFormat3 = ({ product }) => {
        const familyColor = settings.primaryColor;
        const mainVariant = product.product_variants?.[0] || {};
        return (
            <div className="w-full flex bg-white p-5 rounded-3xl border border-analyst-100 shadow-sm relative overflow-hidden gap-6 h-[260px]">
                <div className="absolute top-0 left-0 w-1.5 h-full" style={{ backgroundColor: familyColor }}></div>

                <div className="w-[30%] aspect-square bg-slate-50 rounded-2xl overflow-hidden shrink-0 border border-analyst-100 flex items-center justify-center">
                    {product.image_url ? (
                        <img src={product.image_url} className="w-full h-full object-cover" alt={product.name} />
                    ) : (
                        <span className="material-symbols-outlined text-5xl text-analyst-200">image</span>
                    )}
                </div>

                <div className="flex-1 flex flex-col justify-between pt-1">
                    <div>
                        <span className="text-[8px] font-black text-analyst-300 uppercase tracking-widest leading-none">COD: {mainVariant.code || '-'}</span>
                        <h4 className="text-[18px] font-black uppercase tracking-tight text-analyst-900 mt-1 leading-snug">{product.name}</h4>
                        {product.long_description && <p className="text-[10px] text-analyst-400 mt-2 font-medium leading-relaxed line-clamp-3">{product.long_description}</p>}
                    </div>

                    <div className="flex gap-2.5 mt-4">
                        {Object.keys(priceLabels).map(key => {
                            if (key === 'base_price') return null;
                            if (settings[`show_${key}`] === false) return null;
                            return (
                                <div key={key} className="flex-1 bg-slate-800 text-white rounded-xl py-2 px-3 flex flex-col justify-center items-center shadow-md">
                                    <span className="text-[6.5px] font-black uppercase text-slate-300 tracking-wider mb-0.5">{priceLabels[key]}</span>
                                    <span className="text-xs font-black">${(mainVariant[key] || 0).toFixed(2)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    };

    const ProductFormat4 = ({ product }) => {
        const familyColor = settings.primaryColor;
        const techs = (product.technical_columns || "").split(',').map(c => c.trim()).filter(c => c);

        const parsedHeaders = techs.map(t => {
            const parts = t.split(':');
            if (parts.length > 1) {
                return { header: parts[0].trim(), fixedValue: parts.slice(1).join(':').trim(), isFixed: true };
            }
            return { header: t, isFixed: false };
        });

        const separator = product.variant_separator || ' X ';

        return (
            <div className="w-full space-y-6 bg-white p-6 rounded-3xl border border-analyst-100 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: familyColor }}></div>

                <div className="flex gap-10">
                    <div className="w-[35%] aspect-square flex items-start justify-center pt-2">
                        {product.image_url ? (
                            <img src={product.image_url} className="w-full h-full object-contain" alt={product.name} />
                        ) : (
                            <span className="material-symbols-outlined text-6xl text-analyst-100">image</span>
                        )}
                    </div>

                    <div className="w-[65%] flex flex-col pt-2">
                        <h4 className="text-[22px] font-black uppercase tracking-tight leading-tight mb-4 text-slate-900">{product.name}</h4>
                        {product.long_description && (
                            <div className="space-y-4">
                                <p className="text-[11px] text-analyst-500 leading-relaxed font-medium line-clamp-3">{product.long_description}</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-analyst-200">
                    <table className="w-full text-left border-collapse bg-white">
                        <thead>
                            <tr className="bg-analyst-800 text-white">
                                <th className="px-4 py-2 text-[9px] font-black uppercase tracking-widest border-r border-analyst-700 w-24 text-center">Codigo</th>
                                {parsedHeaders.map((col, idx) => (
                                    <th key={idx} className="px-4 py-2 text-[9px] font-black uppercase tracking-widest border-r border-analyst-700 text-center">{col.header}</th>
                                ))}
                                {Object.keys(priceLabels).map(key => {
                                    if (key === 'base_price') return null;
                                    if (settings[`show_${key}`] === false) return null;
                                    return <th key={key} className="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-center border-l border-analyst-700">{priceLabels[key]}</th>;
                                })}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-analyst-100">
                            {(product.product_variants || []).filter(v => v.is_active !== false).map((v, idx) => {
                                const parts = v.name.split(separator).map(p => p.trim());
                                let namePartIndex = 0;
                                return (
                                    <tr key={v.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-analyst-50'}>
                                        <td className="px-2 py-1.5 text-[8px] font-black text-analyst-600 border-r border-analyst-100 text-center bg-white" style={{ borderLeft: `3px solid ${familyColor}` }}>{v.code || '-'}</td>
                                        {parsedHeaders.map((col, cIdx) => {
                                            let cellValue = '-';
                                            if (col.isFixed) {
                                                cellValue = col.fixedValue;
                                            } else {
                                                cellValue = parts[namePartIndex] || '-';
                                                namePartIndex++;
                                            }
                                            return <td key={cIdx} className="px-2 py-1.5 text-[8px] font-bold text-analyst-900 border-r border-analyst-100 text-center">{cellValue}</td>;
                                        })}
                                        {Object.keys(priceLabels).map(key => {
                                            if (key === 'base_price') return null;
                                            if (settings[`show_${key}`] === false) return null;
                                            return <td key={key} className="px-2 py-1.5 text-[8px] font-black text-analyst-900 text-center border-l border-analyst-100 bg-white">${(v[key] || 0).toFixed(2)}</td>;
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const ProductFormat5 = ({ product }) => {
        const familyColor = settings.primaryColor;
        const mainVariant = product.product_variants?.[0] || {};
        return (
            <div className="bg-white rounded-3xl border border-analyst-100 shadow-sm relative overflow-hidden flex flex-col p-6 items-center text-center h-[200px] justify-between">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 overflow-hidden border border-analyst-100 flex items-center justify-center shrink-0">
                    {product.image_url ? (
                        <img src={product.image_url} className="w-full h-full object-cover" alt={product.name} />
                    ) : (
                        <span className="material-symbols-outlined text-4xl text-analyst-200">image</span>
                    )}
                </div>

                <div className="flex-1 flex flex-col justify-center my-2 min-w-0 w-full">
                    <span className="text-[7px] font-black text-analyst-300 uppercase tracking-widest truncate leading-none mb-1">COD: {mainVariant.code || '-'}</span>
                    <h4 className="text-xs font-black uppercase text-analyst-900 truncate tracking-tight">{product.name}</h4>
                </div>

                <div className="flex gap-2 w-full">
                    {Object.keys(priceLabels).map(key => {
                        if (key === 'base_price') return null;
                        if (settings[`show_${key}`] === false) return null;
                        return (
                            <div key={key} className="flex-1 bg-slate-800 text-white rounded-lg py-1 px-1.5 flex flex-col items-center shadow">
                                <span className="text-[5.5px] font-black uppercase text-slate-400 tracking-wider mb-0.5">{priceLabels[key]}</span>
                                <span className="text-[10px] font-black">${(mainVariant[key] || 0).toFixed(1)}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const ProductFormat6 = ({ product }) => {
        const familyColor = settings.primaryColor;
        return (
            <div className="bg-white rounded-2xl border border-analyst-100 shadow-sm relative overflow-hidden flex flex-col items-center">
                <div className="w-full aspect-square bg-slate-50 flex items-center justify-center relative overflow-hidden">
                    {product.image_url ? (
                        <img src={product.image_url} className="w-full h-full object-cover" alt={product.name} />
                    ) : (
                        <span className="material-symbols-outlined text-4xl text-analyst-200">image</span>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/40 backdrop-blur-[2px] py-1 text-center">
                        <p className="text-[7.5px] font-black uppercase text-white truncate px-2">{product.name}</p>
                    </div>
                </div>

                <div className="w-full">
                    <table className="w-full text-center border-collapse">
                        <thead>
                            <tr className="bg-analyst-800 text-white text-[5.5px] font-black uppercase">
                                <th className="py-1 w-6">CODIGO</th>
                                <th className="py-1">MEDIDA</th>
                                {Object.keys(priceLabels).map(key => {
                                    if (key === 'base_price') return null;
                                    if (settings[`show_${key}`] === false) return null;
                                    return <th key={key} className="py-1 w-10">{priceLabels[key]}</th>;
                                })}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-analyst-100">
                            {(product.product_variants || []).filter(v => v.is_active !== false).map((v, i) => (
                                <tr key={v.id} className={`text-[6px] ${i % 2 === 0 ? 'bg-white' : 'bg-analyst-50'}`}>
                                    <td className="py-1 font-mono font-black text-analyst-500 bg-slate-50">{v.code || '-'}</td>
                                    <td className="py-1 font-bold text-analyst-700 truncate max-w-[50px] uppercase">{v.name}</td>
                                    {Object.keys(priceLabels).map(key => {
                                        if (key === 'base_price') return null;
                                        if (settings[`show_${key}`] === false) return null;
                                        return <td key={key} className="py-1 font-black" style={{ color: familyColor }}>${(v[key] || 0).toFixed(1)}</td>;
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    // Filter manual list search
    const filteredProductsList = allProducts.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        p.families?.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="flex h-full w-full bg-white rounded-xl overflow-hidden border border-analyst-200">
            {/* Configuration Panel */}
            <aside className="w-80 lg:w-[350px] bg-white border-r border-analyst-100 flex flex-col h-full shrink-0">
                <header className="p-6 border-b border-analyst-50">
                    <div className="flex justify-between items-start">
                        <h2 className="text-lg font-black tracking-tight text-analyst-900 uppercase">Editor de Catálogo</h2>
                        <button
                            onClick={fetchData}
                            className={`p-2 rounded-lg hover:bg-analyst-100 transition-colors ${loading ? 'animate-spin text-primary' : 'text-analyst-400'}`}
                            title="Recargar datos"
                        >
                            <span className="material-symbols-outlined text-lg">refresh</span>
                        </button>
                    </div>
                    <div className="flex mt-4 bg-analyst-50 p-1 rounded-lg border border-analyst-100">
                        <button
                            onClick={() => setActiveTab('styles')}
                            className={`flex-1 text-[10px] font-black uppercase py-2 px-3 rounded-md transition-all ${activeTab === 'styles' ? 'bg-white shadow-sm text-primary' : 'text-analyst-400'}`}
                        >
                            Estilos
                        </button>
                        <button
                            onClick={() => setActiveTab('products')}
                            className={`flex-1 text-[10px] font-black uppercase py-2 px-3 rounded-md transition-all ${activeTab === 'products' ? 'bg-white shadow-sm text-primary' : 'text-analyst-400'}`}
                        >
                            Productos
                        </button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    {activeTab === 'styles' ? (
                        <div className="space-y-8">
                            <section>
                                <h3 className="text-[10px] font-black text-analyst-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm">palette</span> Apariencia Global
                                </h3>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-black text-analyst-600 uppercase">Color Primario</label>
                                        <input
                                            type="color"
                                            name="primaryColor"
                                            value={settings.primaryColor}
                                            onChange={handleChange}
                                            className="w-8 h-8 p-0 border-none bg-transparent cursor-pointer"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-analyst-600 uppercase">Tipografía</label>
                                        <select
                                            name="fontFamily"
                                            value={settings.fontFamily}
                                            onChange={handleChange}
                                            className="w-full border-analyst-200 bg-analyst-50 rounded-lg text-xs font-bold focus:ring-primary focus:border-primary"
                                        >
                                            <option value="Public Sans">Public Sans</option>
                                            <option value="Inter">Inter</option>
                                            <option value="Helvetica">Helvetica</option>
                                        </select>
                                    </div>
                                    <div className="flex items-center justify-between p-3 bg-analyst-50 rounded-xl border border-analyst-100">
                                        <label htmlFor="repeatHeader" className="text-[10px] text-analyst-700 font-bold uppercase cursor-pointer">Repetir cabezal en hojas</label>
                                        <input
                                            type="checkbox"
                                            id="repeatHeader"
                                            name="repeatHeader"
                                            checked={settings.repeatHeader !== false}
                                            onChange={handleChange}
                                            className="w-4 h-4 text-primary rounded border-analyst-300"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between">
                                            <label className="text-[10px] font-black text-analyst-600 uppercase">Margen (px)</label>
                                            <span className="text-[10px] font-black text-primary uppercase">{settings.pageMargin}px</span>
                                        </div>
                                        <input
                                            name="pageMargin"
                                            type="range"
                                            min="10"
                                            max="60"
                                            value={settings.pageMargin}
                                            onChange={handleChange}
                                            className="w-full h-1.5 bg-analyst-100 rounded-lg appearance-none cursor-pointer accent-primary"
                                        />
                                    </div>

                                    {/* Grouping Mode */}
                                    <div className="space-y-1 pt-2">
                                        <label className="text-[10px] font-black text-analyst-600 uppercase">Agrupar por</label>
                                        <select
                                            name="groupingMode"
                                            value={settings.groupingMode || 'family'}
                                            onChange={handleChange}
                                            className="w-full border-analyst-200 bg-analyst-50 rounded-lg text-xs font-bold focus:ring-primary focus:border-primary"
                                        >
                                            <option value="family">Familia de Productos</option>
                                            <option value="none">Sin Agrupación (Lista Corrida)</option>
                                        </select>
                                    </div>

                                    {/* Sorting Mode */}
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-analyst-600 uppercase">Ordenar por</label>
                                        <select
                                            name="sortingMode"
                                            value={settings.sortingMode || 'alphabetical'}
                                            onChange={handleChange}
                                            className="w-full border-analyst-200 bg-analyst-50 rounded-lg text-xs font-bold focus:ring-primary focus:border-primary"
                                        >
                                            <option value="alphabetical">Alfabéticamente (A-Z)</option>
                                            <option value="manual">Manual (Personalizado)</option>
                                        </select>
                                    </div>

                                    {/* Logo Gallery */}
                                    <div className="space-y-4 pt-4 border-t border-analyst-100">
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="text-[10px] font-black text-analyst-600 uppercase">Galería de Logos (Máx 5)</label>
                                            <span className="text-[9px] font-black text-analyst-300 uppercase">{(settings.logoGallery || []).length} / 5</span>
                                        </div>

                                        <div className="grid grid-cols-5 gap-2">
                                            {(settings.logoGallery || []).map((url, idx) => (
                                                <div
                                                    key={idx}
                                                    className={`aspect-square rounded-lg border-2 transition-all relative group flex items-center justify-center overflow-hidden bg-white p-1 cursor-pointer ${settings.activeLogo === url ? 'border-primary' : 'border-analyst-100 hover:border-analyst-200'}`}
                                                    onClick={() => handleSelectLogo(url)}
                                                >
                                                    <img src={url} className="w-full h-full object-contain" alt={`Logo ${idx}`} />
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteLogo(url); }}
                                                        className="absolute top-0 right-0 p-0.5 bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity rounded-bl-lg"
                                                    >
                                                        <span className="material-symbols-outlined text-[10px]">close</span>
                                                    </button>
                                                    {settings.activeLogo === url && (
                                                        <div className="absolute inset-0 bg-primary/10 pointer-events-none flex items-center justify-center">
                                                            <span className="material-symbols-outlined text-primary text-xs font-black">check</span>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                            {(settings.logoGallery || []).length < 5 && (
                                                <label className="aspect-square rounded-lg border-2 border-dashed border-analyst-200 flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all text-analyst-300 hover:text-primary">
                                                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                                                    <span className="material-symbols-outlined text-lg">add</span>
                                                    {uploadingLogo && <div className="absolute inset-0 bg-white/50 flex items-center justify-center"><div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></div></div>}
                                                </label>
                                            )}
                                        </div>
                                        <p className="text-[8px] font-bold text-analyst-400 uppercase leading-tight">Haz clic para elegir el logo activo. Aparecerá en el cabezal y como marca de agua (8% opacidad).</p>
                                    </div>
                                </div>
                            </section>

                            <section>
                                <h3 className="text-[10px] font-black text-analyst-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm">text_fields</span> Textos Fijos
                                </h3>
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-analyst-600 uppercase">Título Principal (Grande)</label>
                                        <input
                                            name="headerTitle"
                                            value={settings.headerTitle}
                                            onChange={handleChange}
                                            className="w-full border-analyst-200 bg-analyst-50 rounded-lg text-xs font-bold focus:ring-primary focus:border-primary"
                                            type="text"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-analyst-600 uppercase">Etiqueta Superior (L)</label>
                                        <input
                                            name="headerSubtitle"
                                            value={settings.headerSubtitle}
                                            onChange={handleChange}
                                            className="w-full border-analyst-200 bg-analyst-50 rounded-lg text-xs font-bold focus:ring-primary focus:border-primary"
                                            type="text"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-analyst-600 uppercase">Etiqueta Superior (R)</label>
                                        <input
                                            name="headerUnderlineText"
                                            value={settings.headerUnderlineText}
                                            onChange={handleChange}
                                            className="w-full border-analyst-200 bg-analyst-50 rounded-lg text-xs font-bold focus:ring-primary focus:border-primary"
                                            type="text"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-analyst-600 uppercase">Sitio Web (Pie)</label>
                                        <input
                                            name="footerWebsite"
                                            value={settings.footerWebsite}
                                            onChange={handleChange}
                                            className="w-full border-analyst-200 bg-analyst-50 rounded-lg text-xs font-bold focus:ring-primary focus:border-primary"
                                            type="text"
                                        />
                                    </div>
                                </div>
                            </section>

                            <section>
                                <h3 className="text-[10px] font-black text-analyst-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm">payments</span> Precios Visibles
                                </h3>
                                <div className="space-y-3">
                                    {Object.keys(priceLabels).map(key => {
                                        if (key === 'base_price') return null;
                                        return (
                                            <div key={key} className="flex items-center justify-between p-3 bg-analyst-50 rounded-xl border border-analyst-100">
                                                <label htmlFor={`show_${key}`} className="text-[10px] text-analyst-700 font-bold uppercase cursor-pointer">Mostrar {priceLabels[key]}</label>
                                                <input
                                                    type="checkbox"
                                                    id={`show_${key}`}
                                                    name={`show_${key}`}
                                                    checked={settings[`show_${key}`] !== false}
                                                    onChange={handleChange}
                                                    className="w-4 h-4 text-primary rounded border-analyst-300"
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-[10px] font-black text-analyst-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm">filter_alt</span> Selección de Productos
                                </h3>

                                <div className="flex bg-analyst-50 p-1 rounded-lg border border-analyst-100 mb-4 shrink-0">
                                    {[
                                        { id: 'manual', label: '1 a 1', icon: 'ads_click' },
                                        { id: 'family', label: 'Familia', icon: 'category' },
                                        { id: 'group', label: 'Grupo', icon: 'account_tree' }
                                    ].map(m => (
                                        <button
                                            key={m.id}
                                            onClick={() => setSelectionMode(m.id)}
                                            className={`flex-1 flex items-center justify-center gap-1.5 text-[9px] font-black uppercase py-1.5 px-2 rounded-md transition-all ${selectionMode === m.id ? 'bg-white shadow-sm text-primary' : 'text-analyst-400'}`}
                                        >
                                            <span className="material-symbols-outlined text-sm">{m.icon}</span>
                                            {m.label}
                                        </button>
                                    ))}
                                </div>

                                <div className="flex gap-2 mb-4">
                                    <button
                                        onClick={() => setPreviewProducts(allProducts)}
                                        className="flex-1 py-2 px-3 bg-primary text-white text-[9px] font-black uppercase rounded-lg hover:bg-primary/90 transition-all"
                                    >
                                        Marcar Todos
                                    </button>
                                    <button
                                        onClick={() => setPreviewProducts([])}
                                        className="flex-1 py-2 px-3 bg-analyst-50 text-analyst-600 text-[9px] font-black uppercase rounded-lg hover:bg-analyst-100 transition-all border border-analyst-200"
                                    >
                                        Limpiar
                                    </button>
                                </div>

                                {selectionMode === 'manual' && (
                                    <>
                                        <div className="relative mb-3">
                                            <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-analyst-400 text-sm">search</span>
                                            <input
                                                type="text"
                                                placeholder="Buscar productos..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="w-full border-analyst-200 bg-analyst-50 rounded-lg text-[10px] font-bold py-1.5 pl-8 focus:ring-primary"
                                            />
                                        </div>

                                        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                            {filteredProductsList.map((p, idx) => {
                                                const isSelected = previewProducts.some(pp => pp.id === p.id);
                                                const masterIdx = allProducts.findIndex(ap => ap.id === p.id);
                                                return (
                                                    <div
                                                        key={p.id}
                                                        draggable
                                                        onDragStart={(e) => handleDragStart(e, masterIdx)}
                                                        onDragOver={(e) => handleDragOver(e, masterIdx)}
                                                        onDragEnd={handleDragEnd}
                                                        onDrop={(e) => handleDrop(e, masterIdx)}
                                                        onClick={() => toggleProductVisibility(p)}
                                                        className={`p-3 rounded-xl border transition-all cursor-move flex items-center gap-3 ${isSelected ? 'border-primary bg-primary/5 animate-in fade-in zoom-in duration-100' : 'border-analyst-100 bg-white hover:border-analyst-200'}`}
                                                    >
                                                        <div 
                                                            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-analyst-200'}`}
                                                            onClick={(e) => { e.stopPropagation(); toggleProductVisibility(p); }}
                                                        >
                                                            {isSelected && <span className="material-symbols-outlined text-white text-[12px] font-black">check</span>}
                                                        </div>
                                                        <div className="w-8 h-8 rounded bg-analyst-50 overflow-hidden shrink-0 border border-analyst-100">
                                                            {p.image_url ? <img src={p.image_url} className="w-full h-full object-cover" /> : <span className="material-symbols-outlined text-analyst-300 text-sm">image</span>}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className={`text-[10px] font-black uppercase truncate ${isSelected ? 'text-primary' : 'text-analyst-900'}`}>{p.name}</p>
                                                            <p className="text-[8px] text-analyst-400 font-bold uppercase tracking-wider">{p.families?.name}</p>
                                                        </div>
                                                        <span className="material-symbols-outlined text-analyst-300 text-sm shrink-0">drag_indicator</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}

                                {selectionMode === 'family' && (
                                    <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                                        {allFamilies.map(f => {
                                            const categoryProducts = allProducts.filter(p => p.family_id === f.id);
                                            const selectedInCategory = categoryProducts.filter(p => previewProducts.some(pp => pp.id === p.id));
                                            const isFullySelected = categoryProducts.length > 0 && selectedInCategory.length === categoryProducts.length;
                                            const isPartial = selectedInCategory.length > 0 && !isFullySelected;

                                            return (
                                                <div
                                                    key={f.id}
                                                    onClick={() => toggleCategoryProducts('family_id', f.id)}
                                                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${isFullySelected ? 'border-primary bg-primary/5' : isPartial ? 'border-primary/50 bg-primary/5' : 'border-analyst-100 bg-white hover:border-analyst-200'}`}
                                                >
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isFullySelected ? 'bg-primary border-primary' : isPartial ? 'bg-primary/50 border-primary' : 'border-analyst-200'}`}>
                                                        {isFullySelected && <span className="material-symbols-outlined text-white text-[12px] font-black">check</span>}
                                                        {isPartial && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                                    </div>
                                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm" style={{ backgroundColor: settings.primaryColor }}>
                                                        <span className="material-symbols-outlined text-lg">{f.icon || 'category'}</span>
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className={`text-[10px] font-black uppercase ${isFullySelected ? 'text-primary' : 'text-analyst-900'}`}>{f.name}</p>
                                                        <p className="text-[8px] text-analyst-400 font-bold uppercase">{selectedInCategory.length} / {categoryProducts.length} Productos</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {selectionMode === 'group' && (
                                    <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                                        {allGroups.map(g => {
                                            const categoryProducts = allProducts.filter(p => p.group_id === g.id);
                                            const selectedInCategory = categoryProducts.filter(p => previewProducts.some(pp => pp.id === p.id));
                                            const isFullySelected = categoryProducts.length > 0 && selectedInCategory.length === categoryProducts.length;
                                            const isPartial = selectedInCategory.length > 0 && !isFullySelected;

                                            return (
                                                <div
                                                    key={g.id}
                                                    onClick={() => toggleCategoryProducts('group_id', g.id)}
                                                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${isFullySelected ? 'border-primary bg-primary/5' : isPartial ? 'border-primary/50 bg-primary/5' : 'border-analyst-100 bg-white hover:border-analyst-200'}`}
                                                >
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isFullySelected ? 'bg-primary border-primary' : isPartial ? 'bg-primary/50 border-primary' : 'border-analyst-200'}`}>
                                                        {isFullySelected && <span className="material-symbols-outlined text-white text-[12px] font-black">check</span>}
                                                        {isPartial && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className={`text-[10px] font-black uppercase ${isFullySelected ? 'text-primary' : 'text-analyst-900'}`}>{g.name}</p>
                                                        <p className="text-[8px] text-analyst-400 font-bold uppercase tracking-wider">{g.families?.name || 'Sin Familia'}</p>
                                                        <p className="text-[7px] text-analyst-300 font-black uppercase mt-1">{selectedInCategory.length} / {categoryProducts.length} Productos</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {!loading && allProducts.length === 0 && (
                                <div className="p-8 text-center border-2 border-dashed border-analyst-100 rounded-2xl">
                                    <p className="text-[10px] font-black text-analyst-300 uppercase leading-relaxed">No se encontraron productos.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <footer className="p-6 border-t border-analyst-100 bg-analyst-50/50 flex gap-3">
                    <button
                        onClick={handleSave}
                        className="flex-1 py-3 text-[10px] font-black uppercase bg-primary text-white rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
                    >
                        Guardar Configuración
                    </button>
                </footer>
            </aside>

            {/* Live Preview Canvas with pagination support */}
            <section className="flex-1 bg-analyst-100 flex flex-col overflow-hidden relative p-8 items-center overflow-y-auto custom-scrollbar">
                <div className="sticky top-0 z-20 bg-white/85 backdrop-blur-md px-6 py-3 rounded-2xl shadow-xl border border-white/20 flex items-center gap-6 mb-8 translate-y-2">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleExport}
                            disabled={exporting}
                            className={`px-4 py-2 bg-white border border-analyst-100 rounded-xl text-[10px] font-black uppercase transition-all shadow-sm flex items-center gap-2 ${exporting ? 'opacity-50' : 'hover:bg-analyst-50'}`}
                        >
                            {exporting && <div className="w-3 h-3 border-2 border-analyst-400 border-t-transparent rounded-full animate-spin"></div>}
                            {exporting ? 'Generando...' : 'Descargar'}
                        </button>
                        <button
                            onClick={handleExport}
                            disabled={exporting}
                            className={`px-4 py-2 bg-primary text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-primary/20 transition-all flex items-center gap-2 ${exporting ? 'opacity-50' : 'hover:opacity-90'}`}
                        >
                            {exporting ? 'Procesando...' : 'Imprimir'}
                        </button>
                    </div>
                    <p className="text-[9px] font-black text-analyst-400 uppercase italic">Vista previa con saltos de página reales</p>
                </div>

                <div className="flex flex-col items-center gap-12 select-none w-full pb-32">
                    {previewPages.length === 0 ? (
                        <div
                            className="bg-white text-slate-900 flex flex-col shadow-2xl shrink-0 transition-all duration-300 relative border border-analyst-100"
                            style={{
                                width: '210mm',
                                height: '297mm',
                                padding: `${settings.pageMargin}px`,
                                fontFamily: settings.fontFamily,
                                transform: 'scale(0.85)',
                                transformOrigin: 'top center'
                            }}
                        >
                            <div className="flex-1 flex items-center justify-center border-2 border-dashed border-analyst-50 rounded-3xl p-10 mt-12">
                                <p className="text-[10px] font-black text-analyst-200 uppercase tracking-widest">Vista Previa Vacía</p>
                            </div>
                        </div>
                    ) : (
                        previewPages.map((page, pIdx) => (
                            <div
                                key={pIdx}
                                className="bg-white text-slate-900 flex flex-col shadow-2xl shrink-0 transition-all duration-300 relative border border-analyst-150"
                                style={{
                                    width: '210mm',
                                    height: '297mm',
                                    padding: `${settings.pageMargin}px`,
                                    fontFamily: settings.fontFamily,
                                    transform: 'scale(0.85)',
                                    transformOrigin: 'top center'
                                }}
                            >
                                {/* Watermark Preview */}
                                {settings.activeLogo && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                                        <img
                                            src={settings.activeLogo}
                                            className="w-[400px] h-[400px] object-contain"
                                            style={{ opacity: 0.08 }}
                                            alt="Watermark Preview"
                                        />
                                    </div>
                                )}

                                {/* Header */}
                                {(pIdx === 0 || settings.repeatHeader !== false) ? (
                                    <div className="w-full flex justify-between items-start mb-8 relative z-10" style={{ borderColor: settings.primaryColor }}>
                                        <div className="flex items-center gap-4">
                                            <div className="w-14 h-14 flex items-center justify-center rounded-2xl shadow-lg shrink-0" style={{ backgroundColor: '#1e293b' }}>
                                                <span className="material-symbols-outlined text-white text-3xl">token</span>
                                            </div>
                                            <div className="min-w-0">
                                                <p
                                                    contentEditable
                                                    suppressContentEditableWarning
                                                    onBlur={(e) => handleTextEdit('headerSubtitle', e.target.innerText)}
                                                    className="text-[10px] font-black tracking-widest uppercase mb-1 outline-none focus:ring-2 focus:ring-primary/20 rounded px-1 -ml-1 whitespace-nowrap overflow-hidden"
                                                    style={{ color: settings.primaryColor }}
                                                >
                                                    {settings.headerSubtitle}
                                                </p>
                                                <h4
                                                    contentEditable
                                                    suppressContentEditableWarning
                                                    onBlur={(e) => handleTextEdit('headerTitle', e.target.innerText)}
                                                    className="text-[26.6px] font-black leading-none text-analyst-900 uppercase tracking-tighter outline-none focus:ring-2 focus:ring-primary/20 rounded px-1 -ml-1 transition-all truncate"
                                                >
                                                    {settings.headerTitle}
                                                </h4>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p
                                                contentEditable
                                                suppressContentEditableWarning
                                                onBlur={(e) => handleTextEdit('headerUnderlineText', e.target.innerText)}
                                                className="text-[10px] font-black text-analyst-900 uppercase tracking-tighter mt-1 outline-none focus:ring-2 focus:ring-primary/20 rounded px-1 -mr-1"
                                            >
                                                {settings.headerUnderlineText}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-6"></div>
                                )}

                                {/* Absolute layout container */}
                                <div className="relative flex-1 z-10 w-full h-full">
                                    {page.items.map((item, itemIdx) => {
                                        const p = item.product;
                                        const format = p.pdf_format || '1';
                                        const startY = (pIdx === 0 || settings.repeatHeader !== false) ? 140 : 40;
                                        const relativeY = item.y - startY;

                                        return (
                                            <div
                                                key={p.id + '-' + itemIdx}
                                                className="absolute transition-all"
                                                style={{
                                                    left: `${item.x - 40}px`,
                                                    top: `${relativeY}px`,
                                                    width: `${item.width}px`
                                                }}
                                            >
                                                {format === '6' ? <ProductFormat6 product={p} /> :
                                                 format === '5' ? <ProductFormat5 product={p} /> :
                                                 format === '4' ? <ProductFormat4 product={p} /> :
                                                 format === '3' ? <ProductFormat3 product={p} /> :
                                                 format === '2' ? <ProductFormat2 product={p} /> :
                                                 <ProductFormat1 product={p} />}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Footer */}
                                <footer className="absolute bottom-0 left-0 right-0 h-[27px] flex items-center px-10 transition-colors" style={{ backgroundColor: settings.primaryColor }}>
                                    <div className="flex-1 text-center">
                                        <p
                                            contentEditable
                                            suppressContentEditableWarning
                                            onBlur={(e) => handleTextEdit('footerWebsite', e.target.innerText)}
                                            className="text-[7px] font-black text-white uppercase tracking-widest outline-none transition-all"
                                        >
                                            {settings.footerWebsite}
                                        </p>
                                    </div>
                                    {settings.showPageNumbers && (
                                        <div className="absolute right-10">
                                            <p className="text-[7px] font-black text-white uppercase">
                                                Pag. {String(page.pageNum).padStart(2, '0')}
                                            </p>
                                        </div>
                                    )}
                                </footer>
                            </div>
                        ))
                    )}
                </div>
            </section>
        </div>
    );
};

export default CatalogEditor;
