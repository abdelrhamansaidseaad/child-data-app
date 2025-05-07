const jwt = require('jsonwebtoken');
const Child = require('../models/Child');

exports.authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const child = await Child.findById(decoded.id).select('-password');
    
    if (!child) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    req.child = child;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Not authorized' });
  }
};