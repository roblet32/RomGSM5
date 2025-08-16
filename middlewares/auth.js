const User = require('../models/user');
const logger = require('../config/logger');

// Middleware de autenticación
const isAuthenticated = (req, res, next) => {
    if (req.session.userId) {
        return next();
    }
    logger.warn('Unauthenticated access attempt', { 
        ip: req.ip, 
        userAgent: req.get('User-Agent'),
        path: req.path 
    });
    res.redirect('/login');
};

// Middleware para verificar rol específico
const hasRole = (roles) => {
    return async (req, res, next) => {
        try {
            if (!req.session.userId) {
                logger.warn('Unauthenticated access attempt', { 
                    ip: req.ip, 
                    path: req.path 
                });
                return res.redirect('/login');
            }

            const user = await User.findById(req.session.userId);
            if (!user) {
                logger.warn('User not found in session', { 
                    userId: req.session.userId,
                    ip: req.ip 
                });
                req.session.destroy();
                return res.redirect('/login');
            }

            if (!user.activo) {
                logger.warn('Inactive user access attempt', { 
                    userId: user._id,
                    username: user.username,
                    ip: req.ip 
                });
                req.session.destroy();
                return res.redirect('/login?error=Cuenta desactivada');
            }

            const userRoles = Array.isArray(roles) ? roles : [roles];
            if (userRoles.includes(user.role)) {
                req.user = user; // Add user to request for use in routes
                return next();
            }

            logger.warn('Unauthorized access attempt', { 
                userId: user._id,
                username: user.username,
                userRole: user.role,
                requiredRoles: userRoles,
                ip: req.ip,
                path: req.path 
            });
            res.status(403).render('error', { 
                message: 'Acceso denegado',
                error: { status: 403 }
            });
        } catch (error) {
            logger.error('Auth middleware error', { 
                error: error.message,
                userId: req.session.userId,
                ip: req.ip 
            });
            res.status(500).render('error', { 
                message: 'Error interno del servidor',
                error: { status: 500 }
            });
        }
    };
};

// Middleware específicos para cada rol
const isAdmin = hasRole('admin');
const isTecnico = hasRole('tecnico');
const isRecepcion = hasRole('recepcion');

// Middleware para verificar permisos específicos
const hasPermission = (permission) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Usuario no autenticado' });
            }

            if (req.user.role === 'admin' || req.user.permissions.includes(permission)) {
                return next();
            }

            logger.warn('Permission denied', { 
                userId: req.user._id,
                username: req.user.username,
                requiredPermission: permission,
                ip: req.ip 
            });
            res.status(403).json({ error: 'Permiso denegado' });
        } catch (error) {
            logger.error('Permission check error', { error: error.message });
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    };
};

module.exports = {
    isAuthenticated,
    hasRole,
    isAdmin,
    isTecnico,
    isRecepcion,
    hasPermission
}; 