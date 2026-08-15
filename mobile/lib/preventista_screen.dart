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

  // Wizard / Order States
  bool _orderActive = false;
  int _wizardLevel = 0; // 0 = Cliente, 1 = Familias, 2 = Grupos, 3 = Productos
  Map<String, dynamic>? _selectedShop;
  String? _selectedFamilyId;
  String? _selectedFamilyName;
  String? _selectedGroupId;
  String? _selectedGroupName;
  String? _editingOrderId;

  // Cart State (variant_id -> {variant, product, quantity})
  final Map<String, Map<String, dynamic>> _cart = {};

  double _getVariantPrice(dynamic variant) {
    final priceKey = _selectedShop?['price_list']?.toString() ?? 'price_unit';
    return double.tryParse(variant[priceKey]?.toString() ?? '') ?? double.tryParse(variant['price_unit']?.toString() ?? '') ?? 0.0;
  }

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

  void _addToCart(dynamic variant, dynamic product, {int qty = 1}) {
    setState(() {
      final id = variant['id'].toString();
      if (_cart.containsKey(id)) {
        _cart[id]!['quantity'] = _cart[id]!['quantity'] + qty;
      } else {
        _cart[id] = {
          'variant': variant,
          'product': product,
          'quantity': qty,
        };
      }
      if (_cart[id]!['quantity'] <= 0) {
        _cart.remove(id);
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

  void _updateCartQty(dynamic variant, dynamic product, int newQty) {
    setState(() {
      final id = variant['id'].toString();
      if (newQty <= 0) {
        _cart.remove(id);
      } else {
        _cart[id] = {
          'variant': variant,
          'product': product,
          'quantity': newQty,
        };
      }
    });
  }

  double _getCartTotal() {
    double total = 0;
    _cart.forEach((key, item) {
      final price = _getVariantPrice(item['variant']);
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
          'price_unit': _getVariantPrice(item['variant']),
        };
      }).toList();

      if (_editingOrderId != null) {
        await ApiService.updateOrder(_editingOrderId!, {
          'shop_id': _selectedShop!['id'],
          'items': items,
        });
      } else {
        await ApiService.createOrder({
          'seller_id': widget.userInfo['id'],
          'shop_id': _selectedShop!['id'],
          'items': items,
          'status': 'pendiente',
        });
      }

      setState(() {
        _cart.clear();
        _selectedShop = null;
        _editingOrderId = null;
        _orderActive = false;
        _wizardLevel = 0;
        _currentTab = 1; // Go to History tab
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_editingOrderId != null ? '¡Pedido actualizado con éxito!' : '¡Pedido enviado con éxito!')),
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

  void _resetOrder() {
    setState(() {
      _cart.clear();
      _selectedShop = null;
      _selectedFamilyId = null;
      _selectedGroupId = null;
      _editingOrderId = null;
      _orderActive = false;
      _wizardLevel = 0;
    });
  }

  IconData _getIconData(String? iconName) {
    switch (iconName) {
      case 'construction': return Icons.construction;
      case 'grid_view': return Icons.grid_view;
      case 'category': return Icons.category;
      case 'layers': return Icons.layers;
      case 'inventory_2': return Icons.inventory_2;
      case 'handyman': return Icons.handyman;
      case 'hardware': return Icons.hardware;
      default: return Icons.category_outlined;
    }
  }

  Color _hexToColor(String? hexString) {
    if (hexString == null || hexString.isEmpty) return Colors.cyan;
    final buffer = StringBuffer();
    if (hexString.length == 7) buffer.write('ff');
    buffer.write(hexString.replaceFirst('#', ''));
    return Color(int.parse(buffer.toString(), radix: 16));
  }

  @override
  Widget build(BuildContext context) {
    final themeColor = Colors.cyan.shade700;

    return Scaffold(
      appBar: AppBar(
        title: Text('Vendedor: ${widget.userInfo['name']}'),
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
              ? _buildOrderWizard(themeColor)
              : _buildHistoryTab(themeColor),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentTab,
        selectedItemColor: themeColor,
        onTap: (index) => setState(() {
          _currentTab = index;
          if (index == 1) {
            _resetOrder();
          }
        }),
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.add_shopping_cart),
            label: 'Pedido',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.history),
            label: 'Historial',
          ),
        ],
      ),
    );
  }

  // WIZARD ROUTING
  Widget _buildOrderWizard(Color themeColor) {
    if (!_orderActive) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.playlist_add_check_outlined, size: 100, color: AppColors.slate),
              const SizedBox(height: 16),
              const Text(
                'Generador de Pedidos',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white),
              ),
              const SizedBox(height: 8),
              const Text(
                'Presiona el botón para comenzar a levantar un nuevo pedido.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: AppColors.slate),
              ),
              const SizedBox(height: 32),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: themeColor,
                  padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(30)),
                ),
                onPressed: () => setState(() => _orderActive = true),
                child: const Text(
                  'EMPEZAR NUEVO PEDIDO',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white, letterSpacing: 1),
                ),
              ),
            ],
          ),
        ),
      );
    }

    switch (_wizardLevel) {
      case 0:
        return _buildShopSelectorStep(themeColor);
      case 1:
        return _buildFamiliesStep(themeColor);
      case 2:
        return _buildGroupsStep(themeColor);
      case 3:
        return _buildProductsStep(themeColor);
      default:
        return _buildShopSelectorStep(themeColor);
    }
  }

  // STEP 0: SELECT CLIENT
  Widget _buildShopSelectorStep(Color themeColor) {
    return Padding(
      padding: const EdgeInsets.all(20.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Text(
            'SELECCIONAR CLIENTE',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, letterSpacing: 1),
          ),
          const SizedBox(height: 24),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(12),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<dynamic>(
                isExpanded: true,
                dropdownColor: const Color(0xFF1E293B),
                hint: const Text('Toca para buscar negocio...'),
                value: _selectedShop,
                items: _shops.map<DropdownMenuItem<dynamic>>((shop) {
                  return DropdownMenuItem<dynamic>(
                    value: shop,
                    child: Text('${shop['name']} (${shop['address']})', style: const TextStyle(fontSize: 13, color: Colors.white)),
                  );
                }).toList(),
                onChanged: (val) {
                  setState(() => _selectedShop = val);
                },
              ),
            ),
          ),
          const SizedBox(height: 32),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    side: const BorderSide(color: Colors.grey),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: _resetOrder,
                  child: const Text('CANCELAR', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: themeColor,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: _selectedShop == null
                      ? null
                      : () => setState(() => _wizardLevel = 1),
                  child: const Text('SIGUIENTE', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // STEP 1: FAMILIES GRID
  Widget _buildFamiliesStep(Color themeColor) {
    // Extract unique families from products
    final familiesMap = <String, Map<String, dynamic>>{};
    for (var p in _products) {
      final f = p['families'];
      if (f != null) {
        familiesMap[f['id'].toString()] = f;
      }
    }
    final uniqueFamilies = familiesMap.values.toList();

    return Column(
      children: [
        _buildWizardHeader('Familias', 'Selecciona una categoría principal'),
        Expanded(
          child: GridView.builder(
            padding: const EdgeInsets.all(16),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 16,
              mainAxisSpacing: 16,
              childAspectRatio: 1.1,
            ),
            itemCount: uniqueFamilies.length,
            itemBuilder: (context, index) {
              final fam = uniqueFamilies[index];
              final color = _hexToColor(fam['color']);

              return InkWell(
                onTap: () {
                  setState(() {
                    _selectedFamilyId = fam['id'].toString();
                    _selectedFamilyName = fam['name'];
                    _wizardLevel = 2; // Go to Groups
                  });
                },
                child: Container(
                  decoration: BoxDecoration(
                    color: const Color(0xFF1E293B),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: color.withOpacity(0.3), width: 1.5),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(_getIconData(fam['icon']), size: 40, color: color),
                      const SizedBox(height: 12),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        child: Text(
                          fam['name'].toString().toUpperCase(),
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 11, color: Colors.white),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        _buildCancelBottomButton(),
      ],
    );
  }

  // STEP 2: GROUPS GRID
  Widget _buildGroupsStep(Color themeColor) {
    // Extract unique groups belonging to selected family
    final groupsMap = <String, Map<String, dynamic>>{};
    for (var p in _products) {
      if (p['family_id']?.toString() == _selectedFamilyId) {
        final g = p['groups'];
        if (g != null) {
          groupsMap[g['id'].toString()] = g;
        }
      }
    }
    final uniqueGroups = groupsMap.values.toList();

    return Column(
      children: [
        _buildWizardHeader(
          'Grupos - $_selectedFamilyName',
          'Selecciona una subcategoría',
          backAction: () => setState(() => _wizardLevel = 1),
        ),
        Expanded(
          child: uniqueGroups.isEmpty
              ? const Center(child: Text('No hay grupos en esta familia.'))
              : GridView.builder(
                  padding: const EdgeInsets.all(16),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    crossAxisSpacing: 16,
                    mainAxisSpacing: 16,
                    childAspectRatio: 1.2,
                  ),
                  itemCount: uniqueGroups.length,
                  itemBuilder: (context, index) {
                    final grp = uniqueGroups[index];
                    return InkWell(
                      onTap: () {
                        setState(() {
                          _selectedGroupId = grp['id'].toString();
                          _selectedGroupName = grp['name'];
                          _wizardLevel = 3; // Go to Products
                        });
                      },
                      child: Container(
                        decoration: BoxDecoration(
                          color: const Color(0xFF1E293B),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: Colors.white10),
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.folder_open, size: 30, color: AppColors.slate),
                            const SizedBox(height: 8),
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 8),
                              child: Text(
                                grp['name'].toString().toUpperCase(),
                                textAlign: TextAlign.center,
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 11, color: Colors.white),
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
        _buildCancelBottomButton(),
      ],
    );
  }

  // STEP 3: SIMPLIFIED PRODUCTS LIST
  Widget _buildProductsStep(Color themeColor) {
    final filteredProducts = _products.where((p) {
      return p['group_id']?.toString() == _selectedGroupId &&
          p['family_id']?.toString() == _selectedFamilyId;
    }).toList();

    return Column(
      children: [
        _buildWizardHeader(
          '$_selectedGroupName',
          'Toca un artículo para definir cantidades',
          backAction: () => setState(() => _wizardLevel = 2),
        ),
        Expanded(
          child: filteredProducts.isEmpty
              ? const Center(child: Text('No hay productos en este grupo.'))
              : ListView.builder(
                  padding: const EdgeInsets.all(12),
                  itemCount: filteredProducts.length,
                  itemBuilder: (context, index) {
                    final prod = filteredProducts[index];
                    final prodId = prod['id'];
                    final prodVariants = _variants.where((v) => v['product_id'] == prodId).toList();

                    // Calculate items of this product already in cart
                    int cartCount = 0;
                    for (var v in prodVariants) {
                      cartCount += _cart[v['id'].toString()]?['quantity'] as int? ?? 0;
                    }

                    return Card(
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      child: ListTile(
                        onTap: () => _showVariantPickerModal(prod, prodVariants),
                        title: Text(
                          prod['name'].toString().toUpperCase(),
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Colors.white),
                        ),
                        subtitle: prod['description'] != null
                            ? Text(prod['description'], style: const TextStyle(fontSize: 10, color: AppColors.slate))
                            : null,
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (cartCount > 0)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                decoration: BoxDecoration(color: Colors.green.withOpacity(0.2), borderRadius: BorderRadius.circular(12)),
                                child: Text('$cartCount agregados', style: const TextStyle(color: Colors.green, fontWeight: FontWeight.bold, fontSize: 10)),
                              ),
                            const SizedBox(width: 8),
                            const Icon(Icons.arrow_forward_ios, size: 12, color: AppColors.slate),
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
        _buildCartBottomBar(themeColor),
      ],
    );
  }

  // HELPER HEADERS AND BUTTONS
  Widget _buildWizardHeader(String title, String subtitle, {VoidCallback? backAction}) {
    return Container(
      padding: const EdgeInsets.all(12),
      color: const Color(0xFF1E293B),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              if (backAction != null)
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.grey.shade700,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    minimumSize: Size.zero,
                  ),
                  onPressed: backAction,
                  icon: const Icon(Icons.arrow_back, size: 14),
                  label: const Text('ATRÁS', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold)),
                )
              else
                const SizedBox(width: 60),
              Expanded(
                child: Text(
                  title.toUpperCase(),
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13, color: Colors.white),
                ),
              ),
              const SizedBox(width: 60),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            subtitle,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 10, color: AppColors.slate),
          ),
        ],
      ),
    );
  }

  Widget _buildCancelBottomButton() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF0F172A),
        border: Border(top: BorderSide(color: Colors.white.withOpacity(0.05))),
      ),
      child: OutlinedButton(
        style: OutlinedButton.styleFrom(
          padding: const EdgeInsets.symmetric(vertical: 12),
          side: const BorderSide(color: Colors.redAccent),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
        onPressed: _resetOrder,
        child: const Center(
          child: Text('CANCELAR Y LIMPIAR PEDIDO', style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold, fontSize: 11)),
        ),
      ),
    );
  }

  Widget _buildCartBottomBar(Color themeColor) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        border: Border(top: BorderSide(color: Colors.white.withOpacity(0.05))),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Total: \$${_getCartTotal().toStringAsFixed(2)}',
                  style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 14, color: AppColors.green),
                ),
                Text('${_cart.length} productos en carrito', style: const TextStyle(fontSize: 10, color: AppColors.slate)),
              ],
            ),
          ),
          OutlinedButton(
            style: OutlinedButton.styleFrom(
              side: const BorderSide(color: Colors.red),
              padding: const EdgeInsets.symmetric(horizontal: 16),
            ),
            onPressed: _resetOrder,
            child: const Text('BORRAR', style: TextStyle(color: Colors.red, fontSize: 10)),
          ),
          const SizedBox(width: 8),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: themeColor, padding: const EdgeInsets.symmetric(horizontal: 16)),
            onPressed: _cart.isEmpty ? null : _submitOrder,
            child: const Text('ENVIAR PEDIDO', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 11)),
          ),
        ],
      ),
    );
  }

  // BOTTOM SHEET VARIANT PICKER
  void _showVariantPickerModal(dynamic product, List<dynamic> productVariants) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF1E293B),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 20,
                bottom: MediaQuery.of(context).viewInsets.bottom + 20,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    product['name'].toString().toUpperCase(),
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: Colors.white),
                  ),
                  if (product['description'] != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      product['description'],
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 10, color: AppColors.slate),
                    ),
                  ],
                  const Divider(height: 24, color: Colors.white10),

                  // Variants list mapping
                  Flexible(
                    child: ListView.builder(
                      shrinkWrap: true,
                      itemCount: productVariants.length,
                      itemBuilder: (context, vIndex) {
                        final v = productVariants[vIndex];
                        final vId = v['id'].toString();
                        final price = _getVariantPrice(v);
                        final currentQty = _cart[vId]?['quantity'] as int? ?? 0;

                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(v['name'], style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.white)),
                                    const SizedBox(height: 2),
                                    Text('\$${price.toStringAsFixed(2)} • Stock: ${v['stock'] ?? 0}', style: const TextStyle(fontSize: 11, color: AppColors.green)),
                                  ],
                                ),
                              ),
                              Row(
                                children: [
                                  IconButton(
                                    icon: const Icon(Icons.remove_circle_outline, color: Colors.redAccent, size: 24),
                                    onPressed: () {
                                      _removeFromCart(vId);
                                      setModalState(() {});
                                      setState(() {});
                                    },
                                  ),
                                  Text(
                                    '$currentQty',
                                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white),
                                  ),
                                  IconButton(
                                    icon: const Icon(Icons.add_circle_outline, color: Colors.cyan, size: 24),
                                    onPressed: () {
                                      _addToCart(v, product);
                                      setModalState(() {});
                                      setState(() {});
                                    },
                                  ),
                                ],
                              )
                            ],
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.cyan.shade700,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('LISTO', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
            );
          }
        );
      },
    );
  }

  // STEP 4: ORDER HISTORY
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
        if (status == 'NO ENTREGADO') statusColor = AppColors.red;
        if (status == 'EN TRANSPORTE') statusColor = AppColors.blue;
        if (status == 'PENDIENTE') statusColor = AppColors.orange;

        return Card(
          margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: ExpansionTile(
            title: Text(
              '${order['negocios']?['name']?.toString().toUpperCase() ?? 'Negocio Desconocido'} (#${order['id'].toString().substring(0, 8).toUpperCase()})',
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
                    if (status == 'PENDIENTE' || status == 'PENDING_PREPARATION') ...[
                      const Divider(height: 20),
                      ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.cyan.shade700,
                          foregroundColor: Colors.white,
                          minimumSize: const Size(double.infinity, 36),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        onPressed: () {
                          setState(() {
                            _editingOrderId = order['id'].toString();
                            _selectedShop = order['negocios'];
                            _cart.clear();
                            for (var it in order['order_items']) {
                              final variant = it['product_variants'];
                              if (variant != null) {
                                final vId = variant['id'].toString();
                                _cart[vId] = {
                                  'variant': variant,
                                  'product': variant['products'],
                                  'quantity': it['quantity'],
                                };
                              }
                            }
                            _orderActive = true;
                            _wizardLevel = 1;
                            _currentTab = 0;
                          });
                        },
                        icon: const Icon(Icons.edit, size: 14),
                        label: const Text('EDITAR PEDIDO PENDIENTE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
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
