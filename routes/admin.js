const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Cliente = require('../models/Cliente');
const Dispositivo = require('../models/Dispositivo');
const OrdenServicio = require('../models/OrdenServicio');
const Cotizacion = require('../models/Cotizacion');
const InventarioItem = require('../models/InventarioItem');

const { isAdmin } = require('../middlewares/auth');
const { 
    userRegistrationValidation, 
    inventarioValidation,
    idValidation 
} = require('../middlewares/validation');
const logger = require('../config/logger');

// Dashboard Admin
router.get('/dashboard', isAdmin, async (req, res) => {
    try {
        // Estadísticas básicas
        const totalOrdenes = await OrdenServicio.countDocuments();
        const totalClientes = await Cliente.countDocuments();
        const totalDispositivos = await Dispositivo.countDocuments();

        // Ingresos totales (sumando cotizaciones aprobadas y pagadas)
        const cotizacionesPagadas = await Cotizacion.aggregate([
            { $match: { estado: 'aprobada' } },
            {
                $lookup: {
                    from: 'ordenservicios',
                    localField: 'ordenServicio',
                    foreignField: '_id',
                    as: 'orden'
                }
            },
            { $unwind: '$orden' },
            { $match: { 'orden.estadoPago': 'pagada' } },
            { $group: { _id: null, total: { $sum: '$total' } } }
        ]);
        const ingresosTotales = cotizacionesPagadas[0] ? cotizacionesPagadas[0].total : 0;

        // Ingresos por mes (últimos 12 meses)
        const ingresosPorMes = await Cotizacion.aggregate([
            { $match: { estado: 'aprobada' } },
            {
                $lookup: {
                    from: 'ordenservicios',
                    localField: 'ordenServicio',
                    foreignField: '_id',
                    as: 'orden'
                }
            },
            { $unwind: '$orden' },
            { $match: { 'orden.estadoPago': 'pagada' } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m", date: "$fechaCreacion" } },
                    total: { $sum: '$total' }
                }
            },
            { $sort: { "_id": -1 } },
            { $limit: 12 }
        ]);

        // Estadísticas avanzadas
        const finalizadasPorMes = await OrdenServicio.aggregate([
            { $match: { estado: 'finalizada', fechaFinalizacion: { $exists: true } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m", date: "$fechaFinalizacion" } },
                    total: { $sum: 1 }
                }
            },
            { $sort: { "_id": -1 } },
            { $limit: 12 }
        ]);
        const totalFinalizadas = await OrdenServicio.countDocuments({ estado: 'finalizada' });
        const totalPagadas = await OrdenServicio.countDocuments({ estadoPago: 'pagada' });
        const totalPendientesPago = await OrdenServicio.countDocuments({ estadoPago: { $in: ['no_pagada', 'parcial'] } });
        const totalEnProceso = await OrdenServicio.countDocuments({ estado: { $in: ['asignada', 'cotizacion_enviada', 'aprobada', 'en_proceso'] } });

        res.render('dashboards/admin', {
            user: req.user,
            totalOrdenes,
            totalClientes,
            totalDispositivos,
            ingresosTotales,
            ingresosPorMes,
            finalizadasPorMes,
            totalFinalizadas,
            totalPagadas,
            totalPendientesPago,
            totalEnProceso
        });
    } catch (error) {
        res.status(500).render('error', { message: 'Error cargando estadísticas', error });
    }
});


// ===========================================
// GESTIÓN DE USUARIOS
// ===========================================

// Formulario de registro de usuario
router.get('/register-user', isAdmin, (req, res) => {
    res.render('admin/register_user', { 
        error: req.query.error,
        success: req.query.success 
    });
});

