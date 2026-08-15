import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import 'api_service.dart';

class EntregadorScreen extends StatefulWidget {
  final Map<String, dynamic> userInfo;
  const EntregadorScreen({Key? key, required this.userInfo}) : super(key: key);

  @override
  _EntregadorScreenState createState() => _EntregadorScreenState();
}

class _EntregadorScreenState extends State<EntregadorScreen> {
  bool _isLoading = false;
  List<dynamic> _orders = [];
  List<dynamic> _shops = [];
  bool _onlyTodayRoute = true;

  Future<void> _callShop(String? phone) async {
    if (phone == null || phone.trim().isEmpty) return;
    final cleanPhone = phone.replaceAll(RegExp(r'[^0-9+]'), '');
    final uri = Uri.parse('tel:$cleanPhone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  String _getTodayWeekdaySpanish() {
    final day = DateTime.now().weekday;
    switch (day) {
      case 1: return 'Lunes';
      case 2: return 'Martes';
      case 3: return 'Miércoles';
      case 4: return 'Jueves';
      case 5: return 'Viernes';
      case 6: return 'Sábado';
      case 7: return 'Domingo';
      default: return 'Lunes';
    }
  }

  Future<void> _openMap(dynamic latitude, dynamic longitude, String? address) async {
    final lat = double.tryParse(latitude?.toString() ?? '');
    final lng = double.tryParse(longitude?.toString() ?? '');
    Uri uri;
    if (lat != null && lng != null) {
      uri = Uri.parse('https://www.google.com/maps/search/?api=1&query=$lat,$lng');
    } else if (address != null && address.isNotEmpty) {
      uri = Uri.parse('https://www.google.com/maps/search/?api=1&query=${Uri.encodeComponent(address)}');
    } else {
      return;
    }
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  void initState() {
    super.initState();
    _loadOrders();
  }

  Future<void> _loadOrders() async {
    setState(() => _isLoading = true);
    try {
      final ordersData = await ApiService.getMobileOrders();
      final shopsData = await ApiService.getShops();
      setState(() {
        _orders = ordersData;
        _shops = shopsData;
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error cargando repartos: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _updateStatus(String orderId, String status) async {
    if (status == 'no entregado') {
      _showFailureReasonDialog(orderId);
      return;
    }

    setState(() => _isLoading = true);
    try {
      await ApiService.updateOrderStatus(orderId, status);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Entrega confirmada con éxito.')),
        );
      }
      _loadOrders();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error al actualizar estado: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _showFailureReasonDialog(String orderId) {
    final reasons = [
      'Negocio cerrado',
      'Cliente no tiene dinero',
      'Mercadería rechazada / Error pedido',
      'No se encontró la dirección',
      'Cliente postergó entrega',
    ];
    String selectedReason = reasons[0];

    showDialog(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setStateDialog) {
            return AlertDialog(
              title: const Text('Motivo del Fallo de Entrega', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Color(0xFF0F172A))),
              backgroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
              content: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFF1F5F9),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButtonFormField<String>(
                    isExpanded: true,
                    dropdownColor: Colors.white,
                    value: selectedReason,
                    items: reasons.map((r) => DropdownMenuItem(value: r, child: Text(r, style: const TextStyle(color: Color(0xFF0F172A), fontSize: 13, fontWeight: FontWeight.bold)))).toList(),
                    onChanged: (val) {
                      if (val != null) {
                        setStateDialog(() => selectedReason = val);
                      }
                    },
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Cancelar', style: TextStyle(color: Color(0xFF64748B), fontWeight: FontWeight.bold)),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFEF4444),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: () async {
                    Navigator.of(context).pop();
                    setState(() => _isLoading = true);
                    try {
                      await ApiService.updateOrderStatus(orderId, 'no entregado', failureReason: selectedReason);
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Estado actualizado a no entregado.')),
                        );
                      }
                      _loadOrders();
                    } catch (e) {
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Error al fallar entrega: $e')),
                        );
                      }
                    } finally {
                      if (mounted) {
                        setState(() => _isLoading = false);
                      }
                    }
                  },
                  child: const Text('Confirmar Fallo', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ),
              ],
            );
          }
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final themeColor = const Color(0xFF4F46E5);

