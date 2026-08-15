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
        useMaterial3: true,
        brightness: Brightness.light,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF4F46E5), // Indigo 600
          primary: const Color(0xFF4F46E5),
          secondary: const Color(0xFF06B6D4), // Cyan
          background: const Color(0xFFF8FAFC), // Slate 50 (clean light background)
          surface: Colors.white,
        ),
        scaffoldBackgroundColor: const Color(0xFFF8FAFC),
        cardColor: Colors.white,
        cardTheme: CardThemeData(
          elevation: 2,
          shadowColor: Colors.black.withOpacity(0.04),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF4F46E5),
          foregroundColor: Colors.white,
          elevation: 0,
          centerTitle: true,
          titleTextStyle: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.5,
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: const BorderSide(color: Color(0xFFE2E8F0)), // Slate 200
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: const BorderSide(color: Color(0xFF4F46E5), width: 2),
          ),
          hintStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13), // Slate 400
        ),
        bottomNavigationBarTheme: const BottomNavigationBarThemeData(
          backgroundColor: Colors.white,
          selectedItemColor: Color(0xFF4F46E5),
          unselectedItemColor: Color(0xFF94A3B8),
          elevation: 8,
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
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Color(0xFF4F46E5), // Indigo 600
              Color(0xFF3B82F6), // Blue 500
              Color(0xFF06B6D4), // Cyan 500
            ],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Card(
                elevation: 12,
                shadowColor: Colors.black.withOpacity(0.15),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 36),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Modern Rounded Icon Container
                      Center(
                        child: Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: const Color(0xFF4F46E5).withOpacity(0.1),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.local_shipping,
                            size: 48,
                            color: Color(0xFF4F46E5),
                          ),
                        ),
                      ),
                      const SizedBox(height: 20),
                      const Text(
                        'SISTEMA MÓVIL',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1.5,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                      const Text(
                        'Distribuidora & Logística',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 12,
                          color: Color(0xFF64748B),
                        ),
                      ),
                      const SizedBox(height: 32),

                      // Username Input
                      TextField(
                        controller: _userController,
                        decoration: const InputDecoration(
                          hintText: 'Usuario móvil',
                          prefixIcon: Icon(Icons.person_outline, color: Color(0xFF4F46E5), size: 20),
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Password Input
                      TextField(
                        controller: _passwordController,
                        obscureText: true,
                        decoration: const InputDecoration(
                          hintText: 'Contraseña',
                          prefixIcon: Icon(Icons.lock_outline, color: Color(0xFF4F46E5), size: 20),
                        ),
                      ),
                      const SizedBox(height: 24),

                      if (_errorMsg.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 16),
                          child: Text(
                            '⚠️ $_errorMsg',
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: Colors.redAccent,
                              fontWeight: FontWeight.bold,
                              fontSize: 12,
                            ),
                          ),
                        ),

                      _isLoading
                          ? const Center(child: CircularProgressIndicator())
                          : Container(
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(16),
                                gradient: const LinearGradient(
                                  colors: [
                                    Color(0xFF4F46E5),
                                    Color(0xFF3B82F6),
                                  ],
                                ),
                                boxShadow: [
                                  BoxShadow(
                                    color: const Color(0xFF4F46E5).withOpacity(0.3),
                                    blurRadius: 10,
                                    offset: const Offset(0, 4),
                                  )
                                ],
                              ),
                              child: ElevatedButton(
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: Colors.transparent,
                                  shadowColor: Colors.transparent,
                                  padding: const EdgeInsets.symmetric(vertical: 16),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(16),
                                  ),
                                ),
                                onPressed: _handleLogin,
                                child: const Text(
                                  'INGRESAR AL SISTEMA',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: 1,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                            ),
                    ],
                  ),
                ),
              ),
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