// Crear nuevo usuario
router.post('/register-user', isAdmin, async (req, res) => {
    try {
        const { username, password, role, nombre, email } = req.body;

        // Validación manual
        if (!username || !password || !role || !nombre) {
            return res.render('admin/register_user', { 
                error: 'Por favor, complete todos los campos requeridos',
                formData: req.body 
            });
        }

        // Validar username
        if (username.length < 3 || username.length > 50) {
            return res.render('admin/register_user', { 
                error: 'El nombre de usuario debe tener entre 3 y 50 caracteres',
                formData: req.body 
            });
        }

        // Validar password
        if (password.length < 8) {
            return res.render('admin/register_user', { 
                error: 'La contraseña debe tener al menos 8 caracteres',
                formData: req.body 
            });
        }

        // Validar role
        const rolesValidos = ['admin', 'tecnico', 'recepcion'];
        if (!rolesValidos.includes(role)) {
            return res.render('admin/register_user', { 
                error: 'Rol inválido',
                formData: req.body 
            });
        }

        // Verificar si el username ya existe
        const existingUser = await User.findOne({ username: username.toLowerCase() });
        if (existingUser) {
            return res.render('admin/register_user', { 
                error: 'El nombre de usuario ya existe',
                formData: req.body 
            });
        }

        // Verificar si el email ya existe (si se proporciona)
        if (email) {
            const existingEmail = await User.findOne({ email: email.toLowerCase() });
            if (existingEmail) {
                return res.render('admin/register_user', { 
                    error: 'El email ya está registrado',
                    formData: req.body 
                });
            }
        }

        const newUser = new User({
            username: username.toLowerCase(),
            password,
            role,
            nombre,
            email: email ? email.toLowerCase() : undefined
        });

        await newUser.save();

        logger.info('New user created', { 
            createdBy: req.user.username,
            newUser: username,
            role: role 
        });

        res.redirect('/admin/users?success=Usuario creado correctamente');
    } catch (error) {
        logger.error('User creation error', { 
            error: error.message,
            createdBy: req.user.username 
        });
        res.render('admin/register_user', { 
            error: 'Error creando usuario: ' + error.message,
            formData: req.body 
        });
    }
});

// Lista de usuarios
router.get('/users', isAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const skip = (page - 1) * limit;

        const users = await User.find({ activo: true })
            .sort({ fechaCreacion: -1 })
            .skip(skip)
            .limit(limit);

        const totalUsers = await User.countDocuments({ activo: true });
        const totalPages = Math.ceil(totalUsers / limit);

        res.render('admin/users', { 
            users,
            pagination: {
                page,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        logger.error('Users list error', { error: error.message });
        res.status(500).render('error', { 
            message: 'Error cargando usuarios',
            error: { status: 500 }
        });
    }
});

// Desactivar usuario
router.post('/users/:id/deactivate', isAdmin, idValidation, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // No permitir desactivar el propio usuario
        if (user._id.toString() === req.user._id.toString()) {
            return res.status(400).json({ error: 'No puede desactivar su propia cuenta' });
        }

        user.activo = false;
        await user.save();

        logger.info('User deactivated', { 
            deactivatedBy: req.user.username,
            deactivatedUser: user.username 
        });

        res.json({ success: true, message: 'Usuario desactivado correctamente' });
    } catch (error) {
        logger.error('User deactivation error', { error: error.message });
        res.status(500).json({ error: 'Error desactivando usuario' });
    }
});

// ===========================================
// GESTIÓN DE INVENTARIO
// ===========================================

