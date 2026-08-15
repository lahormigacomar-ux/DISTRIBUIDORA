import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api_service.dart';
import 'preventista_screen.dart';
import 'entregador_screen.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Distribuidora Movil',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        primarySwatch: Colors.cyan,
        scaffoldBackgroundColor: const Color(0xFF0F172A), // Slate 900
        cardColor: const Color(0xFF1E293B), // Slate 800
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xFF334155), // Slate 700
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide.none,
          ),
          hintStyle: const TextStyle(color: AppColors.slate),
        ),
      ),
      home: const SessionGateway(),
      routes: {
        '/login': (context) => const LoginScreen(),
      },
    );
  }
}

class SessionGateway extends StatefulWidget {
  const SessionGateway({Key? key}) : super(key: key);

  @override
  _SessionGatewayState createState() => _SessionGatewayState();
}

class _SessionGatewayState extends State<SessionGateway> {
  @override
  void initState() {
    super.initState();
    _checkSession();
  }

  Future<void> _checkSession() async {
    final prefs = await SharedPreferences.getInstance();
    final role = prefs.getString('user_role');
    final name = prefs.getString('user_name') ?? '';
    final id = prefs.getString('user_id') ?? '';

    if (role != null && id.isNotEmpty) {
      final userInfo = {'id': id, 'name': name};
      if (role == 'preventista') {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (context) => PreventistaScreen(userInfo: userInfo)),
        );
      } else if (role == 'entregador') {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (context) => EntregadorScreen(userInfo: userInfo)),
        );
      }
    } else {
      Navigator.of(context).pushReplacementNamed('/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: CircularProgressIndicator(),
      ),
    );
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({Key? key}) : super(key: key);

  @override
  _LoginScreenState createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final TextEditingController _userController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  bool _isLoading = false;
  String _errorMsg = '';

  Future<void> _handleLogin() async {
    final username = _userController.text.trim();
    final password = _passwordController.text.trim();

    if (username.isEmpty || password.isEmpty) {
      setState(() => _errorMsg = 'Completa todos los campos.');
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMsg = '';
    });

    try {
      final data = await ApiService.login(username, password);
      final role = data['role'];
      final userInfo = {
        'id': data['user']['id'],
        'name': data['user']['name'],
      };

      if (role == 'preventista') {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (context) => PreventistaScreen(userInfo: userInfo)),
        );
      } else if (role == 'entregador') {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (context) => EntregadorScreen(userInfo: userInfo)),
        );
      }
    } catch (e) {
      setState(() {
        _errorMsg = e.toString().replaceFirst('Exception: ', '');
      });
    } finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Premium look logo
                const Icon(
                  Icons.local_shipping_outlined,
                  size: 80,
                  color: Colors.cyan,
                ),
                const SizedBox(height: 16),
                const Text(
                  'SISTEMA MÓVIL',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 2,
                    color: Colors.white,
                  ),
                ),
                const Text(
                  'Distribuidora & Logística',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey,
                  ),
                ),
                const SizedBox(height: 48),

                // Inputs
                TextField(
                  controller: _userController,
                  decoration: const InputDecoration(
                    hintText: 'Usuario móvil',
                    prefixIcon: Icon(Icons.person, color: Colors.cyan),
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _passwordController,
                  obscureText: true,
                  decoration: const InputDecoration(
                    hintText: 'Contraseña',
                    prefixIcon: Icon(Icons.lock, color: Colors.cyan),
                  ),
                ),
                const SizedBox(height: 24),

                if (_errorMsg.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Text(
                      '⚠️ $_errorMsg',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: AppColors.redAccent, fontWeight: FontWeight.bold, fontSize: 13),
                    ),
                  ),

                _isLoading
                    ? const Center(child: CircularProgressIndicator())
                    : ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.cyan.shade700,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        onPressed: _handleLogin,
                        child: const Text(
                          'INGRESAR AL SISTEMA',
                          style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1.5),
                        ),
                      ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class AppColors {
  static const Color slatePlay = Color(0xFF64748B);
  static const Color slate = Color(0xFF94A3B8);
  static const Color cyan = Color(0xFF06B6D4);
  static const Color white = Color(0xFFFFFFFF);
  static const Color grey = Color(0xFF6B7280);
  static const Color red = Color(0xFFEF4444);
  static const Color redAccent = Color(0xFFFF5252);
  static const Color green = Color(0xFF22C55E);
  static const Color blue = Color(0xFF3B82F6);
  static const Color blueGrey = Color(0xFF607D8B);
  static const Color orange = Color(0xFFF97316);
}
