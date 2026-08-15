import React, { useState } from 'react';
import axios from 'axios';
import { API_URL } from './config';
import Inventory from './components/Inventory';
import PriceManager from './components/PriceManager';
import Configuration from './components/Configuration';
import ProductWizard from './components/ProductWizard';
import CatalogEditor from './components/CatalogEditor';
import OrderManager from './components/OrderManager';
import StockManager from './components/StockManager';

function App() {
    const [company, setCompany] = useState(() => {
        try {
            const saved = localStorage.getItem('activeCompany');
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            return null;
        }
    });

    const [activeTab, setActiveTab] = useState('inventory');
    const [isWizardOpen, setIsWizardOpen] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Login / Register Screen States
    const [isLoginTab, setIsLoginTab] = useState(true);
    const [authForm, setAuthForm] = useState({ name: '', code: '', password: '' });
    const [authLoading, setAuthLoading] = useState(false);
    const [authError, setAuthError] = useState(null);

    const handleAuthSubmit = async (e) => {
        e.preventDefault();
        setAuthLoading(true);
        setAuthError(null);
        try {
            if (isLoginTab) {
                const response = await axios.post(`${API_URL}/auth/login`, {
                    code: authForm.code,
                    password: authForm.password
                });
                localStorage.setItem('activeCompany', JSON.stringify(response.data));
                setCompany(response.data);
            } else {
                if (!authForm.name) {
                    setAuthError('El nombre de la empresa es obligatorio.');
                    setAuthLoading(false);
                    return;
                }
                const response = await axios.post(`${API_URL}/auth/register`, {
                    name: authForm.name,
                    code: authForm.code,
                    password: authForm.password
                });
                alert('Empresa registrada correctamente. Ya puedes iniciar sesión.');
                setIsLoginTab(true);
                setAuthForm({ name: '', code: authForm.code, password: '' });
            }
        } catch (error) {
            console.error(error);
            const errMsg = error.response?.data?.error;
            setAuthError(
                typeof errMsg === 'object'
                    ? (errMsg.message || errMsg.details || JSON.stringify(errMsg))
                    : (errMsg || 'Error de conexión con el servidor.')
            );
        } finally {
            setAuthLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('activeCompany');
        setCompany(null);
        setActiveTab('inventory');
    };

    const handleWizardComplete = () => {
        setIsWizardOpen(false);
        setRefreshTrigger(prev => prev + 1);
    };

    const NavItem = ({ id, icon, label }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all w-full text-left ${activeTab === id
                ? 'bg-primary text-white font-semibold shadow-md shadow-primary/20'
                : 'text-analyst-500 hover:bg-analyst-50 hover:text-analyst-900'
                }`}
        >
            <span className="material-symbols-outlined text-xl">{icon}</span>
            <span className="hidden lg:block text-sm">{label}</span>
        </button>
    );

    // Render Login / Register Portal if not authenticated
    if (!company) {
        return (
            <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-6 relative overflow-hidden">
                {/* Visual Decorative Background Blobs */}
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[100px] animate-pulse"></div>
                <div className="absolute bottom-1/4 right-1/4 w-[450px] h-[450px] bg-blue-900/20 rounded-full blur-[120px] animate-pulse delay-700"></div>

                <div className="w-full max-w-md bg-slate-800/80 backdrop-blur-xl border border-slate-700/50 rounded-3xl shadow-2xl overflow-hidden relative z-10 flex flex-col">
                    <header className="p-8 pb-4 text-center">
                        <div className="w-14 h-14 bg-primary text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/20">
                            <span className="material-symbols-outlined text-3xl font-black">token</span>
                        </div>
                        <h1 className="text-xl font-black text-white uppercase tracking-tight">SISTEMA DISTRIBUIDORA</h1>
                        <p className="text-[10px] font-black text-slate-400 tracking-widest uppercase mt-1">Portal Multi-Empresa</p>
                    </header>

                    {/* Auth Tab Switcher */}
                    <div className="px-8 flex border-b border-slate-700/50">
                        <button
                            onClick={() => { setIsLoginTab(true); setAuthError(null); }}
                            className={`flex-1 text-[10px] font-black uppercase py-3 border-b-2 transition-all ${isLoginTab ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                        >
                            Iniciar Sesión
                        </button>
                        <button
                            onClick={() => { setIsLoginTab(false); setAuthError(null); }}
                            className={`flex-1 text-[10px] font-black uppercase py-3 border-b-2 transition-all ${!isLoginTab ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                        >
                            Registrar Empresa
                        </button>
                    </div>

                    <form onSubmit={handleAuthSubmit} className="p-8 space-y-4 text-[11px] font-bold text-slate-300">
                        {authError && (
                            <div className="p-3.5 bg-red-500/10 border border-red-500/35 rounded-xl text-red-400 text-[10px] font-bold uppercase tracking-wide">
                                ⚠️ {typeof authError === 'object' ? (authError.message || JSON.stringify(authError)) : authError}
                            </div>
                        )}

                        {!isLoginTab && (
                            <div className="space-y-1">
                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Nombre de la Empresa</label>
                                <input
                                    type="text"
                                    placeholder="Ej: Distribuidora Norte SRL"
                                    value={authForm.name}
                                    required
                                    onChange={(e) => setAuthForm(prev => ({ ...prev, name: e.target.value }))}
                                    className="w-full h-10 px-4 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-primary text-xs"
                                />
                            </div>
                        )}

                        <div className="space-y-1">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Código de Empresa</label>
                            <input
                                type="text"
                                placeholder="Ej: ideasdelnorte"
                                value={authForm.code}
                                required
                                onChange={(e) => setAuthForm(prev => ({ ...prev, code: e.target.value.toLowerCase().replace(/\s+/g, '') }))}
                                className="w-full h-10 px-4 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-primary text-xs"
                            />
                            <p className="text-[7.5px] font-normal text-slate-500 leading-normal uppercase">Será el código único de acceso (ej: sin espacios ni mayúsculas).</p>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Contraseña de Acceso</label>
                            <input
                                type="password"
                                placeholder="••••••"
                                value={authForm.password}
                                required
                                onChange={(e) => setAuthForm(prev => ({ ...prev, password: e.target.value }))}
                                className="w-full h-10 px-4 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-primary text-xs"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={authLoading}
                            className="w-full h-11 bg-primary hover:bg-blue-700 text-white font-black uppercase text-[10px] rounded-xl tracking-wider transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 mt-6 disabled:opacity-40"
                        >
                            {authLoading && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                            {isLoginTab ? 'Ingresar al Sistema' : 'Crear Registro Empresa'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-analyst-100 font-display text-analyst-800 antialiased overflow-hidden">
            {/* Sidebar */}
            <aside className="w-16 lg:w-64 bg-white text-analyst-600 border-r border-analyst-200 flex flex-col shrink-0">
                <div className="p-6 border-b border-analyst-100">
                    <div className="flex items-center gap-3 text-analyst-900">
                        {company.logo_url ? (
                            <div className="w-8 h-8 rounded-xl overflow-hidden shrink-0 border border-analyst-200">
                                <img src={company.logo_url} className="w-full h-full object-cover" alt="Logo Empresa" />
                            </div>
                        ) : (
                            <span className="material-symbols-outlined text-2xl text-primary font-bold">inventory_2</span>
                        )}
                        <h1 className="text-sm font-black tracking-tight truncate hidden lg:block uppercase">{company.name}</h1>
                    </div>
                    <p className="text-[9px] text-analyst-400 mt-1 uppercase tracking-[0.2em] font-black hidden lg:block">Distribuidora</p>
                </div>

                <nav className="flex-1 px-3 py-6 space-y-2">
                    <NavItem id="inventory" icon="package" label="Productos" />
                    <NavItem id="editor" icon="edit_document" label="Editor Catálogo" />
                    <NavItem id="prices" icon="sell" label="Precios" />
                    <NavItem id="stock" icon="inventory" label="Control de Stock" />
                    <NavItem id="orders" icon="shopping_cart_checkout" label="Pedidos" />
                    <NavItem id="config" icon="settings" label="Configuración" />
                </nav>

                <div className="p-4 border-t border-analyst-100 space-y-3">
                    <div className="flex items-center gap-3 p-2 rounded-xl bg-analyst-50 border border-analyst-100">
                        <div className="w-9 h-9 rounded-full bg-white border border-analyst-200 flex items-center justify-center text-primary shadow-sm">
                            <span className="material-symbols-outlined text-xl">account_circle</span>
                        </div>
                        <div className="hidden lg:block overflow-hidden">
                            <p className="text-[11px] font-bold truncate text-analyst-900 uppercase">{company.code}</p>
                            <p className="text-[9px] text-analyst-500 font-bold">SESIÓN ACTIVA</p>
                        </div>
                    </div>
                    
                    <button
                        onClick={handleLogout}
                        className="w-full py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-[9px] font-black uppercase transition-all flex items-center justify-center gap-2 border border-red-200"
                    >
                        <span className="material-symbols-outlined text-sm">logout</span>
                        <span className="hidden lg:inline">Cerrar Sesión</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0 bg-analyst-50 p-6 gap-6 overflow-hidden">
                <header className="flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-xl font-black tracking-tight text-analyst-900 flex items-center gap-2 uppercase">
                            <span className="w-2 h-6 bg-primary rounded-full"></span>
                            {activeTab === 'inventory' && "Panel de Productos"}
                            {activeTab === 'groups' && "Gestión de Categorías"}
                            {activeTab === 'editor' && "Editor Profesional de Catálogos"}
                            {activeTab === 'prices' && "Gestión de Precios"}
                            {activeTab === 'stock' && "Gestión de Inventario y Stock"}
                            {activeTab === 'orders' && "Gestión de Pedidos y Logística"}
                            {activeTab === 'reports' && "Informes y Análisis"}
                            {activeTab === 'config' && "Configuración del Sistema"}
                        </h2>
                        <p className="text-[10px] text-analyst-500 font-bold uppercase tracking-wider mt-1">
                            {activeTab === 'inventory' && "Gestión de inventario de alta densidad y control de variantes."}
                            {activeTab === 'groups' && "Visualización y control de grupos de productos."}
                            {activeTab === 'editor' && "Suite de diseño para catálogos personalizados en tiempo real."}
                            {activeTab === 'prices' && "Actualización masiva de valores y márgenes de ganancia."}
                            {activeTab === 'stock' && "Control de ingresos, egresos y ajustes manuales de stock."}
                            {activeTab === 'orders' && "Control y seguimiento del circuito completo de preventistas, empaque y despacho."}
                            {activeTab === 'reports' && "Análisis de rendimiento y estadísticas de inventario."}
                            {activeTab === 'config' && "Administración de familias, grupos y parámetros globales."}
                        </p>
                    </div>
                    <div className="flex gap-3">
                        {activeTab === 'inventory' && (
                            <>
                                <button className="flex items-center gap-2 bg-white border border-analyst-200 px-4 py-2 rounded-xl text-[10px] font-black text-analyst-600 hover:bg-analyst-50 transition-all uppercase">
                                    <span className="material-symbols-outlined text-lg">filter_list</span> Proveedor
                                </button>
                                <button className="flex items-center gap-2 bg-white border border-analyst-200 px-4 py-2 rounded-xl text-[10px] font-black text-analyst-600 hover:bg-analyst-50 transition-all uppercase">
                                    <span className="material-symbols-outlined text-lg">category</span> Familia
                                </button>
                                <button
                                    onClick={() => setIsWizardOpen(true)}
                                    className="flex items-center gap-2 bg-green-600 text-white px-5 py-2.5 rounded-xl text-[10px] font-black hover:bg-green-700 transition-all shadow-lg shadow-green-600/20 uppercase"
                                >
                                    <span className="material-symbols-outlined text-lg">add_circle</span>
                                    Nuevo Producto
                                </button>
                                <button
                                    onClick={() => setActiveTab('editor')}
                                    className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-[10px] font-black hover:bg-blue-700 transition-all shadow-lg shadow-primary/20 uppercase"
                                >
                                    <span className="material-symbols-outlined text-lg">edit_document</span>
                                    Editor de Catálogo
                                </button>
                            </>
                        )}
                    </div>
                </header>

                <div className="flex-1 flex flex-col min-h-0">
                    {activeTab === 'inventory' && (
                        <div className="flex-1 flex flex-col gap-6 overflow-hidden">
                            <Inventory refreshTrigger={refreshTrigger} />
                        </div>
                    )}
                    {activeTab === 'groups' && <div className="p-10 text-center text-analyst-400 font-bold uppercase italic">Sección de Categorías en construcción...</div>}
                    {activeTab === 'editor' && <CatalogEditor />}
                    {activeTab === 'prices' && <PriceManager onUpdate={() => { }} />}
                    {activeTab === 'stock' && <StockManager />}
                    {activeTab === 'orders' && <OrderManager />}
                    {activeTab === 'reports' && <div className="p-10 text-center text-analyst-400 font-bold uppercase italic border-2 border-dashed border-analyst-200 rounded-3xl">Generando Informes de Inteligencia...</div>}
                    {activeTab === 'config' && <Configuration />}
                </div>
            </main>

            {/* Product Wizard Modal */}
            {isWizardOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-analyst-900/60 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-white/20">
                        <ProductWizard onComplete={handleWizardComplete} />
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
