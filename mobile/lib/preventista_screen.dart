import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'api_service.dart';
import 'main.dart';

class PreventistaScreen extends StatefulWidget {
  final Map<String, dynamic> userInfo;
  const PreventistaScreen({Key? key, required this.userInfo}) : super(key: key);

  @override
  _PreventistaScreenState createState() => _PreventistaScreenState();
}

class _PreventistaScreenState extends State<PreventistaScreen> {
  int _currentTab = 0;
  bool _isLoading = false;
  List<dynamic> _shops = [];
  List<dynamic> _products = [];
  List<dynamic> _variants = [];
  List<dynamic> _orders = [];

  // Cart State
  Map<String, dynamic>? _selectedShop;
  final Map<String, Map<String, dynamic>> _cart = {}; // variant_id -> {variant, quantity}

  // Filter states
  String _searchQuery = '';
  String _selectedFamily = 'Todas';

  @override
  void initState() {
    super.initState();
    _loadInitialData();
  }

  Future<void> _loadInitialData() async {
    setState(() => _isLoading = true);
    try {
      final shopsData = await ApiService.getShops();
      final productsData = await ApiService.getProducts();
      final variantsData = await ApiService.getVariants();
      final ordersData = await ApiService.getMobileOrders();

      setState(() {
        _shops = shopsData;
        _products = productsData;
        _variants = variantsData;
        _orders = ordersData;
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error cargando datos: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _addToCart(dynamic variant, dynamic product) {
    setState(() {
      final id = variant['id'].toString();
      if (_cart.containsKey(id)) {
        _cart[id]!['quantity'] = _cart[id]!['quantity'] + 1;
      } else {
        _cart[id] = {
          'variant': variant,
          'product': product,
          'quantity': 1,
        };
      }
    });
  }

  void _removeFromCart(String variantId) {
    setState(() {
      if (_cart.containsKey(variantId)) {
        if (_cart[variantId]!['quantity'] > 1) {
          _cart[variantId]!['quantity'] = _cart[variantId]!['quantity'] - 1;
        } else {
          _cart.remove(variantId);
        }
      }
    });
  }

  double _getCartTotal() {
    double total = 0;
    _cart.forEach((key, item) {
      final price = double.tryParse(item['variant']['price_unit'].toString()) ?? 0.0;
      total += price * item['quantity'];
    });
    return total;
  }

  Future<void> _submitOrder() async {
    if (_selectedShop == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Selecciona un negocio para el pedido.')),
      );
      return;
    }
    if (_cart.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('El carrito está vacío.')),
      );
      return;
    }

    setState(() => _isLoading = true);
    try {
      final items = _cart.values.map((item) {
        return {
          'variant_id': item['variant']['id'],
          'quantity': item['quantity'],
          'price_unit': double.tryParse(item['variant']['price_unit'].toString()) ?? 0.0,
        };
      }).toList();

      await ApiService.createOrder({
        'seller_id': widget.userInfo['id'],
        'shop_id': _selectedShop!['id'],
        'items': items,
        'status': 'pendiente',
      });

      setState(() {
        _cart.clear();
        _selectedShop = null;
        _currentTab = 1; // Go to History tab
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('¡Pedido enviado con éxito!')),
        );
      }

      _loadInitialData();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error al enviar el pedido: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final themeColor = Colors.cyan.shade700;

    return Scaffold(
      appBar: AppBar(
        title: Text('Preventista: ${widget.userInfo['name']}'),
        backgroundColor: themeColor,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadInitialData,
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
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _currentTab == 0
              ? _buildNewOrderTab(themeColor)
              : _buildHistoryTab(themeColor),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentTab,
        selectedItemColor: themeColor,
        onTap: (index) => setState(() => _currentTab = index),
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.add_shopping_cart),
            label: 'Nuevo Pedido',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.history),
            label: 'Historial',
          ),
        ],
      ),
    );
  }

  Widget _buildNewOrderTab(Color themeColor) {
    final families = ['Todas', ..._products.map((p) => p['families']?['name'] ?? 'Varios').toSet().where((f) => f != null)];

    final filteredProducts = _products.where((p) {
      final name = p['name'].toString().toLowerCase();
      final family = p['families']?['name'] ?? 'Varios';
      final matchesSearch = name.contains(_searchQuery.toLowerCase());
      final matchesFamily = _selectedFamily == 'Todas' || family == _selectedFamily;
      return matchesSearch && matchesFamily;
    }).toList();

    return Column(
      children: [
        // 1. Shop Picker Section
        Container(
          padding: const EdgeInsets.all(12),
          color: AppColors.slate.withOpacity(0.1),
          child: Row(
            children: [
              const Icon(Icons.store, color: AppColors.slatePlay),
              const SizedBox(width: 8),
              Expanded(
                child: DropdownButton<dynamic>(
                  isExpanded: true,
                  dropdownColor: const Color(0xFF1E293B),
                  hint: const Text('Seleccionar Negocio / Cliente'),
                  value: _selectedShop,
                  items: _shops.map<DropdownMenuItem<dynamic>>((shop) {
                    return DropdownMenuItem<dynamic>(
                      value: shop,
                      child: Text('${shop['name']} (${shop['address']})', style: const TextStyle(color: Colors.white, fontSize: 12)),
                    );
                  }).toList(),
                  onChanged: (val) {
                    setState(() => _selectedShop = val);
                  },
                ),
              ),
            ],
          ),
        ),

        // 2. Filters Row
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            children: [
              Expanded(
                flex: 2,
                child: TextField(
                  decoration: const InputDecoration(
                    hintText: 'Buscar productos...',
                    prefixIcon: Icon(Icons.search, size: 20),
                    isDense: true,
                    contentPadding: EdgeInsets.zero,
                    border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(8))),
                  ),
                  onChanged: (val) => setState(() => _searchQuery = val),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: DropdownButtonFormField<dynamic>(
                  value: _selectedFamily,
                  dropdownColor: const Color(0xFF1E293B),
                  decoration: const InputDecoration(
                    isDense: true,
                    contentPadding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(8))),
                  ),
                  items: families.map((f) => DropdownMenuItem<dynamic>(value: f, child: Text(f ?? 'Varios', style: const TextStyle(fontSize: 10, color: Colors.white)))).toList(),
                  onChanged: (val) => setState(() => _selectedFamily = val?.toString() ?? 'Todas'),
                ),
              ),
            ],
          ),
        ),

        // 3. Products Catalog list
        Expanded(
          child: ListView.builder(
            itemCount: filteredProducts.length,
            itemBuilder: (context, index) {
              final prod = filteredProducts[index];
              final prodId = prod['id'];
              final prodVariants = _variants.where((v) => v['product_id'] == prodId).toList();

              return Card(
                margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        prod['name'].toString().toUpperCase(),
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppColors.blueGrey),
                      ),
                      if (prod['description'] != null)
                        Text(
                          prod['description'],
                          style: TextStyle(fontSize: 10, color: Colors.grey.shade400),
                        ),
                      const Divider(height: 12),
                      Column(
                        children: prodVariants.map((v) {
                          final price = double.tryParse(v['price_unit'].toString()) ?? 0.0;
                          final vId = v['id'].toString();
                          final cartQty = _cart[vId]?['quantity'] ?? 0;

                          return Padding(
                            padding: const EdgeInsets.symmetric(vertical: 4),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Expanded(
                                  child: Text(
                                    v['name'],
                                    style: const TextStyle(fontSize: 11),
                                  ),
                                ),
                                Text(
                                  '\$${price.toStringAsFixed(2)}',
                                  style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.green, fontSize: 11),
                                ),
                                const SizedBox(width: 8),
                                if (cartQty > 0) ...[
                                  IconButton(
                                    icon: const Icon(Icons.remove_circle_outline, color: AppColors.red, size: 20),
                                    onPressed: () => _removeFromCart(vId),
                                    padding: EdgeInsets.zero,
                                    constraints: const BoxConstraints(),
                                  ),
                                  Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 8),
                                    child: Text('$cartQty', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                                  ),
                                ],
                                IconButton(
                                  icon: const Icon(Icons.add_circle, color: AppColors.blue, size: 20),
                                  onPressed: () => _addToCart(v, prod),
                                  padding: EdgeInsets.zero,
                                  constraints: const BoxConstraints(),
                                ),
                              ],
                            ),
                          );
                        }).toList(),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),

        // 4. Cart summary bar
        if (_cart.isNotEmpty)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              boxShadow: [
                BoxShadow(color: Colors.black.withOpacity(0.2), blurRadius: 4, offset: const Offset(0, -2))
              ],
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Total: \$${_getCartTotal().toStringAsFixed(2)}',
                        style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15, color: AppColors.green)),
                    Text('${_cart.length} productos agregados', style: const TextStyle(fontSize: 10, color: AppColors.slate)),
                  ],
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: themeColor),
                  onPressed: _submitOrder,
                  child: const Text('Confirmar Pedido', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _buildHistoryTab(Color themeColor) {
    if (_orders.isEmpty) {
      return const Center(child: Text('No has generado pedidos aún.'));
    }

    return ListView.builder(
      itemCount: _orders.length,
      itemBuilder: (context, index) {
        final order = _orders[index];
        final total = double.tryParse(order['total'].toString()) ?? 0.0;
        final date = DateTime.tryParse(order['created_at'].toString()) ?? DateTime.now();
        final formattedDate = DateFormat('dd/MM/yyyy HH:mm').format(date);
        final status = order['status'].toString().toUpperCase();

        Color statusColor = AppColors.orange;
        if (status == 'ENTREGADO') statusColor = AppColors.green;
        if (status == 'CANCELADO' || status == 'FALLIDO') statusColor = AppColors.red;
        if (status == 'REPARTO') statusColor = AppColors.blue;

        return Card(
          margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: ExpansionTile(
            title: Text(
              order['negocios']?['name']?.toString().toUpperCase() ?? 'Negocio Desconocido',
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
            ),
            subtitle: Text('$formattedDate - \$${total.toStringAsFixed(2)}'),
            trailing: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(color: statusColor.withOpacity(0.15), borderRadius: BorderRadius.circular(8)),
              child: Text(status, style: TextStyle(color: statusColor, fontWeight: FontWeight.bold, fontSize: 9)),
            ),
            children: [
              Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('PRODUCTOS:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 10, color: AppColors.slate)),
                    const SizedBox(height: 4),
                    Column(
                      children: (order['order_items'] as List).map<Widget>((it) {
                        final qty = it['quantity'];
                        final price = double.tryParse(it['price_unit'].toString()) ?? 0.0;
                        final subtotal = qty * price;
                        final vName = it['product_variants']?['name'] ?? 'Variante';
                        final pName = it['product_variants']?['products']?['name'] ?? 'Producto';

                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 2),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('$qty x $pName ($vName)', style: const TextStyle(fontSize: 11)),
                              Text('\$${subtotal.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 11)),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
                    if (order['failure_reason'] != null) ...[
                      const Divider(),
                      Text(
                        'Motivo de fallo: ${order['failure_reason']}',
                        style: const TextStyle(color: AppColors.red, fontWeight: FontWeight.bold, fontSize: 10),
                      ),
                    ],
                  ],
                ),
              )
            ],
          ),
        );
      },
    );
  }
}
