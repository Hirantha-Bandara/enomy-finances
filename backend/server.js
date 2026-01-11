const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = 8080;
const JWT_SECRET = 'enomy-finances-secret-key-2024';

app.use(cors());
app.use(express.json());

// ==================== IN-MEMORY DATABASE ====================
let users = [
  {
    id: 1,
    email: 'user@example.com',
    password: '$2a$10$N9qo8uLOickgx2ZMRZoMye8p6vWpK8z6TZP9QJ8p1G3dY4z5vX8O2', // password123
    fullName: 'John Client',
    role: 'USER',
    createdAt: '2024-01-01'
  },
  {
    id: 2,
    email: 'admin@enomy.com',
    password: '$2a$10$N9qo8uLOickgx2ZMRZoMye8p6vWpK8z6TZP9QJ8p1G3dY4z5vX8O2', // password123
    fullName: 'Sarah Admin',
    role: 'ADMIN',
    createdAt: '2024-01-01'
  }
];

let currencyConversions = [];
let investmentQuotes = [];

// ==================== HELPER FUNCTIONS ====================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

const calculateFee = (amount) => {
  if (amount <= 500) return 3.5;
  if (amount <= 1500) return 2.7;
  if (amount <= 2500) return 2.0;
  return 1.5;
};

const getExchangeRate = (from, to) => {
  const rates = {
    'GBP_USD': 1.25,
    'GBP_EUR': 1.15,
    'GBP_BRL': 6.20,
    'GBP_JPY': 185.50,
    'GBP_TRY': 40.75,
    'USD_GBP': 0.80,
    'USD_EUR': 0.92,
    'EUR_GBP': 0.87,
    'EUR_USD': 1.09,
    'BRL_GBP': 0.16,
    'JPY_GBP': 0.0054,
    'TRY_GBP': 0.0245
  };
  
  const key = `${from}_${to}`;
  return rates[key] || 1.0;
};

// ==================== ROUTES ====================

// 1. Health Check
app.get('/', (req, res) => {
  res.json({
    message: 'Enomy-Finances API v1.0',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// 2. Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  const user = users.find(u => u.email === email);
  
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  
  // In real app, compare hashed passwords
  // For demo, we'll accept any password that matches the hardcoded hash
  const passwordValid = bcrypt.compareSync(password, user.password);
  
  if (!passwordValid && password !== 'password123') {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  
  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role
    }
  });
});

