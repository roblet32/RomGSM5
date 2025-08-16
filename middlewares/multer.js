const multer = require('multer');
const path = require('path');
const fs = require('fs');
const logger = require('../config/logger');

// Crear directorio de uploads si no existe
const uploadsDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configuración de almacenamiento
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        // Crear nombre único: timestamp + random + nombre original
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        const safeName = uniqueName + extension;
        cb(null, safeName);
    }
});

// Filtro para tipos de archivo permitidos
const fileFilter = (req, file, cb) => {
    // Solo permitir imágenes
    const allowedMimeTypes = [
        'image/jpeg',
        'image/jpg', 
        'image/png',
        'image/gif',
        'image/webp'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        logger.warn('Invalid file type attempted', { 
            filename: file.originalname,
            mimetype: file.mimetype,
            ip: req.ip 
        });
        cb(new Error('Solo se permiten archivos de imagen (JPEG, PNG, GIF, WebP)'), false);
    }
};

// Configuración de multer con límites mejorados
const upload = multer({
    storage: storage,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB máximo por archivo
        files: parseInt(process.env.MAX_FILES) || 10 // máximo 10 archivos por vez
    },
    fileFilter: fileFilter
});

// Middleware para múltiples fotos de dispositivos
const uploadFotosDispositivo = upload.array('fotos', parseInt(process.env.MAX_FILES) || 10);

// Middleware para una sola foto
const uploadFotoUnica = upload.single('foto');

// Middleware con manejo de errores mejorado
const uploadWithErrorHandling = (req, res, next) => {
    uploadFotosDispositivo(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            logger.error('Multer error', { 
                error: err.message,
                code: err.code,
                ip: req.ip 
            });
            
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ 
                    error: `Archivo demasiado grande. Máximo ${(parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024) / (1024 * 1024)}MB` 
                });
            }
            if (err.code === 'LIMIT_FILE_COUNT') {
                return res.status(400).json({ 
                    error: `Demasiados archivos. Máximo ${process.env.MAX_FILES || 10} fotos` 
                });
            }
            if (err.code === 'LIMIT_UNEXPECTED_FILE') {
                return res.status(400).json({ 
                    error: 'Campo de archivo inesperado' 
                });
            }
            return res.status(400).json({ error: 'Error al subir archivo: ' + err.message });
        } else if (err) {
            logger.error('File upload error', { 
                error: err.message,
                ip: req.ip 
            });
            return res.status(400).json({ error: err.message });
        }
        
        // Log successful upload
        if (req.files && req.files.length > 0) {
            logger.info('Files uploaded successfully', { 
                count: req.files.length,
                filenames: req.files.map(f => f.filename),
                ip: req.ip 
            });
        }
        
        next();
    });
};

// Función para eliminar archivos de forma segura
const eliminarArchivo = (rutaArchivo) => {
    try {
        const rutaCompleta = path.join(__dirname, '../public/uploads', rutaArchivo);
        
        // Verificar que el archivo existe y está en el directorio de uploads
        if (fs.existsSync(rutaCompleta) && rutaCompleta.startsWith(path.join(__dirname, '../public/uploads'))) {
            fs.unlinkSync(rutaCompleta);
            logger.info('File deleted successfully', { filename: rutaArchivo });
            return true;
        } else {
            logger.warn('File not found or outside uploads directory', { filename: rutaArchivo });
            return false;
        }
    } catch (error) {
        logger.error('Error deleting file', { 
            filename: rutaArchivo,
            error: error.message 
        });
        return false;
    }
};

// Función para limpiar archivos huérfanos (archivos sin referencia en la base de datos)
const limpiarArchivosHuerfanos = async () => {
    try {
        const Dispositivo = require('../models/Dispositivo');
        
        // Obtener todos los archivos en el directorio de uploads
        const archivosEnDisco = fs.readdirSync(uploadsDir);
        
        // Obtener todos los archivos referenciados en la base de datos
        const dispositivos = await Dispositivo.find({}, 'fotos');
        const archivosEnDB = dispositivos.reduce((acc, dispositivo) => {
            if (dispositivo.fotos && Array.isArray(dispositivo.fotos)) {
                acc.push(...dispositivo.fotos);
            }
            return acc;
        }, []);
        
        // Encontrar archivos huérfanos
        const archivosHuerfanos = archivosEnDisco.filter(archivo => !archivosEnDB.includes(archivo));
        
        // Eliminar archivos huérfanos
        let eliminados = 0;
        for (const archivo of archivosHuerfanos) {
            if (eliminarArchivo(archivo)) {
                eliminados++;
            }
        }
        
        if (eliminados > 0) {
            logger.info('Orphaned files cleaned up', { 
                deleted: eliminados,
                total: archivosHuerfanos.length 
            });
        }
        
        return { eliminados, total: archivosHuerfanos.length };
    } catch (error) {
        logger.error('Error cleaning orphaned files', { error: error.message });
        throw error;
    }
};

// Función para obtener información de un archivo
const obtenerInfoArchivo = (rutaArchivo) => {
    try {
        const rutaCompleta = path.join(__dirname, '../public/uploads', rutaArchivo);
        
        if (fs.existsSync(rutaCompleta)) {
            const stats = fs.statSync(rutaCompleta);
            return {
                exists: true,
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime
            };
        }
        
        return { exists: false };
    } catch (error) {
        logger.error('Error getting file info', { 
            filename: rutaArchivo,
            error: error.message 
        });
        return { exists: false, error: error.message };
    }
};

module.exports = {
    upload,
    uploadFotosDispositivo,
    uploadFotoUnica,
    uploadWithErrorHandling,
    eliminarArchivo,
    limpiarArchivosHuerfanos,
    obtenerInfoArchivo
};