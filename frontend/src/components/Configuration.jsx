import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

const ConfigCard = ({ title, icon, onAdd, value, onChange, placeholder, children, filter }) => (
    <div className="bg-white border border-analyst-200 rounded-2xl shadow-sm flex flex-col min-h-0 overflow-hidden group">
        <div className="px-5 py-4 border-b border-analyst-100 flex items-center justify-between bg-white group-hover:bg-analyst-50/50 transition-colors shrink-0">
            <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-xl font-bold">{icon}</span>
                <h3 className="font-black text-[11px] text-analyst-900 uppercase tracking-widest leading-none">{title}</h3>
            </div>
        </div>
        {filter && <div className="p-4 bg-analyst-50/50 border-b border-analyst-100 shrink-0">{filter}</div>}
        <div className="p-4 bg-white border-b border-analyst-100 flex gap-2 shrink-0">
            <input
                className="flex-1 bg-analyst-50 focus:bg-white !h-9 text-[11px] font-bold border-analyst-200 rounded-xl"
                placeholder={placeholder || "Añadir nuevo..."}
                value={value}
                onChange={onChange}
            />
            <button
                onClick={onAdd}
                className="bg-primary text-white w-9 h-9 flex items-center justify-center rounded-xl font-black shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
            >
                +
            </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
            {children}
        </div>
    </div>
);

const ICON_LIST = [
    'construction', 'grid_view', 'layers', 'inventory_2', 'home_repair_service', 'category',
    'bolt', 'plumbing', 'format_paint', 'handyman', 'carpenter', 'square_foot',
    'straighten', 'architecture', 'hardware', 'build', 'settings_accessibility',
    'Precision_Manufacturing', 'engineering', 'factory', 'warehouse', 'local_shipping',
    'package_2', 'inventory', 'shopping_cart', 'store', 'view_quilt', 'view_module',
    'window', 'door_front', 'foundation', 'roofing', 'deck', 'walling'
];

