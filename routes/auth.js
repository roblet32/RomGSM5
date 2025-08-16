const express = require('express');
const router = express.Router();
const User = require('../models/user');
const { loginValidation } = require('../middlewares/validation');
const logger = require('../config/logger');

// Login page
router.get('/login', (req, res) => {
    res.render('login', { 
        error: req.query.error,
        success: req.query.success 
    });
});

// Login process
router.post('/login', loginValidation, async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Find user by username
        const user = await User.findOne({ username: username.toLowerCase() });
        
        if (!user) {
            logger.warn('Login attempt with non-existent username', { 
                username: username.toLowerCase(),
                ip: req.ip 
            });
            return res.render('login', { 
                error: 'Credenciales incorrectas',
                username: username 
            });
        }

        // Check if account is active
        if (!user.activo) {
            logger.warn('Login attempt with inactive account', { 
                username: user.username,
                ip: req.ip 
            });
            return res.render('login', { 
                error: 'Cuenta desactivada. Contacte al administrador.',
                username: username 
            });
        }

        // Check if account is locked
        if (user.isLocked()) {
            logger.warn('Login attempt with locked account', { 
                username: user.username,
                ip: req.ip 
            });
            return res.render('login', { 
                error: `Cuenta bloqueada temporalmente. Intente nuevamente después de ${user.bloqueadoHasta.toLocaleString()}`,
                username: username 
            });
        }

        // Verify password
        const isValidPassword = await user.comparePassword(password);
        
        if (!isValidPassword) {
            // Increment login attempts
            await user.incrementLoginAttempts();
            
            logger.warn('Failed login attempt', { 
                username: user.username,
                ip: req.ip,
                attempts: user.intentosLogin 
            });
            
            return res.render('login', { 
                error: 'Credenciales incorrectas',
                username: username 
            });
        }

        // Reset login attempts on successful login
        await user.resetLoginAttempts();
        
        // Set session
        req.session.userId = user._id;
        req.session.userRole = user.role;
        
        // Update last access
        await User.findByIdAndUpdate(user._id, { 
            ultimoAcceso: new Date() 
        });

        logger.info('Successful login', { 
            username: user.username,
            role: user.role,
            ip: req.ip 
        });

        res.redirect('/dashboard');
        
    } catch (error) {
        logger.error('Login error', { 
            error: error.message,
            ip: req.ip 
        });
        res.render('login', { 
            error: 'Error interno del servidor. Intente nuevamente.',
            username: req.body.username 
        });
    }
});

// Logout
router.get('/logout', (req, res) => {
    if (req.session.userId) {
        logger.info('User logout', { 
            userId: req.session.userId,
            ip: req.ip 
        });
    }
    
    req.session.destroy((err) => {
        if (err) {
            logger.error('Session destruction error', { error: err.message });
        }
        res.redirect('/login');
    });
});

// Dashboard redirect based on role
router.get('/dashboard', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    const role = req.session.userRole;
    
    switch (role) {
        case 'admin':
            res.redirect('/admin/dashboard');
            break;
        case 'tecnico':
            res.redirect('/tecnico/dashboard');
            break;
        case 'recepcion':
            res.redirect('/recepcion/dashboard');
            break;
        default:
            logger.warn('Unknown user role', { 
                userId: req.session.userId,
                role: role 
            });
            req.session.destroy();
            res.redirect('/login?error=Rol desconocido');
    }
});

// Root redirect
router.get('/', (req, res) => {
    res.redirect('/login');
});

module.exports = router; 