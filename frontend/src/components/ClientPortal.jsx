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

    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
    const [loginForm, setLoginForm] = useState({ user: '', password: '', companyCode: '' });
    const [loginLoading, setLoginLoading] = useState(false);
    const [loginError, setLoginError] = useState(null);

    // Data State
    const [companyInfo, setCompanyInfo] = useState(null);
    const [catalog, setCatalog] = useState([]);
    const [priceListName, setPriceListName] = useState('');
    const [deliverySchedule, setDeliverySchedule] = useState({ whatsapp_number: '', rules: [] });
    const [loadingCatalog, setLoadingCatalog] = useState(false);

    // Filters State
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFamily, setSelectedFamily] = useState('ALL');

    // Cart State
    const [cart, setCart] = useState({}); // { [variantId]: { variant, product, quantity } }
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [orderNote, setOrderNote] = useState('');
    const [sendingOrder, setSendingOrder] = useState(false);
    const [orderSuccess, setOrderSuccess] = useState(null);

    // Time ticker for countdown
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (clientSession) {
            fetchCatalog();
        } else {
            fetchPublicInfo();
        }
    }, [clientSession]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoginLoading(true);
        setLoginError(null);
        try {
            const res = await axios.post(`${API_URL}/portal/login`, loginForm);
            localStorage.setItem('clientPortalSession', JSON.stringify(res.data));
            setClientSession(res.data);
            setIsLoginModalOpen(false);
        } catch (err) {
            console.error(err);
            setLoginError(err.response?.data?.error || 'Error al iniciar sesión');
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
    };

    const fetchPublicInfo = async () => {
        try {
            const res = await axios.get(`${API_URL}/settings/delivery_schedule`);
            if (res.data) setDeliverySchedule(res.data);
        } catch (e) { }
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
            setDeliverySchedule(res.data.delivery_schedule || { whatsapp_number: '', rules: [] });
        } catch (err) {
            console.error('Error fetching portal catalog:', err);
        } finally {
            setLoadingCatalog(false);
        }
    };

    // Calculate delivery countdown & next delivery
    const deliveryStatus = useMemo(() => {
        const rules = deliverySchedule.rules || [];
        if (rules.length === 0) return null;

        const now = currentTime;

        // Find candidate cutoffs in chronological order
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
        if (!clientSession) {
            setIsLoginModalOpen(true);
            return;
        }

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
        if (!clientSession) {
            setIsLoginModalOpen(true);
            return;
        }

        if (cartItems.length === 0) return;
        setSendingOrder(true);
        try {
            const itemsPayload = cartItems.map(it => ({
                variant_id: it.variant.id,
                quantity: it.quantity,
                price: it.variant.price
            }));

            const deliveryDateStr = deliveryStatus?.deliveryDateFormatted || 'Próximo reparto';

            const res = await axios.post(`${API_URL}/portal/orders`, {
                shop_id: clientSession.client.id,
                items: itemsPayload,
                delivery_date: deliveryDateStr,
                note: orderNote
            }, {
                headers: { 'x-company-id': clientSession.company.id }
            });

            // Build WhatsApp Message
            const targetPhone = deliverySchedule.whatsapp_number || clientSession.company.phone || '';
            const cleanPhone = targetPhone.replace(/\D/g, '');

            let waText = `📦 *NUEVO PEDIDO - ${clientSession.client.name.toUpperCase()}*\n`;
            waText += `🚚 *Entrega estimada:* ${deliveryDateStr}\n`;
            waText += `📍 *Dirección:* ${clientSession.client.address || 'Sin especificar'}\n`;
            if (clientSession.client.phone) waText += `📞 *Tel:* ${clientSession.client.phone}\n`;
            waText += `\n*Detalle del pedido:*\n`;

            cartItems.forEach(it => {
                const sub = (it.variant.price * it.quantity).toLocaleString('es-AR');
                waText += `• ${it.quantity}x ${it.product.name} - ${it.variant.name} ($${it.variant.price.toLocaleString('es-AR')}) = $${sub}\n`;
            });

            waText += `\n💰 *TOTAL: $${cartTotal.toLocaleString('es-AR')}*\n`;
            if (orderNote.trim()) {
                waText += `📝 *Nota:* ${orderNote.trim()}\n`;
            }

            setOrderSuccess({
                orderId: res.data.order_id,
                waUrl: cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waText)}` : null,
                deliveryDate: deliveryDateStr
            });

            setCart({});
            setIsCartOpen(false);
            setOrderNote('');
        } catch (err) {
            console.error('Error confirming order:', err);
            alert('Error al procesar el pedido. Por favor intentá nuevamente.');
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

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-24 text-slate-800">
            {/* Top Brand & Announcement Bar */}
            <div className="bg-slate-900 text-slate-300 text-[11px] font-bold py-2 px-4 border-b border-slate-800">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                        <span className="tracking-wide">Venta Mayorista y Distribución de Materiales, Tuberías y Herramientas</span>
                    </div>
                    <div className="flex items-center gap-4 text-slate-400">
                        {deliverySchedule.whatsapp_number && (
                            <a
                                href={`https://wa.me/${deliverySchedule.whatsapp_number}`}
                                target="_blank"
                                rel="noreferrer"
                                className="hover:text-emerald-400 transition-colors flex items-center gap-1"
                            >
                                <span className="material-symbols-outlined text-[13px]">chat</span>
                                WhatsApp Directo
                            </a>
                        )}
                        <span>Envíos a Obra y Comercios</span>
                    </div>
                </div>
            </div>

            {/* Main Navbar with Modern Glassmorphism */}
            <header className="bg-white/95 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-30 shadow-xs">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
                    {/* Logo & Brand Identity */}
                    <div className="flex items-center gap-3">
                        {companyInfo?.logo_url ? (
                            <div className="h-11 w-11 rounded-2xl overflow-hidden border border-slate-200/80 bg-white p-1 shadow-xs flex items-center justify-center">
                                <img src={companyInfo.logo_url} className="w-full h-full object-contain" alt="Logo" />
                            </div>
                        ) : (
                            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
                                <span className="material-symbols-outlined text-2xl font-black">plumbing</span>
                            </div>
                        )}
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-base font-black text-slate-900 tracking-tight uppercase leading-none">
                                    {companyInfo?.name || 'TUBOMUNDO'}
                                </h1>
                                <span className="hidden sm:inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                                    Distribuidora
                                </span>
                            </div>
                            <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                                {clientSession ? `Cliente: ${clientSession.client.name.toUpperCase()} (${priceListName})` : 'Portal Mayorista de Pedidos'}
                            </p>
                        </div>
                    </div>

                    {/* Actions: Auth + Cart */}
                    <div className="flex items-center gap-2.5">
                        {clientSession ? (
                            <div className="flex items-center gap-2">
                                <div className="hidden md:flex flex-col text-right">
                                    <span className="text-xs font-black text-slate-900 leading-tight">{clientSession.client.owner || clientSession.client.name}</span>
                                    <span className="text-[9px] font-bold text-emerald-600">Cuenta Activa</span>
                                </div>
                                <button
                                    onClick={handleLogout}
                                    className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl border border-slate-200 transition-all"
                                    title="Cerrar sesión"
                                >
                                    <span className="material-symbols-outlined text-xl">logout</span>
                                </button>
                                {/* Cart Button only when logged in */}
                                <button
                                    onClick={() => setIsCartOpen(true)}
                                    className="relative bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-4 py-2.5 rounded-2xl text-xs font-black flex items-center gap-2 shadow-lg shadow-blue-600/20 transition-all active:scale-95"
                                >
                                    <span className="material-symbols-outlined text-lg">shopping_cart</span>
                                    <span className="hidden sm:inline">${cartTotal.toLocaleString('es-AR')}</span>
                                    {totalItemsCount > 0 && (
                                        <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-md">
                                            {totalItemsCount}
                                        </span>
                                    )}
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setIsLoginModalOpen(true)}
                                className="px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md shadow-blue-600/20 transition-all"
                            >
                                <span className="material-symbols-outlined text-lg">login</span>
                                <span>Ingresar con mi Cuenta</span>
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {/* Smart Delivery Countdown Banner */}
            {deliveryStatus && (
                <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white py-3.5 px-4 shadow-md border-b border-blue-900/40">
                    <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left">
                        <div className="flex items-center gap-3.5">
                            <div className="w-11 h-11 rounded-2xl bg-blue-500/15 border border-blue-400/30 flex items-center justify-center text-blue-400 shrink-0">
                                <span className="material-symbols-outlined text-2xl animate-pulse">local_shipping</span>
                            </div>
                            <div>
                                <div className="flex items-center gap-2 justify-center md:justify-start">
                                    <span className="text-xs font-black uppercase tracking-wide">
                                        Próxima Entrega Programada: <span className="text-blue-400">{deliveryStatus.deliveryName}</span>
                                    </span>
                                    <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2.5 py-0.5 rounded-full font-bold uppercase border border-blue-400/30">
                                        {deliveryStatus.deliveryDateFormatted}
                                    </span>
                                </div>
                                <p className="text-[11px] text-slate-300 font-medium mt-0.5">
                                    Cierre de pedidos: <strong>{deliveryStatus.cutoffName} a las {deliveryStatus.cutoffTime} hs</strong>
                                </p>
                            </div>
                        </div>

                        {/* Live Countdown Clock */}
                        <div className="flex items-center gap-1.5 bg-slate-800/60 p-1.5 rounded-2xl border border-slate-700/60">
                            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 px-2 hidden sm:inline">Tiempo Restante:</span>
                            {deliveryStatus.days > 0 && (
                                <div className="bg-slate-900 px-2.5 py-1 rounded-xl text-center min-w-[38px] border border-slate-700">
                                    <span className="text-xs font-black text-white">{deliveryStatus.days}</span>
                                    <span className="block text-[7px] text-slate-400 font-bold uppercase">días</span>
                                </div>
                            )}
                            <div className="bg-slate-900 px-2.5 py-1 rounded-xl text-center min-w-[38px] border border-slate-700">
                                <span className="text-xs font-black text-white">{String(deliveryStatus.hours).padStart(2, '0')}</span>
                                <span className="block text-[7px] text-slate-400 font-bold uppercase">hs</span>
                            </div>
                            <span className="text-blue-400 font-black">:</span>
                            <div className="bg-slate-900 px-2.5 py-1 rounded-xl text-center min-w-[38px] border border-slate-700">
                                <span className="text-xs font-black text-white">{String(deliveryStatus.mins).padStart(2, '0')}</span>
                                <span className="block text-[7px] text-slate-400 font-bold uppercase">min</span>
                            </div>
                            <span className="text-blue-400 font-black">:</span>
                            <div className="bg-slate-900 px-2.5 py-1 rounded-xl text-center min-w-[38px] border border-slate-700">
                                <span className="text-xs font-black text-emerald-400">{String(deliveryStatus.secs).padStart(2, '0')}</span>
                                <span className="block text-[7px] text-slate-400 font-bold uppercase">seg</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* IF NOT LOGGED IN: SHOW MODERN LANDING & INLINE LOGIN (NO PRODUCTS SHOWN) */}
            {!clientSession ? (
                <div className="flex-1 flex flex-col justify-center items-center py-12 px-4">
                    <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
                        {/* Left Side: Brand Story */}
                        <div className="md:col-span-7 space-y-5 text-center md:text-left">
                            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-black uppercase tracking-wider border border-blue-200">
                                <span className="material-symbols-outlined text-sm">verified</span>
                                Acceso Privado para Clientes
                            </span>
                            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 uppercase tracking-tight leading-tight">
                                Tuberías PVC, Sanitarios, Morteros y Construcción
                            </h2>
                            <p className="text-sm text-slate-600 font-medium leading-relaxed">
                                Portal exclusivo de pedidos para corralones, ferreterías y profesionales. Iniciá sesión con tu usuario y contraseña para acceder al catálogo completo con <strong>tus precios por escala asignados</strong> y programar tu entrega.
                            </p>

                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
                                    <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-2">
                                        <span className="material-symbols-outlined text-lg">sell</span>
                                    </div>
                                    <h4 className="text-xs font-black uppercase text-slate-900">Precios por Escala</h4>
                                    <p className="text-[10px] text-slate-500 font-medium">Pallet, 1/2 Equipo y Equipo completo.</p>
                                </div>
                                <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
                                    <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2">
                                        <span className="material-symbols-outlined text-lg">local_shipping</span>
                                    </div>
                                    <h4 className="text-xs font-black uppercase text-slate-900">Entregas en Obra</h4>
                                    <p className="text-[10px] text-slate-500 font-medium">Cronograma de repartos semanales.</p>
                                </div>
                            </div>
                        </div>

                        {/* Right Side: Embedded Login Box */}
                        <div className="md:col-span-5 bg-white rounded-3xl p-7 shadow-xl border border-slate-200/80">
                            <div className="text-center mb-6">
                                <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md shadow-blue-600/20">
                                    <span className="material-symbols-outlined text-3xl font-black">lock</span>
                                </div>
                                <h3 className="text-base font-black text-slate-900 uppercase">Ingresar al Catálogo</h3>
                                <p className="text-[11px] font-medium text-slate-500 mt-1">
                                    Colocá tus datos para ver productos y precios
                                </p>
                            </div>

                            {loginError && (
                                <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-[10px] font-bold uppercase text-center">
                                    ⚠️ {loginError}
                                </div>
                            )}

                            <form onSubmit={handleLogin} className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Usuario Web</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="ej: elazulejo"
                                        value={loginForm.user}
                                        onChange={(e) => setLoginForm(prev => ({ ...prev, user: e.target.value }))}
                                        className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 text-xs font-mono font-bold"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Contraseña</label>
                                    <input
                                        type="password"
                                        required
                                        placeholder="••••••"
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

                            {deliverySchedule.whatsapp_number && (
                                <div className="mt-5 pt-4 border-t border-slate-100 text-center">
                                    <p className="text-[10px] text-slate-400 font-medium">¿Aún no tenés usuario mayorista?</p>
                                    <a
                                        href={`https://wa.me/${deliverySchedule.whatsapp_number}?text=${encodeURIComponent('Hola! Quisiera solicitar un usuario mayorista para hacer pedidos en la web.')}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[11px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-wide inline-flex items-center gap-1 mt-1"
                                    >
                                        <span className="material-symbols-outlined text-[13px]">chat</span>
                                        Solicitar cuenta por WhatsApp
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                /* IF LOGGED IN: SHOW FULL CATALOG & CART */
                <>
                    {/* Search & Categories Filter */}
                    <div id="catalogo" className="max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full space-y-4">
                        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                            {/* Search box */}
                            <div className="relative w-full sm:max-w-md">
                                <span className="material-symbols-outlined absolute left-3.5 top-3 text-slate-400 text-xl">search</span>
                                <input
                                    type="text"
                                    placeholder="Buscar producto, cañería, cemento, código..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full h-11 pl-11 pr-4 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600 shadow-xs transition-all"
                                />
                                {searchQuery && (
                                    <button onClick={() => setSearchQuery('')} className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600">
                                        <span className="material-symbols-outlined text-lg">close</span>
                                    </button>
                                )}
                            </div>

                            <div className="text-[11px] font-black text-slate-500 uppercase tracking-wider self-start sm:self-center">
                                Mostrando {filteredProducts.length} producto{filteredProducts.length === 1 ? '' : 's'}
                            </div>
                        </div>

                        {/* Family / Category filter pills */}
                        <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                            <button
                                onClick={() => setSelectedFamily('ALL')}
                                className={`px-4 py-2 rounded-2xl text-[11px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${selectedFamily === 'ALL' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}
                            >
                                Todos ({catalog.length})
                            </button>
                            {families.map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => setSelectedFamily(f.id)}
                                    className={`px-4 py-2 rounded-2xl text-[11px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${selectedFamily === f.id ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}
                                >
                                    {f.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Catalog Grid */}
                    <main className="max-w-7xl mx-auto px-4 sm:px-6 w-full flex-1">
                        {loadingCatalog ? (
                            <div className="p-20 text-center space-y-4">
                                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                                <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Cargando catálogo oficial...</p>
                            </div>
                        ) : filteredProducts.length === 0 ? (
                            <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center space-y-3 shadow-xs">
                                <span className="material-symbols-outlined text-5xl text-slate-300">inventory_2</span>
                                <h4 className="text-sm font-black text-slate-800 uppercase">No se encontraron productos</h4>
                                <p className="text-xs text-slate-400 font-medium">Intentá con otra palabra de búsqueda o cambiá la categoría seleccionada.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                                {filteredProducts.map(p => (
                                    <div key={p.id} className="bg-white border border-slate-200/90 rounded-3xl p-4 shadow-xs flex flex-col justify-between hover:shadow-xl hover:border-blue-200 transition-all duration-300 group">
                                        <div>
                                            {/* Image with Tag */}
                                            <div className="relative w-full h-44 bg-slate-50 rounded-2xl overflow-hidden mb-3 border border-slate-100 flex items-center justify-center p-3 group-hover:scale-[1.02] transition-transform">
                                                {p.image_url ? (
                                                    <img src={p.image_url} alt={p.name} className="w-full h-full object-contain" />
                                                ) : (
                                                    <span className="material-symbols-outlined text-5xl text-slate-200">construction</span>
                                                )}
                                                {p.family && (
                                                    <span className="absolute top-2.5 left-2.5 bg-slate-900/85 backdrop-blur-sm text-white px-2.5 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-wider">
                                                        {p.family}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Product Title & Info */}
                                            <h3 className="font-black text-xs text-slate-900 uppercase leading-snug line-clamp-2">{p.name}</h3>
                                            {p.description && (
                                                <p className="text-[10px] text-slate-500 line-clamp-2 mt-1 leading-normal font-medium">{p.description}</p>
                                            )}
                                        </div>

                                        {/* Variants with Assigned Price */}
                                        <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                                            {p.variants.map(v => {
                                                const inCartQty = cart[v.id]?.quantity || 0;
                                                return (
                                                    <div key={v.id} className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50/80 border border-slate-100 hover:bg-slate-50 transition-colors">
                                                        <div className="min-w-0 pr-2">
                                                            <span className="text-[11px] font-black text-slate-800 block truncate">{v.name}</span>
                                                            <span className="text-xs font-black text-blue-600 font-mono">
                                                                ${v.price.toLocaleString('es-AR')}
                                                            </span>
                                                        </div>

                                                        {/* Stepper Button */}
                                                        <div className="flex items-center gap-1 shrink-0 bg-white border border-slate-200 rounded-xl p-0.5 shadow-xs">
                                                            {inCartQty > 0 ? (
                                                                <>
                                                                    <button
                                                                        onClick={() => updateQuantity(p, v, -1)}
                                                                        className="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded-lg font-black text-sm transition-colors"
                                                                    >
                                                                        -
                                                                    </button>
                                                                    <span className="w-6 text-center text-xs font-black text-slate-900">{inCartQty}</span>
                                                                    <button
                                                                        onClick={() => updateQuantity(p, v, 1)}
                                                                        className="w-7 h-7 flex items-center justify-center bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-black text-sm transition-colors"
                                                                    >
                                                                        +
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <button
                                                                    onClick={() => updateQuantity(p, v, 1)}
                                                                    className="px-3 h-7 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase rounded-lg transition-all flex items-center gap-1 shadow-xs shadow-blue-600/20"
                                                                >
                                                                    <span className="material-symbols-outlined text-sm font-black">add</span>
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
                </>
            )}

            {/* Success Modal */}
            {orderSuccess && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 text-center space-y-4 shadow-2xl border border-slate-100">
                        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                            <span className="material-symbols-outlined text-3xl font-black">check_circle</span>
                        </div>
                        <h3 className="text-lg font-black text-slate-900 uppercase">¡Pedido Recibido!</h3>
                        <p className="text-xs text-slate-600 leading-relaxed">
                            Tu pedido fue ingresado al sistema para la entrega del <strong>{orderSuccess.deliveryDate}</strong>.
                        </p>
                        {orderSuccess.waUrl && (
                            <div className="pt-2">
                                <a
                                    href={orderSuccess.waUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
                                >
                                    <span className="material-symbols-outlined text-lg">chat</span>
                                    Enviar Copia a WhatsApp
                                </a>
                            </div>
                        )}
                        <button
                            onClick={() => setOrderSuccess(null)}
                            className="w-full py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-2xl text-xs font-black uppercase"
                        >
                            Seguir Comprando
                        </button>
                    </div>
                </div>
            )}

            {/* Cart Drawer / Slide-Over */}
            {isCartOpen && (
                <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs">
                    <div className="bg-white w-full max-w-md h-full flex flex-col shadow-2xl">
                        {/* Drawer Header */}
                        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-blue-600 text-xl">shopping_cart</span>
                                <h3 className="font-black text-sm text-slate-900 uppercase">Mi Pedido</h3>
                            </div>
                            <button onClick={() => setIsCartOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                                <span className="material-symbols-outlined text-xl">close</span>
                            </button>
                        </div>

                        {/* Items list */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                            {cartItems.length === 0 ? (
                                <div className="text-center py-16 space-y-2">
                                    <span className="material-symbols-outlined text-4xl text-slate-300">shopping_cart</span>
                                    <p className="text-xs font-bold text-slate-500 uppercase">El carrito está vacío</p>
                                </div>
                            ) : (
                                cartItems.map(it => (
                                    <div key={it.variant.id} className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <h4 className="text-xs font-black text-slate-800 uppercase truncate">{it.product.name}</h4>
                                            <p className="text-[10px] text-slate-500 font-bold">{it.variant.name}</p>
                                            <p className="text-[11px] font-black text-blue-600 mt-0.5">
                                                ${(it.variant.price * it.quantity).toLocaleString('es-AR')}
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-0.5 shrink-0 shadow-xs">
                                            <button
                                                onClick={() => updateQuantity(it.product, it.variant, -1)}
                                                className="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded-lg font-black text-sm"
                                            >
                                                -
                                            </button>
                                            <span className="w-6 text-center text-xs font-black text-slate-900">{it.quantity}</span>
                                            <button
                                                onClick={() => updateQuantity(it.product, it.variant, 1)}
                                                className="w-7 h-7 flex items-center justify-center bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-black text-sm"
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}

                            {/* Note field */}
                            {cartItems.length > 0 && (
                                <div className="pt-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                                        Notas o instrucciones de entrega
                                    </label>
                                    <textarea
                                        rows={2}
                                        placeholder="Ej: Entregar por la mañana, timbre 2..."
                                        value={orderNote}
                                        onChange={(e) => setOrderNote(e.target.value)}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 resize-none"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Drawer Footer */}
                        {cartItems.length > 0 && (
                            <div className="p-4 border-t border-slate-200 bg-slate-50 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-black text-slate-500 uppercase">Total Estimado</span>
                                    <span className="text-lg font-black text-blue-600 font-mono">${cartTotal.toLocaleString('es-AR')}</span>
                                </div>

                                {deliveryStatus && (
                                    <p className="text-[10px] text-slate-500 font-medium text-center">
                                        🚚 Entrega programada: <strong>{deliveryStatus.deliveryName} ({deliveryStatus.deliveryDateFormatted})</strong>
                                    </p>
                                )}

                                <button
                                    onClick={handleConfirmOrder}
                                    disabled={sendingOrder}
                                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-40"
                                >
                                    {sendingOrder ? (
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined text-lg">check_circle</span>
                                            Confirmar Pedido y Enviar
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClientPortal;