const Configuration = () => {
    const [activeSectionTab, setActiveSectionTab] = useState('structure'); // 'structure', 'entities', 'company'
    
    const [families, setFamilies] = useState([]);
    const [groups, setGroups] = useState([]);
    const [providers, setProviders] = useState([]);
    const [units, setUnits] = useState([]);
    const [priceLabels, setPriceLabels] = useState({});
    const [loading, setLoading] = useState({});

    // Entities Management States
    const [sellers, setSellers] = useState([]);
    const [shops, setShops] = useState([]);
    const [deliverers, setDeliverers] = useState([]);
    const [activeEntityTab, setActiveEntityTab] = useState('sellers'); // 'sellers', 'shops', 'deliverers'
    const [entityForm, setEntityForm] = useState({});
    const [editingEntityId, setEditingEntityId] = useState(null);

    // Active Company Profile States
    const [companyForm, setCompanyForm] = useState({
        name: '', logo_url: '', address: '', phone: '', cuit: '', email: '', password: ''
    });
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [companyLoading, setCompanyLoading] = useState(false);

    const [newName, setNewName] = useState({ family: '', group: '', provider: '', unit: '', unitValue: '' });
    const [selectedFamily, setSelectedFamily] = useState('');
    const [selectedUnit, setSelectedUnit] = useState('');

    const [pickingIconFor, setPickingIconFor] = useState(null);

    useEffect(() => {
        fetchData();
        fetchPriceLabels();
        fetchCompanyProfile();
    }, []);

    const fetchData = async () => {
        try {
            const [f, g, p, u, sel, sh, del] = await Promise.all([
                axios.get(`${API_URL}/families`),
                axios.get(`${API_URL}/groups`),
                axios.get(`${API_URL}/providers`),
                axios.get(`${API_URL}/units`),
                axios.get(`${API_URL}/preventistas`).catch(e => ({ data: [] })),
                axios.get(`${API_URL}/negocios`).catch(e => ({ data: [] })),
                axios.get(`${API_URL}/entregadores`).catch(e => ({ data: [] }))
            ]);
            setFamilies(f.data);
            setGroups(g.data);
            setProviders(p.data);
            setUnits(u.data);
            setSellers(sel.data || []);
            setShops(sh.data || []);
            setDeliverers(del.data || []);
        } catch (err) { console.error(err); }
    };

    const fetchPriceLabels = async () => {
        try {
            const { data } = await axios.get(`${API_URL}/settings/price_labels`);
            if (data && Object.keys(data).length > 0) {
                setPriceLabels(data);
            } else {
                setPriceLabels({ price_unit: 'Precio Base', price_bulk: 'Mayorista' });
            }
        } catch (err) {
            console.warn("Settings table missing.");
            setPriceLabels({ price_unit: 'Precio Base', price_bulk: 'Mayorista' });
        }
    };

    const fetchCompanyProfile = async () => {
        try {
            const { data } = await axios.get(`${API_URL}/auth/company`);
            if (data) {
                setCompanyForm({
                    name: data.name || '',
                    logo_url: data.logo_url || '',
                    address: data.address || '',
                    phone: data.phone || '',
                    cuit: data.cuit || '',
                    email: data.email || '',
                    password: data.password || ''
                });
            }
        } catch (err) {
            console.error('Error fetching company details:', err);
        }
    };

    const updatePriceLabels = async () => {
        setLoading(prev => ({ ...prev, prices: true }));
        try {
            await axios.post(`${API_URL}/settings/price_labels`, { value: priceLabels });
            alert("Etiquetas de precios actualizadas.");
        } catch (err) { console.error(err); }
        setLoading(prev => ({ ...prev, prices: false }));
    };

    const addItem = async (type, payload) => {
        if (!payload.name && !payload.value) return;
        setLoading(prev => ({ ...prev, [type]: true }));
        try {
            await axios.post(`${API_URL}/${type}`, payload);
            await fetchData();
            const typeToKey = {
                'families': 'family',
                'groups': 'group',
                'providers': 'provider',
                'units': 'unit',
                'unit-values': 'unitValue'
            };
            const keyToClear = typeToKey[type];
            if (keyToClear) {
                setNewName(prev => ({ ...prev, [keyToClear]: '' }));
            }
        } catch (err) { console.error(err); }
        finally { setLoading(prev => ({ ...prev, [type]: false })); }
    };

    const updateFamily = async (id, payload) => {
        try {
            await axios.patch(`${API_URL}/families/${id}`, payload);
            fetchData();
        } catch (err) { console.error(err); }
    };

    // --- ENTITY CRUD ACTIONS ---
    const handleEntitySubmit = async (e) => {
        e.preventDefault();
        const endpoint = activeEntityTab === 'sellers' ? 'preventistas' : activeEntityTab === 'shops' ? 'negocios' : 'entregadores';
        try {
            if (editingEntityId) {
                await axios.patch(`${API_URL}/${endpoint}/${editingEntityId}`, entityForm);
                alert('Registro actualizado correctamente.');
            } else {
                await axios.post(`${API_URL}/${endpoint}`, entityForm);
                alert('Registro creado correctamente.');
            }
            setEntityForm({});
            setEditingEntityId(null);
            fetchData();
        } catch (error) {
            console.error(error);
            alert('Error al guardar el registro.');
        }
    };

    const editEntity = (entity) => {
        setEditingEntityId(entity.id);
        if (activeEntityTab === 'sellers') {
            setEntityForm({ name: entity.name, phone: entity.phone || '', commission: entity.commission || 0, is_active: entity.is_active, username: entity.username || '', password: entity.password || '' });
        } else if (activeEntityTab === 'shops') {
            setEntityForm({ 
                name: entity.name, 
                owner: entity.owner || '', 
                address: entity.address, 
                phone: entity.phone || '', 
                cuit: entity.cuit || '', 
                is_active: entity.is_active,
                latitude: entity.latitude || '',
                longitude: entity.longitude || '',
                price_list: entity.price_list || 'price_unit'
            });
        } else {
            setEntityForm({ name: entity.name, vehicle: entity.vehicle || '', phone: entity.phone || '', is_active: entity.is_active, username: entity.username || '', password: entity.password || '' });
        }
    };

    const captureGPS = () => {
        if (!navigator.geolocation) {
            alert('La geolocalización no está soportada por tu navegador.');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setEntityForm(prev => ({
                    ...prev,
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                }));
                alert('¡Ubicación GPS capturada con éxito!');
            },
            (error) => {
                console.error(error);
                alert('Error al obtener geolocalización: ' + error.message);
            },
            { enableHighAccuracy: true }
        );
    };

    const deleteEntity = async (id) => {
        if (!window.confirm('¿Estás seguro de eliminar este registro?')) return;
        const endpoint = activeEntityTab === 'sellers' ? 'preventistas' : activeEntityTab === 'shops' ? 'negocios' : 'entregadores';
        try {
            await axios.delete(`${API_URL}/${endpoint}/${id}`);
            fetchData();
        } catch (error) {
            console.error(error);
            alert('Error al eliminar. Asegúrese de que no esté asociado a un pedido activo.');
        }
    };

    // --- COMPANY PROFILE ACTIONS ---
    const handleCompanyLogoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploadingLogo(true);
        try {
            const formData = new FormData();
            formData.append('image', file);
            const response = await axios.post(`${API_URL}/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            const logoUrl = response.data.publicUrl;
            setCompanyForm(prev => ({ ...prev, logo_url: logoUrl }));
            alert('Logo cargado correctamente. Presiona "Guardar Datos" para confirmar.');
        } catch (error) {
            console.error(error);
            alert('Error al subir el logo.');
        } finally {
            setUploadingLogo(false);
        }
    };

    const handleCompanySubmit = async (e) => {
        e.preventDefault();
        setCompanyLoading(true);
        try {
            const { data } = await axios.patch(`${API_URL}/auth/company`, companyForm);
            
            // Sync activeCompany details in localStorage so it updates sidebar name and logo instantly
            const activeCompany = JSON.parse(localStorage.getItem('activeCompany') || '{}');
            const updatedCompany = { ...activeCompany, ...data };
            localStorage.setItem('activeCompany', JSON.stringify(updatedCompany));
            
            alert('Perfil de empresa actualizado con éxito.');
            // Force refresh context branding by dispatching a storage event
            window.location.reload(); 
        } catch (error) {
            console.error(error);
            alert('Error al guardar datos de la empresa.');
        } finally {
            setCompanyLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full space-y-6 overflow-hidden min-h-0 relative">

            {/* Icon Picker Overlay */}
            {pickingIconFor && (
                <div className="absolute inset-0 z-50 flex items-center justify-center p-10 bg-analyst-900/40 backdrop-blur-md">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-full overflow-hidden border border-white/20">
                        <div className="px-8 py-6 border-b border-analyst-100 flex justify-between items-center bg-analyst-50/30">
                            <div>
                                <h3 className="font-black text-sm text-analyst-900 uppercase">Elegir Icono</h3>
                                <p className="text-[10px] text-analyst-400 font-bold uppercase">Representación para {families.find(f => f.id === pickingIconFor)?.name}</p>
                            </div>
                            <button onClick={() => setPickingIconFor(null)} className="p-2 hover:bg-white rounded-xl transition-all shadow-sm">
                                <span className="material-symbols-outlined text-analyst-400">close</span>
                            </button>
                        </div>
                        <div className="p-8 overflow-y-auto grid grid-cols-6 gap-4 custom-scrollbar">
                            {ICON_LIST.map(icon => (
                                <button
                                    key={icon}
                                    onClick={() => {
                                        updateFamily(pickingIconFor, { icon });
                                        setPickingIconFor(null);
                                    }}
                                    className={`aspect-square flex flex-col items-center justify-center rounded-2xl border transition-all hover:scale-110 active:scale-95 ${families.find(f => f.id === pickingIconFor)?.icon === icon ? 'bg-primary/10 border-primary text-primary shadow-lg shadow-primary/5' : 'bg-analyst-50/30 border-analyst-100 text-analyst-400 hover:border-analyst-300 hover:text-analyst-600'}`}
                                >
                                    <span className="material-symbols-outlined text-2xl mb-1">{icon}</span>
                                    <span className="text-[7px] font-black uppercase text-center leading-none">{icon.replace('_', ' ')}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Sub-Tab Navigation Bar */}
            <div className="bg-white border border-analyst-200 rounded-2xl p-2 shrink-0 shadow-sm flex gap-3">
                <button
                    onClick={() => setActiveSectionTab('structure')}
                    className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${activeSectionTab === 'structure' ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-analyst-500 hover:bg-slate-50'}`}
                >
                    <span className="material-symbols-outlined text-sm font-black">settings_input_component</span>
                    Parámetros e Iconos
                </button>
                <button
                    onClick={() => setActiveSectionTab('entities')}
                    className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${activeSectionTab === 'entities' ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-analyst-500 hover:bg-slate-50'}`}
                >
                    <span className="material-symbols-outlined text-sm font-black">groups</span>
                    Cargar Preventistas, Negocios y Choferes
                </button>
                <button
                    onClick={() => { setActiveSectionTab('company'); fetchCompanyProfile(); }}
                    className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${activeSectionTab === 'company' ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-analyst-500 hover:bg-slate-50'}`}
                >
                    <span className="material-symbols-outlined text-sm font-black">domain</span>
                    Mi Empresa
                </button>
            </div>

            {/* Active section rendering */}
            {activeSectionTab === 'structure' && (
                <div className="flex-1 flex flex-col space-y-6 overflow-y-auto pr-1 min-h-0 custom-scrollbar pb-6">
                    {/* Price Labels Section */}
                    <div className="bg-white border border-analyst-200 rounded-2xl p-6 shrink-0 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-2 h-full bg-primary"></div>
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-blue-50 rounded-xl text-primary">
                                    <span className="material-symbols-outlined text-2xl font-bold">stylus_note</span>
                                </div>
                                <div>
                                    <h3 className="font-black text-xs text-analyst-900 uppercase tracking-widest">Nomenclatura de Precios</h3>
                                    <p className="text-[10px] text-analyst-400 font-bold uppercase tracking-tighter">Define tus propios niveles y nombres de precios</p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        const keys = ['price_unit', 'price_bulk', 'price_business', 'price_company'];
                                        const unusedKey = keys.find(k => !priceLabels[k]);
                                        if (unusedKey) {
                                            setPriceLabels({ ...priceLabels, [unusedKey]: 'Nuevo Precio' });
                                        } else {
                                            alert("Límite alcanzado: El sistema soporta un máximo de 4 listas de precios de venta.");
                                        }
                                    }}
                                    className="bg-slate-800 text-white px-6 h-10 text-[11px] font-black rounded-xl uppercase hover:bg-black transition-all flex items-center gap-2"
                                >
                                    + Nueva Etiqueta
                                </button>
                                <button
                                    onClick={updatePriceLabels}
                                    disabled={loading.prices}
                                    className="bg-primary text-white px-8 h-10 text-[11px] font-black rounded-xl uppercase shadow-xl shadow-primary/20 hover:bg-blue-700 transition-all flex items-center gap-3"
                                >
                                    {loading.prices && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                                    Sincronizar Etiquetas
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            {Object.keys(priceLabels).map(key => (
                                <div key={key} className="space-y-2 group/label relative">
                                    <div className="flex justify-between items-center px-1">
                                        <label className="block text-[9px] font-black text-analyst-300 uppercase tracking-widest">
                                            {key === 'price_unit' ? 'PRECIO BASE' : key.replace('price_', '').toUpperCase()}
                                        </label>
                                        <button
                                            onClick={() => {
                                                const newLabels = { ...priceLabels };
                                                delete newLabels[key];
                                                setPriceLabels(newLabels);
                                            }}
                                            className="opacity-0 group-hover/label:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
                                        >
                                            <span className="material-symbols-outlined text-xs">delete</span>
                                        </button>
                                    </div>
                                    <input
                                        className="bg-analyst-50 focus:bg-white focus:ring-4 focus:ring-primary/5 !h-10 text-[11px] font-bold border-analyst-200 rounded-xl transition-all w-full"
                                        value={priceLabels[key]}
                                        onChange={(e) => setPriceLabels({ ...priceLabels, [key]: e.target.value })}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Param cards grid */}
                    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 shrink-0">
                        {/* Families */}
                        <ConfigCard
                            title="Familias"
                            icon="layers"
                            value={newName.family}
                            onChange={(e) => setNewName({ ...newName, family: e.target.value })}
                            onAdd={() => addItem('families', { name: newName.family })}
                        >
                            {families.map(f => (
                                <div key={f.id} className="mx-2 my-1 px-4 py-3 bg-white border border-analyst-50 rounded-xl text-[10px] font-black text-analyst-700 uppercase hover:border-primary/20 transition-all shadow-sm flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setPickingIconFor(f.id)}
                                            className="w-10 h-10 flex items-center justify-center bg-analyst-50 rounded-xl hover:bg-white hover:shadow-md transition-all group/icon"
                                        >
                                            <span className="material-symbols-outlined text-[18px] text-analyst-400 group-hover/icon:text-primary transition-all">
                                                {f.icon || 'construction'}
                                            </span>
                                        </button>
                                        <span>{f.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="w-4 h-4 rounded-full border border-analyst-200"
                                            style={{ backgroundColor: f.color || '#00bcd4' }}
                                        />
                                        <input
                                            type="color"
                                            defaultValue={f.color || '#00bcd4'}
                                            onBlur={(e) => updateFamily(f.id, { color: e.target.value })}
                                            className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer"
                                        />
                                    </div>
                                </div>
                            ))}
                        </ConfigCard>

                        {/* Groups */}
                        <ConfigCard
                            title="Grupos"
                            icon="auto_awesome_mosaic"
                            value={newName.group}
                            onChange={(e) => setNewName({ ...newName, group: e.target.value })}
                            onAdd={() => addItem('groups', { family_id: selectedFamily, name: newName.group })}
                            filter={
                                <select className="!h-9 text-[10px] font-bold uppercase rounded-xl border-analyst-200 w-full" value={selectedFamily} onChange={(e) => setSelectedFamily(e.target.value)}>
                                    <option value="">- FILTRAR POR FAMILIA -</option>
                                    {families.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                </select>
                            }
                        >
                            {groups.filter(g => !selectedFamily || g.family_id == selectedFamily).map(g => (
                                <div key={g.id} className="mx-2 my-1 px-4 py-3 bg-white border border-analyst-50 rounded-xl text-[10px] font-bold text-analyst-600 uppercase hover:border-primary/20 transition-all shadow-sm flex justify-between">
                                    <span>{g.name}</span>
                                    {!selectedFamily && <span className="text-[8px] opacity-50">{families.find(f => f.id === g.family_id)?.name}</span>}
                                </div>
                            ))}
                        </ConfigCard>

                        {/* Providers */}
                        <ConfigCard
                            title="Proveedores"
                            icon="group"
                            value={newName.provider}
                            onChange={(e) => setNewName({ ...newName, provider: e.target.value })}
                            onAdd={() => addItem('providers', { name: newName.provider })}
                        >
                            {providers.map(p => (
                                <div key={p.id} className="mx-2 my-1 px-4 py-3 bg-white border border-analyst-50 rounded-xl text-[10px] font-bold text-analyst-600 uppercase hover:border-primary/20 transition-all shadow-sm">
                                    {p.name}
                                </div>
                            ))}
                        </ConfigCard>

                        {/* Units/Values */}
                        <ConfigCard
                            title="Unidades"
                            icon="ruler"
                            value={newName.unit}
                            onChange={(e) => setNewName({ ...newName, unit: e.target.value })}
                            onAdd={() => addItem('units', { name: newName.unit })}
                            filter={
                                <div className="space-y-2">
                                    <select className="!h-9 text-[10px] font-bold uppercase rounded-xl w-full" value={selectedUnit} onChange={(e) => setSelectedUnit(e.target.value)}>
                                        <option value="">- CARGAR VALORES A... -</option>
                                        {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                    </select>
                                    <div className="flex gap-2">
                                        <input className="flex-1 !h-9 text-[10px] font-bold uppercase border-analyst-200 rounded-xl px-3" placeholder="Añadir valor..." value={newName.unitValue} onChange={(e) => setNewName({ ...newName, unitValue: e.target.value })} />
                                        <button onClick={() => addItem('unit-values', { unit_id: selectedUnit, value: newName.unitValue })} className="bg-slate-800 text-white px-3 rounded-xl font-black">+</button>
                                    </div>
                                </div>
                            }
                        >
                            <div className="p-2 space-y-4">
                                {units.map(u => (
                                    <div key={u.id} className="p-4 bg-analyst-50/50 rounded-2xl border border-analyst-100">
                                        <p className="text-[10px] font-black text-analyst-900 uppercase mb-2 tracking-widest leading-none flex items-center gap-2">
                                            <span className="w-1 h-3 bg-primary rounded-full"></span>
                                            {u.name}
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {u.unit_values?.map(val => (
                                                <span key={val.id} className="text-[9px] font-black px-2 py-1 bg-white border border-analyst-100 rounded-lg text-analyst-500 shadow-sm">
                                                    {val.value}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ConfigCard>
                    </div>
                </div>
            )}

            {activeSectionTab === 'entities' && (
                /* Tab 2: Preventistas, Negocios & Repartidores CRUD loaders */
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start min-h-0 overflow-y-auto pb-8 custom-scrollbar">
                    {/* Left Form Panel */}
                    <div className="lg:col-span-4 bg-white border border-analyst-150 rounded-2xl p-5 shadow-sm">
                        <h4 className="text-[11px] font-black uppercase text-analyst-800 pb-2 border-b border-slate-100 mb-4">
                            {editingEntityId ? 'Editar Registro' : 'Cargar Nuevo Registro'}
                        </h4>

                        <form onSubmit={handleEntitySubmit} className="space-y-4 text-[10px] font-bold">
                            <div className="flex bg-analyst-50 p-1 rounded-lg border border-analyst-100 mb-2">
                                {[
                                    { id: 'sellers', label: 'Preventistas' },
                                    { id: 'shops', label: 'Negocios' },
                                    { id: 'deliverers', label: 'Choferes' }
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => {
                                            setActiveEntityTab(tab.id);
                                            setEntityForm({});
                                            setEditingEntityId(null);
                                        }}
                                        className={`flex-1 text-[8.5px] font-black uppercase py-1.5 rounded transition-all ${activeEntityTab === tab.id ? 'bg-white shadow-sm text-primary' : 'text-analyst-400'}`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <label className="text-[8px] font-black text-analyst-400 uppercase">Nombre Completo</label>
                                    <input
                                        type="text"
                                        value={entityForm.name || ''}
                                        required
                                        onChange={(e) => setEntityForm(prev => ({ ...prev, name: e.target.value }))}
                                        className="w-full border-analyst-200 bg-analyst-50 rounded-lg text-xs"
                                    />
                                </div>

                                {activeEntityTab === 'sellers' && (
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black text-analyst-400 uppercase">Porcentaje Comisión (%)</label>
                                        <input
                                            type="number"
                                            value={entityForm.commission || ''}
                                            onChange={(e) => setEntityForm(prev => ({ ...prev, commission: parseFloat(e.target.value) || 0 }))}
                                            className="w-full border-analyst-200 bg-analyst-50 rounded-lg text-xs"
                                        />
                                    </div>
                                )}

                                {activeEntityTab === 'shops' && (
                                    <>
                                        <div className="space-y-1">
                                            <label className="text-[8px] font-black text-analyst-400 uppercase">Dueño / Titular</label>
                                            <input
                                                type="text"
                                                value={entityForm.owner || ''}
                                                onChange={(e) => setEntityForm(prev => ({ ...prev, owner: e.target.value }))}
                                                className="w-full border-analyst-200 bg-analyst-50 rounded-lg text-xs"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[8px] font-black text-analyst-400 uppercase">Dirección Comercial</label>
                                            <input
                                                type="text"
                                                value={entityForm.address || ''}
                                                required
                                                onChange={(e) => setEntityForm(prev => ({ ...prev, address: e.target.value }))}
                                                className="w-full border-analyst-200 bg-analyst-50 rounded-lg text-xs"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[8px] font-black text-analyst-400 uppercase">CUIT / Identificación</label>
                                            <input
                                                type="text"
                                                value={entityForm.cuit || ''}
                                                onChange={(e) => setEntityForm(prev => ({ ...prev, cuit: e.target.value }))}
                                                className="w-full border-analyst-200 bg-analyst-50 rounded-lg text-xs"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1">
                                                <label className="text-[8px] font-black text-analyst-400 uppercase">Latitud (GPS)</label>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    placeholder="Ej: -34.6037"
                                                    value={entityForm.latitude || ''}
                                                    onChange={(e) => setEntityForm(prev => ({ ...prev, latitude: parseFloat(e.target.value) || '' }))}
                                                    className="w-full border-analyst-200 bg-analyst-50 rounded-lg text-xs"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[8px] font-black text-analyst-400 uppercase">Longitud (GPS)</label>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    placeholder="Ej: -58.3816"
                                                    value={entityForm.longitude || ''}
                                                    onChange={(e) => setEntityForm(prev => ({ ...prev, longitude: parseFloat(e.target.value) || '' }))}
                                                    className="w-full border-analyst-200 bg-analyst-50 rounded-lg text-xs"
                                                />
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={captureGPS}
                                            className="w-full py-2 bg-slate-800 hover:bg-black text-white rounded-xl text-[9px] font-black uppercase flex items-center justify-center gap-1.5 shadow"
                                        >
                                            <span className="material-symbols-outlined text-[13px] font-black">my_location</span>
                                            Obtener GPS Actual
                                        </button>

                                        <div className="space-y-1">
                                            <label className="text-[8px] font-black text-analyst-400 uppercase">Lista de Precios Asignada</label>
                                            <select
                                                value={entityForm.price_list || 'price_unit'}
                                                onChange={(e) => setEntityForm(prev => ({ ...prev, price_list: e.target.value }))}
                                                className="w-full border-analyst-200 bg-analyst-50 rounded-lg text-xs"
                                            >
                                                {Object.entries(priceLabels).map(([key, label]) => (
                                                    <option key={key} value={key}>{label.toUpperCase()}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </>
                                )}

                                {activeEntityTab === 'deliverers' && (
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black text-analyst-400 uppercase">Vehículo / Patente</label>
                                        <input
                                            type="text"
                                            value={entityForm.vehicle || ''}
                                            onChange={(e) => setEntityForm(prev => ({ ...prev, vehicle: e.target.value }))}
                                            className="w-full border-analyst-200 bg-analyst-50 rounded-lg text-xs"
                                        />
                                    </div>
                                )}

                                <div className="space-y-1">
                                    <label className="text-[8px] font-black text-analyst-400 uppercase">Teléfono de Contacto</label>
                                    <input
                                        type="text"
                                        value={entityForm.phone || ''}
                                        onChange={(e) => setEntityForm(prev => ({ ...prev, phone: e.target.value }))}
                                        className="w-full border-analyst-200 bg-analyst-50 rounded-lg text-xs"
                                    />
                                </div>

                                {activeEntityTab !== 'shops' && (
                                    <>
                                        <div className="space-y-1">
                                            <label className="text-[8px] font-black text-analyst-400 uppercase">Usuario de Acceso Móvil</label>
                                            <input
                                                type="text"
                                                value={entityForm.username || ''}
                                                onChange={(e) => setEntityForm(prev => ({ ...prev, username: e.target.value }))}
                                                placeholder="Ej: juan.preventa"
                                                className="w-full border-analyst-200 bg-analyst-50 rounded-lg text-xs"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[8px] font-black text-analyst-400 uppercase">Contraseña</label>
                                            <input
                                                type="text"
                                                value={entityForm.password || ''}
                                                onChange={(e) => setEntityForm(prev => ({ ...prev, password: e.target.value }))}
                                                placeholder="Contraseña de ingreso"
                                                className="w-full border-analyst-200 bg-analyst-50 rounded-lg text-xs"
                                            />
                                        </div>
                                    </>
                                )}

                                <div className="flex items-center justify-between p-3 bg-analyst-50 border border-analyst-100 rounded-xl">
                                    <span className="text-[9px] font-black text-analyst-600 uppercase">Estado Activo</span>
                                    <input
                                        type="checkbox"
                                        checked={entityForm.is_active !== false}
                                        onChange={(e) => setEntityForm(prev => ({ ...prev, is_active: e.target.checked }))}
                                        className="w-4 h-4 text-primary rounded border-analyst-300"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-2 pt-2">
                                {editingEntityId && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditingEntityId(null);
                                            setEntityForm({});
                                        }}
                                        className="flex-1 py-2 border border-slate-200 rounded-xl font-black uppercase text-[8.5px] hover:bg-slate-50"
                                    >
                                        Cancelar
                                    </button>
                                )}
                                <button
                                    type="submit"
                                    className="flex-1 py-2 bg-primary hover:bg-blue-700 text-white rounded-xl font-black uppercase text-[8.5px] shadow"
                                >
                                    {editingEntityId ? 'Actualizar' : 'Cargar'}
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Right Lists Panel */}
                    <div className="lg:col-span-8 bg-white border border-analyst-150 rounded-2xl p-5 shadow-sm min-h-[450px]">
                        <h4 className="text-[11px] font-black uppercase text-analyst-800 mb-4 pb-2 border-b border-slate-100">
                            Registros en el Sistema: {activeEntityTab === 'sellers' ? 'Preventistas' : activeEntityTab === 'shops' ? 'Negocios' : 'Choferes'}
                        </h4>

                        <div className="overflow-auto rounded-xl border border-analyst-150 max-h-[400px] custom-scrollbar">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-analyst-900 text-white text-[8.5px] font-black uppercase">
                                        <th className="px-4 py-2">NOMBRE</th>
                                        <th className="px-4 py-2">CONTACTO</th>
                                        {activeEntityTab === 'sellers' && <th className="px-4 py-2 w-24 text-center">COMISIÓN</th>}
                                        {activeEntityTab === 'shops' && <th className="px-4 py-2">DIRECCIÓN</th>}
                                        {activeEntityTab === 'deliverers' && <th className="px-4 py-2">VEHÍCULO</th>}
                                        <th className="px-4 py-2 w-20 text-center">ESTADO</th>
                                        <th className="px-4 py-2 w-24 text-center">ACCIONES</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-analyst-100 text-[10px] font-bold">
                                    {activeEntityTab === 'sellers' && sellers.map(s => (
                                        <tr key={s.id} className="hover:bg-slate-50/55">
                                            <td className="px-4 py-2 uppercase text-slate-800 font-black">
                                                <p>{s.name}</p>
                                                {s.username && (
                                                    <p className="text-[7.5px] font-normal text-primary mt-0.5 lowercase font-mono">User: {s.username}</p>
                                                )}
                                            </td>
                                            <td className="px-4 py-2 font-mono text-analyst-500">{s.phone || '-'}</td>
                                            <td className="px-4 py-2 text-center text-primary font-black">{s.commission}%</td>
                                            <td className="px-4 py-2 text-center">
                                                <span className={`px-2 py-0.5 rounded-full text-[8px] ${s.is_active ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-slate-50 text-slate-400 border border-slate-200'}`}>{s.is_active ? 'ACTIVO' : 'INACTIVO'}</span>
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                                <div className="flex gap-1.5 justify-center">
                                                    <button onClick={() => editEntity(s)} className="p-1 text-primary hover:bg-slate-100 rounded"><span className="material-symbols-outlined text-xs">edit</span></button>
                                                    <button onClick={() => deleteEntity(s.id)} className="p-1 text-red-500 hover:bg-slate-100 rounded"><span className="material-symbols-outlined text-xs">delete</span></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}

                                    {activeEntityTab === 'shops' && shops.map(sh => (
                                        <tr key={sh.id} className="hover:bg-slate-50/55">
                                            <td className="px-4 py-2 uppercase text-slate-800 font-black">
                                                <p>{sh.name}</p>
                                                <p className="text-[7.5px] font-normal text-analyst-400 mt-0.5">Dueño: {sh.owner || '-'}</p>
                                                <p className="text-[7.5px] font-bold text-primary mt-0.5 uppercase">
                                                    Lista: {priceLabels[sh.price_list] || 'PRECIO BASE'}
                                                </p>
                                                {sh.latitude && sh.longitude && (
                                                    <p className="text-[7px] text-green-600 font-mono mt-0.5 flex items-center gap-0.5 font-black uppercase">
                                                        <span className="material-symbols-outlined text-[9px] font-black">location_on</span>
                                                        Ubicación GPS Guardada
                                                    </p>
                                                )}
                                            </td>
                                            <td className="px-4 py-2 font-mono text-analyst-500">
                                                <p>{sh.phone || '-'}</p>
                                                <p className="text-[7px]">CUIT: {sh.cuit || '-'}</p>
                                            </td>
                                            <td className="px-4 py-2 text-slate-600 uppercase">{sh.address}</td>
                                            <td className="px-4 py-2 text-center">
                                                <span className={`px-2 py-0.5 rounded-full text-[8px] ${sh.is_active ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-slate-50 text-slate-400 border border-slate-200'}`}>{sh.is_active ? 'ACTIVO' : 'INACTIVO'}</span>
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                                <div className="flex gap-1.5 justify-center">
                                                    <button onClick={() => editEntity(sh)} className="p-1 text-primary hover:bg-slate-100 rounded"><span className="material-symbols-outlined text-xs">edit</span></button>
                                                    <button onClick={() => deleteEntity(sh.id)} className="p-1 text-red-500 hover:bg-slate-100 rounded"><span className="material-symbols-outlined text-xs">delete</span></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}

                                    {activeEntityTab === 'deliverers' && deliverers.map(d => (
                                        <tr key={d.id} className="hover:bg-slate-50/55">
                                            <td className="px-4 py-2 uppercase text-slate-800 font-black">
                                                <p>{d.name}</p>
                                                {d.username && (
                                                    <p className="text-[7.5px] font-normal text-primary mt-0.5 lowercase font-mono">User: {d.username}</p>
                                                )}
                                            </td>
                                            <td className="px-4 py-2 font-mono text-analyst-500">{d.phone || '-'}</td>
                                            <td className="px-4 py-2 text-slate-600 uppercase">{d.vehicle || '-'}</td>
                                            <td className="px-4 py-2 text-center">
                                                <span className={`px-2 py-0.5 rounded-full text-[8px] ${d.is_active ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-slate-50 text-slate-400 border border-slate-200'}`}>{d.is_active ? 'ACTIVO' : 'INACTIVO'}</span>
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                                <div className="flex gap-1.5 justify-center">
                                                    <button onClick={() => editEntity(d)} className="p-1 text-primary hover:bg-slate-100 rounded"><span className="material-symbols-outlined text-xs">edit</span></button>
                                                    <button onClick={() => deleteEntity(d.id)} className="p-1 text-red-500 hover:bg-slate-100 rounded"><span className="material-symbols-outlined text-xs">delete</span></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) }

            {activeSectionTab === 'company' && (
                /* Tab 3: Active Company Profile editor & uploader */
                <div className="flex-1 bg-white border border-analyst-150 rounded-2xl p-6 shadow-sm overflow-y-auto pb-8 custom-scrollbar">
                    <div className="absolute top-0 left-0 w-2 h-full bg-primary"></div>
                    
                    <div className="flex items-center gap-4 mb-8 pb-4 border-b border-slate-100">
                        <div className="p-2.5 bg-blue-50 text-primary rounded-xl">
                            <span className="material-symbols-outlined text-2xl font-bold">domain</span>
                        </div>
                        <div>
                            <h3 className="font-black text-xs text-analyst-900 uppercase tracking-widest">Mi Empresa / Datos Comerciales</h3>
                            <p className="text-[10px] text-analyst-400 font-bold uppercase tracking-tighter">Gestiona tu identidad corporativa, datos de facturación e inicio de sesión</p>
                        </div>
                    </div>

                    <form onSubmit={handleCompanySubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-[11px] font-bold text-analyst-700">
                        {/* Logo Upload Box (Left) */}
                        <div className="lg:col-span-4 flex flex-col items-center justify-center p-6 border-2 border-dashed border-analyst-200 rounded-3xl bg-slate-50/50">
                            <label className="text-[8px] font-black text-analyst-400 uppercase tracking-widest mb-4">Logo Corporativo</label>
                            
                            <div className="w-32 h-32 rounded-2xl bg-white border border-analyst-150 overflow-hidden relative flex items-center justify-center shadow-md">
                                {companyForm.logo_url ? (
                                    <img src={companyForm.logo_url} className="w-full h-full object-cover" alt="Logo de empresa" />
                                ) : (
                                    <span className="material-symbols-outlined text-5xl text-analyst-200">storefront</span>
                                )}

                                {uploadingLogo && (
                                    <div className="absolute inset-0 bg-white/75 flex items-center justify-center">
                                        <div className="w-6 h-6 border-3 border-primary border-t-transparent rounded-full animate-spin"></div>
                                    </div>
                                )}
                            </div>

                            <label className="mt-4 px-4 py-2 bg-slate-800 hover:bg-black text-white text-[9.5px] font-black uppercase rounded-xl cursor-pointer shadow transition-all">
                                <span className="flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">cloud_upload</span> Subir Logo</span>
                                <input type="file" accept="image/*" className="hidden" onChange={handleCompanyLogoUpload} />
                            </label>
                            <p className="text-[8px] text-analyst-400 uppercase font-bold text-center mt-2 leading-relaxed px-2">Formatos png, jpg. Recomendable cuadrado.</p>
                        </div>

                        {/* Profile Input fields (Right) */}
                        <div className="lg:col-span-8 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[8px] font-black text-analyst-400 uppercase">Razón Social / Nombre Comercial</label>
                                    <input
                                        type="text"
                                        value={companyForm.name}
                                        required
                                        onChange={(e) => setCompanyForm(prev => ({ ...prev, name: e.target.value }))}
                                        className="w-full border-analyst-200 bg-analyst-50 focus:bg-white rounded-xl text-xs h-10 font-bold"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[8px] font-black text-analyst-400 uppercase">CUIT / Identificación Fiscal</label>
                                    <input
                                        type="text"
                                        placeholder="Ej: 20-12345678-9"
                                        value={companyForm.cuit}
                                        onChange={(e) => setCompanyForm(prev => ({ ...prev, cuit: e.target.value }))}
                                        className="w-full border-analyst-200 bg-analyst-50 focus:bg-white rounded-xl text-xs h-10 font-bold"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[8px] font-black text-analyst-400 uppercase">Dirección Comercial</label>
                                    <input
                                        type="text"
                                        value={companyForm.address}
                                        onChange={(e) => setCompanyForm(prev => ({ ...prev, address: e.target.value }))}
                                        className="w-full border-analyst-200 bg-analyst-50 focus:bg-white rounded-xl text-xs h-10 font-bold"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[8px] font-black text-analyst-400 uppercase">Teléfono Comercial</label>
                                    <input
                                        type="text"
                                        value={companyForm.phone}
                                        onChange={(e) => setCompanyForm(prev => ({ ...prev, phone: e.target.value }))}
                                        className="w-full border-analyst-200 bg-analyst-50 focus:bg-white rounded-xl text-xs h-10 font-bold"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[8px] font-black text-analyst-400 uppercase">Correo Electrónico</label>
                                    <input
                                        type="email"
                                        value={companyForm.email}
                                        onChange={(e) => setCompanyForm(prev => ({ ...prev, email: e.target.value }))}
                                        className="w-full border-analyst-200 bg-analyst-50 focus:bg-white rounded-xl text-xs h-10 font-bold"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[8px] font-black text-analyst-400 uppercase">Contraseña de Login (Seguridad)</label>
                                    <input
                                        type="password"
                                        value={companyForm.password}
                                        required
                                        onChange={(e) => setCompanyForm(prev => ({ ...prev, password: e.target.value }))}
                                        className="w-full border-analyst-200 bg-analyst-50 focus:bg-white rounded-xl text-xs h-10 font-bold"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-100 flex justify-end">
                                <button
                                    type="submit"
                                    disabled={companyLoading}
                                    className="bg-primary hover:bg-blue-700 text-white px-8 h-11 text-[10px] font-black rounded-xl uppercase tracking-wider shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                                >
                                    {companyLoading && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                                    Guardar Datos Empresa
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default Configuration;
