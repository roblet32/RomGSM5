const { body, param, query, validationResult } = require('express-validator');
const logger = require('../config/logger');

// Middleware para manejar errores de validación
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        logger.warn('Validation errors', { 
            errors: errors.array(),
            path: req.path,
            method: req.method,
            ip: req.ip 
        });
        
        // Si es una petición AJAX, devolver JSON
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(400).json({ 
                error: 'Datos inválidos',
                details: errors.array() 
            });
        }
        
        // Para peticiones normales, redirigir de vuelta al formulario con errores
        return res.redirect('back');
    }
    next();
};

// Validaciones para login
const loginValidation = [
    body('username')
        .trim()
        .isLength({ min: 3, max: 50 })
        .withMessage('El nombre de usuario debe tener entre 3 y 50 caracteres')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('El nombre de usuario solo puede contener letras, números y guiones bajos'),
    body('password')
        .isLength({ min: 6 })
        .withMessage('La contraseña debe tener al menos 6 caracteres'),
    handleValidationErrors
];

// Validaciones para registro de usuarios
const userRegistrationValidation = [
    body('username')
        .trim()
        .isLength({ min: 3, max: 50 })
        .withMessage('El nombre de usuario debe tener entre 3 y 50 caracteres')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('El nombre de usuario solo puede contener letras, números y guiones bajos'),
    body('password')
        .isLength({ min: 8 })
        .withMessage('La contraseña debe tener al menos 8 caracteres')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('La contraseña debe contener al menos una mayúscula, una minúscula y un número'),
    body('email')
        .isEmail()
        .withMessage('Ingrese un email válido')
        .normalizeEmail(),
    body('nombre')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('El nombre debe tener entre 2 y 100 caracteres'),
    body('role')
        .isIn(['admin', 'tecnico', 'recepcion'])
        .withMessage('Rol inválido'),
    handleValidationErrors
];

// Validaciones para clientes
const clienteValidation = [
    body('nombre')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('El nombre debe tener entre 2 y 100 caracteres'),
    body('telefono')
        .trim()
        .matches(/^[\+]?[0-9\s\-\(\)]{7,15}$/)
        .withMessage('Ingrese un número de teléfono válido'),
    body('email')
        .optional()
        .isEmail()
        .withMessage('Ingrese un email válido')
        .normalizeEmail(),
    handleValidationErrors
];

// Validaciones para dispositivos
const dispositivoValidation = [
    body('cliente')
        .isMongoId()
        .withMessage('Cliente inválido'),
    body('tipo')
        .isIn(['Smartphone', 'Tablet', 'Laptop', 'Desktop', 'Consola', 'Otro'])
        .withMessage('Tipo de dispositivo inválido'),
    body('marca')
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('La marca debe tener entre 1 y 50 caracteres'),
    body('modelo')
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('El modelo debe tener entre 1 y 50 caracteres'),
    body('numeroSerie')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('El número de serie no puede exceder 100 caracteres'),
    body('descripcionProblema')
        .trim()
        .isLength({ min: 10, max: 1000 })
        .withMessage('La descripción del problema debe tener entre 10 y 1000 caracteres'),
    body('accesoriosIncluidos')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Los accesorios no pueden exceder 500 caracteres'),
    handleValidationErrors
];

// Validaciones para órdenes de servicio
const ordenServicioValidation = [
    body('dispositivo')
        .isMongoId()
        .withMessage('Dispositivo inválido'),
    body('tipoServicio')
        .isIn(['reparacion', 'mantenimiento', 'instalacion'])
        .withMessage('Tipo de servicio inválido'),
    body('prioridad')
        .optional()
        .isIn(['baja', 'media', 'alta', 'urgente'])
        .withMessage('Prioridad inválida'),
    body('diagnosticoInicial')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('El diagnóstico inicial no puede exceder 1000 caracteres'),
    body('observaciones')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Las observaciones no pueden exceder 1000 caracteres'),
    handleValidationErrors
];

// Validaciones para cotizaciones
const cotizacionValidation = [
    body('descripcionManoObra')
        .trim()
        .isLength({ min: 10, max: 500 })
        .withMessage('La descripción de mano de obra debe tener entre 10 y 500 caracteres'),
    body('horas')
        .isFloat({ min: 0.5, max: 100 })
        .withMessage('Las horas deben ser entre 0.5 y 100'),
    body('precioPorHora')
        .isFloat({ min: 0 })
        .withMessage('El precio por hora debe ser mayor a 0'),
    body('observaciones')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Las observaciones no pueden exceder 1000 caracteres'),
    handleValidationErrors
];

// Validaciones para inventario
const inventarioValidation = [
    body('nombre')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('El nombre debe tener entre 2 y 100 caracteres'),
    body('descripcion')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('La descripción no puede exceder 500 caracteres'),
    body('categoria')
        .isIn(['repuestos', 'herramientas', 'accesorios', 'otros'])
        .withMessage('Categoría inválida'),
    body('precio')
        .isFloat({ min: 0 })
        .withMessage('El precio debe ser mayor o igual a 0'),
    body('stock')
        .isInt({ min: 0 })
        .withMessage('El stock debe ser un número entero mayor o igual a 0'),
    body('stockMinimo')
        .optional()
        .isInt({ min: 0 })
        .withMessage('El stock mínimo debe ser un número entero mayor o igual a 0'),
    handleValidationErrors
];

// Validaciones para parámetros de ID
const idValidation = [
    param('id')
        .isMongoId()
        .withMessage('ID inválido'),
    handleValidationErrors
];

module.exports = {
    handleValidationErrors,
    loginValidation,
    userRegistrationValidation,
    clienteValidation,
    dispositivoValidation,
    ordenServicioValidation,
    cotizacionValidation,
    inventarioValidation,
    idValidation
}; 