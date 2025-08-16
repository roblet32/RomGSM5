const express = require('express');
const router = express.Router();
const Cliente = require('../models/Cliente');
const Dispositivo = require('../models/Dispositivo');
const OrdenServicio = require('../models/OrdenServicio');
const puppeteer = require('puppeteer');
const Cotizacion = require('../models/Cotizacion');
const InventarioItem = require('../models/InventarioItem');
const { isRecepcion } = require('../middlewares/auth');
const { 
    clienteValidation, 
    dispositivoValidation, 
    ordenServicioValidation,
    idValidation 
} = require('../middlewares/validation');
const { uploadWithErrorHandling } = require('../middlewares/multer');
const logger = require('../config/logger');

// Dashboard Recepción
router.get('/dashboard', isRecepcion, async (req, res) => {
    try {
        // Órdenes recientes
        const ordenesRecientes = await OrdenServicio.find({ activo: true })
            .populate('dispositivo')
            .populate('tecnicoAsignado')
            .sort({ fechaCreacion: -1 })
            .limit(10);

        // Cotizaciones pendientes
        const cotizacionesPendientes = await Cotizacion.find({ estado: 'pendiente' })
            .populate({
                path: 'ordenServicio',
                populate: { path: 'dispositivo' }
            })
            .sort({ fechaCreacion: -1 });

        // Estadísticas del día
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const mañana = new Date(hoy);
        mañana.setDate(mañana.getDate() + 1);

        const ordenesHoy = await OrdenServicio.countDocuments({
            fechaCreacion: { $gte: hoy, $lt: mañana },
            activo: true
        });

        const clientesHoy = await Cliente.countDocuments({
            fechaRegistro: { $gte: hoy, $lt: mañana },
            activo: true
        });

        // Estadísticas generales
        const totalOrdenes = await OrdenServicio.countDocuments({ activo: true });
        const totalClientes = await Cliente.countDocuments({ activo: true });
        const totalDispositivos = await Dispositivo.countDocuments({ activo: true });
        const totalPagadas = await OrdenServicio.countDocuments({ estadoPago: 'pagada', activo: true });
        const totalPendientesPago = await OrdenServicio.countDocuments({ estadoPago: { $in: ['no_pagada', 'parcial'] }, activo: true });
        const totalEnProceso = await OrdenServicio.countDocuments({ estado: { $in: ['asignada', 'cotizacion_enviada', 'aprobada', 'en_proceso'] }, activo: true });

        // Estadísticas de la semana
        const inicioSemana = new Date();
        inicioSemana.setDate(inicioSemana.getDate() - 7);
        const ordenesSemana = await OrdenServicio.countDocuments({
            fechaCreacion: { $gte: inicioSemana },
            activo: true
        });
        const clientesSemana = await Cliente.countDocuments({
            fechaRegistro: { $gte: inicioSemana },
            activo: true
        });

        res.render('dashboards/recepcion', { 
            user: req.user,
            ordenesRecientes,
            cotizacionesPendientes,
            stats: {
                ordenesHoy,
                clientesHoy,
                ordenesSemana,
                clientesSemana,
                totalOrdenes,
                totalClientes,
                totalDispositivos,
                totalPagadas,
                totalPendientesPago,
                totalEnProceso
            }
        });
    } catch (error) {
        logger.error('Reception dashboard error', { error: error.message });
        res.status(500).render('error', { 
            message: 'Error cargando el dashboard',
            error: { status: 500 }
        });
    }
});

// ===========================================
// GESTIÓN DE CLIENTES
// ===========================================