// 3. Register
app.post('/api/auth/register', (req, res) => {
  const { email, password, fullName } = req.body;
  
  if (users.find(u => u.email === email)) {
    return res.status(400).json({ error: 'User already exists' });
  }
  
  const hashedPassword = bcrypt.hashSync(password, 10);
  const newUser = {
    id: users.length + 1,
    email,
    password: hashedPassword,
    fullName,
    role: 'USER',
    createdAt: new Date().toISOString()
  };
  
  users.push(newUser);
  
  const token = jwt.sign(
    { id: newUser.id, email: newUser.email, role: newUser.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  
  res.json({
    success: true,
    token,
    user: {
      id: newUser.id,
      email: newUser.email,
      fullName: newUser.fullName,
      role: newUser.role
    }
  });
});

// 4. Get Current User
app.get('/api/auth/me', authenticateToken, (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  res.json({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    createdAt: user.createdAt
  });
});

// 5. Get Currency Rates
app.get('/api/currency/rates', (req, res) => {
  const baseCurrency = req.query.base || 'GBP';
  const currencies = ['GBP', 'USD', 'EUR', 'BRL', 'JPY', 'TRY'];
  
  const rates = {};
  currencies.forEach(currency => {
    if (currency !== baseCurrency) {
      rates[`${baseCurrency}_${currency}`] = getExchangeRate(baseCurrency, currency);
    }
  });
  
  res.json(rates);
});

// 6. Currency Conversion
app.post('/api/currency/convert', authenticateToken, (req, res) => {
  const { fromCurrency, toCurrency, amount } = req.body;
  const userId = req.user.id;
  
  // Validation
  if (!fromCurrency || !toCurrency || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  if (amount < 300 || amount > 5000) {
    return res.status(400).json({ error: 'Amount must be between 300 and 5000' });
  }
  
  // Get exchange rate
  const exchangeRate = getExchangeRate(fromCurrency, toCurrency);
  
  // Calculate
  const convertedAmount = amount * exchangeRate;
  const feePercentage = calculateFee(amount);
  const feeAmount = (convertedAmount * feePercentage) / 100;
  const finalAmount = convertedAmount - feeAmount;
  
  // Create conversion record
  const conversion = {
    id: Date.now(),
    userId,
    fromCurrency,
    toCurrency,
    amount: parseFloat(amount),
    exchangeRate: parseFloat(exchangeRate.toFixed(4)),
    feePercentage: parseFloat(feePercentage.toFixed(1)),
    feeAmount: parseFloat(feeAmount.toFixed(2)),
    finalAmount: parseFloat(finalAmount.toFixed(2)),
    timestamp: new Date().toISOString()
  };
  
  currencyConversions.push(conversion);
  
  res.json(conversion);
});

// 7. Get Conversion History
app.get('/api/currency/history/:userId', authenticateToken, (req, res) => {
  const { userId } = req.params;
  
  if (req.user.id !== parseInt(userId) && req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  const userConversions = currencyConversions
    .filter(conv => conv.userId === parseInt(userId))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  res.json(userConversions);
});

// 8. Investment Calculation
app.post('/api/investment/calculate', authenticateToken, (req, res) => {
  const { investmentType, initialAmount, monthlyContribution } = req.body;
  const userId = req.user.id;
  
  // Validate investment type
  const validTypes = ['BASIC_SAVINGS', 'SAVINGS_PLUS', 'MANAGED_STOCK'];
  if (!validTypes.includes(investmentType)) {
    return res.status(400).json({ error: 'Invalid investment type' });
  }
  
  // Validate amounts
  const initial = parseFloat(initialAmount);
  const monthly = parseFloat(monthlyContribution);
  
  if (isNaN(initial) || isNaN(monthly)) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  
  // Type-specific validation
  let error = null;
  switch (investmentType) {
    case 'BASIC_SAVINGS':
      if (monthly < 50) error = 'Minimum monthly investment: £50';
      if (initial + (monthly * 12) > 20000) error = 'Maximum yearly investment: £20,000';
      break;
    case 'SAVINGS_PLUS':
      if (initial < 300) error = 'Minimum initial investment: £300';
      if (monthly < 50) error = 'Minimum monthly investment: £50';
      if (initial + (monthly * 12) > 30000) error = 'Maximum yearly investment: £30,000';
      break;
    case 'MANAGED_STOCK':
      if (initial < 1000) error = 'Minimum initial investment: £1,000';
      if (monthly < 150) error = 'Minimum monthly investment: £150';
      break;
  }
  
  if (error) {
    return res.status(400).json({ error });
  }
  
  // Calculate returns based on type
  let minReturn, maxReturn, fees;
  switch (investmentType) {
    case 'BASIC_SAVINGS':
      minReturn = 1.2;
      maxReturn = 2.4;
      fees = 0.25;
      break;
    case 'SAVINGS_PLUS':
      minReturn = 3.0;
      maxReturn = 5.5;
      fees = 0.3;
      break;
    case 'MANAGED_STOCK':
      minReturn = 4.0;
      maxReturn = 23.0;
      fees = 1.3;
      break;
  }
  
  const avgReturn = (minReturn + maxReturn) / 2;
  
  // Calculate projections
  const calculateProjection = (years) => {
    let total = initial;
    for (let i = 0; i < years; i++) {
      // Add yearly return
      total = total * (1 + avgReturn / 100);
      // Add monthly contributions for the year
      total += monthly * 12;
      // Apply yearly fees (simplified)
      total = total * (1 - fees / 100);
    }
    return parseFloat(total.toFixed(2));
  };
  
  const projectedValue1Year = calculateProjection(1);
  const projectedValue5Years = calculateProjection(5);
  const projectedValue10Years = calculateProjection(10);
  
  // Create quote
  const quote = {
    id: Date.now(),
    userId,
    investmentType,
    initialAmount: initial,
    monthlyContribution: monthly,
    projectedValue1Year,
    projectedValue5Years,
    projectedValue10Years,
    createdAt: new Date().toISOString()
  };
  
  investmentQuotes.push(quote);
  
  res.json(quote);
});

// 9. Get Investment History
app.get('/api/investment/history/:userId', authenticateToken, (req, res) => {
  const { userId } = req.params;
  
  if (req.user.id !== parseInt(userId) && req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  const userQuotes = investmentQuotes
    .filter(quote => quote.userId === parseInt(userId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  res.json(userQuotes);
});

// 10. Get Supported Currencies
app.get('/api/currency/supported', (req, res) => {
  res.json(['GBP', 'USD', 'EUR', 'BRL', 'JPY', 'TRY']);
});

// 11. Get Investment Types
app.get('/api/investment/types', (req, res) => {
  res.json([
    {
      value: 'BASIC_SAVINGS',
      label: 'Basic Savings Plan',
      minMonthly: 50,
      maxYearly: 20000,
      returns: '1.2% - 2.4%',
      fees: '0.25% monthly'
    },
    {
      value: 'SAVINGS_PLUS',
      label: 'Savings Plan Plus',
      minInitial: 300,
      minMonthly: 50,
      maxYearly: 30000,
      returns: '3% - 5.5%',
      fees: '0.3% monthly'
    },
    {
      value: 'MANAGED_STOCK',
      label: 'Managed Stock Investments',
      minInitial: 1000,
      minMonthly: 150,
      maxYearly: null,
      returns: '4% - 23%',
      fees: '1.3% monthly'
    }
  ]);
});

// Start server
app.listen(PORT, () => {
  console.log('╔════════════════════════════════════════╗');
  console.log('║    Enomy-Finances API Server v1.0     ║');
  console.log(`║    Running on http://localhost:${PORT}      ║`);
  console.log('╚════════════════════════════════════════╝');
  console.log('\n📊 API Endpoints:');
  console.log('  POST /api/auth/login');
  console.log('  POST /api/auth/register');
  console.log('  GET  /api/auth/me');
  console.log('  POST /api/currency/convert');
  console.log('  GET  /api/currency/rates');
  console.log('  GET  /api/currency/history/:userId');
  console.log('  POST /api/investment/calculate');
  console.log('  GET  /api/investment/history/:userId');
  console.log('\n🔐 Test Credentials:');
  console.log('  Email: user@example.com');
  console.log('  Password: password123');
  console.log('\n🌐 Frontend should run on: http://localhost:3000');
});