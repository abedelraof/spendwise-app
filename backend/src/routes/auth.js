const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const { seedDefaults } = require('../models/categoryModel');

function makeToken(user) {
  return jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

router.post('/signup', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (userModel.findByEmail(email)) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);
    const result = userModel.createUser({ email, passwordHash });
    const userId = result.lastInsertRowid;
    seedDefaults(userId);

    const user = userModel.findById(userId);
    const token = makeToken(user);
    res.status(201).json({ token, user: { id: user.id, email: user.email, currency: user.currency, theme: user.theme } });
  } catch (err) { next(err); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = userModel.findByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = makeToken(user);
    res.json({ token, user: { id: user.id, email: user.email, currency: user.currency, theme: user.theme } });
  } catch (err) { next(err); }
});

module.exports = router;
