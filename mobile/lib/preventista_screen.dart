import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import 'api_service.dart';

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
    if (hexString == null || hexString.isEmpty) return const Color(0xFF4F46E5);
    final buffer = StringBuffer();
    if (hexString.length == 7) buffer.write('ff');
    buffer.write(hexString.replaceFirst('#', ''));
    return Color(int.parse(buffer.toString(), radix: 16));
  }

  @override
  Widget build(BuildContext context) {
    final themeColor = const Color(0xFF4F46E5);

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
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: const Color(0xFF4F46E5).withOpacity(0.06),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.playlist_add_check, size: 80, color: Color(0xFF4F46E5)),
              ),
              const SizedBox(height: 24),
              const Text(
                'Generador de Pedidos',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: Color(0xFF0F172A)),
              ),
              const SizedBox(height: 8),
              const Text(
                'Presiona el botón para comenzar a levantar un nuevo pedido.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: Color(0xFF64748B)),
              ),
              const SizedBox(height: 36),
              Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(30),
                  gradient: const LinearGradient(
                    colors: [Color(0xFF4F46E5), Color(0xFF3B82F6)],
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF4F46E5).withOpacity(0.25),
                      blurRadius: 15,
                      offset: const Offset(0, 5),
                    )
                  ],
                ),
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.transparent,
                    shadowColor: Colors.transparent,
                    padding: const EdgeInsets.symmetric(horizontal: 48, vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(30)),
                  ),
                  onPressed: () => setState(() => _orderActive = true),
                  child: const Text(
                    'EMPEZAR NUEVO PEDIDO',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: Colors.white, letterSpacing: 1),
                  ),
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
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24.0),
        child: Card(
          elevation: 8,
          shadowColor: Colors.black.withOpacity(0.04),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'SELECCIONAR CLIENTE',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: Color(0xFF0F172A), letterSpacing: 1),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Selecciona el negocio que realiza el pedido',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                ),
                const SizedBox(height: 24),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF1F5F9), // Light grey fill
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<dynamic>(
                      isExpanded: true,
                      dropdownColor: Colors.white,
                      hint: const Text('Toca para buscar negocio...', style: TextStyle(fontSize: 13, color: Color(0xFF94A3B8))),
                      value: _selectedShop,
                      items: _shops.map<DropdownMenuItem<dynamic>>((shop) {
                        return DropdownMenuItem<dynamic>(
                          value: shop,
                          child: Text('${shop['name']} (${shop['address']})', style: const TextStyle(fontSize: 13, color: Color(0xFF0F172A), fontWeight: FontWeight.bold)),
                        );
                      }).toList(),
                      onChanged: (val) {
                        setState(() => _selectedShop = val);
                      },
                    ),
                  ),
                ),
                if (_selectedShop != null) ...[
                  const SizedBox(height: 12),
                  TextButton.icon(
                    onPressed: () => _openMap(_selectedShop!['latitude'], _selectedShop!['longitude'], _selectedShop!['address']),
                    icon: const Icon(Icons.map, size: 16, color: Color(0xFF4F46E5)),
                    label: const Text('VER UBICACIÓN EN MAPA', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF4F46E5))),
                  ),
                ],
                const SizedBox(height: 24),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          side: const BorderSide(color: Color(0xFFCBD5E1)),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                        ),
                        onPressed: _resetOrder,
                        child: const Text('CANCELAR', style: TextStyle(color: Color(0xFF64748B), fontWeight: FontWeight.w800, fontSize: 12)),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Container(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(16),
                          gradient: _selectedShop == null
                              ? null
                              : const LinearGradient(colors: [Color(0xFF4F46E5), Color(0xFF3B82F6)]),
                          color: _selectedShop == null ? Colors.grey[200] : null,
                        ),
                        child: ElevatedButton(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.transparent,
                            shadowColor: Colors.transparent,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                          ),
                          onPressed: _selectedShop == null
                              ? null
                              : () => setState(() => _wizardLevel = 1),
                          child: const Text('SIGUIENTE', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12)),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // STEP 1: FAMILIES GRID
  Widget _buildFamiliesStep(Color themeColor) {
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
        _buildWizardHeader('Categorías', 'Selecciona una familia de productos'),
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

              return Card(
                elevation: 4,
                shadowColor: Colors.black.withOpacity(0.04),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                color: Colors.white,
                child: InkWell(
                  borderRadius: BorderRadius.circular(20),
                  onTap: () {
                    setState(() {
                      _selectedFamilyId = fam['id'].toString();
                      _selectedFamilyName = fam['name'];
                      _wizardLevel = 2; // Go to Groups
                    });
                  },
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: color.withOpacity(0.08),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(_getIconData(fam['icon']), size: 32, color: color),
                      ),
                      const SizedBox(height: 12),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        child: Text(
                          fam['name'].toString().toUpperCase(),
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 11, color: Color(0xFF0F172A)),
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
          _selectedFamilyName ?? 'Grupos',
          'Selecciona una subcategoría',
          backAction: () => setState(() => _wizardLevel = 1),
        ),
        Expanded(
          child: uniqueGroups.isEmpty
              ? const Center(child: Text('No hay subcategorías en esta familia.'))
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
                    return Card(
                      elevation: 4,
                      shadowColor: Colors.black.withOpacity(0.04),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                      color: Colors.white,
                      child: InkWell(
                        borderRadius: BorderRadius.circular(20),
                        onTap: () {
                          setState(() {
                            _selectedGroupId = grp['id'].toString();
                            _selectedGroupName = grp['name'];
                            _wizardLevel = 3; // Go to Products
                          });
                        },
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: const Color(0xFF4F46E5).withOpacity(0.06),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(Icons.folder_outlined, size: 24, color: Color(0xFF4F46E5)),
                            ),
                            const SizedBox(height: 8),
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 8),
                              child: Text(
                                grp['name'].toString().toUpperCase(),
                                textAlign: TextAlign.center,
                                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 11, color: Color(0xFF0F172A)),
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
          _selectedGroupName ?? 'Artículos',
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

                    int cartCount = 0;
                    for (var v in prodVariants) {
                      cartCount += _cart[v['id'].toString()]?['quantity'] as int? ?? 0;
                    }

                    return Card(
                      elevation: 3,
                      shadowColor: Colors.black.withOpacity(0.03),
                      margin: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
                      color: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      child: ListTile(
                        onTap: () => _showVariantPickerModal(prod, prodVariants),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        title: Text(
                          prod['name'].toString().toUpperCase(),
                          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5, color: Color(0xFF0F172A)),
                        ),
                        subtitle: prod['description'] != null
                            ? Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Text(prod['description'], style: const TextStyle(fontSize: 10.5, color: Color(0xFF64748B))),
                              )
                            : null,
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (cartCount > 0)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF10B981).withOpacity(0.12),
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: Text(
                                  '$cartCount AGREGADOS',
                                  style: const TextStyle(color: Color(0xFF059669), fontWeight: FontWeight.w900, fontSize: 9),
                                ),
                              ),
                            const SizedBox(width: 8),
                            const Icon(Icons.arrow_forward_ios, size: 12, color: Color(0xFF94A3B8)),
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
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF4F46E5), Color(0xFF3B82F6)],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              if (backAction != null)
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white.withOpacity(0.2),
                    foregroundColor: Colors.white,
                    elevation: 0,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    minimumSize: Size.zero,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: backAction,
                  icon: const Icon(Icons.arrow_back, size: 12, color: Colors.white),
                  label: const Text('ATRÁS', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w900, color: Colors.white)),
                )
              else
                const SizedBox(width: 60),
              Expanded(
                child: Text(
                  title.toUpperCase(),
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13, color: Colors.white, letterSpacing: 0.5),
                ),
              ),
              const SizedBox(width: 60),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            subtitle,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 10.5, color: Colors.white.withOpacity(0.8)),
          ),
        ],
      ),
    );
  }

  Widget _buildCancelBottomButton() {
    return Container(
      padding: const EdgeInsets.all(16),
      color: Colors.white,
      child: OutlinedButton(
        style: OutlinedButton.styleFrom(
          padding: const EdgeInsets.symmetric(vertical: 14),
          side: const BorderSide(color: Color(0xFFF1F5F9), width: 1.5),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        ),
        onPressed: _resetOrder,
        child: const Center(
          child: Text('CANCELAR PEDIDO', style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.w900, fontSize: 11, letterSpacing: 0.5)),
        ),
      ),
    );
  }

  Widget _buildCartBottomBar(Color themeColor) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 10, offset: const Offset(0, -3))
        ],
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
                  style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15, color: Color(0xFF10B981)),
                ),
                Text('${_cart.length} artículos en el carrito', style: const TextStyle(fontSize: 10.5, color: Color(0xFF64748B))),
              ],
            ),
          ),
          OutlinedButton(
            style: OutlinedButton.styleFrom(
              side: const BorderSide(color: Color(0xFFCBD5E1)),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: _resetOrder,
            child: const Text('BORRAR', style: TextStyle(color: Color(0xFF64748B), fontSize: 10, fontWeight: FontWeight.bold)),
          ),
          const SizedBox(width: 8),
          Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              gradient: _cart.isEmpty
                  ? null
                  : const LinearGradient(colors: [Color(0xFF4F46E5), Color(0xFF3B82F6)]),
              color: _cart.isEmpty ? Colors.grey[200] : null,
            ),
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.transparent,
                shadowColor: Colors.transparent,
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: _cart.isEmpty ? null : _submitOrder,
              child: const Text('ENVIAR PEDIDO', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 11)),
            ),
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
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 24,
                right: 24,
                top: 24,
                bottom: MediaQuery.of(context).viewInsets.bottom + 24,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    product['name'].toString().toUpperCase(),
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w900, color: Color(0xFF0F172A)),
                  ),
                  if (product['description'] != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      product['description'],
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                    ),
                  ],
                  const Divider(height: 24, color: Color(0xFFF1F5F9)),

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
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(v['name'], style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: Color(0xFF0F172A))),
                                    const SizedBox(height: 2),
                                    Text('\$${price.toStringAsFixed(2)} • Stock: ${v['stock'] ?? 0}', style: const TextStyle(fontSize: 11.5, color: Color(0xFF059669), fontWeight: FontWeight.bold)),
                                  ],
                                ),
                              ),
                              Container(
                                decoration: BoxDecoration(
                                  color: const Color(0xFFF1F5F9),
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: Row(
                                  children: [
                                    IconButton(
                                      icon: const Icon(Icons.remove_circle_outline, color: Colors.redAccent, size: 20),
                                      onPressed: () {
                                        _removeFromCart(vId);
                                        setModalState(() {});
                                        setState(() {});
                                      },
                                    ),
                                    Padding(
                                      padding: const EdgeInsets.symmetric(horizontal: 4),
                                      child: Text(
                                        '$currentQty',
                                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: Color(0xFF0F172A)),
                                      ),
                                    ),
                                    IconButton(
                                      icon: const Icon(Icons.add_circle_outline, color: Color(0xFF4F46E5), size: 20),
                                      onPressed: () {
                                        _addToCart(v, product);
                                        setModalState(() {});
                                        setState(() {});
                                      },
                                    ),
                                  ],
                                ),
                              )
                            ],
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 20),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF4F46E5),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('GUARDAR Y VOLVER', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 12)),
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

        Color statusColor = const Color(0xFFF59E0B); // Pending -> Amber
        if (status == 'ENTREGADO') statusColor = const Color(0xFF10B981); // Green
        if (status == 'NO ENTREGADO') statusColor = const Color(0xFFEF4444); // Red
        if (status == 'EN TRANSPORTE') statusColor = const Color(0xFF3B82F6); // Blue

        return Card(
          elevation: 4,
          shadowColor: Colors.black.withOpacity(0.04),
          margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          color: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          child: ExpansionTile(
            title: Text(
              '${order['negocios']?['name']?.toString().toUpperCase() ?? 'Negocio Desconocido'} (#${order['id'].toString().substring(0, 8).toUpperCase()})',
              style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13, color: Color(0xFF0F172A)),
            ),
            subtitle: Text('$formattedDate - \$${total.toStringAsFixed(2)}', style: const TextStyle(fontSize: 11, color: Color(0xFF64748B))),
            trailing: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(color: statusColor.withOpacity(0.12), borderRadius: BorderRadius.circular(12)),
              child: Text(status, style: TextStyle(color: statusColor, fontWeight: FontWeight.w900, fontSize: 8.5)),
            ),
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('PRODUCTOS:', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 10, color: Color(0xFF94A3B8), letterSpacing: 0.5)),
                    const SizedBox(height: 8),
                    Column(
                      children: (order['order_items'] as List).map<Widget>((it) {
                        final qty = it['quantity'];
                        final price = double.tryParse(it['price_unit'].toString()) ?? 0.0;
                        final subtotal = qty * price;
                        final vName = it['product_variants']?['name'] ?? 'Variante';
                        final pName = it['product_variants']?['products']?['name'] ?? 'Producto';

                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('$qty x $pName ($vName)', style: const TextStyle(fontSize: 11, color: Color(0xFF475569))),
                              Text('\$${subtotal.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 11, color: Color(0xFF0F172A))),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
                    if (order['failure_reason'] != null) ...[
                      const Divider(height: 24, color: Color(0xFFF1F5F9)),
                      Text(
                        'Motivo de fallo: ${order['failure_reason']}',
                        style: const TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold, fontSize: 10.5),
                      ),
                    ],
                    if (status == 'PENDIENTE' || status == 'PENDING_PREPARATION') ...[
                      const Divider(height: 24, color: Color(0xFFF1F5F9)),
                      ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF4F46E5),
                          foregroundColor: Colors.white,
                          minimumSize: const Size(double.infinity, 44),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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
                        label: const Text('EDITAR PEDIDO PENDIENTE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
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
extension ButtonStyleExtension on ButtonStyle {
  Widget build(Widget child) {
    if (child is ElevatedButton) {
      return ElevatedButton(
        style: this,
        onPressed: child.onPressed,
        child: child.child,
      );
    }
    return child;
  }
}