    final activeOrders = _orders.where((o) => o['status'] == 'en transporte').toList();
    final completedOrders = _orders.where((o) => o['status'] == 'entregado' || o['status'] == 'no entregado').toList();

    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: Text('Chofer: ${widget.userInfo['name']}'),
          backgroundColor: themeColor,
          actions: [
            IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: _loadOrders,
            ),
            IconButton(
              icon: const Icon(Icons.logout),
              onPressed: () async {
                await ApiService.logout();
                if (mounted) {
                  Navigator.of(context).pushReplacementNamed('/login');
                }
              },
            ),
          ],
          bottom: const TabBar(
            indicatorColor: Colors.white,
            labelColor: Colors.white,
            unselectedLabelColor: Colors.white70,
            indicatorSize: TabBarIndicatorSize.tab,
            tabs: [
              Tab(icon: Icon(Icons.local_shipping), text: 'Hoja de Ruta'),
              Tab(icon: Icon(Icons.store), text: 'Comercios'),
              Tab(icon: Icon(Icons.check_circle), text: 'Completados'),
            ],
          ),
        ),
        body: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : TabBarView(
                children: [
                  _buildOrdersList(activeOrders, themeColor, isActive: true),
                  _buildShopsTab(themeColor),
                  _buildOrdersList(completedOrders, themeColor, isActive: false),
                ],
              ),
      ),
    );
  }

  Widget _buildOrdersList(List<dynamic> list, Color themeColor, {required bool isActive}) {
    if (list.isEmpty) {
      return Center(
        child: Text(isActive ? 'No tienes entregas pendientes asignadas.' : 'No tienes entregas completadas hoy.', style: const TextStyle(color: Color(0xFF64748B))),
      );
    }

    return ListView.builder(
      itemCount: list.length,
      itemBuilder: (context, index) {
        final order = list[index];
        final total = double.tryParse(order['total'].toString()) ?? 0.0;
        final date = DateTime.tryParse(order['created_at'].toString()) ?? DateTime.now();
        final formattedDate = DateFormat('dd/MM/yyyy HH:mm').format(date);
        final shop = order['negocios'] ?? {};
        final address = shop['address'] ?? 'Sin dirección';

        return Card(
          elevation: 4,
          shadowColor: Colors.black.withOpacity(0.04),
          margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          color: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          child: ExpansionTile(
            title: Text(
              '${shop['name']?.toString().toUpperCase() ?? 'Negocio Desconocido'} (#${order['id'].toString().substring(0, 8).toUpperCase()})',
              style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13, color: Color(0xFF0F172A)),
            ),
            subtitle: Text('$address\nFecha: $formattedDate - \$${total.toStringAsFixed(2)}', style: const TextStyle(fontSize: 11, color: Color(0xFF64748B))),
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (shop['owner'] != null) ...[
                      Text('Contacto: ${shop['owner']} (${shop['phone'] ?? '-'})', style: const TextStyle(fontSize: 11.5, color: Color(0xFF475569))),
                      const SizedBox(height: 4),
                    ],
                    if (shop['latitude'] != null || shop['address'] != null) ...[
                      const SizedBox(height: 8),
                      ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF4F46E5).withOpacity(0.08),
                          foregroundColor: const Color(0xFF4F46E5),
                          elevation: 0,
                          minimumSize: const Size(double.infinity, 38),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        onPressed: () => _openMap(shop['latitude'], shop['longitude'], shop['address']),
                        icon: const Icon(Icons.map, size: 14),
                        label: const Text('VER UBICACIÓN EN MAPA', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w900)),
                      ),
                      const SizedBox(height: 8),
                    ],
                    const Divider(color: Color(0xFFF1F5F9)),
                    const Text('DETALLE DE MERCADERÍA:', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 10, color: Color(0xFF94A3B8), letterSpacing: 0.5)),
                    const SizedBox(height: 6),
                    Column(
                      children: (order['order_items'] as List).map<Widget>((it) {
                        final qty = it['quantity'];
                        final vName = it['product_variants']?['name'] ?? 'Variante';
                        final pName = it['product_variants']?['products']?['name'] ?? 'Producto';

                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 2),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('$qty x $pName ($vName)', style: const TextStyle(fontSize: 11, color: Color(0xFF475569))),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
                    if (isActive) ...[
                      const Divider(height: 24, color: Color(0xFFF1F5F9)),
                      Row(
                        children: [
                          Expanded(
                            child: ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFFEF4444),
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(vertical: 12),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              ),
                              onPressed: () => _updateStatus(order['id'], 'no entregado'),
                              child: const Text('Fallo de Entrega', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Container(
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(12),
                                gradient: const LinearGradient(colors: [Color(0xFF10B981), Color(0xFF059669)]),
                              ),
                              child: ElevatedButton(
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: Colors.transparent,
                                  shadowColor: Colors.transparent,
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(vertical: 12),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                ),
                                onPressed: () => _updateStatus(order['id'], 'entregado'),
                                child: const Text('Confirmar Entrega', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ] else ...[
                      const Divider(color: Color(0xFFF1F5F9)),
                      Row(
                        children: [
                          const Text('Estado: ', style: TextStyle(fontSize: 11, color: Color(0xFF64748B))),
                          Text(
                            order['status'].toString().toUpperCase(),
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w900,
                              color: order['status'] == 'entregado' ? const Color(0xFF10B981) : const Color(0xFFEF4444),
                            ),
                          ),
                        ],
                      ),
                      if (order['failure_reason'] != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(
                            'Motivo de fallo: ${order['failure_reason']}',
                            style: const TextStyle(color: Color(0xFFEF4444), fontWeight: FontWeight.bold, fontSize: 10.5),
                          ),
                        ),
                    ]
                  ],
                ),
              )
            ],
          ),
        );
      },
    );
  }

  Widget _buildShopsTab(Color themeColor) {
    final todaySpanish = _getTodayWeekdaySpanish();
    final displayedShops = _onlyTodayRoute
        ? _shops.where((s) {
            final days = s['visiting_days'];
            if (days is List) {
              return days.contains(todaySpanish);
            }
            return false;
          }).toList()
        : _shops;

    return Column(
      children: [
        // Tab Header with Segmented Toggle
        Container(
          padding: const EdgeInsets.all(16),
          color: Colors.white,
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _onlyTodayRoute ? const Color(0xFF4F46E5) : const Color(0xFFF1F5F9),
                        foregroundColor: _onlyTodayRoute ? Colors.white : const Color(0xFF475569),
                        elevation: 0,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      onPressed: () => setState(() => _onlyTodayRoute = true),
                      child: Text('HOY: ${todaySpanish.toUpperCase()}', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: !_onlyTodayRoute ? const Color(0xFF4F46E5) : const Color(0xFFF1F5F9),
                        foregroundColor: !_onlyTodayRoute ? Colors.white : const Color(0xFF475569),
                        elevation: 0,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      onPressed: () => setState(() => _onlyTodayRoute = false),
                      child: const Text('TODOS LOS CLIENTES', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold)),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),

        // Shops List
        Expanded(
          child: displayedShops.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.storefront, size: 64, color: Colors.grey[300]),
                        const SizedBox(height: 16),
                        Text(
                          _onlyTodayRoute ? 'No tienes visitas programadas para hoy.' : 'No hay comercios registrados.',
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Color(0xFF64748B), fontSize: 13),
                        ),
                      ],
                    ),
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(12),
                  itemCount: displayedShops.length,
                  itemBuilder: (context, index) {
                    final s = displayedShops[index];

                    return Card(
                      elevation: 4,
                      shadowColor: Colors.black.withOpacity(0.04),
                      margin: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
                      color: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              s['name'].toString().toUpperCase(),
                              style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13, color: Color(0xFF0F172A)),
                            ),
                            const SizedBox(height: 4),
                            Text('Dirección: ${s['address']}', style: const TextStyle(fontSize: 11, color: Color(0xFF64748B))),
                            if (s['owner'] != null && s['owner'].toString().trim().isNotEmpty)
                              Text('Titular: ${s['owner']}', style: const TextStyle(fontSize: 11, color: Color(0xFF64748B))),
                            if (s['phone'] != null && s['phone'].toString().trim().isNotEmpty)
                              Text('Teléfono: ${s['phone']}', style: const TextStyle(fontSize: 11, color: Color(0xFF64748B))),

                            // Scheduled Days Badges
                            if (s['visiting_days'] != null && (s['visiting_days'] as List).isNotEmpty) ...[
                              const SizedBox(height: 8),
                              Wrap(
                                spacing: 4,
                                runSpacing: 4,
                                children: (s['visiting_days'] as List).map<Widget>((day) {
                                  final isToday = day == todaySpanish;
                                  return Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: isToday ? const Color(0xFF10B981).withOpacity(0.12) : const Color(0xFFF1F5F9),
                                      borderRadius: BorderRadius.circular(6),
                                      border: Border.all(color: isToday ? const Color(0xFF10B981).withOpacity(0.3) : const Color(0xFFE2E8F0)),
                                    ),
                                    child: Text(
                                      day.toString().substring(0, 3).toUpperCase(),
                                      style: TextStyle(
                                        fontSize: 8.5,
                                        fontWeight: FontWeight.w900,
                                        color: isToday ? const Color(0xFF059669) : const Color(0xFF64748B),
                                      ),
                                    ),
                                  );
                                }).toList(),
                              ),
                            ],

                            const Divider(height: 24, color: Color(0xFFF1F5F9)),

                            // Quick Action Buttons
                            Row(
                              children: [
                                if (s['phone'] != null && s['phone'].toString().trim().isNotEmpty) ...[
                                  Expanded(
                                    child: OutlinedButton.icon(
                                      style: OutlinedButton.styleFrom(
                                        padding: const EdgeInsets.symmetric(vertical: 10),
                                        side: const BorderSide(color: Color(0xFFCBD5E1)),
                                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                      ),
                                      onPressed: () => _callShop(s['phone']),
                                      icon: const Icon(Icons.phone, size: 14, color: Color(0xFF64748B)),
                                      label: const Text('LLAMAR', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                ],
                                Expanded(
                                  child: Container(
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(12),
                                      gradient: const LinearGradient(colors: [Color(0xFF4F46E5), Color(0xFF3B82F6)]),
                                    ),
                                    child: ElevatedButton.icon(
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: Colors.transparent,
                                        shadowColor: Colors.transparent,
                                        foregroundColor: Colors.white,
                                        padding: const EdgeInsets.symmetric(vertical: 10),
                                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                      ),
                                      onPressed: () => _openMap(s['latitude'], s['longitude'], s['address']),
                                      icon: const Icon(Icons.map, size: 14),
                                      label: const Text('VER EN MAPA', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold)),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

