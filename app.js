require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// Import configurations and middleware
const connectDB = require('./config/database');
const logger = require('./config/logger');

// Import routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const recepcionRoutes = require('./routes/recepcion');
const tecnicoRoutes = require('./routes/tecnico');

const app = express();

// Connect to database
connectDB();

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            scriptSrcAttr: ["'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
        },
    },
    crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? process.env.ALLOWED_ORIGINS?.split(',') : true,
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 400, // limit each IP to 400 requests per windowMs
    message: {
        error: 'Demasiadas peticiones desde esta IP, intente nuevamente más tarde.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply rate limiting to all routes
app.use(limiter);

// Stricter rate limiting for login attempts
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 7, // limit each IP to 7 login attempts per windowMs
    message: {
        error: 'Demasiados intentos de login, intente nuevamente más tarde.'
    },
    skipSuccessfulRequests: true,
});

// Apply stricter rate limiting to login routes
app.use('/login', loginLimiter);

// Body parsing middleware
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'strict'
    },
    name: 'rocketgsm.sid' // Change default session name
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Global middleware to add user to res.locals for use in templates
app.use((req, res, next) => {
    res.locals.user = req.user;
    res.locals.error = req.query.error;
    res.locals.success = req.query.success;
    next();
});

// Routes
app.use('/', authRoutes);
app.use('/admin', adminRoutes);
app.use('/recepcion', recepcionRoutes);
app.use('/tecnico', tecnicoRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error('Unhandled error', { 
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip 
    });

    // Don't leak error details in production
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(500).json({ 
            error: isDevelopment ? err.message : 'Error interno del servidor'
        });
    }

    res.status(500).render('error', { 
        message: 'Error interno del servidor',
        error: isDevelopment ? err : { status: 500 }
    });
});

// 404 handler
app.use((req, res) => {
    logger.warn('404 Not Found', { 
        url: req.url,
        method: req.method,
        ip: req.ip 
    });

    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(404).json({ error: 'Página no encontrada' });
    }

    res.status(404).render('error', { 
        message: 'Página no encontrada',
        error: { status: 404 }
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
});

// Unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', { 
        promise: promise,
        reason: reason 
    });
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', { 
        error: error.message,
        stack: error.stack 
    });
    process.exit(1);
});

// Start server
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0'; // Listen on all network interfaces
const server = app.listen(PORT, HOST, () => {
    logger.info(`Server running on ${HOST}:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    logger.info(`Access from other devices using: http://[YOUR_IP]:${PORT}`);
});

// Handle server errors
server.on('error', (error) => {
    if (error.syscall !== 'listen') {
        throw error;
    }

    const bind = typeof PORT === 'string' ? 'Pipe ' + PORT : 'Port ' + PORT;

    switch (error.code) {
        case 'EACCES':
            logger.error(`${bind} requires elevated privileges`);
            process.exit(1);
            break;
        case 'EADDRINUSE':
            logger.error(`${bind} is already in use`);
            process.exit(1);
            break;
        default:
            throw error;
    }
});

module.exports = app;