// Lista de clientes
router.get('/clientes', isRecepcion, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const skip = (page - 1) * limit;

        const clientes = await Cliente.find({ activo: true })
            .sort({ fechaRegistro: -1 })
            .skip(skip)
            .limit(limit);

        const totalClientes = await Cliente.countDocuments({ activo: true });
        const totalPages = Math.ceil(totalClientes / limit);

        res.render('recepcion/clientes', { 
            clientes,
            pagination: {
                page,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        logger.error('Clients list error', { error: error.message });
        res.status(500).render('error', { 
            message: 'Error cargando clientes',
            error: { status: 500 }
        });
    }
});

// Formulario de nuevo cliente
router.get('/clientes/nuevo', isRecepcion, (req, res) => {
    res.render('recepcion/cliente_form', { 
        isEdit: false,
        error: req.query.error,
        success: req.query.success 
    });
});

// Crear nuevo cliente
router.post('/clientes/nuevo', isRecepcion, async (req, res) => {
    try {
        const { nombre, telefono, email } = req.body;

        // Validación manual
        if (!nombre || !telefono) {
            return res.render('recepcion/cliente_form', { 
                error: 'Por favor, complete todos los campos requeridos',
                formData: req.body 
            });
        }

        // Validar nombre
        if (nombre.length < 2 || nombre.length > 100) {
            return res.render('recepcion/cliente_form', { 
                error: 'El nombre debe tener entre 2 y 100 caracteres',
                formData: req.body 
            });
        }

        // Validar teléfono (simplificado)
        if (telefono.length < 7 || telefono.length > 20) {
            return res.render('recepcion/cliente_form', { 
                error: 'El teléfono debe tener entre 7 y 20 caracteres',
                formData: req.body 
            });
        }

        // Verificar si el teléfono ya existe
        const existingCliente = await Cliente.findOne({ telefono });
        if (existingCliente) {
            return res.render('recepcion/cliente_form', { 
                error: 'Ya existe un cliente con este número de teléfono',
                formData: req.body 
            });
        }

        // Verificar si el email ya existe (si se proporciona)
        if (email) {
            const existingEmail = await Cliente.findOne({ email: email.toLowerCase() });
            if (existingEmail) {
                return res.render('recepcion/cliente_form', { 
                    error: 'Ya existe un cliente con este email',
                    formData: req.body 
                });
            }
        }

        const nuevoCliente = new Cliente({
            nombre,
            telefono,
            email: email ? email.toLowerCase() : undefined
        });

        await nuevoCliente.save();

        logger.info('New client created', { 
            createdBy: req.user.username,
            clientName: nombre 
        });

        res.redirect('/recepcion/clientes?success=Cliente registrado correctamente');
    } catch (error) {
        logger.error('Client creation error', { 
            error: error.message,
            createdBy: req.user.username 
        });
        res.render('recepcion/cliente_form', { 
            error: 'Error registrando cliente: ' + error.message,
            formData: req.body 
        });
    }
});

// Editar cliente
router.get('/clientes/:id/editar', isRecepcion, idValidation, async (req, res) => {
    try {
        const cliente = await Cliente.findById(req.params.id);
        
        if (!cliente) {
            return res.status(404).render('error', { 
                message: 'Cliente no encontrado',
                error: { status: 404 }
            });
        }

        res.render('recepcion/cliente_form', { 
            cliente,
            isEdit: true 
        });
    } catch (error) {
        logger.error('Client edit error', { error: error.message });
        res.status(500).render('error', { 
            message: 'Error cargando cliente',
            error: { status: 500 }
        });
    }
});

// Actualizar cliente
router.post('/clientes/:id/editar', isRecepcion, idValidation, async (req, res) => {
    try {
        const { nombre, telefono, email } = req.body;

        // Validación manual
        if (!nombre || !telefono) {
            const cliente = await Cliente.findById(req.params.id);
            return res.render('recepcion/cliente_form', { 
                cliente,
                error: 'Por favor, complete todos los campos requeridos',
                formData: req.body,
                isEdit: true 
            });
        }

        // Validar nombre
        if (nombre.length < 2 || nombre.length > 100) {
            const cliente = await Cliente.findById(req.params.id);
            return res.render('recepcion/cliente_form', { 
                cliente,
                error: 'El nombre debe tener entre 2 y 100 caracteres',
                formData: req.body,
                isEdit: true 
            });
        }

        // Validar teléfono (simplificado)
        if (telefono.length < 7 || telefono.length > 20) {
            const cliente = await Cliente.findById(req.params.id);
            return res.render('recepcion/cliente_form', { 
                cliente,
                error: 'El teléfono debe tener entre 7 y 20 caracteres',
                formData: req.body,
                isEdit: true 
            });
        }

        // Verificar si el teléfono ya existe en otro cliente
        const existingCliente = await Cliente.findOne({ 
            telefono, 
            _id: { $ne: req.params.id } 
        });
        if (existingCliente) {
            const cliente = await Cliente.findById(req.params.id);
            return res.render('recepcion/cliente_form', { 
                cliente,
                error: 'Ya existe otro cliente con este número de teléfono',
                formData: req.body,
                isEdit: true 
            });
        }

        // Verificar si el email ya existe en otro cliente (si se proporciona)
        if (email) {
            const existingEmail = await Cliente.findOne({ 
                email: email.toLowerCase(), 
                _id: { $ne: req.params.id } 
            });
            if (existingEmail) {
                const cliente = await Cliente.findById(req.params.id);
                return res.render('recepcion/cliente_form', { 
                    cliente,
                    error: 'Ya existe otro cliente con este email',
                    formData: req.body,
                    isEdit: true 
                });
            }
        }

        const cliente = await Cliente.findByIdAndUpdate(req.params.id, {
            nombre,
            telefono,
            email: email ? email.toLowerCase() : undefined
        }, { new: true });

        if (!cliente) {
            return res.status(404).render('error', { 
                message: 'Cliente no encontrado',
                error: { status: 404 }
            });
        }

        logger.info('Client updated', { 
            updatedBy: req.user.username,
            clientName: nombre 
        });

        res.redirect('/recepcion/clientes?success=Cliente actualizado correctamente');
    } catch (error) {
        logger.error('Client update error', { error: error.message });
        const cliente = await Cliente.findById(req.params.id);
        res.render('recepcion/cliente_form', { 
            cliente,
            error: 'Error actualizando cliente: ' + error.message,
            formData: req.body,
            isEdit: true 
        });
    }
});

// Eliminar cliente
router.post('/clientes/:id/eliminar', isRecepcion, idValidation, async (req, res) => {
    try {
        const cliente = await Cliente.findById(req.params.id);
        
        if (!cliente) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        // Verificar si tiene dispositivos activos
        const dispositivosActivos = await Dispositivo.countDocuments({ 
            cliente: req.params.id, 
            activo: true 
        });

        if (dispositivosActivos > 0) {
            return res.status(400).json({ 
                error: `No se puede eliminar el cliente porque tiene ${dispositivosActivos} dispositivo(s) activo(s)` 
            });
        }

        cliente.activo = false;
        await cliente.save();

        logger.info('Client deleted', { 
            deletedBy: req.user.username,
            clientName: cliente.nombre 
        });

        res.json({ success: true, message: 'Cliente eliminado correctamente' });
    } catch (error) {
        logger.error('Client deletion error', { error: error.message });
        res.status(500).json({ error: 'Error eliminando cliente' });
    }
});

// ===========================================
// GESTIÓN DE DISPOSITIVOS
// ===========================================

// Lista de dispositivos
router.get('/dispositivos', isRecepcion, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const skip = (page - 1) * limit;

        const dispositivos = await Dispositivo.find({ activo: true })
            .populate('cliente')
            .sort({ fechaIngreso: -1 })
            .skip(skip)
            .limit(limit);

        const totalDispositivos = await Dispositivo.countDocuments({ activo: true });
        const totalPages = Math.ceil(totalDispositivos / limit);

        res.render('recepcion/dispositivos', { 
            dispositivos,
            pagination: {
                page,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        logger.error('Devices list error', { error: error.message });
        res.status(500).render('error', { 
            message: 'Error cargando dispositivos',
            error: { status: 500 }
        });
    }
});

// Formulario de nuevo dispositivo
router.get('/dispositivos/nuevo', isRecepcion, async (req, res) => {
    try {
        const clientes = await Cliente.find({ activo: true }).sort({ nombre: 1 });
        res.render('recepcion/dispositivo_form', { 
            isEdit: false,
            clientes,
            error: req.query.error,
            success: req.query.success 
        });
    } catch (error) {
        logger.error('Device form error', { error: error.message });
        res.status(500).render('error', { 
            message: 'Error cargando formulario',
            error: { status: 500 }
        });
    }
});

// Crear nuevo dispositivo
router.post('/dispositivos/nuevo', isRecepcion, uploadWithErrorHandling, async (req, res) => {
    try {
        const { cliente, tipo, marca, modelo, numeroSerie, descripcionProblema, accesoriosIncluidos } = req.body;

        // Validación manual
        if (!cliente || !tipo || !marca || !modelo || !descripcionProblema) {
            const clientes = await Cliente.find({ activo: true }).sort({ nombre: 1 });
            return res.render('recepcion/dispositivo_form', { 
                clientes,
                error: 'Por favor, complete todos los campos requeridos',
                formData: req.body 
            });
        }

        // Validar tipo de dispositivo
        const tiposValidos = ['computadora', 'laptop', 'impresora', 'tablet', 'smartphone', 'monitor', 'otro'];
        if (!tiposValidos.includes(tipo)) {
            const clientes = await Cliente.find({ activo: true }).sort({ nombre: 1 });
            return res.render('recepcion/dispositivo_form', { 
                clientes,
                error: 'Tipo de dispositivo inválido',
                formData: req.body 
            });
        }

        const fotos = req.files ? req.files.map(file => file.filename) : [];

        const nuevoDispositivo = new Dispositivo({
            cliente,
            tipo,
            marca,
            modelo,
            numeroSerie,
            descripcionProblema,
            accesoriosIncluidos,
            fotos
        });

        await nuevoDispositivo.save();

        logger.info('New device created', { 
            createdBy: req.user.username,
            deviceType: tipo,
            brand: marca,
            model: modelo 
        });

        res.redirect('/recepcion/dispositivos?success=Dispositivo registrado correctamente');
    } catch (error) {
        logger.error('Device creation error', { 
            error: error.message,
            createdBy: req.user.username 
        });
        
        // Clean up uploaded files if there was an error
        if (req.files) {
            req.files.forEach(file => {
                const fs = require('fs');
                const path = require('path');
                const filePath = path.join(__dirname, '../public/uploads', file.filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });
        }

        const clientes = await Cliente.find({ activo: true }).sort({ nombre: 1 });
        res.render('recepcion/dispositivo_form', { 
            clientes,
            error: 'Error registrando dispositivo: ' + error.message,
            formData: req.body 
        });
    }
});

// Editar dispositivo
router.get('/dispositivos/:id/editar', isRecepcion, idValidation, async (req, res) => {
    try {
        const dispositivo = await Dispositivo.findById(req.params.id).populate('cliente');
        const clientes = await Cliente.find({ activo: true }).sort({ nombre: 1 });
        
        if (!dispositivo) {
            return res.status(404).render('error', { 
                message: 'Dispositivo no encontrado',
                error: { status: 404 }
            });
        }

        res.render('recepcion/dispositivo_form', { 
            dispositivo,
            clientes,
            isEdit: true 
        });
    } catch (error) {
        logger.error('Device edit error', { error: error.message });
        res.status(500).render('error', { 
            message: 'Error cargando dispositivo',
            error: { status: 500 }
        });
    }
});

// Actualizar dispositivo
router.post('/dispositivos/:id/editar', isRecepcion, idValidation, uploadWithErrorHandling, async (req, res) => {
    try {
        const { cliente, tipo, marca, modelo, numeroSerie, descripcionProblema, accesoriosIncluidos } = req.body;

        // Validación manual
        if (!cliente || !tipo || !marca || !modelo || !descripcionProblema) {
            const clientes = await Cliente.find({ activo: true }).sort({ nombre: 1 });
            const dispositivo = await Dispositivo.findById(req.params.id).populate('cliente');
            return res.render('recepcion/dispositivo_form', { 
                dispositivo,
                clientes,
                error: 'Por favor, complete todos los campos requeridos',
                formData: req.body,
                isEdit: true 
            });
        }

        // Validar tipo de dispositivo
        const tiposValidos = ['computadora', 'laptop', 'impresora', 'tablet', 'smartphone', 'monitor', 'otro'];
        if (!tiposValidos.includes(tipo)) {
            const clientes = await Cliente.find({ activo: true }).sort({ nombre: 1 });
            const dispositivo = await Dispositivo.findById(req.params.id).populate('cliente');
            return res.render('recepcion/dispositivo_form', { 
                dispositivo,
                clientes,
                error: 'Tipo de dispositivo inválido',
                formData: req.body,
                isEdit: true 
            });
        }

        const dispositivo = await Dispositivo.findById(req.params.id);
        if (!dispositivo) {
            return res.status(404).render('error', { 
                message: 'Dispositivo no encontrado',
                error: { status: 404 }
            });
        }

        // Manejar nuevas fotos si se subieron
        let fotos = dispositivo.fotos || [];
        if (req.files && req.files.length > 0) {
            const nuevasFotos = req.files.map(file => file.filename);
            fotos = [...fotos, ...nuevasFotos];
        }

        // Actualizar dispositivo
        dispositivo.cliente = cliente;
        dispositivo.tipo = tipo;
        dispositivo.marca = marca;
        dispositivo.modelo = modelo;
        dispositivo.numeroSerie = numeroSerie;
        dispositivo.descripcionProblema = descripcionProblema;
        dispositivo.accesoriosIncluidos = accesoriosIncluidos;
        dispositivo.fotos = fotos;

        await dispositivo.save();

        logger.info('Device updated', { 
            updatedBy: req.user.username,
            deviceId: dispositivo._id,
            brand: marca,
            model: modelo 
        });

        res.redirect('/recepcion/dispositivos?success=Dispositivo actualizado correctamente');
    } catch (error) {
        logger.error('Device update error', { error: error.message });
        
        // Clean up uploaded files if there was an error
        if (req.files) {
            req.files.forEach(file => {
                const fs = require('fs');
                const path = require('path');
                const filePath = path.join(__dirname, '../public/uploads', file.filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });
        }

        const clientes = await Cliente.find({ activo: true }).sort({ nombre: 1 });
        const dispositivo = await Dispositivo.findById(req.params.id).populate('cliente');
        res.render('recepcion/dispositivo_form', { 
            dispositivo,
            clientes,
            error: 'Error actualizando dispositivo: ' + error.message,
            formData: req.body,
            isEdit: true 
        });
    }
});

// Eliminar dispositivo
router.post('/dispositivos/:id/eliminar', isRecepcion, idValidation, async (req, res) => {
    try {
        const dispositivo = await Dispositivo.findById(req.params.id);
        
        if (!dispositivo) {
            return res.status(404).json({ error: 'Dispositivo no encontrado' });
        }

        // Verificar si tiene órdenes activas
        const ordenesActivas = await OrdenServicio.countDocuments({ 
            dispositivo: req.params.id, 
            activo: true 
        });

        if (ordenesActivas > 0) {
            return res.status(400).json({ 
                error: `No se puede eliminar el dispositivo porque tiene ${ordenesActivas} orden(es) activa(s)` 
            });
        }

        // Eliminar fotos del servidor
        if (dispositivo.fotos && dispositivo.fotos.length > 0) {
            const fs = require('fs');
            const path = require('path');
            dispositivo.fotos.forEach(foto => {
                const filePath = path.join(__dirname, '../public/uploads', foto);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });
        }

        dispositivo.activo = false;
        await dispositivo.save();

        logger.info('Device deleted', { 
            deletedBy: req.user.username,
            deviceId: dispositivo._id 
        });

        res.json({ success: true, message: 'Dispositivo eliminado correctamente' });
    } catch (error) {
        logger.error('Device deletion error', { error: error.message });
        res.status(500).json({ error: 'Error eliminando dispositivo' });
    }
});

// Eliminar foto de dispositivo
router.post('/dispositivos/:id/eliminar-foto', isRecepcion, idValidation, async (req, res) => {
    try {
        const { foto } = req.body;
        const dispositivo = await Dispositivo.findById(req.params.id);
        
        if (!dispositivo) {
            return res.status(404).json({ error: 'Dispositivo no encontrado' });
        }

        if (!dispositivo.fotos.includes(foto)) {
            return res.status(400).json({ error: 'Foto no encontrada en el dispositivo' });
        }

        // Eliminar foto del servidor
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(__dirname, '../public/uploads', foto);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Remover foto del array
        dispositivo.fotos = dispositivo.fotos.filter(f => f !== foto);
        await dispositivo.save();

        logger.info('Device photo deleted', { 
            deletedBy: req.user.username,
            deviceId: dispositivo._id,
            photo: foto 
        });

        res.json({ success: true, message: 'Foto eliminada correctamente' });
    } catch (error) {
        logger.error('Device photo deletion error', { error: error.message });
        res.status(500).json({ error: 'Error eliminando foto' });
    }
});

// ===========================================
// GESTIÓN DE ÓRDENES DE SERVICIO
// ===========================================

// Lista de órdenes
router.get('/ordenes', isRecepcion, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const skip = (page - 1) * limit;

        const ordenes = await OrdenServicio.find({ activo: true })
            .populate({
                path: 'dispositivo',
                populate: { path: 'cliente' }
            })
            .populate('tecnicoAsignado')
            .sort({ fechaCreacion: -1 })
            .skip(skip)
            .limit(limit);

        const totalOrdenes = await OrdenServicio.countDocuments({ activo: true });
        const totalPages = Math.ceil(totalOrdenes / limit);

        res.render('recepcion/ordenes', { 
            ordenes,
            pagination: {
                page,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        logger.error('Orders list error', { error: error.message });
        res.status(500).render('error', { 
            message: 'Error cargando órdenes',
            error: { status: 500 }
        });
    }

    
});

// Formulario de nueva orden
router.get('/ordenes/nueva', isRecepcion, async (req, res) => {
    try {
        const dispositivos = await Dispositivo.find({ activo: true })
            .populate('cliente')
            .sort({ fechaIngreso: -1 });
        res.render('recepcion/orden_form', {
            dispositivos,
            isEdit: false,
            orden: null,
            error: req.query.error,
            success: req.query.success,
            formData: {}
        });
    } catch (error) {
        logger.error('Order form error', { error: error.message });
        res.status(500).render('error', {
            message: 'Error cargando formulario',
            error: { status: 500 }
        });
    }
});

// Crear nueva orden
router.post('/ordenes/nueva', isRecepcion, ordenServicioValidation, async (req, res) => {
    try {
        const { dispositivo, tipoServicio, prioridad, diagnosticoInicial, observaciones } = req.body;

        const nuevaOrden = new OrdenServicio({
            dispositivo,
            tipoServicio,
            prioridad,
            diagnosticoInicial,
            observaciones,
            creadoPor: req.user._id
        });

        await nuevaOrden.save();

        logger.info('New service order created', { 
            createdBy: req.user.username,
            orderId: nuevaOrden._id,
            serviceType: tipoServicio 
        });

        res.redirect('/recepcion/ordenes?success=Orden de servicio creada correctamente');
    } catch (error) {
        logger.error('Order creation error', { 
            error: error.message,
            createdBy: req.user.username 
        });
        const dispositivos = await Dispositivo.find({ activo: true })
            .populate('cliente')
            .sort({ fechaIngreso: -1 });
        res.render('recepcion/orden_form', { 
            dispositivos,
            isEdit: false,
            orden: null,
            error: 'Error creando orden: ' + error.message,
            formData: req.body 
        });
    }
});


// Ver detalle de orden
router.get('/ordenes/:id', isRecepcion, idValidation, async (req, res) => {
    try {
        const orden = await OrdenServicio.findById(req.params.id)
            .populate({
                path: 'dispositivo',
                populate: { path: 'cliente' }
            })
            .populate('tecnicoAsignado');
        if (!orden) {
            return res.status(404).render('error', {
                message: 'Orden no encontrada',
                error: { status: 404 }
            });
        }
        const cotizaciones = await Cotizacion.find({ ordenServicio: req.params.id })
            .populate('itemsInventario.inventarioItem')
            .sort({ fechaCreacion: -1 });
        // Buscar cotización aprobada
        const cotizacionAprobada = await Cotizacion.findOne({
            ordenServicio: req.params.id,
            estado: 'aprobada'
        });
        res.render('recepcion/orden_detalle1', { orden, cotizaciones, cotizacionAprobada });
    } catch (error) {
        logger.error('Order detail error', { error: error.message });
        res.status(500).render('error', {
            message: 'Error cargando orden',
            error: { status: 500 }
        });
    }
});

// Formulario de edición de orden
router.get('/ordenes/:id/editar', isRecepcion, idValidation, async (req, res) => {
    try {
        const orden = await OrdenServicio.findById(req.params.id)
            .populate({
                path: 'dispositivo',
                populate: { path: 'cliente' }
            });
        if (!orden) {
            return res.status(404).render('error', {
                message: 'Orden no encontrada',
                error: { status: 404 }
            });
        }
        // Solo dispositivos activos para el select
        const dispositivos = await Dispositivo.find({ activo: true }).populate('cliente').sort({ fechaIngreso: -1 });
        res.render('recepcion/orden_form', {
            orden,
            dispositivos,
            isEdit: true,
            error: req.query.error,
            success: req.query.success,
            formData: {}
        });
    } catch (error) {
        logger.error('Order edit form error', { error: error.message });
        res.status(500).render('error', {
            message: 'Error cargando formulario de edición',
            error: { status: 500 }
        });
    }
});

// Procesar edición de orden
router.post('/ordenes/:id/editar', isRecepcion, idValidation, ordenServicioValidation, async (req, res) => {
    try {
        const { dispositivo, tipoServicio, prioridad, diagnosticoInicial, observaciones } = req.body;
        const orden = await OrdenServicio.findById(req.params.id);
        if (!orden) {
            return res.status(404).render('error', {
                message: 'Orden no encontrada',
                error: { status: 404 }
            });
        }
        orden.dispositivo = dispositivo;
        orden.tipoServicio = tipoServicio;
        orden.prioridad = prioridad;
        orden.diagnosticoInicial = diagnosticoInicial;
        orden.observaciones = observaciones;
        await orden.save();
        logger.info('Order updated', {
            updatedBy: req.user.username,
            orderId: orden._id
        });
        res.redirect('/recepcion/ordenes?success=Orden actualizada correctamente');
    } catch (error) {
        logger.error('Order update error', { error: error.message });
        // Recargar dispositivos para el select
        const dispositivos = await Dispositivo.find({ activo: true }).populate('cliente').sort({ fechaIngreso: -1 });
        const orden = await OrdenServicio.findById(req.params.id);
        res.render('recepcion/orden_form', {
            orden,
            dispositivos,
            isEdit: true,
            error: 'Error actualizando orden: ' + error.message,
            formData: req.body
        });
    }
});

// Eliminar orden y cotización asociada
router.post('/ordenes/:id/eliminar', isRecepcion, idValidation, async (req, res) => {
    try {
        const orden = await OrdenServicio.findById(req.params.id);
        if (!orden) {
            if (req.xhr || req.headers.accept.indexOf('json') > -1) {
                return res.status(404).json({ error: 'Orden no encontrada' });
            } else {
                return res.redirect('/recepcion/ordenes?error=Orden no encontrada');
            }
        }
        // Eliminar cotización asociada si existe
        await Cotizacion.deleteMany({ ordenServicio: req.params.id });
        await orden.deleteOne();
        logger.info('Order and associated quotes deleted', {
            deletedBy: req.user.username,
            orderId: req.params.id
        });
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            res.json({ success: true, message: 'Orden y cotización eliminadas correctamente' });
        } else {
            res.redirect('/recepcion/ordenes?success=Orden eliminada correctamente');
        }
    } catch (error) {
        logger.error('Order deletion error', { error: error.message });
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            res.status(500).json({ error: 'Error eliminando orden' });
        } else {
            res.redirect('/recepcion/ordenes?error=Error eliminando orden');
        }
    }
});

// Registrar pago de una orden
router.post('/ordenes/:id/pago', isRecepcion, idValidation, async (req, res) => {
    try {
        const { monto } = req.body;
        const orden = await OrdenServicio.findById(req.params.id);
        if (!orden) {
            return res.status(404).render('error', {
                message: 'Orden no encontrada',
                error: { status: 404 }
            });
        }
        if (Number(monto) < 0) {
            return res.redirect(`/recepcion/ordenes/${orden._id}?error=El monto no puede ser negativo`);
        }
        orden.montoPagado = Number(monto);
        await orden.actualizarEstadoPago();
        await orden.save();

        logger.info('Pago editado', {
            orderId: orden._id,
            monto: monto,
            montoPagado: orden.montoPagado,
            estadoPago: orden.estadoPago,
            service: 'rocketgsm',
            timestamp: new Date().toISOString(),
            registradoPor: req.user?.username || 'recepcion'
        });

        res.redirect(`/recepcion/ordenes/${orden._id}?success=Pago actualizado correctamente`);
    } catch (error) {
        logger.error('Pago error', { error: error.message });
        res.redirect(`/recepcion/ordenes/${req.params.id}?error=Error al actualizar el pago`);
    }
});

router.get('/ordenes', isRecepcion, async (req, res) => {
    const { q, estado, prioridad, fecha_inicio, fecha_fin } = req.query;
    const filter = {};

    if (q) {
        filter.$or = [
            { 'dispositivo.cliente.nombre': { $regex: q, $options: 'i' } },
            { 'dispositivo.marca': { $regex: q, $options: 'i' } },
            { 'dispositivo.modelo': { $regex: q, $options: 'i' } },
            { folio: { $regex: q, $options: 'i' } }
        ];
    }
    if (estado) filter.estado = estado;
    if (prioridad) filter.prioridad = prioridad;
    if (fecha_inicio || fecha_fin) {
        filter.fechaCreacion = {};
        if (fecha_inicio) filter.fechaCreacion.$gte = new Date(fecha_inicio);
        if (fecha_fin) filter.fechaCreacion.$lte = new Date(fecha_fin);
    }

    const ordenes = await OrdenServicio.find(filter)
        .populate({ path: 'dispositivo', populate: { path: 'cliente' } })
        .populate('tecnicoAsignado')
        .sort({ fechaCreacion: -1 });

    res.render('recepcion/ordenes', {
        ordenes,
        q, estado, prioridad, fecha_inicio, fecha_fin
    });
});

// ===========================================
// GESTIÓN DE COTIZACIONES
// ===========================================

// Lista de cotizaciones
router.get('/cotizaciones', isRecepcion, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const skip = (page - 1) * limit;

        const cotizaciones = await Cotizacion.find({ activo: true })
            .populate({
                path: 'ordenServicio',
                populate: { 
                    path: 'dispositivo',
                    populate: { path: 'cliente' }
                }
            })
            .populate('creadoPor')
            .sort({ fechaCreacion: -1 })
            .skip(skip)
            .limit(limit);

        const totalCotizaciones = await Cotizacion.countDocuments({ activo: true });
        const totalPages = Math.ceil(totalCotizaciones / limit);

        res.render('recepcion/cotizaciones', { 
            cotizaciones,
            pagination: {
                page,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        logger.error('Quotes list error', { error: error.message });
        res.status(500).render('error', { 
            message: 'Error cargando cotizaciones',
            error: { status: 500 }
        });
    }
});

// Aprobar cotización
router.post('/cotizaciones/:id/aprobar', isRecepcion, idValidation, async (req, res) => {
    try {
        const cotizacion = await Cotizacion.findById(req.params.id);
        
        if (!cotizacion) {
            return res.status(404).json({ error: 'Cotización no encontrada' });
        }

        if (cotizacion.estado !== 'pendiente') {
            return res.status(400).json({ error: 'La cotización ya no está pendiente' });
        }

        cotizacion.estado = 'aprobada';
        cotizacion.fechaAprobacion = new Date();
        cotizacion.aprobadoPor = req.user._id;
        await cotizacion.save();

        // Actualizar estado de la orden
        await OrdenServicio.findByIdAndUpdate(cotizacion.ordenServicio, {
            estado: 'aprobada',
            fechaInicio: new Date()
        });

        logger.info('Quote approved', { 
            approvedBy: req.user.username,
            quoteId: cotizacion._id 
        });

        res.redirect('/recepcion/cotizaciones?success=Cotización aprobada');
    } catch (error) {
        logger.error('Quote approval error', { error: error.message });
        res.redirect('/recepcion/cotizaciones?error=Error aprobando cotización');
    }
});

// Rechazar cotización
router.post('/cotizaciones/:id/rechazar', isRecepcion, idValidation, async (req, res) => {
    try {
        const cotizacion = await Cotizacion.findById(req.params.id)
            .populate('itemsInventario.inventarioItem');
        
        if (!cotizacion) {
            return res.status(404).json({ error: 'Cotización no encontrada' });
        }

        if (cotizacion.estado !== 'pendiente') {
            return res.status(400).json({ error: 'La cotización ya no está pendiente' });
        }

        // Restaurar stock del inventario
        if (cotizacion.itemsInventario && cotizacion.itemsInventario.length > 0) {
            for (let item of cotizacion.itemsInventario) {
                const cantidad = parseInt(item.cantidad);
                await InventarioItem.findByIdAndUpdate(
                    item.inventarioItem,
                    { $inc: { stock: cantidad } }
                );
                
                logger.info('Inventory item stock restored', {
                    itemId: item.inventarioItem,
                    cantidad: cantidad,
                    quoteId: cotizacion._id,
                    restoredBy: req.user.username
                });
            }
        }

        cotizacion.estado = 'rechazada';
        await cotizacion.save();

        // Actualizar estado de la orden
        await OrdenServicio.findByIdAndUpdate(cotizacion.ordenServicio, {
            estado: 'asignada'
        });

        logger.info('Quote rejected', { 
            rejectedBy: req.user.username,
            quoteId: cotizacion._id 
        });

        res.redirect('/recepcion/cotizaciones?success=Cotización rechazada y stock restaurado');
    } catch (error) {
        logger.error('Quote rejection error', { error: error.message });
        res.redirect('/recepcion/cotizaciones?error=Error rechazando cotización');
    }
});

// Cancelar cotización
router.post('/cotizaciones/:id/cancelar', isRecepcion, idValidation, async (req, res) => {
    try {
        const cotizacion = await Cotizacion.findById(req.params.id)
            .populate('itemsInventario.inventarioItem');
        
        if (!cotizacion) {
            return res.status(404).json({ error: 'Cotización no encontrada' });
        }

        if (cotizacion.estado !== 'aprobada') {
            return res.status(400).json({ error: 'Solo se pueden cancelar cotizaciones aprobadas' });
        }

        // Restaurar stock del inventario
        if (cotizacion.itemsInventario && cotizacion.itemsInventario.length > 0) {
            for (let item of cotizacion.itemsInventario) {
                const cantidad = parseInt(item.cantidad);
                await InventarioItem.findByIdAndUpdate(
                    item.inventarioItem,
                    { $inc: { stock: cantidad } }
                );

                logger.info('Inventory item stock restored (cancelled quote)', {
                    itemId: item.inventarioItem,
                    cantidad: cantidad,
                    quoteId: cotizacion._id,
                    cancelledBy: req.user.username
                });
            }
        }

        cotizacion.estado = 'cancelada';
        await cotizacion.save();

        // Actualizar estado de la orden
        await OrdenServicio.findByIdAndUpdate(cotizacion.ordenServicio, {
            estado: 'asignada'
        });

        logger.info('Quote cancelled', { 
            cancelledBy: req.user.username,
            quoteId: cotizacion._id 
        });

        res.redirect('/recepcion/cotizaciones?success=Cotización cancelada y stock restaurado');
    } catch (error) {
        logger.error('Quote cancellation error', { error: error.message });
        res.redirect('/recepcion/cotizaciones?error=Error cancelando cotización');
    }
});

// ===========================================
// REPORTES Y FACTURAS
// ===========================================

// Reporte final de orden
router.get('/reporte/:ordenId', isRecepcion, async (req, res) => {
    try {
        const orden = await OrdenServicio.findById(req.params.ordenId)
            .populate({
                path: 'dispositivo',
                populate: { path: 'cliente' }
            })
            .populate('tecnicoAsignado')
            .populate('creadoPor');

        if (!orden) {
            return res.status(404).render('error', { 
                message: 'Orden no encontrada',
                error: { status: 404 }
            });
        }

        // Cotización aprobada
        const cotizacion = await Cotizacion.findOne({
            ordenServicio: orden._id,
            estado: 'aprobada'
        }).populate('itemsInventario.inventarioItem');

        // Usar los campos correctos del modelo
        const totalManoObra = cotizacion ? cotizacion.subtotalManoObra : 0;
        const totalMateriales = cotizacion ? cotizacion.subtotalMateriales : 0;
        const totalGeneral = cotizacion ? cotizacion.total : 0;

        res.render('recepcion/reporte_final', {
            orden,
            cotizacion,
            totales: {
                manoObra: totalManoObra,
                materiales: totalMateriales,
                general: totalGeneral
            },
            fechaReporte: new Date()
        });
    } catch (error) {
        res.status(500).render('error', { 
            message: 'Error generando reporte',
            error
        });
    }
});

router.get('/reporte/:ordenId/pdf', isRecepcion, async (req, res) => {
    try {
        // Busca la orden y cotización igual que en el reporte normal
        const orden = await OrdenServicio.findById(req.params.ordenId)
            .populate({ path: 'dispositivo', populate: { path: 'cliente' } })
            .populate('tecnicoAsignado')
            .populate('creadoPor');

        const cotizacion = await Cotizacion.findOne({
            ordenServicio: orden._id,
            estado: 'aprobada'
        }).populate('itemsInventario.inventarioItem');

        const totalManoObra = cotizacion ? cotizacion.subtotalManoObra : 0;
        const totalMateriales = cotizacion ? cotizacion.subtotalMateriales : 0;
        const totalGeneral = cotizacion ? cotizacion.total : 0;

        // Renderiza el HTML
        const html = await new Promise((resolve, reject) => {
            res.render('recepcion/reporte_final', {
                orden,
                cotizacion,
                totales: {
                    manoObra: totalManoObra,
                    materiales: totalMateriales,
                    general: totalGeneral
                },
                fechaReporte: new Date()
            }, (err, html) => {
                if (err) reject(err);
                else resolve(html);
            });
        });

        // Genera el PDF
        const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'A4' });
        await browser.close();

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="reporte_${req.params.ordenId}.pdf"`
        });
        res.send(pdfBuffer);
    } catch (error) {
        res.status(500).send('Error generando PDF');
    }
});

module.exports = router; 