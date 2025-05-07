const Child = require('../models/Child');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// تكوين Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// إعداد Multer مع MemoryStorage مؤقتاً للتحقق
const memoryStorage = multer.memoryStorage();

const upload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 5
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مسموح به. يُسمح بملفات JPEG و PNG فقط'), false);
    }
  }
}).array('images');

// دالة معالجة الصور المعدلة
const processImages = async (files) => {
  if (!files || files.length === 0) {
    throw new Error('لم يتم توفير أي ملفات للرفع');
  }

  // تصفية الملفات الفارغة
  const validFiles = files.filter(file => {
    const isValid = file.buffer && file.buffer.length > 0;
    if (!isValid) {
      console.warn(`ملف غير صالح: ${file.originalname}`, {
        size: file.size,
        bufferLength: file.buffer?.length,
        mimetype: file.mimetype
      });
    }
    return isValid;
  });

  if (validFiles.length === 0) {
    throw new Error('جميع الملفات المقدمة غير صالحة للرفع');
  }

  const uploadResults = await Promise.allSettled(
    validFiles.map(file => {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'children_profiles',
            resource_type: 'image',
            quality: 'auto:good'
          },
          (error, result) => {
            if (error) {
              console.error(`خطأ في رفع ${file.originalname}:`, error);
              reject(error);
            } else {
              console.log(`تم رفع ${file.originalname} بنجاح`);
              resolve(result.secure_url);
            }
          }
        );

        uploadStream.end(file.buffer);
      });
    })
  );

  const successfulUploads = uploadResults
    .filter(result => result.status === 'fulfilled')
    .map(result => result.value);

  if (successfulUploads.length === 0) {
    throw new Error('فشل رفع جميع الملفات');
  }

  return successfulUploads;
};

// إنشاء طفل جديد - الإصدار المعدل
exports.createChild = async (req, res) => {
  try {
    // تنفيذ عملية الرفع
    await new Promise((resolve, reject) => {
      upload(req, res, (err) => {
        if (err) {
          console.error('تفاصيل خطأ الرفع:', {
            message: err.message,
            code: err.code,
            stack: err.stack
          });
          reject(err);
          return;
        }
        
        // تسجيل تفاصيل الملفات المستلمة
        console.log('تفاصيل الملفات المستلمة:', req.files?.map(f => ({
          name: f.originalname,
          size: f.size,
          type: f.mimetype,
          bufferLength: f.buffer?.length,
          fieldname: f.fieldname
        })));
        
        resolve();
      });
    });

    const { name, age, email, password } = req.body;
    
    if (!name || !age || !email || !password) {
      throw new Error('جميع الحقول مطلوبة (الاسم، العمر، البريد الإلكتروني، كلمة المرور)');
    }

    let imageUrls = [];
    if (req.files && req.files.length > 0) {
      try {
        imageUrls = await processImages(req.files);
      } catch (uploadError) {
        console.error('تفاصيل خطأ رفع الصور:', uploadError);
        throw new Error('حدث خطأ أثناء رفع الصور');
      }
    }

    const child = await Child.create({
      name,
      age,
      email,
      password,
      images: imageUrls
    });
    
    child.password = undefined;

    res.status(201).json({
      status: 'success',
      data: {
        child,
        uploadedImages: imageUrls.length,
        message: imageUrls.length === 0 
          ? 'تم إنشاء الحساب بدون صور' 
          : `تم رفع ${imageUrls.length} صورة بنجاح`
      }
    });

  } catch (error) {
    console.error('تفاصيل الخطأ الكامل:', {
      message: error.message,
      stack: error.stack,
      rawError: error
    });
    
    let statusCode = 400;
    let errorMessage = error.message;

    if (error.message.includes('duplicate key')) {
      errorMessage = 'البريد الإلكتروني مسجل مسبقاً';
      statusCode = 409;
    } else if (error.message.includes('رفع')) {
      statusCode = 500;
    }

    res.status(statusCode).json({
      status: 'fail',
      message: errorMessage,
      ...(process.env.NODE_ENV === 'development' && { 
        details: error.message,
        stack: error.stack 
      })
    });
  }
};

// الحصول على جميع الأطفال
exports.getAllChildren = async (req, res) => {
  try {
    const children = await Child.find().select('-password -__v');
    res.status(200).json({
      status: 'success',
      results: children.length,
      data: {
        children
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch children'
    });
  }
};

// الحصول على طفل واحد
exports.getChild = async (req, res) => {
  try {
    const child = await Child.findById(req.params.id).select('-password -__v');
    
    if (!child) {
      return res.status(404).json({
        status: 'fail',
        message: 'Child not found'
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        child
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch child'
    });
  }
};

// تحديث بيانات الطفل
exports.updateChild = async (req, res) => {
  try {
    const { name, age } = req.body;
    const child = await Child.findByIdAndUpdate(
      req.params.id,
      { name, age },
      { new: true, runValidators: true }
    ).select('-password -__v');

    if (!child) {
      return res.status(404).json({
        status: 'fail',
        message: 'Child not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        child
      }
    });
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
};

// حذف الطفل
exports.deleteChild = async (req, res) => {
  try {
    const child = await Child.findByIdAndDelete(req.params.id);

    if (!child) {
      return res.status(404).json({
        status: 'fail',
        message: 'Child not found'
      });
    }

    // حذف الصور من Cloudinary
    if (child.images && child.images.length > 0) {
      await Promise.all(
        child.images.map(imageUrl => {
          const publicId = imageUrl.split('/').pop().split('.')[0];
          return cloudinary.uploader.destroy(`children_profiles/${publicId}`);
        })
      );
    }

    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete child'
    });
  }
};