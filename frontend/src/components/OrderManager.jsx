import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

const OrderManager = () => {
    const [activeSubTab, setActiveSubTab] = useState('orders-list'); // 'orders-list', 'create-order'
    const [orders, setOrders] = useState([]);
    const [sellers, setSellers] = useState([]);
    const [shops, setShops] = useState([]);
    const [deliverers, setDeliverers] = useState([]);
    const [variants, setVariants] = useState([]);
    const [loading, setLoading] = useState(true);

    // Create Order States
    const [orderForm, setOrderForm] = useState({
        seller_id: '',
        shop_id: '',
        price_tier: 'price_unit',
        items: []
    });
    const [productSearch, setProductSearch] = useState('');

    // Delivery assign states
    const [assigningOrder, setAssigningOrder] = useState(null);
    const [selectedDelivererId, setSelectedDelivererId] = useState('');

    // Packing Checklist Modal States
    const [packingOrder, setPackingOrder] = useState(null);
    const [packingChecklist, setPackingChecklist] = useState({}); // { itemId: boolean }
    const [viewingOrder, setViewingOrder] = useState(null);
    const [failingOrder, setFailingOrder] = useState(null);
    const [failureReasonForm, setFailureReasonForm] = useState({ reason: 'Cliente Ausente / Local Cerrado', otherText: '' });

    // Leaflet Map states
    const [leafletLoaded, setLeafletLoaded] = useState(false);
    const mapRef = useRef(null);
    const markersGroupRef = useRef(null);
    const pathsGroupRef = useRef(null);

    useEffect(() => {
        fetchAllData();
        loadLeafletCDN();
    }, []);

    const fetchAllData = async () => {
        setLoading(true);
        try {
            const [oRes, sRes, nRes, eRes, vRes] = await Promise.all([
                axios.get(`${API_URL}/orders`).catch(e => ({ data: [] })),
                axios.get(`${API_URL}/preventistas`).catch(e => ({ data: [] })),
                axios.get(`${API_URL}/negocios`).catch(e => ({ data: [] })),
                axios.get(`${API_URL}/entregadores`).catch(e => ({ data: [] })),
                axios.get(`${API_URL}/products/variants`).catch(e => ({ data: [] }))
            ]);

            setOrders(oRes.data || []);
            setSellers(sRes.data || []);
            setShops(nRes.data || []);
            setDeliverers(eRes.data || []);
            setVariants(vRes.data || []);
            setLoading(false);
        } catch (err) {
            console.error('Error fetching order manager data:', err);
            setLoading(false);
        }
    };

    // Load Leaflet map libraries dynamically
    const loadLeafletCDN = () => {
        if (window.L) {
            setLeafletLoaded(true);
            return;
        }

        // 1. Inject Leaflet CSS
        if (!document.getElementById('leaflet-css')) {
            const link = document.createElement('link');
            link.id = 'leaflet-css';
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
        }

        // 2. Inject Leaflet JS
        if (!document.getElementById('leaflet-js')) {
            const script = document.createElement('script');
            script.id = 'leaflet-js';
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.async = true;
            script.onload = () => {
                setLeafletLoaded(true);
            };
            document.head.appendChild(script);
        } else {
            // Script tag exists but window.L is not ready yet, wait slightly
            setTimeout(() => {
                if (window.L) setLeafletLoaded(true);
            }, 500);
        }
    };

    // Render / Update Leaflet Map Markers & Routes
    useEffect(() => {
        if (!leafletLoaded || !window.L || loading || activeSubTab !== 'orders-list') return;

        const mapContainer = document.getElementById('delivery-map');
        if (!mapContainer) return;

        // Initialize map if not already done
        if (!mapRef.current) {
            const defaultCenter = [-34.6037, -58.3816]; // Buenos Aires default center
            const map = window.L.map('delivery-map', { zoomControl: true }).setView(defaultCenter, 12);
            
            window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(map);

            mapRef.current = map;
            markersGroupRef.current = window.L.layerGroup().addTo(map);
            pathsGroupRef.current = window.L.layerGroup().addTo(map);
        }

        const map = mapRef.current;
        const markersGroup = markersGroupRef.current;
        const pathsGroup = pathsGroupRef.current;

        // Clear existing markers and paths
        markersGroup.clearLayers();
        pathsGroup.clearLayers();

        // 1. Collect Geolocation Points
        const activeOrders = orders.filter(o => ['pendiente', 'en preparacion', 'preparado', 'en transporte'].includes(o.status));
        const geolocatedPoints = [];
        const routeCoordinatesByDriver = {}; // { driverId: [LatLng] }

        activeOrders.forEach(order => {
            const shop = order.negocios;
            if (shop && shop.latitude && shop.longitude) {
                const lat = parseFloat(shop.latitude);
                const lng = parseFloat(shop.longitude);
                geolocatedPoints.push({ lat, lng, order });

                // Group active shipping coordinates by driver
                if (order.status === 'en transporte' && order.deliverer_id) {
                    if (!routeCoordinatesByDriver[order.deliverer_id]) {
                        routeCoordinatesByDriver[order.deliverer_id] = [];
                    }
                    routeCoordinatesByDriver[order.deliverer_id].push([lat, lng]);
                }
            }
        });

        // 2. Draw Custom Pin Markers
        geolocatedPoints.forEach(({ lat, lng, order }) => {
            let markerColor = '#f59e0b'; // pending -> amber
            let statusText = 'Pendiente';

            if (order.status === 'en preparacion') {
                markerColor = '#f97316'; // orange
                statusText = 'En Preparación';
            } else if (order.status === 'preparado') {
                markerColor = '#3b82f6'; // prepared -> blue
                statusText = 'Preparado';
            } else if (order.status === 'en transporte') {
                markerColor = '#8b5cf6'; // in_delivery -> purple
                statusText = 'En Transporte';
            }

            // Create a custom SVG marker
            const svgIcon = window.L.divIcon({
                html: `<div style="background-color: ${markerColor}; width: 14px; height: 14px; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 5px rgba(0,0,0,0.3); transition: transform 0.2s;" class="hover:scale-125"></div>`,
                className: 'custom-leaflet-marker',
                iconSize: [14, 14],
                iconAnchor: [7, 7]
            });

            const popupContent = `
                <div style="font-family: inherit; font-size: 10px; padding: 2px;">
                    <strong style="text-transform: uppercase;">Pedido #${order.id.substring(0, 8).toUpperCase()}</strong>
                    <p style="margin: 4px 0 2px 0; font-weight: bold; color:#1e293b;">${order.negocios?.name.toUpperCase()}</p>
                    <p style="margin: 0; color: #64748b;">${order.negocios?.address.toUpperCase()}</p>
                    <div style="margin-top: 6px; padding: 2px 6px; font-weight: 900; font-size: 8px; border-radius: 999px; text-align: center; text-transform: uppercase; background-color: ${markerColor}15; color: ${markerColor}; border: 1px solid ${markerColor}30;">
                        ${statusText}
                    </div>
                </div>
            `;

            window.L.marker([lat, lng], { icon: svgIcon })
                .bindPopup(popupContent)
                .addTo(markersGroup);
        });

        // 3. Draw routes polylines for active delivery drivers
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
        let colorIdx = 0;

        Object.keys(routeCoordinatesByDriver).forEach(driverId => {
            const coords = routeCoordinatesByDriver[driverId];
            if (coords.length > 0) {
                const driverName = deliverers.find(d => d.id === driverId)?.name || 'Chofer';
                const routeColor = colors[colorIdx % colors.length];
                colorIdx++;

                // Draw polyline connecting delivery pins
                const polyline = window.L.polyline(coords, {
                    color: routeColor,
                    weight: 3.5,
                    opacity: 0.85,
                    dashArray: '5, 8'
                }).addTo(pathsGroup);

                // Add a hover tooltip showing the driver name
                polyline.bindTooltip(`Ruta de Reparto: ${driverName.toUpperCase()}`, { sticky: true });
            }
        });

        // Adjust map bounds to fit markers
        if (geolocatedPoints.length > 0) {
            const bounds = window.L.latLngBounds(geolocatedPoints.map(p => [p.lat, p.lng]));
            map.fitBounds(bounds, { padding: [40, 40] });
        }
    }, [orders, leafletLoaded, loading, activeSubTab]);

    // --- PACKING CHECKLIST HANDLERS ---
    const startPreparation = async (order) => {
        try {
            await updateOrderStatus(order.id, 'en preparacion');
        } catch (e) {
            console.error('Error starting preparation:', e);
        }
        // Deep copy order to allow editing items quantities during preparation
        const clonedOrder = JSON.parse(JSON.stringify(order));
        clonedOrder.order_items = (clonedOrder.order_items || []).map(item => ({
            ...item,
            original_quantity: item.quantity
        }));
        setPackingOrder(clonedOrder);
        
        // Initialize checklist with all items unchecked
        const initialList = {};
        clonedOrder.order_items?.forEach(item => {
            initialList[item.id] = false;
        });
        setPackingChecklist(initialList);
    };

    const decreasePackingQty = (itemId) => {
        setPackingOrder(prev => {
            const updatedItems = prev.order_items.map(it => {
                if (it.id === itemId) {
                    const newQty = Math.max(0, it.quantity - 1);
                    return { ...it, quantity: newQty };
                }
                return it;
            });
            return { ...prev, order_items: updatedItems };
        });
    };

    const increasePackingQty = (itemId) => {
        setPackingOrder(prev => {
            const updatedItems = prev.order_items.map(it => {
                if (it.id === itemId) {
                    const newQty = Math.min(it.original_quantity, it.quantity + 1);
                    return { ...it, quantity: newQty };
                }
                return it;
            });
            return { ...prev, order_items: updatedItems };
        });
    };

    const togglePackingItem = (itemId) => {
        setPackingChecklist(prev => ({
            ...prev,
            [itemId]: !prev[itemId]
        }));
    };

    const isPackingComplete = () => {
        if (!packingOrder || !packingOrder.order_items) return false;
        return packingOrder.order_items.every(item => packingChecklist[item.id] === true);
    };

    const finishPreparation = async () => {
        if (!isPackingComplete()) return;
        try {
            await updateOrderStatus(packingOrder.id, 'preparado', null, packingOrder.order_items);
            setPackingOrder(null);
        } catch (e) {
            console.error(e);
        }
    };

    // --- CREATE ORDER ACTIONS ---
    const addToCart = (variant) => {
        const existing = orderForm.items.find(it => it.variant_id === variant.id);
        const price = variant[orderForm.price_tier] || variant.price_unit || 0;
        
        if (existing) {
            setOrderForm(prev => ({
                ...prev,
                items: prev.items.map(it => it.variant_id === variant.id ? { ...it, quantity: it.quantity + 1 } : it)
            }));
        } else {
            setOrderForm(prev => ({
                ...prev,
                items: [...prev.items, {
                    variant_id: variant.id,
                    name: `${variant.products?.name} (${variant.name})`,
                    code: variant.code,
                    quantity: 1,
                    price_unit: price
                }]
            }));
        }
    };

    const updateCartQty = (variantId, qty) => {
        if (qty <= 0) {
            setOrderForm(prev => ({
                ...prev,
                items: prev.items.filter(it => it.variant_id !== variantId)
            }));
        } else {
            setOrderForm(prev => ({
                ...prev,
                items: prev.items.map(it => it.variant_id === variantId ? { ...it, quantity: qty } : it)
            }));
        }
    };

    const submitOrder = async () => {
        if (!orderForm.shop_id) {
            alert('Debes seleccionar un negocio cliente.');
            return;
        }
        if (orderForm.items.length === 0) {
            alert('Debes agregar al menos un producto al pedido.');
            return;
        }
        try {
            await axios.post(`${API_URL}/orders`, {
                seller_id: orderForm.seller_id || null,
                shop_id: orderForm.shop_id,
                items: orderForm.items
            });
            alert('¡Pedido enviado con éxito!');
            setOrderForm({ seller_id: '', shop_id: '', price_tier: 'price_unit', items: [] });
            setActiveSubTab('orders-list');
            fetchAllData();
        } catch (error) {
            console.error(error);
            alert('Error al enviar el pedido.');
        }
    };

    // --- ORDER WORKFLOW STATUS UPDATES ---
    const updateOrderStatus = async (orderId, status, delivererId = null, items = null, failureReason = null) => {
        try {
            await axios.patch(`${API_URL}/orders/${orderId}/status`, { status, deliverer_id: delivererId, items, failure_reason: failureReason });
            setAssigningOrder(null);
            setFailingOrder(null);
            setSelectedDelivererId('');
            fetchAllData();
        } catch (error) {
            console.error(error);
            alert('Error al actualizar el estado del pedido. Verifique que la columna "stock_discounted" exista en su tabla "orders" de Supabase.');
        }
    };

    const getStatusLabel = (status) => {
        const labels = {
            'pendiente': 'Pendiente',
            'en preparacion': 'En Preparación',
            'preparado': 'Preparado',
            'en transporte': 'En Transporte',
            'entregado': 'Entregado',
            'no entregado': 'No Entregado'
        };
        return labels[status] || status;
    };

    const getStatusClass = (status) => {
        const classes = {
            'pendiente': 'bg-amber-50 text-amber-600 border-amber-250',
            'en preparacion': 'bg-orange-50 text-orange-600 border-orange-250',
            'preparado': 'bg-blue-50 text-blue-600 border-blue-250',
            'en transporte': 'bg-indigo-50 text-indigo-600 border-indigo-250',
            'entregado': 'bg-green-50 text-green-600 border-green-250',
            'no entregado': 'bg-red-50 text-red-600 border-red-250'
        };
        return classes[status] || 'bg-slate-50 text-slate-500 border-slate-200';
    };

    const calculateOrderTotal = () => {
        return orderForm.items.reduce((acc, it) => acc + (it.price_unit * it.quantity), 0);
    };

    // Filters variants matching search query
    const filteredVariants = variants.filter(v => 
        v.products?.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        v.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        v.code?.toLowerCase().includes(productSearch.toLowerCase())
    );

    // Grouping orders by column status
    const pendingOrders = orders.filter(o => o.status === 'pendiente' || o.status === 'en preparacion');
    const preparedOrders = orders.filter(o => o.status === 'preparado');
    const inDeliveryOrders = orders.filter(o => o.status === 'en transporte');
    const historyOrders = orders.filter(o => ['entregado', 'no entregado'].includes(o.status));

    return (
        <div className="flex-1 bg-white border border-analyst-200 shadow-sm rounded-xl flex flex-col min-h-0 overflow-hidden">
            {/* Toolbar Header */}
            <div className="px-6 py-4 bg-white border-b border-analyst-100 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary text-xl">shopping_cart_checkout</span>
                    <h3 className="font-bold text-xs text-analyst-900 uppercase tracking-tight">Gestor de Pedidos & Logística</h3>
                </div>

                <div className="flex bg-analyst-50 p-1 rounded-lg border border-analyst-100">
                    <button
                        onClick={() => setActiveSubTab('orders-list')}
                        className={`px-4 py-2 rounded-md text-[10px] font-black uppercase transition-all flex items-center gap-1.5 ${activeSubTab === 'orders-list' ? 'bg-white text-primary shadow-sm' : 'text-analyst-400 hover:text-analyst-600'}`}
                    >
                        <span className="material-symbols-outlined text-sm">list_alt</span>
                        Pedidos y Entregas
                    </button>
                    <button
                        onClick={() => setActiveSubTab('create-order')}
                        className={`px-4 py-2 rounded-md text-[10px] font-black uppercase transition-all flex items-center gap-1.5 ${activeSubTab === 'create-order' ? 'bg-white text-primary shadow-sm' : 'text-analyst-400 hover:text-analyst-600'}`}
                    >
                        <span className="material-symbols-outlined text-sm">phone_iphone</span>
                        Carga Preventistas
                    </button>
                </div>
            </div>

            {/* Inner Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col bg-slate-50/50 min-h-0">
                {loading ? (
                    <div className="h-full flex flex-col items-center justify-center py-20 text-analyst-300">
                        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="text-[10px] font-black uppercase tracking-wider">Cargando circuito de pedidos...</p>
                    </div>
                ) : (
                    <>
                        {/* Tab 1: Orders list & tracking */}
                        {activeSubTab === 'orders-list' && (
                            <div className="flex-1 flex flex-col lg:flex-row gap-6 p-6 min-h-0 overflow-hidden">
                                
                                {/* Left Side: 3-column Operational Kanban Board */}
                                <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0 overflow-y-auto lg:overflow-hidden">
                                    
                                    {/* Column 1: Pending preparation */}
                                    <div className="bg-slate-100/60 border border-slate-200 rounded-2xl p-4 flex flex-col min-h-[300px] lg:min-h-0 overflow-hidden">
                                        <div className="flex justify-between items-center pb-3 border-b border-slate-200 mb-3 shrink-0">
                                            <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                                                <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                                                1. Preparación (${pendingOrders.reduce((a,c)=>a+c.total,0).toFixed(0)})
                                            </h4>
                                            <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[8.5px] font-black rounded-lg">{pendingOrders.length}</span>
                                        </div>

                                        <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
                                            {pendingOrders.map(order => (
                                                <div key={order.id} className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm hover:shadow transition-all space-y-2 relative overflow-hidden">
                                                    <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[10px] font-black text-slate-800">#{order.id.substring(0, 8).toUpperCase()}</span>
                                                            <button
                                                                onClick={() => setViewingOrder(order)}
                                                                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition-colors flex items-center"
                                                                title="Ver Detalle"
                                                            >
                                                                <span className="material-symbols-outlined text-[13px] font-black">visibility</span>
                                                            </button>
                                                        </div>
                                                        <span className="text-[10.5px] font-black text-primary">${(order.total || 0).toFixed(1)}</span>
                                                    </div>
                                                    <p className="text-[9.5px] font-bold text-slate-900 uppercase truncate">
                                                        {order.negocios?.name}
                                                    </p>
                                                    <p className="text-[8px] text-slate-400 font-bold uppercase truncate">
                                                        {order.negocios?.address}
                                                    </p>
                                                    <div className="pt-2 border-t border-slate-100 flex justify-between gap-2">
                                                        <button
                                                            onClick={() => updateOrderStatus(order.id, 'no entregado')}
                                                            className="flex-1 py-1 text-center border border-red-100 text-red-500 rounded-lg text-[8px] font-black uppercase hover:bg-red-50"
                                                        >
                                                            No Entregado
                                                        </button>
                                                        <button
                                                            onClick={() => startPreparation(order)}
                                                            className="flex-1 py-1 text-center bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[8px] font-black uppercase shadow shadow-blue-500/10 flex items-center justify-center gap-0.5"
                                                        >
                                                            <span className="material-symbols-outlined text-[10px]">inventory_2</span>
                                                            Preparar
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            {pendingOrders.length === 0 && (
                                                <p className="text-center text-[9px] font-black text-slate-400 uppercase py-10">Sin pedidos pendientes</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Column 2: Prepared / Ready */}
                                    <div className="bg-slate-100/60 border border-slate-200 rounded-2xl p-4 flex flex-col min-h-[300px] lg:min-h-0 overflow-hidden">
                                        <div className="flex justify-between items-center pb-3 border-b border-slate-200 mb-3 shrink-0">
                                            <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                                                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                                                2. Listos / Empacados (${preparedOrders.reduce((a,c)=>a+c.total,0).toFixed(0)})
                                            </h4>
                                            <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[8.5px] font-black rounded-lg">{preparedOrders.length}</span>
                                        </div>

                                        <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
                                            {preparedOrders.map(order => (
                                                <div key={order.id} className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm hover:shadow transition-all space-y-2 relative overflow-hidden">
                                                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[10px] font-black text-slate-800">#{order.id.substring(0, 8).toUpperCase()}</span>
                                                            <button
                                                                onClick={() => setViewingOrder(order)}
                                                                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition-colors flex items-center"
                                                                title="Ver Detalle"
                                                            >
                                                                <span className="material-symbols-outlined text-[13px] font-black">visibility</span>
                                                            </button>
                                                        </div>
                                                        <span className="text-[10.5px] font-black text-primary">${(order.total || 0).toFixed(1)}</span>
                                                    </div>
                                                    <p className="text-[9.5px] font-bold text-slate-900 uppercase truncate">
                                                        {order.negocios?.name}
                                                    </p>
                                                    <p className="text-[8px] text-slate-400 font-bold uppercase truncate">
                                                        {order.negocios?.address}
                                                    </p>
                                                    {order.negocios?.latitude && order.negocios?.longitude && (
                                                        <span className="text-[7.5px] text-green-600 font-black uppercase flex items-center gap-0.5 mt-1">
                                                            <span className="material-symbols-outlined text-[10px] font-black">location_on</span> Geolocalizado
                                                        </span>
                                                    )}
                                                    <div className="pt-2 border-t border-slate-100 flex">
                                                        <button
                                                            onClick={() => setAssigningOrder(order)}
                                                            className="w-full py-1.5 text-center bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[8px] font-black uppercase shadow shadow-indigo-500/10 flex items-center justify-center gap-0.5"
                                                        >
                                                            <span className="material-symbols-outlined text-[10px]">local_shipping</span>
                                                            Asignar Chofer
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            {preparedOrders.length === 0 && (
                                                <p className="text-center text-[9px] font-black text-slate-400 uppercase py-10">Sin pedidos listos</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Column 3: In Delivery / Shipping */}
                                    <div className="bg-slate-100/60 border border-slate-200 rounded-2xl p-4 flex flex-col min-h-[300px] lg:min-h-0 overflow-hidden">
                                        <div className="flex justify-between items-center pb-3 border-b border-slate-200 mb-3 shrink-0">
                                            <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                                                <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
                                                3. En Reparto (${inDeliveryOrders.reduce((a,c)=>a+c.total,0).toFixed(0)})
                                            </h4>
                                            <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[8.5px] font-black rounded-lg">{inDeliveryOrders.length}</span>
                                        </div>

                                        <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
                                            {inDeliveryOrders.map(order => (
                                                <div key={order.id} className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm hover:shadow transition-all space-y-2 relative overflow-hidden">
                                                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[10px] font-black text-slate-800">#{order.id.substring(0, 8).toUpperCase()}</span>
                                                            <button
                                                                onClick={() => setViewingOrder(order)}
                                                                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition-colors flex items-center"
                                                                title="Ver Detalle"
                                                            >
                                                                <span className="material-symbols-outlined text-[13px] font-black">visibility</span>
                                                            </button>
                                                        </div>
                                                        <span className="text-[10.5px] font-black text-primary">${(order.total || 0).toFixed(1)}</span>
                                                    </div>
                                                    <p className="text-[9.5px] font-bold text-slate-900 uppercase truncate">
                                                        {order.negocios?.name}
                                                    </p>
                                                    {order.entregadores && (
                                                        <p className="text-[7.5px] text-indigo-600 font-black uppercase flex items-center gap-0.5">
                                                            <span className="material-symbols-outlined text-[9px]">local_shipping</span>
                                                            Chofer: {order.entregadores.name} ({order.entregadores.vehicle})
                                                        </p>
                                                    )}
                                                    <div className="pt-2 border-t border-slate-100 flex gap-2">
                                                        <button
                                                            onClick={() => { setFailingOrder(order); setFailureReasonForm({ reason: 'Cliente Ausente / Local Cerrado', otherText: '' }); }}
                                                            className="flex-1 py-1 text-center border border-red-100 text-red-500 rounded-lg text-[8px] font-black uppercase hover:bg-red-50"
                                                        >
                                                            Falla
                                                        </button>
                                                        <button
                                                            onClick={() => updateOrderStatus(order.id, 'entregado')}
                                                            className="flex-1 py-1 text-center bg-green-600 hover:bg-green-700 text-white rounded-lg text-[8px] font-black uppercase shadow shadow-green-500/10 flex items-center justify-center gap-0.5"
                                                        >
                                                            <span className="material-symbols-outlined text-[10px]">check_circle</span>
                                                            Entregado
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            {inDeliveryOrders.length === 0 && (
                                                <p className="text-center text-[9px] font-black text-slate-400 uppercase py-10">Sin repartos en tránsito</p>
                                            )}
                                        </div>
                                    </div>

                                </div>

                                {/* Right Side: Dynamic Interactive Route Map */}
                                <div className="lg:w-[40%] bg-white border border-slate-200 rounded-2xl p-4 flex flex-col shadow-sm shrink-0 min-h-[300px] lg:min-h-0">
                                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3 shrink-0">
                                        <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-sm text-primary">map</span>
                                            Mapa de Ruta de Repartos
                                        </h4>
                                        <span className="text-[7.5px] text-slate-400 font-bold uppercase tracking-wider">Pins interactivos y Trazados</span>
                                    </div>
                                    
                                    <div className="flex-1 relative rounded-xl overflow-hidden border border-slate-150 bg-slate-50 min-h-0">
                                        {leafletLoaded ? (
                                            <div id="delivery-map" className="w-full h-full min-h-[250px] z-10"></div>
                                        ) : (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                                                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2"></div>
                                                <p className="text-[8px] font-black uppercase tracking-wider">Cargando Mapas Leaflet CDN...</p>
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="mt-3 grid grid-cols-3 gap-2 text-[8px] font-black uppercase text-center border-t border-slate-100 pt-3">
                                        <div className="flex items-center justify-center gap-1"><span className="w-2.5 h-2.5 bg-amber-500 rounded-full border border-white shadow-sm"></span> Empaque</div>
                                        <div className="flex items-center justify-center gap-1"><span className="w-2.5 h-2.5 bg-blue-500 rounded-full border border-white shadow-sm"></span> Empacado</div>
                                        <div className="flex items-center justify-center gap-1"><span className="w-2.5 h-2.5 bg-indigo-500 rounded-full border border-white shadow-sm"></span> En Reparto</div>
                                    </div>
                                </div>

                            </div>
                        )}

                        {/* Tab 2: Preventistas mobile order creation */}
                        {activeSubTab === 'create-order' && (
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start p-6 overflow-y-auto">
                                {/* Left Side: Cart and client selection */}
                                <div className="lg:col-span-4 bg-white border border-analyst-150 rounded-2xl p-5 shadow-sm space-y-4">
                                    <h4 className="text-[11px] font-black uppercase text-analyst-800 pb-2 border-b border-slate-100 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-sm">playlist_add</span>
                                        Detalle del Pedido
                                    </h4>

                                    <div className="space-y-3">
                                        <div className="space-y-1">
                                            <label className="text-[8px] font-black text-analyst-400 uppercase tracking-wider">Preventista que levanta</label>
                                            <select
                                                value={orderForm.seller_id}
                                                onChange={(e) => setOrderForm(prev => ({ ...prev, seller_id: e.target.value }))}
                                                className="w-full border-analyst-200 bg-analyst-50 rounded-lg text-[10px] font-bold"
                                            >
                                                <option value="">- SELECCIONAR PREVENTISTA -</option>
                                                {sellers.map(s => (
                                                    <option key={s.id} value={s.id}>{s.name}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[8px] font-black text-analyst-400 uppercase tracking-wider">Negocio / Cliente</label>
                                            <select
                                                value={orderForm.shop_id}
                                                onChange={(e) => setOrderForm(prev => ({ ...prev, shop_id: e.target.value }))}
                                                className="w-full border-analyst-200 bg-analyst-50 rounded-lg text-[10px] font-bold"
                                            >
                                                <option value="">- SELECCIONAR NEGOCIO -</option>
                                                {shops.map(sh => (
                                                    <option key={sh.id} value={sh.id}>{sh.name} ({sh.address})</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[8px] font-black text-analyst-400 uppercase tracking-wider">Tarifa de Precio</label>
                                            <select
                                                value={orderForm.price_tier}
                                                onChange={(e) => {
                                                    const tier = e.target.value;
                                                    setOrderForm(prev => {
                                                        const updatedItems = prev.items.map(it => {
                                                            const match = variants.find(v => v.id === it.variant_id);
                                                            return { ...it, price_unit: match ? (match[tier] || match.price_unit) : it.price_unit };
                                                        });
                                                        return { ...prev, price_tier: tier, items: updatedItems };
                                                    });
                                                }}
                                                className="w-full border-analyst-200 bg-analyst-50 rounded-lg text-[10px] font-bold"
                                            >
                                                <option value="price_unit">Base / Minorista</option>
                                                <option value="price_bulk">Mayorista</option>
                                                <option value="price_business">Bussines</option>
                                                <option value="price_company">Company</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Cart list */}
                                    <div className="pt-4 border-t border-slate-100 space-y-2">
                                        <label className="text-[8px] font-black text-analyst-400 uppercase tracking-wider">Productos Seleccionados</label>
                                        {orderForm.items.length === 0 ? (
                                            <p className="text-[9px] font-bold text-analyst-300 uppercase py-6 text-center">El carro está vacío. Añade productos de la lista.</p>
                                        ) : (
                                            <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1 custom-scrollbar">
                                                {orderForm.items.map((it, index) => (
                                                    <div key={index} className="p-2.5 bg-slate-50 border border-analyst-100 rounded-lg flex items-center justify-between gap-2 text-[10px] font-bold">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="truncate uppercase text-slate-800 leading-tight">{it.name}</p>
                                                            <p className="text-[7.5px] font-mono text-analyst-400 mt-0.5">Precio: ${it.price_unit.toFixed(2)}</p>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                value={it.quantity}
                                                                onChange={(e) => updateCartQty(it.variant_id, parseInt(e.target.value) || 0)}
                                                                className="w-10 !h-6 p-1 text-center font-bold border-analyst-200 bg-white rounded"
                                                            />
                                                            <span className="w-16 text-right text-primary font-black">${(it.price_unit * it.quantity).toFixed(2)}</span>
                                                        </div>
                                                    </div>
                                                ))}

                                                <div className="pt-3 flex justify-between items-center text-xs font-black border-t border-slate-200 text-slate-800">
                                                    <span>TOTAL ESTIMADO:</span>
                                                    <span className="text-primary text-sm">${calculateOrderTotal().toFixed(2)}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={submitOrder}
                                        className="w-full py-2.5 bg-primary hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase transition-all shadow-md shadow-primary/10 mt-4"
                                    >
                                        Confirmar y Levantar Pedido
                                    </button>
                                </div>

                                {/* Right Side: Products Browser */}
                                <div className="lg:col-span-8 bg-white border border-analyst-150 rounded-2xl p-5 shadow-sm flex flex-col min-h-[500px]">
                                    <div className="flex justify-between items-center mb-4">
                                        <h4 className="text-[11px] font-black uppercase text-analyst-800 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-sm">search</span>
                                            Buscar Productos
                                        </h4>
                                        <input
                                            type="text"
                                            placeholder="Buscar por código, nombre o medida..."
                                            value={productSearch}
                                            onChange={(e) => setProductSearch(e.target.value)}
                                            className="w-64 border-analyst-200 bg-analyst-50 rounded-lg text-[10px] font-bold py-1.5 focus:ring-primary"
                                        />
                                    </div>

                                    <div className="flex-1 overflow-auto max-h-[550px] custom-scrollbar rounded-xl border border-analyst-150">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-analyst-900 text-white text-[8px] font-black uppercase">
                                                    <th className="px-4 py-2 w-24 text-center">CODIGO</th>
                                                    <th className="px-4 py-2">DESCRIPCION</th>
                                                    <th className="px-4 py-2 text-right w-24">PRECIO</th>
                                                    <th className="px-4 py-2 text-center w-20">STOCK</th>
                                                    <th className="px-4 py-2 text-center w-24">ACCIONES</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-analyst-100">
                                                {filteredVariants.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="5" className="text-center py-20 text-[9px] font-black text-analyst-300 uppercase">Sin resultados matching</td>
                                                    </tr>
                                                ) : (
                                                    filteredVariants.map(v => {
                                                        const currentPrice = v[orderForm.price_tier] || v.price_unit || 0;
                                                        return (
                                                            <tr key={v.id} className="text-[10px] hover:bg-slate-50/55 transition-colors font-bold">
                                                                <td className="px-4 py-2 text-center font-mono text-analyst-500 bg-slate-50/50">{v.code || '-'}</td>
                                                                <td className="px-4 py-2">
                                                                    <p className="text-analyst-900 uppercase font-black">{v.products?.name}</p>
                                                                    <p className="text-[8.5px] text-analyst-400 uppercase mt-0.5">{v.name}</p>
                                                                </td>
                                                                <td className="px-4 py-2 text-right text-primary font-black">${currentPrice.toFixed(2)}</td>
                                                                <td className="px-4 py-2 text-center">
                                                                    <span className={`px-2 py-0.5 rounded font-mono text-[9px] font-black ${v.stock <= 5 ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-green-50 text-green-600 border border-green-100'}`}>
                                                                        {v.stock || 0}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-2 text-center">
                                                                    <button
                                                                        onClick={() => addToCart(v)}
                                                                        disabled={v.stock <= 0}
                                                                        className="px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-primary transition-all text-[8.5px] font-black uppercase disabled:opacity-40"
                                                                    >
                                                                        Añadir +
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Modal for Packing Checklist */}
            {packingOrder && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg border border-slate-150 overflow-hidden flex flex-col p-6 space-y-4">
                        <div>
                            <h4 className="text-[12px] font-black uppercase text-slate-950 flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-sm text-primary">inventory_2</span>
                                Control de Preparación (Packing Slip)
                            </h4>
                            <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">PEDIDO #{packingOrder.id.substring(0, 8).toUpperCase()}</p>
                            <p className="text-[8.5px] font-medium text-slate-500 uppercase mt-0.5">Cliente: {packingOrder.negocios?.name} ({packingOrder.negocios?.address})</p>
                        </div>

                        <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar border-t border-b border-slate-100 py-3">
                            <label className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest">Lista de Empaque: Tilda cada bulto guardado</label>
                            
                            {packingOrder.order_items?.map(item => {
                                const isChecked = packingChecklist[item.id] === true;
                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => togglePackingItem(item.id)}
                                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 text-[10.5px] font-bold ${isChecked ? 'border-green-200 bg-green-50/40 text-green-800 shadow-sm' : 'border-slate-150 bg-white hover:border-slate-200 text-slate-800'}`}
                                    >
                                        <div className="flex-1 min-w-0 pr-4">
                                            <p className="uppercase truncate">{item.product_variants?.products?.name} ({item.product_variants?.name})</p>
                                            <p className="text-[7.5px] font-mono text-slate-400 mt-0.5">SKU: {item.product_variants?.code || 'S/N'}</p>
                                        </div>
                                        <div className="flex items-center gap-6 shrink-0">
                                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    type="button"
                                                    onClick={() => decreasePackingQty(item.id)}
                                                    className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-black text-slate-700"
                                                >
                                                    -
                                                </button>
                                                <span className="w-12 text-center text-[10px] font-black text-slate-700">
                                                    {item.quantity} / {item.original_quantity}
                                                </span>
                                                <button
                                                    type="button"
                                                    disabled={item.quantity >= item.original_quantity}
                                                    onClick={() => increasePackingQty(item.id)}
                                                    className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-black text-slate-700 disabled:opacity-40"
                                                >
                                                    +
                                                </button>
                                            </div>
                                            <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${isChecked ? 'bg-green-600 border-green-600 text-white' : 'border-slate-200 bg-white'}`}>
                                                {isChecked && <span className="material-symbols-outlined text-[14px] font-black">check</span>}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex gap-2 justify-end pt-2">
                            <button
                                onClick={() => setPackingOrder(null)}
                                className="px-5 py-2.5 border border-slate-200 rounded-xl text-[9px] font-black uppercase hover:bg-slate-50 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={finishPreparation}
                                disabled={!isPackingComplete()}
                                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase transition-colors shadow-lg shadow-blue-500/10 flex items-center gap-1"
                            >
                                <span className="material-symbols-outlined text-sm font-black">done_all</span>
                                Finalizar Empaque y Descontar Stock
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal for Assign Deliverer */}
            {assigningOrder && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm border border-slate-150 overflow-hidden flex flex-col p-6 space-y-4">
                        <div>
                            <h4 className="text-[12px] font-black uppercase text-slate-950">Asignar Reparto de Pedido</h4>
                            <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">PEDIDO #{String(assigningOrder.number || assigningOrder.id.slice(0,4)).toUpperCase()}</p>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[8px] font-black text-slate-400 uppercase">Seleccionar Repartidor / Entregador</label>
                            <select
                                value={selectedDelivererId}
                                onChange={(e) => setSelectedDelivererId(e.target.value)}
                                className="w-full border-slate-250 bg-slate-50 rounded-lg text-[10px] font-bold"
                            >
                                <option value="">- SELECCIONAR REPARTIDOR -</option>
                                {deliverers.filter(d => d.is_active).map(d => (
                                    <option key={d.id} value={d.id}>{d.name} ({d.vehicle})</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex gap-2 justify-end pt-2">
                            <button
                                onClick={() => setAssigningOrder(null)}
                                className="px-4 py-2 border border-slate-200 rounded-xl text-[9px] font-black uppercase hover:bg-slate-50 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => updateOrderStatus(assigningOrder.id, 'en transporte', selectedDelivererId)}
                                disabled={!selectedDelivererId}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[9px] font-black uppercase transition-colors disabled:opacity-40"
                            >
                                Despachar a Reparto
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal for Viewing Order Details */}
            {viewingOrder && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl border border-slate-150 overflow-hidden flex flex-col p-6 space-y-4">
                        <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                            <div>
                                <h4 className="text-[12px] font-black uppercase text-slate-950 flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-sm text-primary">receipt_long</span>
                                    Detalle Completo del Pedido
                                </h4>
                                <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">PEDIDO #{viewingOrder.id.substring(0, 8).toUpperCase()}</p>
                            </div>
                            <button
                                onClick={() => setViewingOrder(null)}
                                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-[10px] font-bold text-slate-600 uppercase">
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                                <p className="text-[8px] text-slate-400 font-black">Cliente / Negocio</p>
                                <p className="text-slate-950 font-black">{viewingOrder.negocios?.name}</p>
                                <p className="text-slate-500">{viewingOrder.negocios?.address}</p>
                                <p className="text-slate-500 font-mono">Tel: {viewingOrder.negocios?.phone || '-'}</p>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                                <p className="text-[8px] text-slate-400 font-black">Logística y Estado</p>
                                <p className="text-slate-950 flex items-center gap-1">
                                    Estado: 
                                    <span className={`px-2 py-0.5 rounded text-[8px] font-black ${getStatusClass(viewingOrder.status)}`}>
                                        {getStatusLabel(viewingOrder.status)}
                                    </span>
                                </p>
                                <p className="text-slate-500">Preventista: {viewingOrder.preventistas?.name || 'S/D'}</p>
                                <p className="text-slate-500">Chofer: {viewingOrder.entregadores?.name || 'No asignado'}</p>
                                {viewingOrder.status === 'no entregado' && (
                                    <p className="text-red-500 font-black mt-1 text-[8.5px] border-t border-red-100 pt-1">
                                        Falla: {viewingOrder.failure_reason || 'Sin especificar'}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-slate-150">
                            <table className="w-full text-left border-collapse text-[10px] font-bold">
                                <thead>
                                    <tr className="bg-slate-900 text-white text-[8px] font-black uppercase">
                                        <th className="px-4 py-2 w-24 text-center">CODIGO</th>
                                        <th className="px-4 py-2">DESCRIPCION</th>
                                        <th className="px-4 py-2 text-right w-24">P. UNITARIO</th>
                                        <th className="px-4 py-2 text-center w-20">CANT.</th>
                                        <th className="px-4 py-2 text-right w-24">SUBTOTAL</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {(viewingOrder.order_items || []).map(item => (
                                        <tr key={item.id} className="hover:bg-slate-50/50">
                                            <td className="px-4 py-2 text-center font-mono text-slate-500 bg-slate-50/50">{item.product_variants?.code || '-'}</td>
                                            <td className="px-4 py-2">
                                                <p className="text-slate-950 uppercase font-black">{item.product_variants?.products?.name}</p>
                                                <p className="text-[8.5px] text-slate-400 uppercase font-mono mt-0.5">{item.product_variants?.name}</p>
                                            </td>
                                            <td className="px-4 py-2 text-right font-mono">${(item.price_unit || 0).toFixed(2)}</td>
                                            <td className="px-4 py-2 text-center font-mono">{item.quantity}</td>
                                            <td className="px-4 py-2 text-right font-mono text-primary font-black">${(item.total || 0).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-between items-center text-xs font-black pt-2 text-slate-950">
                            <span>TOTAL PEDIDO:</span>
                            <span className="text-primary text-sm">${(viewingOrder.total || 0).toFixed(2)}</span>
                        </div>

                        <div className="flex justify-end pt-2">
                            <button
                                onClick={() => setViewingOrder(null)}
                                className="px-6 py-2 bg-slate-800 hover:bg-black text-white rounded-xl text-[9px] font-black uppercase transition-colors"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal for Registering Delivery Failure Reason */}
            {failingOrder && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm border border-slate-150 overflow-hidden flex flex-col p-6 space-y-4">
                        <div>
                            <h4 className="text-[12px] font-black uppercase text-red-600 flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-sm font-black">report</span>
                                Registrar Falla de Entrega
                            </h4>
                            <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">PEDIDO #{failingOrder.id.substring(0, 8).toUpperCase()}</p>
                            <p className="text-[8.5px] font-medium text-slate-500 uppercase mt-0.5">Cliente: {failingOrder.negocios?.name}</p>
                        </div>

                        <div className="space-y-4 text-[10px] font-bold">
                            <div className="space-y-1">
                                <label className="text-[8px] font-black text-slate-400 uppercase">Motivo del Rechazo / Falla</label>
                                <select
                                    value={failureReasonForm.reason}
                                    onChange={(e) => setFailureReasonForm(prev => ({ ...prev, reason: e.target.value }))}
                                    className="w-full border-slate-250 bg-slate-50 rounded-lg text-[10px] font-bold"
                                >
                                    <option value="Cliente Ausente / Local Cerrado">Cliente Ausente / Local Cerrado</option>
                                    <option value="Falta de Pago / Sin Dinero">Falta de Pago / Sin Dinero</option>
                                    <option value="Rechazado (No coincide pedido)">Rechazado (No coincide pedido)</option>
                                    <option value="Dirección Incorrecta">Dirección Incorrecta</option>
                                    <option value="Otro (Especificar)">Otro (Especificar)</option>
                                </select>
                            </div>

                            {failureReasonForm.reason === 'Otro (Especificar)' && (
                                <div className="space-y-1">
                                    <label className="text-[8px] font-black text-slate-400 uppercase">Especificar Motivo</label>
                                    <input
                                        type="text"
                                        required
                                        value={failureReasonForm.otherText}
                                        onChange={(e) => setFailureReasonForm(prev => ({ ...prev, otherText: e.target.value }))}
                                        className="w-full border-slate-200 bg-slate-50 rounded-lg text-xs"
                                        placeholder="Ej: Camión roto, cliente reprogramó, etc."
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2 justify-end pt-2">
                            <button
                                onClick={() => setFailingOrder(null)}
                                className="px-4 py-2 border border-slate-200 rounded-xl text-[9px] font-black uppercase hover:bg-slate-50 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    const finalReason = failureReasonForm.reason === 'Otro (Especificar)' 
                                        ? failureReasonForm.otherText 
                                        : failureReasonForm.reason;
                                    updateOrderStatus(failingOrder.id, 'no entregado', null, null, finalReason || 'Otro motivo');
                                }}
                                disabled={failureReasonForm.reason === 'Otro (Especificar)' && !failureReasonForm.otherText}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[9px] font-black uppercase transition-colors disabled:opacity-40"
                            >
                                Confirmar Falla
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OrderManager;
