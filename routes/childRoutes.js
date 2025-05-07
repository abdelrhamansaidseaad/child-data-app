const express = require('express');
const router = express.Router();
const childController = require('../controllers/childController');
const authController = require('../controllers/authController');

// المسارات الأساسية
router
  .route('/')
  .post(childController.createChild)
  .get(childController.getAllChildren);

router
  .route('/:id')
  .get(childController.getChild)
  .patch(childController.updateChild)
  .delete(childController.deleteChild);

module.exports = router;