// Lista de inventario
router.get('/inventario', isAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const skip = (page - 1) * limit;

        const inventario = await InventarioItem.find({ activo: true })
            .sort({ nombre: 1 })
            .skip(skip)
            .limit(limit);

        const totalItems = await InventarioItem.countDocuments({ activo: true });
        const totalPages = Math.ceil(totalItems / limit);

        res.render('admin/inventario', { 
            inventario,
            pagination: {
                page,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        logger.error('Inventory list error', { error: error.message });
        res.status(500).render('error', { 
            message: 'Error cargando inventario',
            error: { status: 500 }
        });
    }
});

// Formulario de nuevo item
router.get('/inventario/nuevo', isAdmin, (req, res) => {
    res.render('admin/inventario_form', { 
        error: req.query.error,
        success: req.query.success 
    });
});

// Crear nuevo item
router.post('/inventario/nuevo', isAdmin, async (req, res) => {
    try {
        const { nombre, descripcion, categoria, precio, stock, stockMinimo } = req.body;

        // Validación manual
        if (!nombre || !categoria || !precio || !stock) {
            return res.render('admin/inventario_form', { 
                error: 'Por favor, complete todos los campos requeridos',
                formData: req.body 
            });
        }

        // Validar categoría
        const categoriasValidas = ['repuestos', 'herramientas', 'accesorios', 'otros'];
        if (!categoriasValidas.includes(categoria)) {
            return res.render('admin/inventario_form', { 
                error: 'Categoría inválida',
                formData: req.body 
            });
        }

        // Validar precio y stock
        if (isNaN(precio) || parseFloat(precio) < 0) {
            return res.render('admin/inventario_form', { 
                error: 'El precio debe ser un número mayor o igual a 0',
                formData: req.body 
            });
        }

        if (isNaN(stock) || parseInt(stock) < 0) {
            return res.render('admin/inventario_form', { 
                error: 'El stock debe ser un número entero mayor o igual a 0',
                formData: req.body 
            });
        }

        const nuevoItem = new InventarioItem({
            nombre,
            descripcion,
            categoria,
            precio: parseFloat(precio),
            stock: parseInt(stock),
            stockMinimo: parseInt(stockMinimo) || 1
        });

        await nuevoItem.save();

        logger.info('New inventory item created', { 
            createdBy: req.user.username,
            itemName: nombre,
            category: categoria 
        });

        res.redirect('/admin/inventario?success=Item agregado correctamente');
    } catch (error) {
        logger.error('Inventory item creation error', { 
            error: error.message,
            createdBy: req.user.username 
        });
        res.render('admin/inventario_form', { 
            error: 'Error agregando item: ' + error.message,
            formData: req.body 
        });
    }
});

// Editar item
router.get('/inventario/:id/editar', isAdmin, idValidation, async (req, res) => {
    try {
        const item = await InventarioItem.findById(req.params.id);
        
        if (!item) {
            return res.status(404).render('error', { 
                message: 'Item no encontrado',
                error: { status: 404 }
            });
        }

        res.render('admin/inventario_form', { 
            item,
            isEdit: true 
        });
    } catch (error) {
        logger.error('Inventory item edit error', { error: error.message });
        res.status(500).render('error', { 
            message: 'Error cargando item',
            error: { status: 500 }
        });
    }
});

// Actualizar item
router.post('/inventario/:id/editar', isAdmin, idValidation, async (req, res) => {
    try {
        const { nombre, descripcion, categoria, precio, stock, stockMinimo } = req.body;

        // Validación manual
        if (!nombre || !categoria || !precio || !stock) {
            const item = await InventarioItem.findById(req.params.id);
            return res.render('admin/inventario_form', { 
                item,
                error: 'Por favor, complete todos los campos requeridos',
                formData: req.body,
                isEdit: true 
            });
        }

        // Validar categoría
        const categoriasValidas = ['repuestos', 'herramientas', 'accesorios', 'otros'];
        if (!categoriasValidas.includes(categoria)) {
            const item = await InventarioItem.findById(req.params.id);
            return res.render('admin/inventario_form', { 
                item,
                error: 'Categoría inválida',
                formData: req.body,
                isEdit: true 
            });
        }

        // Validar precio y stock
        if (isNaN(precio) || parseFloat(precio) < 0) {
            const item = await InventarioItem.findById(req.params.id);
            return res.render('admin/inventario_form', { 
                item,
                error: 'El precio debe ser un número mayor o igual a 0',
                formData: req.body,
                isEdit: true 
            });
        }

        if (isNaN(stock) || parseInt(stock) < 0) {
            const item = await InventarioItem.findById(req.params.id);
            return res.render('admin/inventario_form', { 
                item,
                error: 'El stock debe ser un número entero mayor o igual a 0',
                formData: req.body,
                isEdit: true 
            });
        }

        const item = await InventarioItem.findByIdAndUpdate(req.params.id, {
            nombre,
            descripcion,
            categoria,
            precio: parseFloat(precio),
            stock: parseInt(stock),
            stockMinimo: parseInt(stockMinimo) || 1
        }, { new: true });

        if (!item) {
            return res.status(404).render('error', { 
                message: 'Item no encontrado',
                error: { status: 404 }
            });
        }

        logger.info('Inventory item updated', { 
            updatedBy: req.user.username,
            itemName: nombre 
        });

        res.redirect('/admin/inventario?success=Item actualizado correctamente');
    } catch (error) {
        logger.error('Inventory item update error', { error: error.message });
        const item = await InventarioItem.findById(req.params.id);
        res.render('admin/inventario_form', { 
            item,
            error: 'Error actualizando item: ' + error.message,
            formData: req.body,
            isEdit: true 
        });
    }
});

// Eliminar item del inventario
router.post('/inventario/:id/eliminar', isAdmin, idValidation, async (req, res) => {
    try {
        const item = await InventarioItem.findById(req.params.id);
        
        if (!item) {
            return res.status(404).json({ error: 'Item no encontrado' });
        }

        item.activo = false;
        await item.save();

        logger.info('Inventory item deleted', { 
            deletedBy: req.user.username,
            itemName: item.nombre 
        });

        res.json({ success: true, message: 'Item eliminado correctamente' });
    } catch (error) {
        logger.error('Inventory item deletion error', { error: error.message });
        res.status(500).json({ error: 'Error eliminando item' });
    }
});

// ===========================================
// GESTIÓN AVANZADA DE USUARIOS
// ===========================================

// Editar usuario
router.get('/users/:id/editar', isAdmin, idValidation, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).render('error', { 
                message: 'Usuario no encontrado',
                error: { status: 404 }
            });
        }

        res.render('admin/user_form', { 
            user,
            isEdit: true 
        });
    } catch (error) {
        logger.error('User edit error', { error: error.message });
        res.status(500).render('error', { 
            message: 'Error cargando usuario',
            error: { status: 500 }
        });
    }
});

