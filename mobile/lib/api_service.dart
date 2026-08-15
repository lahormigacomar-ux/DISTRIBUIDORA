import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiService {
  static const String baseUrl = 'https://distribuidorabackend.vercel.app/api';

  static Future<Map<String, String>> _getHeaders() async {
    final prefs = await SharedPreferences.getInstance();
    final companyId = prefs.getString('company_id') ?? '';
    final userId = prefs.getString('user_id') ?? '';
    final userRole = prefs.getString('user_role') ?? '';

    return {
      'Content-Type': 'application/json',
      'x-company-id': companyId,
      'x-user-id': userId,
      'x-user-role': userRole,
    };
  }

  static Future<Map<String, dynamic>> login(String username, String password) async {
    final response = await http.post(
      Uri.parse('$baseUrl/mobile/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'username': username,
        'password': password,
      }),
    );

    final data = jsonDecode(response.body);
    if (response.statusCode == 200) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('company_id', data['company_id'] ?? '');
      await prefs.setString('user_id', data['user']['id'] ?? '');
      await prefs.setString('user_role', data['role'] ?? '');
      await prefs.setString('user_name', data['user']['name'] ?? '');
      return data;
    } else {
      throw Exception(data['error'] ?? 'Error de conexión.');
    }
  }

  static Future<List<dynamic>> getProducts() async {
    final headers = await _getHeaders();
    final response = await http.get(
      Uri.parse('$baseUrl/products'),
      headers: headers,
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      throw Exception('Error al cargar productos.');
    }
  }

  static Future<List<dynamic>> getVariants() async {
    final headers = await _getHeaders();
    final response = await http.get(
      Uri.parse('$baseUrl/products/variants'),
      headers: headers,
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      throw Exception('Error al cargar variantes.');
    }
  }

  static Future<List<dynamic>> getShops() async {
    final headers = await _getHeaders();
    final response = await http.get(
      Uri.parse('$baseUrl/negocios'),
      headers: headers,
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      throw Exception('Error al cargar negocios.');
    }
  }

  static Future<List<dynamic>> getMobileOrders() async {
    final headers = await _getHeaders();
    final response = await http.get(
      Uri.parse('$baseUrl/mobile/orders'),
      headers: headers,
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      throw Exception('Error al cargar pedidos.');
    }
  }

  static Future<Map<String, dynamic>> createOrder(Map<String, dynamic> orderData) async {
    final headers = await _getHeaders();
    final response = await http.post(
      Uri.parse('$baseUrl/orders'),
      headers: headers,
      body: jsonEncode(orderData),
    );

    if (response.statusCode == 200 || response.statusCode == 201) {
      return jsonDecode(response.body);
    } else {
      final errData = jsonDecode(response.body);
      throw Exception(errData['error'] ?? 'Error al crear el pedido.');
    }
  }

  static Future<Map<String, dynamic>> updateOrder(String orderId, Map<String, dynamic> orderData) async {
    final headers = await _getHeaders();
    final response = await http.put(
      Uri.parse('$baseUrl/orders/$orderId'),
      headers: headers,
      body: jsonEncode(orderData),
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      final errData = jsonDecode(response.body);
      throw Exception(errData['error'] ?? 'Error al actualizar el pedido.');
    }
  }

  static Future<void> updateOrderStatus(String orderId, String status, {String? failureReason}) async {
    final headers = await _getHeaders();
    final response = await http.patch(
      Uri.parse('$baseUrl/orders/$orderId/status'),
      headers: headers,
      body: jsonEncode({
        'status': status,
        if (failureReason != null) 'failure_reason': failureReason,
      }),
    );

    if (response.statusCode != 200) {
      throw Exception('Error al actualizar el estado del pedido.');
    }
  }

  static Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
  }
}
