const Child = require('../models/Child');
const jwt = require('jsonwebtoken');
const { promisify } = require('util');

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1h'
  });
};

exports.login = async (req, res) => {
  try {
    const { email, name, password } = req.body;
    
    // 1) Check if email or name and password exist
    if (!(email || name) || !password) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide email/name and password'
      });
    }
    
    // 2) Check if child exists and password is correct
    const child = await Child.findOne({ 
      $or: [{ email }, { name }] 
    }).select('+password');
    
    if (!child || !(await child.comparePassword(password))) {
      return res.status(401).json({
        status: 'fail',
        message: 'Incorrect email/name or password'
      });
    }
    
    // 3) If everything ok, send token to client
    const token = signToken(child._id);
    
    // Remove password from output
    child.password = undefined;
    
    res.status(200).json({
      status: 'success',
      token,
      data: {
        child
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error during login'
    });
  }
};

exports.protect = async (req, res, next) => {
  try {
    // 1) Getting token and check if it's there
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    if (!token) {
      return res.status(401).json({
        status: 'fail',
        message: 'You are not logged in! Please log in to get access.'
      });
    }
    
    // 2) Verification token
    const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
    
    // 3) Check if child still exists
    const currentChild = await Child.findById(decoded.id);
    if (!currentChild) {
      return res.status(401).json({
        status: 'fail',
        message: 'The child belonging to this token does no longer exist.'
      });
    }
    
    // GRANT ACCESS TO PROTECTED ROUTE
    req.child = currentChild;
    next();
  } catch (error) {
    res.status(401).json({
      status: 'fail',
      message: 'Invalid token or expired. Please log in again.'
    });
  }
};