// Actualizar usuario
router.post('/users/:id/editar', isAdmin, idValidation, async (req, res) => {
    try {
        const { username, role, nombre, email, activo } = req.body;

        // Validación manual
        if (!username || !role || !nombre) {
            const user = await User.findById(req.params.id);
            return res.render('admin/user_form', { 
                user,
                error: 'Por favor, complete todos los campos requeridos',
                formData: req.body,
                isEdit: true 
            });
        }

        // Validar username
        if (username.length < 3 || username.length > 50) {
            const user = await User.findById(req.params.id);
            return res.render('admin/user_form', { 
                user,
                error: 'El nombre de usuario debe tener entre 3 y 50 caracteres',
                formData: req.body,
                isEdit: true 
            });
        }

        // Validar role
        const rolesValidos = ['admin', 'tecnico', 'recepcion'];
        if (!rolesValidos.includes(role)) {
            const user = await User.findById(req.params.id);
            return res.render('admin/user_form', { 
                user,
                error: 'Rol inválido',
                formData: req.body,
                isEdit: true 
            });
        }

        const user = await User.findByIdAndUpdate(req.params.id, {
            username: username.toLowerCase(),
            role,
            nombre,
            email: email ? email.toLowerCase() : undefined,
            activo: activo === 'true'
        }, { new: true });

        if (!user) {
            return res.status(404).render('error', { 
                message: 'Usuario no encontrado',
                error: { status: 404 }
            });
        }

        logger.info('User updated', { 
            updatedBy: req.user.username,
            updatedUser: username 
        });

        res.redirect('/admin/users?success=Usuario actualizado correctamente');
    } catch (error) {
        logger.error('User update error', { error: error.message });
        const user = await User.findById(req.params.id);
        res.render('admin/user_form', { 
            user,
            error: 'Error actualizando usuario: ' + error.message,
            formData: req.body,
            isEdit: true 
        });
    }
});

// Cambiar contraseña de usuario
router.get('/users/:id/cambiar-password', isAdmin, idValidation, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).render('error', { 
                message: 'Usuario no encontrado',
                error: { status: 404 }
            });
        }

        res.render('admin/change_password', { 
            user,
            error: req.query.error,
            success: req.query.success 
        });
    } catch (error) {
        logger.error('Change password error', { error: error.message });
        res.status(500).render('error', { 
            message: 'Error cargando formulario',
            error: { status: 500 }
        });
    }
});

// Actualizar contraseña
router.post('/users/:id/cambiar-password', isAdmin, idValidation, async (req, res) => {
    try {
        const { newPassword, confirmPassword } = req.body;

        if (newPassword !== confirmPassword) {
            return res.render('admin/change_password', { 
                error: 'Las contraseñas no coinciden',
                user: { _id: req.params.id }
            });
        }

        if (newPassword.length < 8) {
            return res.render('admin/change_password', { 
                error: 'La contraseña debe tener al menos 8 caracteres',
                user: { _id: req.params.id }
            });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).render('error', { 
                message: 'Usuario no encontrado',
                error: { status: 404 }
            });
        }

        user.password = newPassword;
        await user.save();

        logger.info('User password changed', { 
            changedBy: req.user.username,
            changedUser: user.username 
        });

        res.redirect('/admin/users?success=Contraseña actualizada correctamente');
    } catch (error) {
        logger.error('Password change error', { error: error.message });
        res.render('admin/change_password', { 
            error: 'Error cambiando contraseña: ' + error.message,
            user: { _id: req.params.id }
        });
    }
});



module.exports = router; 