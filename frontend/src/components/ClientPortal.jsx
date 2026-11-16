import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

const ClientPortal = () => {
    // Auth State
    const [clientSession, setClientSession] = useState(() => {
        try {
            const saved = localStorage.getItem('clientPortalSession');
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            return null;
        }
    });

    const [loginForm, setLoginForm] = useState({ user: '', password: '', companyCode: '' });
    const [loginLoading, setLoginLoading] = useState(false);
    const [loginError, setLoginError] = useState(null);

    // Active Tab in Portal: 'catalog' | 'my-orders'
    const [currentView, setCurrentView] = useState('catalog');

    // Data State
    const [companyInfo, setCompanyInfo] = useState(null);
    const [catalog, setCatalog] = useState([]);
    const [priceListName, setPriceListName] = useState('');
    const [deliverySchedule, setDeliverySchedule] = useState({ rules: [] });
    const [loadingCatalog, setLoadingCatalog] = useState(false);

    // My Orders State
    const [myOrders, setMyOrders] = useState([]);
    const [loadingMyOrders, setLoadingMyOrders] = useState(false);
    const [selectedOrderDetail, setSelectedOrderDetail] = useState(null);
    const [orderToDelete, setOrderToDelete] = useState(null);
    const [deletingOrderId, setDeletingOrderId] = useState(null);

    // Filters State
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFamily, setSelectedFamily] = useState('ALL');

    // Cart & Checkout State
    const [cart, setCart] = useState({}); // { [variantId]: { variant, product, quantity } }
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [checkoutStep, setCheckoutStep] = useState('cart'); // 'cart' | 'details' | 'review'

    // Checkout Details Form
    const [checkoutForm, setCheckoutForm] = useState({
        recipient_name: '',
        delivery_address: '',
        contact_phone: '',
        note: ''
    });

    const [sendingOrder, setSendingOrder] = useState(false);
    const [orderSuccess, setOrderSuccess] = useState(null); // { orderId, deliveryDate, total }

    // Live Clock for Countdown
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (clientSession) {
            fetchCatalog();
            // Pre-fill checkout form with client default info
            setCheckoutForm({
                recipient_name: clientSession.client.owner || clientSession.client.name || '',
                delivery_address: clientSession.client.address || '',
                contact_phone: clientSession.client.phone || '',
                note: ''
            });
        }
    }, [clientSession]);

    useEffect(() => {
        if (clientSession && currentView === 'my-orders') {
            fetchMyOrders();
        }
    }, [clientSession, currentView]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoginLoading(true);
        setLoginError(null);
        try {
            const res = await axios.post(`${API_URL}/portal/login`, loginForm);
            localStorage.setItem('clientPortalSession', JSON.stringify(res.data));
            setClientSession(res.data);
        } catch (err) {
            console.error(err);
            setLoginError(err.response?.data?.error || 'Usuario o contraseña incorrectos');
        } finally {
            setLoginLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('clientPortalSession');
        setClientSession(null);
        setCatalog([]);
        setCart({});
        setOrderSuccess(null);
        setSelectedOrderDetail(null);
        setOrderToDelete(null);
        setCurrentView('catalog');
    };

    const fetchCatalog = async () => {
        setLoadingCatalog(true);
        try {
            const companyHeader = clientSession?.company?.id ? { 'x-company-id': clientSession.company.id } : {};
            const res = await axios.get(`${API_URL}/portal/catalog`, {
                headers: companyHeader,
                params: { price_list: clientSession?.client?.price_list || 'price_unit' }
            });
            setCatalog(res.data.products || []);
            setCompanyInfo(res.data.company || null);
            setPriceListName(res.data.price_list_name || 'Lista Asignada');
            setDeliverySchedule(res.data.delivery_schedule || { rules: [] });
        } catch (err) {
            console.error('Error fetching portal catalog:', err);
        } finally {
            setLoadingCatalog(false);
        }
    };

    const fetchMyOrders = async () => {
        setLoadingMyOrders(true);
        try {
            const res = await axios.get(`${API_URL}/portal/my-orders`, {
                headers: { 'x-company-id': clientSession.company.id },
                params: { shop_id: clientSession.client.id }
            });
            setMyOrders(res.data || []);
        } catch (err) {
            console.error('Error fetching my orders:', err);
        } finally {
            setLoadingMyOrders(false);
        }
    };

    const handleDeleteOrder = async (orderId) => {
        setDeletingOrderId(orderId);
        try {
            await axios.delete(`${API_URL}/portal/orders/${orderId}`, {
                headers: { 'x-company-id': clientSession.company.id },
                params: { shop_id: clientSession.client.id }
            });
            setMyOrders(prev => prev.filter(o => o.id !== orderId));
            if (selectedOrderDetail?.id === orderId) {
                setSelectedOrderDetail(null);
            }
            setOrderToDelete(null);
        } catch (err) {
            console.error('Error deleting order:', err);
            alert(err.response?.data?.error || 'No se pudo eliminar el pedido. Verifique e intente nuevamente.');
        } finally {
            setDeletingOrderId(null);
        }
    };

    // Calculate delivery countdown & next delivery
    const deliveryStatus = useMemo(() => {
        const rules = deliverySchedule.rules || [];
        if (rules.length === 0) return null;

        const now = currentTime;
        const candidates = [];

        for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
            const evalDate = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
            const evalDay = evalDate.getDay();

            for (const r of rules) {
                if (r.cutoff_day === evalDay) {
                    const [cutoffH, cutoffM] = (r.cutoff_time || '12:00').split(':').map(Number);
                    const cutoffDate = new Date(evalDate);
                    cutoffDate.setHours(cutoffH, cutoffM || 0, 0, 0);

                    if (cutoffDate.getTime() > now.getTime()) {
                        let delDayDiff = r.delivery_day - r.cutoff_day;
                        if (delDayDiff <= 0) delDayDiff += 7;
                        const deliveryDate = new Date(cutoffDate.getTime() + delDayDiff * 24 * 60 * 60 * 1000);

                        candidates.push({
                            rule: r,
                            cutoffDate,
                            deliveryDate,
                            diffMs: cutoffDate.getTime() - now.getTime()
                        });
                    }
                }
            }
        }

        candidates.sort((a, b) => a.diffMs - b.diffMs);
        if (candidates.length === 0) return null;

        const next = candidates[0];
        const totalSec = Math.floor(next.diffMs / 1000);
        const days = Math.floor(totalSec / (3600 * 24));
        const hours = Math.floor((totalSec % (3600 * 24)) / 3600);
        const mins = Math.floor((totalSec % 3600) / 60);
        const secs = totalSec % 60;

        return {
            deliveryName: next.rule.delivery_name,
            deliveryDateFormatted: next.deliveryDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'numeric' }),
            cutoffName: next.rule.cutoff_name,
            cutoffTime: next.rule.cutoff_time,
            days,
            hours,
            mins,
            secs,
            rawNext: next
        };
    }, [deliverySchedule, currentTime]);

    // Cart calculations
    const cartItems = Object.values(cart);
    const cartTotal = cartItems.reduce((acc, it) => acc + (it.variant.price * it.quantity), 0);
    const totalItemsCount = cartItems.reduce((acc, it) => acc + it.quantity, 0);

    const updateQuantity = (product, variant, delta) => {
        setCart(prev => {
            const currentQty = prev[variant.id]?.quantity || 0;
            const newQty = currentQty + delta;
            if (newQty <= 0) {
                const next = { ...prev };
                delete next[variant.id];
                return next;
            }
            return {
                ...prev,
                [variant.id]: {
                    variant,
                    product,
                    quantity: newQty
                }
            };
        });
    };

    const handleConfirmOrder = async () => {
        if (cartItems.length === 0) return;
        setSendingOrder(true);
        try {
            const itemsPayload = cartItems.map(it => ({
                variant_id: it.variant.id,
                quantity: it.quantity,
                price: it.variant.price
            }));

            const deliveryDateStr = deliveryStatus?.deliveryDateFormatted || 'Próximo reparto semanal';

            const res = await axios.post(`${API_URL}/portal/orders`, {
                shop_id: clientSession.client.id,
                items: itemsPayload,
                delivery_date: deliveryDateStr,
                recipient_name: checkoutForm.recipient_name,
                delivery_address: checkoutForm.delivery_address,
                contact_phone: checkoutForm.contact_phone,
                note: checkoutForm.note
            }, {
                headers: { 'x-company-id': clientSession.company.id }
            });

            setOrderSuccess({
                orderId: res.data.order_id,
                deliveryDate: deliveryDateStr,
                total: cartTotal
            });

            setCart({});
            setIsCartOpen(false);
            setCheckoutStep('cart');
        } catch (err) {
            console.error('Error confirming order:', err);
            alert('Error al confirmar el pedido. Por favor intentá nuevamente.');
        } finally {
            setSendingOrder(false);
        }
    };

    // Filtered products
    const filteredProducts = useMemo(() => {
        return catalog.filter(p => {
            const matchesQuery = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (p.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.variants.some(v => (v.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || (v.code || '').toLowerCase().includes(searchQuery.toLowerCase()));

            const matchesFamily = selectedFamily === 'ALL' || p.family_id === selectedFamily;
            return matchesQuery && matchesFamily;
        });
    }, [catalog, searchQuery, selectedFamily]);

    const families = useMemo(() => {
        const map = new Map();
        catalog.forEach(p => {
            if (p.family_id && !map.has(p.family_id)) {
                map.set(p.family_id, p.family);
            }
        });
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    }, [catalog]);

    const statusBadge = (status) => {
        const styles = {
            pendiente: 'bg-amber-50 text-amber-700 border-amber-200',
            preparado: 'bg-blue-50 text-blue-700 border-blue-200',
            en_camino: 'bg-indigo-50 text-indigo-700 border-indigo-200',
            entregado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            cancelado: 'bg-rose-50 text-rose-700 border-rose-200'
        };
        const labels = {
            pendiente: 'Pendiente',
            preparado: 'En Preparación',
            en_camino: 'En Camino',
            entregado: 'Entregado',
            cancelado: 'Cancelado'
        };
        const s = (status || 'pendiente').toLowerCase();
        return (
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${styles[s] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                {labels[s] || status || 'Pendiente'}
            </span>
        );
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-24 text-slate-800">
            {/* Top Bar */}
            <div className="bg-slate-900 text-slate-300 text-[11px] font-bold py-2 px-3 sm:px-4 border-b border-slate-800">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-1 sm:gap-2 text-center sm:text-left">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span>
                        <span className="tracking-wide">TUBOMUNDO • Distribución de Tuberías, Sanitarios y Construcción</span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-400 text-[10px]">
                        <span>Portal Exclusivo de Clientes</span>
                        <span className="text-slate-600">|</span>
                        <a href="/admin" className="hover:text-blue-300 transition-colors flex items-center gap-1 text-[10px]">
                            <span className="material-symbols-outlined text-xs">lock</span>
                            <span>Administración</span>
                        </a>
                    </div>
                </div>
            </div>

            {/* Navbar */}
            <header className="bg-white/95 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-30 shadow-xs">
                <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between gap-2 sm:gap-4">
                    {/* Logo & Identity */}
                    <div className="flex items-center gap-2.5 min-w-0">
                        {companyInfo?.logo_url ? (
                            <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-2xl overflow-hidden border border-slate-200/80 bg-white p-1 shadow-xs flex items-center justify-center shrink-0">
                                <img src={companyInfo.logo_url} className="w-full h-full object-contain" alt="Logo" />
                            </div>
                        ) : (
                            <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
                                <span className="material-symbols-outlined text-xl sm:text-2xl font-black">plumbing</span>
                            </div>
                        )}
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                                <h1 className="text-sm sm:text-base font-black text-slate-900 tracking-tight uppercase leading-none truncate">
                                    {companyInfo?.name || 'TUBOMUNDO'}
                                </h1>
                                <span className="hidden sm:inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                                    Mayorista
                                </span>
                            </div>
                            <p className="text-[10px] font-bold text-slate-500 mt-0.5 truncate">
                                {clientSession ? `${clientSession.client.name.toUpperCase()} • ${priceListName}` : 'Acceso Privado para Clientes'}
                            </p>
                        </div>
                    </div>

                    {/* Nav actions when logged in */}
                    {clientSession ? (
                        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                            {/* Switch to Catalog */}
                            <button
                                onClick={() => setCurrentView('catalog')}
                                className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl text-[11px] sm:text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all ${currentView === 'catalog' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-slate-600 hover:bg-slate-100'}`}
                            >
                                <span className="material-symbols-outlined text-base sm:text-lg">storefront</span>
                                <span className="hidden sm:inline">Catálogo</span>
                            </button>

                            {/* Switch to My Orders */}
                            <button
                                onClick={() => setCurrentView('my-orders')}
                                className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl text-[11px] sm:text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all ${currentView === 'my-orders' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-slate-600 hover:bg-slate-100'}`}
                            >
                                <span className="material-symbols-outlined text-base sm:text-lg">receipt_long</span>
                                <span className="hidden sm:inline">Mis Pedidos</span>
                            </button>

                            {/* Cart Button */}
                            <button
                                onClick={() => { setIsCartOpen(true); setCheckoutStep('cart'); }}
                                className="relative bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl text-[11px] sm:text-xs font-black flex items-center gap-1.5 shadow-md shadow-blue-600/20 transition-all active:scale-95"
                            >
                                <span className="material-symbols-outlined text-base sm:text-lg">shopping_cart</span>
                                <span className="hidden sm:inline">${cartTotal.toLocaleString('es-AR')}</span>
                                {totalItemsCount > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[9px] font-black w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center shadow-md">
                                        {totalItemsCount}
                                    </span>
                                )}
                            </button>

                            {/* Logout */}
                            <button
                                onClick={handleLogout}
                                className="p-1.5 sm:p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl sm:rounded-2xl border border-slate-200 transition-all"
                                title="Cerrar sesión"
                            >
                                <span className="material-symbols-outlined text-lg sm:text-xl">logout</span>
                            </button>
                        </div>
                    ) : null}
                </div>
            </header>

            {/* Smart Delivery Countdown Banner */}
            {deliveryStatus && (
                <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white py-2.5 sm:py-3.5 px-3 sm:px-4 shadow-md border-b border-blue-900/40">
                    <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2.5 text-center md:text-left">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-blue-500/15 border border-blue-400/30 flex items-center justify-center text-blue-400 shrink-0">
                                <span className="material-symbols-outlined text-xl sm:text-2xl animate-pulse">local_shipping</span>
                            </div>
                            <div>
                                <div className="flex flex-wrap items-center gap-1.5 justify-center md:justify-start">
                                    <span className="text-[11px] sm:text-xs font-black uppercase tracking-wide">
                                        Próxima Entrega en tu Local: <span className="text-blue-400 font-extrabold">{deliveryStatus.deliveryName}</span>
                                    </span>
                                    <span className="text-[9px] sm:text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-bold uppercase border border-blue-400/30">
                                        {deliveryStatus.deliveryDateFormatted}
                                    </span>
                                </div>
                                <p className="text-[10px] sm:text-[11px] text-slate-300 font-medium mt-0.5">
                                    Cierre de pedidos: <strong>{deliveryStatus.cutoffName} a las {deliveryStatus.cutoffTime} hs</strong>
                                </p>
                            </div>
                        </div>

                        {/* Live Countdown Clock */}
                        <div className="flex items-center gap-1.5 sm:gap-2">
                            <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl px-2 py-1 text-center min-w-[42px]">
                                <span className="text-xs sm:text-sm font-black font-mono text-white block leading-none">{deliveryStatus.days}</span>
                                <span className="text-[7px] text-slate-400 font-bold uppercase">Días</span>
                            </div>
                            <span className="text-slate-600 font-black">:</span>
                            <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl px-2 py-1 text-center min-w-[42px]">
                                <span className="text-xs sm:text-sm font-black font-mono text-white block leading-none">
                                    {String(deliveryStatus.hours).padStart(2, '0')}
                                </span>
                                <span className="text-[7px] text-slate-400 font-bold uppercase">Horas</span>
                            </div>
                            <span className="text-slate-600 font-black">:</span>
                            <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl px-2 py-1 text-center min-w-[42px]">
                                <span className="text-xs sm:text-sm font-black font-mono text-white block leading-none">
                                    {String(deliveryStatus.mins).padStart(2, '0')}
                                </span>
                                <span className="text-[7px] text-slate-400 font-bold uppercase">Min</span>
                            </div>
                            <span className="text-slate-600 font-black">:</span>
                            <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl px-2 py-1 text-center min-w-[42px]">
                                <span className="text-xs sm:text-sm font-black font-mono text-blue-400 block leading-none">
                                    {String(deliveryStatus.secs).padStart(2, '0')}
                                </span>
                                <span className="text-[7px] text-slate-400 font-bold uppercase">Seg</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* SCREEN 1: NOT LOGGED IN */}
            {!clientSession ? (
                <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
                    <div className="w-full max-w-md space-y-6">
                        <div className="text-center space-y-2">
                            <div className="inline-flex p-3 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 shadow-xs mb-1">
                                <span className="material-symbols-outlined text-4xl">storefront</span>
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Portal de Clientes Mayorista</h2>
                            <p className="text-xs text-slate-500 font-medium max-w-sm mx-auto">
                                Ingresá con tus credenciales asignadas para acceder a tu lista exclusiva de precios y coordinar entregas directas a tu local.
                            </p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/50">
                            <form onSubmit={handleLogin} className="space-y-4">
                                {loginError && (
                                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
                                        <span className="material-symbols-outlined text-base">error</span>
                                        <span>{loginError}</span>
                                    </div>
                                )}

                                <div>
                                    <label className="text-[11px] font-black uppercase text-slate-600 tracking-wider block mb-1.5">
                                        Usuario o Local
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Ej: ferreteria_central"
                                        value={loginForm.user}
                                        onChange={(e) => setLoginForm(prev => ({ ...prev, user: e.target.value }))}
                                        className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 text-xs font-bold"
                                    />
                                </div>

                                <div>
                                    <label className="text-[11px] font-black uppercase text-slate-600 tracking-wider block mb-1.5">
                                        Contraseña
                                    </label>
                                    <input
                                        type="password"
                                        required
                                        placeholder="••••••••"
                                        value={loginForm.password}
                                        onChange={(e) => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
                                        className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 text-xs font-mono font-bold"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={loginLoading}
                                    className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-[10px] rounded-xl tracking-wider transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 mt-4 disabled:opacity-40"
                                >
                                    {loginLoading && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                                    Ver Mis Precios y Pedir
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            ) : currentView === 'my-orders' ? (
                /* SCREEN 2: MY ORDERS HISTORY (OPTIMIZED FOR MOBILE & DETAILED VIEW / DELETE) */
                <div className="max-w-5xl mx-auto px-3 sm:px-6 py-6 sm:py-8 w-full space-y-5">
                    <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-slate-200">
                        <div>
                            <h2 className="text-lg sm:text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                                <span className="material-symbols-outlined text-blue-600 text-xl sm:text-2xl">receipt_long</span>
                                Mis Pedidos Realizados
                            </h2>
                            <p className="text-[11px] sm:text-xs font-medium text-slate-500 mt-0.5">
                                Historial de compras y estado de repartos para {clientSession.client.name.toUpperCase()}
                            </p>
                        </div>
                        <button
                            onClick={() => setCurrentView('catalog')}
                            className="px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[10px] sm:text-xs font-black uppercase rounded-xl sm:rounded-2xl flex items-center gap-1.5 shadow-sm transition-all shrink-0"
                        >
                            <span className="material-symbols-outlined text-base">add_shopping_cart</span>
                            <span className="hidden sm:inline">Nuevo Pedido</span>
                        </button>
                    </div>

                    {loadingMyOrders ? (
                        <div className="p-16 text-center space-y-3">
                            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cargando tus pedidos...</p>
                        </div>
                    ) : myOrders.length === 0 ? (
                        <div className="bg-white rounded-3xl border border-slate-200 p-12 sm:p-16 text-center space-y-3 shadow-xs">
                            <span className="material-symbols-outlined text-4xl sm:text-5xl text-slate-300">shopping_bag</span>
                            <h3 className="text-sm font-black text-slate-800 uppercase">Todavía no tenés pedidos registrados</h3>
                            <p className="text-xs text-slate-400 font-medium">Podés entrar al catálogo y armar tu primer pedido cuando quieras.</p>
                            <button
                                onClick={() => setCurrentView('catalog')}
                                className="px-5 py-2.5 bg-blue-600 text-white text-xs font-black uppercase rounded-2xl mt-2 inline-flex items-center gap-2 shadow-sm"
                            >
                                Explorar Catálogo
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3 sm:space-y-4">
                            {myOrders.map(order => {
                                const createdDateObj = new Date(order.created_at);
                                const createdFormatted = createdDateObj.toLocaleDateString('es-AR', {
                                    day: '2-digit', month: 'short', year: 'numeric'
                                });
                                const createdHour = createdDateObj.toLocaleTimeString('es-AR', {
                                    hour: '2-digit', minute: '2-digit'
                                });
                                const itemsCount = (order.order_items || []).reduce((acc, it) => acc + (it.quantity || 0), 0);

                                return (
                                    <div key={order.id} className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 p-4 sm:p-5 shadow-xs hover:border-blue-200 transition-all space-y-3">
                                        {/* Top Order Row: ID, Status & When Created */}
                                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                                            <div className="flex items-center gap-2 sm:gap-3">
                                                <span className="text-xs sm:text-sm font-black font-mono text-slate-900 uppercase">
                                                    Orden #{order.id.slice(0, 8)}
                                                </span>
                                                <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-sm">schedule</span>
                                                    {createdFormatted} • {createdHour} hs
                                                </span>
                                            </div>
                                            <div>{statusBadge(order.status)}</div>
                                        </div>

                                        {/* Center Info Row: Amount & Delivery Arrival Date */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                                            {/* Estimated Arrival Banner */}
                                            <div className="p-2.5 sm:p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl sm:rounded-2xl flex items-center gap-2.5">
                                                <span className="material-symbols-outlined text-blue-600 text-2xl shrink-0">local_shipping</span>
                                                <div className="min-w-0">
                                                    <span className="text-[9px] font-black text-blue-700 uppercase tracking-wider block leading-none">
                                                        Llegada Estimada al Local
                                                    </span>
                                                    <span className="text-xs sm:text-sm font-black text-slate-900 uppercase mt-0.5 block truncate">
                                                        {order.delivery_date || 'Reparto coordinado'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Amount & Items count */}
                                            <div className="flex items-center justify-between sm:justify-end gap-4 px-1">
                                                <div>
                                                    <span className="text-[9px] text-slate-400 uppercase font-black block">Total del Pedido</span>
                                                    <span className="text-base sm:text-lg font-black text-slate-900 font-mono">
                                                        ${(order.total || 0).toLocaleString('es-AR')}
                                                    </span>
                                                </div>
                                                <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-xl">
                                                    {itemsCount} {itemsCount === 1 ? 'artículo' : 'artículos'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Actions: Ver Detalle & Eliminar */}
                                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                                            <button
                                                onClick={() => setOrderToDelete(order)}
                                                className="px-3 py-1.5 rounded-xl text-rose-600 hover:bg-rose-50 text-[11px] font-black uppercase tracking-wider flex items-center gap-1 transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-base">delete</span>
                                                <span>Eliminar</span>
                                            </button>

                                            <button
                                                onClick={() => setSelectedOrderDetail(order)}
                                                className="px-4 py-1.5 bg-slate-900 hover:bg-black text-white rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-xs"
                                            >
                                                <span className="material-symbols-outlined text-base">visibility</span>
                                                <span>Ver Detalle</span>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            ) : (
                /* SCREEN 3: LOGGED IN - STOREFRONT CATALOG (COMPACT & MOBILE OPTIMIZED) */
                <>
                    {/* Search & Categories Filter */}
                    <div id="catalogo" className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 w-full space-y-3 sm:space-y-4">
                        <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 items-center justify-between">
                            <div className="relative w-full sm:max-w-md">
                                <span className="material-symbols-outlined absolute left-3.5 top-3 text-slate-400 text-lg">search</span>
                                <input
                                    type="text"
                                    placeholder="Buscar por caño, pegamento, código..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full h-10 sm:h-11 pl-10 pr-4 bg-white border border-slate-200 rounded-xl sm:rounded-2xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600 shadow-xs transition-all"
                                />
                                {searchQuery && (
                                    <button onClick={() => setSearchQuery('')} className="absolute right-3.5 top-2.5 text-slate-400 hover:text-slate-600">
                                        <span className="material-symbols-outlined text-base">close</span>
                                    </button>
                                )}
                            </div>

                            <div className="text-[10px] sm:text-[11px] font-black text-slate-500 uppercase tracking-wider self-start sm:self-center">
                                {filteredProducts.length} producto{filteredProducts.length === 1 ? '' : 's'} disponible{filteredProducts.length === 1 ? '' : 's'}
                            </div>
                        </div>

                        {/* Family / Category filter pills */}
                        <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1 custom-scrollbar">
                            <button
                                onClick={() => setSelectedFamily('ALL')}
                                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl text-[10px] sm:text-[11px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${selectedFamily === 'ALL' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}
                            >
                                Todos ({catalog.length})
                            </button>
                            {families.map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => setSelectedFamily(f.id)}
                                    className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl text-[10px] sm:text-[11px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${selectedFamily === f.id ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}
                                >
                                    {f.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Catalog Grid (Optimized 2-columns on mobile, compact photos) */}
                    <main className="max-w-7xl mx-auto px-3 sm:px-6 w-full flex-1">
                        {loadingCatalog ? (
                            <div className="p-16 text-center space-y-3">
                                <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                                <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Cargando catálogo...</p>
                            </div>
                        ) : filteredProducts.length === 0 ? (
                            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-2 shadow-xs">
                                <span className="material-symbols-outlined text-4xl text-slate-300">inventory_2</span>
                                <h4 className="text-xs sm:text-sm font-black text-slate-800 uppercase">No se encontraron productos</h4>
                                <p className="text-[11px] text-slate-400 font-medium">Intentá con otra palabra o cambiá de categoría.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
                                {filteredProducts.map(p => (
                                    <div key={p.id} className="bg-white border border-slate-200/90 rounded-2xl sm:rounded-3xl p-2.5 sm:p-3.5 shadow-xs flex flex-col justify-between hover:shadow-md hover:border-blue-200 transition-all">
                                        <div>
                                            {/* Compact Image Container */}
                                            <div className="relative w-full h-28 sm:h-36 bg-slate-50 rounded-xl sm:rounded-2xl overflow-hidden mb-2 border border-slate-100 flex items-center justify-center p-2">
                                                {p.image_url ? (
                                                    <img src={p.image_url} alt={p.name} loading="lazy" className="w-full h-full object-contain" />
                                                ) : (
                                                    <span className="material-symbols-outlined text-3xl sm:text-4xl text-slate-200">construction</span>
                                                )}
                                                {p.family && (
                                                    <span className="absolute top-1.5 left-1.5 bg-slate-900/80 backdrop-blur-xs text-white px-1.5 py-0.5 rounded-md text-[7px] sm:text-[8px] font-black uppercase tracking-wider max-w-[85%] truncate">
                                                        {p.family}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Product Title & Info */}
                                            <h3 className="font-black text-[11px] sm:text-xs text-slate-900 uppercase leading-snug line-clamp-2">{p.name}</h3>
                                            {p.description && (
                                                <p className="hidden sm:block text-[10px] text-slate-500 line-clamp-1 mt-0.5 leading-normal font-medium">{p.description}</p>
                                            )}
                                        </div>

                                        {/* Variants with Assigned Price */}
                                        <div className="mt-2.5 pt-2 border-t border-slate-100 space-y-1.5">
                                            {p.variants.map(v => {
                                                const inCartQty = cart[v.id]?.quantity || 0;
                                                return (
                                                    <div key={v.id} className="flex items-center justify-between p-1.5 sm:p-2 rounded-xl bg-slate-50 border border-slate-100">
                                                        <div className="min-w-0 pr-1">
                                                            <span className="text-[10px] sm:text-[11px] font-black text-slate-800 block truncate">{v.name}</span>
                                                            <span className="text-[11px] sm:text-xs font-black text-blue-600 font-mono">
                                                                ${v.price.toLocaleString('es-AR')}
                                                            </span>
                                                        </div>

                                                        {/* Stepper Button */}
                                                        <div className="flex items-center gap-0.5 shrink-0 bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                                                            {inCartQty > 0 ? (
                                                                <>
                                                                    <button
                                                                        onClick={() => updateQuantity(p, v, -1)}
                                                                        className="w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded font-black text-xs transition-colors"
                                                                    >
                                                                        -
                                                                    </button>
                                                                    <span className="w-5 text-center text-[11px] font-black text-slate-900">{inCartQty}</span>
                                                                    <button
                                                                        onClick={() => updateQuantity(p, v, 1)}
                                                                        className="w-6 h-6 flex items-center justify-center bg-blue-600 text-white hover:bg-blue-700 rounded font-black text-xs transition-colors"
                                                                    >
                                                                        +
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <button
                                                                    onClick={() => updateQuantity(p, v, 1)}
                                                                    className="px-2.5 h-6 bg-blue-600 hover:bg-blue-700 text-white text-[9px] font-black uppercase rounded transition-all flex items-center gap-1 shadow-xs"
                                                                >
                                                                    <span className="material-symbols-outlined text-xs font-black">add</span>
                                                                    Pedir
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </main>

                    {/* MOBILE FLOATING STICKY CART BAR */}
                    {totalItemsCount > 0 && (
                        <div className="fixed bottom-3 left-3 right-3 sm:hidden z-40 bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-2xl shadow-2xl flex items-center justify-between border border-slate-700/60 animate-in fade-in slide-in-from-bottom-3 duration-200">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-xs">
                                    {totalItemsCount}
                                </div>
                                <div>
                                    <span className="text-[9px] text-slate-400 uppercase font-black block leading-none">Total Carrito</span>
                                    <span className="text-sm font-black font-mono text-white">${cartTotal.toLocaleString('es-AR')}</span>
                                </div>
                            </div>
                            <button
                                onClick={() => { setIsCartOpen(true); setCheckoutStep('cart'); }}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-blue-600/30 active:scale-95 transition-all"
                            >
                                <span>Ver Carrito</span>
                                <span className="material-symbols-outlined text-base">arrow_forward</span>
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* ORDER SUCCESS MODAL WITH BIG DELIVERY NOTICE */}
            {orderSuccess && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-7 text-center space-y-4 shadow-2xl border border-slate-100 animate-in zoom-in-95">
                        <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                            <span className="material-symbols-outlined text-3xl font-black">check_circle</span>
                        </div>
                        
                        <div>
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Pedido Confirmado • #{orderSuccess.orderId.slice(0, 8)}</span>
                            <h3 className="text-lg sm:text-xl font-black text-slate-900 uppercase mt-1">¡Tu Pedido fue Ingresado con Éxito!</h3>
                        </div>

                        {/* BIG DELIVERY CALLOUT */}
                        <div className="p-4 sm:p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl sm:rounded-3xl space-y-1">
                            <div className="flex items-center justify-center gap-2 text-blue-700">
                                <span className="material-symbols-outlined text-xl sm:text-2xl animate-bounce">local_shipping</span>
                                <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider">Llegada Estimada a tu Local</span>
                            </div>
                            <div className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight pt-1">
                                {orderSuccess.deliveryDate}
                            </div>
                            <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium pt-1">
                                El equipo de logística ya agendó el pedido para su preparación y despacho.
                            </p>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                            <span className="text-slate-500 font-bold uppercase">Total Registrado</span>
                            <span className="font-black text-slate-900 font-mono text-sm">${orderSuccess.total.toLocaleString('es-AR')}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5 pt-1">
                            <button
                                onClick={() => { setOrderSuccess(null); setCurrentView('my-orders'); }}
                                className="w-full py-2.5 sm:py-3 bg-slate-900 hover:bg-black text-white rounded-xl sm:rounded-2xl text-[11px] sm:text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all"
                            >
                                <span className="material-symbols-outlined text-base">receipt_long</span>
                                <span>Mis Pedidos</span>
                            </button>
                            <button
                                onClick={() => { setOrderSuccess(null); setCurrentView('catalog'); }}
                                className="w-full py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl sm:rounded-2xl text-[11px] sm:text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all"
                            >
                                <span className="material-symbols-outlined text-base">add_shopping_cart</span>
                                <span>Comprar Más</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: VER DETALLE DEL PEDIDO */}
            {selectedOrderDetail && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
                    <div className="bg-white rounded-2xl sm:rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95">
                        {/* Header */}
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="font-black text-sm text-slate-900 uppercase">
                                        Detalle de Orden #{selectedOrderDetail.id.slice(0, 8)}
                                    </h3>
                                    {statusBadge(selectedOrderDetail.status)}
                                </div>
                                <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                                    Realizado el: {new Date(selectedOrderDetail.created_at).toLocaleDateString('es-AR', {
                                        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                                    })} hs
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedOrderDetail(null)}
                                className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600"
                            >
                                <span className="material-symbols-outlined text-lg">close</span>
                            </button>
                        </div>

                        {/* Body Scrollable */}
                        <div className="p-4 space-y-4 overflow-y-auto flex-1 custom-scrollbar text-xs">
                            {/* Delivery Date Callout */}
                            <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex items-center gap-3">
                                <span className="material-symbols-outlined text-blue-600 text-2xl">event_available</span>
                                <div>
                                    <span className="text-[9px] font-black text-blue-700 uppercase tracking-widest block leading-none">
                                        Llegada Programada a tu Local
                                    </span>
                                    <span className="text-xs sm:text-sm font-black text-slate-900 uppercase mt-0.5 block">
                                        {selectedOrderDetail.delivery_date || 'Próximo reparto'}
                                    </span>
                                </div>
                            </div>

                            {/* Local / Delivery Info */}
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Datos de Destino</span>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                                    <div>
                                        <span className="text-slate-400 font-bold block text-[10px]">Receptor:</span>
                                        <span className="font-black text-slate-800">{selectedOrderDetail.recipient_name || clientSession.client.name}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 font-bold block text-[10px]">Dirección del Local:</span>
                                        <span className="font-black text-slate-800">{selectedOrderDetail.delivery_address || clientSession.client.address || 'Local central'}</span>
                                    </div>
                                    {selectedOrderDetail.contact_phone && (
                                        <div>
                                            <span className="text-slate-400 font-bold block text-[10px]">Teléfono:</span>
                                            <span className="font-black text-slate-800">{selectedOrderDetail.contact_phone}</span>
                                        </div>
                                    )}
                                    {selectedOrderDetail.note && (
                                        <div className="sm:col-span-2">
                                            <span className="text-slate-400 font-bold block text-[10px]">Observaciones:</span>
                                            <span className="font-medium text-slate-700 italic">{selectedOrderDetail.note}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Items List */}
                            <div>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">Artículos del Pedido</span>
                                <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-xl overflow-hidden bg-white">
                                    {(selectedOrderDetail.order_items || []).map(it => (
                                        <div key={it.id} className="p-2.5 flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-2 min-w-0 pr-2">
                                                <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-black text-[11px] shrink-0">
                                                    {it.quantity}
                                                </span>
                                                <div className="min-w-0 truncate">
                                                    <span className="font-bold text-slate-800 uppercase block truncate">
                                                        {it.product_variants?.products?.name || 'Artículo'}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 block truncate">
                                                        {it.product_variants?.name} • ${(it.price_unit || 0).toLocaleString('es-AR')} c/u
                                                    </span>
                                                </div>
                                            </div>
                                            <span className="font-mono font-black text-slate-900 shrink-0">
                                                ${(it.total || ((it.price_unit || 0) * (it.quantity || 1))).toLocaleString('es-AR')}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Total Final */}
                            <div className="flex items-center justify-between p-3 bg-slate-900 text-white rounded-xl">
                                <span className="text-xs font-black uppercase tracking-wider">Total Final</span>
                                <span className="text-base font-black font-mono">${(selectedOrderDetail.total || 0).toLocaleString('es-AR')}</span>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <button
                                onClick={() => setOrderToDelete(selectedOrderDetail)}
                                className="px-3 py-1.5 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1"
                            >
                                <span className="material-symbols-outlined text-base">delete</span>
                                <span>Eliminar Pedido</span>
                            </button>
                            <button
                                onClick={() => setSelectedOrderDetail(null)}
                                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-black uppercase tracking-wider"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: CONFIRMAR ELIMINACIÓN DE PEDIDO */}
            {orderToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
                    <div className="bg-white rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl border border-slate-100 animate-in zoom-in-95">
                        <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
                            <span className="material-symbols-outlined text-2xl font-black">warning</span>
                        </div>
                        <div>
                            <h3 className="text-base font-black text-slate-900 uppercase">¿Eliminar este pedido?</h3>
                            <p className="text-xs text-slate-500 font-medium mt-1">
                                Estás por cancelar y eliminar la orden <strong className="text-slate-800">#{orderToDelete.id.slice(0, 8)}</strong>. Esta acción no se puede deshacer.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5 pt-2">
                            <button
                                onClick={() => setOrderToDelete(null)}
                                disabled={deletingOrderId !== null}
                                className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-black uppercase tracking-wider"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleDeleteOrder(orderToDelete.id)}
                                disabled={deletingOrderId !== null}
                                className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1 shadow-md shadow-rose-600/20 disabled:opacity-50"
                            >
                                {deletingOrderId === orderToDelete.id ? (
                                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <span>Sí, Eliminar</span>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CHECKOUT DRAWER / MODAL MULTI-STEP */}
            {isCartOpen && (
                <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs">
                    <div className="bg-white w-full max-w-md h-full flex flex-col shadow-2xl">
                        {/* Drawer Header */}
                        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-blue-600 text-xl">
                                    {checkoutStep === 'cart' ? 'shopping_cart' : checkoutStep === 'details' ? 'local_shipping' : 'fact_check'}
                                </span>
                                <h3 className="font-black text-sm text-slate-900 uppercase">
                                    {checkoutStep === 'cart' && 'Mi Carrito de Compras'}
                                    {checkoutStep === 'details' && 'Datos del Local / Entrega'}
                                    {checkoutStep === 'review' && 'Revisión Final del Pedido'}
                                </h3>
                            </div>
                            <button onClick={() => { setIsCartOpen(false); setCheckoutStep('cart'); }} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                                <span className="material-symbols-outlined text-xl">close</span>
                            </button>
                        </div>

                        {/* Progress Stepper Bar */}
                        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[10px] font-black uppercase tracking-wider">
                            <span className={checkoutStep === 'cart' ? 'text-blue-600' : 'text-slate-400'}>1. Artículos</span>
                            <span className="material-symbols-outlined text-xs text-slate-300">chevron_right</span>
                            <span className={checkoutStep === 'details' ? 'text-blue-600' : 'text-slate-400'}>2. Local / Entrega</span>
                            <span className="material-symbols-outlined text-xs text-slate-300">chevron_right</span>
                            <span className={checkoutStep === 'review' ? 'text-blue-600' : 'text-slate-400'}>3. Confirmar</span>
                        </div>

                        {/* Drawer Body */}
                        <div className="p-4 flex-1 overflow-y-auto custom-scrollbar space-y-4">
                            {checkoutStep === 'cart' && (
                                <>
                                    {cartItems.length === 0 ? (
                                        <div className="p-12 text-center space-y-3">
                                            <span className="material-symbols-outlined text-5xl text-slate-300">remove_shopping_cart</span>
                                            <h4 className="text-xs font-black text-slate-800 uppercase">El carrito está vacío</h4>
                                            <p className="text-[11px] text-slate-400">Sumá artículos desde el catálogo para armar tu pedido.</p>
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-slate-100">
                                            {cartItems.map(({ product, variant, quantity }) => (
                                                <div key={variant.id} className="py-3 flex items-center justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <h4 className="text-xs font-black text-slate-900 uppercase truncate">{product.name}</h4>
                                                        <p className="text-[11px] text-slate-500 font-medium truncate">{variant.name}</p>
                                                        <span className="text-xs font-black text-blue-600 font-mono">
                                                            ${(variant.price * quantity).toLocaleString('es-AR')}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-0.5">
                                                        <button
                                                            onClick={() => updateQuantity(product, variant, -1)}
                                                            className="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-200 rounded-lg font-black text-xs"
                                                        >
                                                            -
                                                        </button>
                                                        <span className="w-6 text-center text-xs font-black text-slate-900">{quantity}</span>
                                                        <button
                                                            onClick={() => updateQuantity(product, variant, 1)}
                                                            className="w-7 h-7 flex items-center justify-center bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-black text-xs"
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}

                            {checkoutStep === 'details' && (
                                <div className="space-y-4 text-xs">
                                    <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-center gap-2.5">
                                        <span className="material-symbols-outlined text-blue-600 text-xl">store</span>
                                        <div className="text-[11px] text-slate-700">
                                            Completá o validá los datos de recepción en tu local para el camión de reparto.
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-black uppercase text-slate-600 tracking-wider block mb-1">
                                            Nombre del Local o Encargado de Recibir *
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={checkoutForm.recipient_name}
                                            onChange={(e) => setCheckoutForm(prev => ({ ...prev, recipient_name: e.target.value }))}
                                            placeholder="Ej: Ferretería Norte / Juan Pérez"
                                            className="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:border-blue-600 font-bold"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-black uppercase text-slate-600 tracking-wider block mb-1">
                                            Dirección del Local / Entrega *
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={checkoutForm.delivery_address}
                                            onChange={(e) => setCheckoutForm(prev => ({ ...prev, delivery_address: e.target.value }))}
                                            placeholder="Calle, Número, Localidad"
                                            className="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:border-blue-600 font-bold"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-black uppercase text-slate-600 tracking-wider block mb-1">
                                            Teléfono de Contacto para el Reparto *
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={checkoutForm.contact_phone}
                                            onChange={(e) => setCheckoutForm(prev => ({ ...prev, contact_phone: e.target.value }))}
                                            placeholder="Ej: 11 5555-5555"
                                            className="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:border-blue-600 font-bold"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-black uppercase text-slate-600 tracking-wider block mb-1">
                                            Observaciones o Aclaraciones (Opcional)
                                        </label>
                                        <textarea
                                            rows="2"
                                            value={checkoutForm.note}
                                            onChange={(e) => setCheckoutForm(prev => ({ ...prev, note: e.target.value }))}
                                            placeholder="Ej: Recibir por portón lateral de 9 a 13hs..."
                                            className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:border-blue-600 font-medium"
                                        />
                                    </div>
                                </div>
                            )}

                            {checkoutStep === 'review' && (
                                <div className="space-y-4 text-xs">
                                    {/* Estimated Arrival Banner */}
                                    <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl text-center space-y-1">
                                        <div className="flex items-center justify-center gap-1.5 text-blue-700">
                                            <span className="material-symbols-outlined text-lg">local_shipping</span>
                                            <span className="text-[10px] font-black uppercase tracking-wider">Fecha Estimada de Llegada</span>
                                        </div>
                                        <div className="text-lg font-black text-slate-900 uppercase">
                                            {deliveryStatus?.deliveryDateFormatted || 'Próximo reparto programado'}
                                        </div>
                                    </div>

                                    {/* Shipping details recap */}
                                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Destino de Entrega</span>
                                        <p className="font-bold text-slate-800">
                                            {checkoutForm.recipient_name}
                                        </p>
                                        <p className="text-slate-600 font-medium">{checkoutForm.delivery_address}</p>
                                        <p className="text-slate-500 font-medium">Tel: {checkoutForm.contact_phone}</p>
                                        {checkoutForm.note && (
                                            <p className="text-slate-500 italic mt-1 text-[11px]">Nota: "{checkoutForm.note}"</p>
                                        )}
                                    </div>

                                    {/* Items recap */}
                                    <div>
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1.5">Resumen de Artículos ({cartItems.length})</span>
                                        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white max-h-48 overflow-y-auto">
                                            {cartItems.map(({ product, variant, quantity }) => (
                                                <div key={variant.id} className="p-2 flex items-center justify-between text-[11px]">
                                                    <span className="font-bold text-slate-800 truncate pr-2">
                                                        {quantity}x {product.name} ({variant.name})
                                                    </span>
                                                    <span className="font-mono font-black text-slate-900 shrink-0">
                                                        ${(variant.price * quantity).toLocaleString('es-AR')}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Drawer Footer Actions */}
                        <div className="p-4 border-t border-slate-200 bg-slate-50/70 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black uppercase text-slate-500">Total a Pagar</span>
                                <span className="text-lg font-black font-mono text-blue-600">${cartTotal.toLocaleString('es-AR')}</span>
                            </div>

                            {checkoutStep === 'cart' && (
                                <button
                                    disabled={cartItems.length === 0}
                                    onClick={() => setCheckoutStep('details')}
                                    className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-600/20 disabled:opacity-40"
                                >
                                    <span>Continuar con Datos de Entrega</span>
                                    <span className="material-symbols-outlined text-base">arrow_forward</span>
                                </button>
                            )}

                            {checkoutStep === 'details' && (
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setCheckoutStep('cart')}
                                        className="h-11 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-black uppercase tracking-wider"
                                    >
                                        Volver
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (!checkoutForm.recipient_name || !checkoutForm.delivery_address || !checkoutForm.contact_phone) {
                                                alert('Por favor completá los datos del local para la entrega.');
                                                return;
                                            }
                                            setCheckoutStep('review');
                                        }}
                                        className="h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1 shadow-md shadow-blue-600/20"
                                    >
                                        <span>Revisar</span>
                                        <span className="material-symbols-outlined text-base">arrow_forward</span>
                                    </button>
                                </div>
                            )}

                            {checkoutStep === 'review' && (
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setCheckoutStep('details')}
                                        disabled={sendingOrder}
                                        className="h-11 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-black uppercase tracking-wider"
                                    >
                                        Atrás
                                    </button>
                                    <button
                                        onClick={handleConfirmOrder}
                                        disabled={sendingOrder}
                                        className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 disabled:opacity-40"
                                    >
                                        {sendingOrder ? (
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined text-base">check_circle</span>
                                                <span>Confirmar</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClientPortal;
