const express = require('express');
const router = express.Router();
const OrdenServicio = require('../models/OrdenServicio');
const Cotizacion = require('../models/Cotizacion');
const InventarioItem = require('../models/InventarioItem');
const { isTecnico } = require('../middlewares/auth');
const { 
    cotizacionValidation,
    idValidation 
} = require('../middlewares/validation');
const logger = require('../config/logger');

// Dashboard Técnico
router.get('/dashboard', isTecnico, async (req, res) => {
    try {
        // Órdenes disponibles
        const ordenesDisponibles = await OrdenServicio.find({ 
            estado: 'pendiente',
            activo: true 
        })
        .populate({
            path: 'dispositivo',
            populate: { path: 'cliente' }
        })
        .sort({ fechaCreacion: -1 });

        // Mis órdenes asignadas
        const misOrdenes = await OrdenServicio.find({ 
            tecnicoAsignado: req.user._id,
            activo: true 
        })
        .populate({
            path: 'dispositivo',
            populate: { path: 'cliente' }
        })
        .sort({ fechaCreacion: -1 });

        // Estadísticas del técnico
        const ordenesCompletadas = await OrdenServicio.countDocuments({
            tecnicoAsignado: req.user._id,
            estado: 'finalizada',
            activo: true
        });

        const ordenesEnProceso = await OrdenServicio.countDocuments({
            tecnicoAsignado: req.user._id,
            estado: { $in: ['asignada', 'cotizacion_enviada', 'aprobada', 'en_proceso'] },
            activo: true
        });

        res.render('dashboards/tecnico', { 
            user: req.user,
            ordenesDisponibles,
            misOrdenes,
            stats: {
                ordenesCompletadas,
                ordenesEnProceso
            }
        });
    } catch (error) {
        logger.error('Technician dashboard error', { error: error.message });
        res.status(500).render('error', { 
            message: 'Error cargando el dashboard',
            error: { status: 500 }
        });
    }
});

// Tomar orden
router.post('/ordenes/:id/tomar', isTecnico, idValidation, async (req, res) => {
    try {
        const orden = await OrdenServicio.findById(req.params.id);
        
        if (!orden) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        if (orden.estado !== 'pendiente') {
            return res.status(400).json({ error: 'La orden ya no está disponible' });
        }

        if (orden.tecnicoAsignado) {
            return res.status(400).json({ error: 'La orden ya está asignada a otro técnico' });
        }

        orden.tecnicoAsignado = req.user._id;
        orden.estado = 'asignada';
        orden.fechaAsignacion = new Date();
        await orden.save();

        logger.info('Order taken by technician', { 
            technician: req.user.username,
            orderId: orden._id 
        });

        res.redirect('/tecnico/dashboard?success=Orden tomada correctamente');
    } catch (error) {
        logger.error('Order taking error', { error: error.message });
        res.redirect('/tecnico/dashboard?error=Error tomando orden');
    }
});

// Ver detalle de orden
router.get('/ordenes/:id', isTecnico, idValidation, async (req, res) => {
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

        // Permitir ver si está pendiente o si está asignada a este técnico
        if (orden.estado !== 'pendiente' && (!orden.tecnicoAsignado || orden.tecnicoAsignado._id.toString() !== req.user._id.toString())) {
            return res.status(403).render('error', {
                message: 'Acceso denegado',
                error: { status: 403 }
            });
        }

        const cotizaciones = await Cotizacion.find({ ordenServicio: req.params.id })
            .populate('itemsInventario.inventarioItem')
            .populate('creadoPor')
            .sort({ fechaCreacion: -1 });

        res.render('tecnico/orden_detalle', { orden, cotizaciones, user: req.user });
    } catch (error) {
        logger.error('Order detail error', { error: error.message });
        res.status(500).render('error', {
            message: 'Error cargando orden',
            error: { status: 500 }
        });
    }
});

// Formulario de cotización
router.get('/ordenes/:id/cotizar', isTecnico, idValidation, async (req, res) => {
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

        if (orden.tecnicoAsignado.toString() !== req.user._id.toString()) {
            return res.status(403).render('error', {
                message: 'Acceso denegado',
                error: { status: 403 }
            });
        }

        const inventario = await InventarioItem.find({ activo: true, stock: { $gt: 0 } })
            .sort({ nombre: 1 });

        res.render('tecnico/cotizacion_form', {
            orden,
            inventario,
            error: req.query.error,
            success: req.query.success,
            isEdit: false,
            cotizacion: null
        });
    } catch (error) {
        logger.error('Quote form error', { error: error.message });
        res.status(500).render('error', {
            message: 'Error cargando formulario',
            error: { status: 500 }
        });
    }
});

// Crear cotización
router.post('/ordenes/:id/cotizar', isTecnico, idValidation, cotizacionValidation, async (req, res) => {
    try {
        const { descripcionManoObra, horas, precioPorHora, itemsInventario, observaciones } = req.body;

        // Verificar que la orden pertenece al técnico
        const orden = await OrdenServicio.findById(req.params.id);
        if (!orden || orden.tecnicoAsignado.toString() !== req.user._id.toString()) {
            return res.status(403).render('error', { 
                message: 'Acceso denegado',
                error: { status: 403 }
            });
        }

        const subtotalManoObra = parseFloat(horas) * parseFloat(precioPorHora);
        
        // Procesar items de inventario
        const itemsArray = [];
        let subtotalMateriales = 0;

        if (itemsInventario && Array.isArray(itemsInventario)) {
            for (let item of itemsInventario) {
                const inventarioItem = await InventarioItem.findById(item.inventarioItem);
                
                if (!inventarioItem) {
                    return res.status(400).render('tecnico/cotizacion_form', { 
                        error: 'Item de inventario no encontrado',
                        orden,
                        inventario: await InventarioItem.find({ activo: true, stock: { $gt: 0 } }).sort({ nombre: 1 }),
                        formData: req.body 
                    });
                }

                if (inventarioItem.stock < parseInt(item.cantidad)) {
                    return res.status(400).render('tecnico/cotizacion_form', { 
                        error: `Stock insuficiente para ${inventarioItem.nombre}`,
                        orden,
                        inventario: await InventarioItem.find({ activo: true, stock: { $gt: 0 } }).sort({ nombre: 1 }),
                        formData: req.body 
                    });
                }

                const subtotal = parseInt(item.cantidad) * parseFloat(item.precioUnitario);
                
                itemsArray.push({
                    inventarioItem: item.inventarioItem,
                    cantidad: parseInt(item.cantidad),
                    precioUnitario: parseFloat(item.precioUnitario),
                    subtotal: subtotal
                });
                
                subtotalMateriales += subtotal;
            }
        }

        const total = subtotalManoObra + subtotalMateriales;

        const nuevaCotizacion = new Cotizacion({
            ordenServicio: req.params.id,
            manoDeObra: {
                descripcion: descripcionManoObra,
                horas: parseFloat(horas),
                precioPorHora: parseFloat(precioPorHora),
                subtotal: subtotalManoObra
            },
            itemsInventario: itemsArray,
            subtotalManoObra,
            subtotalMateriales,
            total,
            observaciones,
            creadoPor: req.user._id
        });

        await nuevaCotizacion.save();

        // Descontar items del inventario
        if (itemsInventario && Array.isArray(itemsInventario)) {
            for (let item of itemsInventario) {
                const cantidad = parseInt(item.cantidad);
                await InventarioItem.findByIdAndUpdate(
                    item.inventarioItem,
                    { $inc: { stock: -cantidad } }
                );
                
                logger.info('Inventory item stock reduced', {
                    itemId: item.inventarioItem,
                    cantidad: cantidad,
                    quoteId: nuevaCotizacion._id,
                    reducedBy: req.user.username
                });
            }
        }

        // Actualizar estado de la orden
        await OrdenServicio.findByIdAndUpdate(req.params.id, {
            estado: 'cotizacion_enviada'
        });

        logger.info('Quote created', { 
            createdBy: req.user.username,
            quoteId: nuevaCotizacion._id,
            orderId: req.params.id 
        });

        res.redirect('/tecnico/dashboard?success=Cotización enviada correctamente');
    } catch (error) {
        logger.error('Quote creation error', { 
            error: error.message,
            createdBy: req.user.username 
        });
        res.redirect('/tecnico/ordenes/' + req.params.id + '/cotizar?error=Error creando cotización');
    }
});

// Finalizar orden
router.post('/ordenes/:id/finalizar', isTecnico, idValidation, async (req, res) => {
    try {
        const { trabajoRealizado } = req.body;

        if (!trabajoRealizado || trabajoRealizado.trim().length < 10) {
            return res.status(400).json({ error: 'Debe describir el trabajo realizado (mínimo 10 caracteres)' });
        }

        const orden = await OrdenServicio.findById(req.params.id);
        
        if (!orden) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        if (orden.tecnicoAsignado.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        if (orden.estado !== 'aprobada' && orden.estado !== 'en_proceso') {
            return res.status(400).json({ error: 'La orden no puede ser finalizada en su estado actual' });
        }

        orden.estado = 'finalizada';
        orden.trabajoRealizado = trabajoRealizado.trim();
        orden.fechaFinalizacion = new Date();
        await orden.save();

        logger.info('Order completed', { 
            completedBy: req.user.username,
            orderId: orden._id 
        });

        res.redirect('/tecnico/dashboard?success=Orden finalizada correctamente');
    } catch (error) {
        logger.error('Order completion error', { error: error.message });
        res.redirect('/tecnico/dashboard?error=Error finalizando orden');
    }
});

// Iniciar trabajo en orden
router.post('/ordenes/:id/iniciar', isTecnico, idValidation, async (req, res) => {
    try {
        const orden = await OrdenServicio.findById(req.params.id);
        
        if (!orden) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        if (orden.tecnicoAsignado.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        if (orden.estado !== 'aprobada') {
            return res.status(400).json({ error: 'La orden debe estar aprobada para iniciar el trabajo' });
        }

        orden.estado = 'en_proceso';
        await orden.save();

        logger.info('Order work started', { 
            startedBy: req.user.username,
            orderId: orden._id 
        });

        res.redirect('/tecnico/dashboard?success=Trabajo iniciado correctamente');
    } catch (error) {
        logger.error('Order start error', { error: error.message });
        res.redirect('/tecnico/dashboard?error=Error iniciando trabajo');
    }
});

// Editar cotización rechazada (GET)
router.get('/cotizaciones/:id/editar', isTecnico, idValidation, async (req, res) => {
    try {
        const cotizacion = await Cotizacion.findById(req.params.id)
            .populate({
                path: 'ordenServicio',
                populate: {
                    path: 'dispositivo',
                    populate: { path: 'cliente' }
                }
            })
            .populate('creadoPor');
        if (!cotizacion) {
            return res.status(404).render('error', { message: 'Cotización no encontrada', error: { status: 404 } });
        }
        if (cotizacion.estado !== 'rechazada' || cotizacion.creadoPor._id.toString() !== req.user._id.toString()) {
            return res.status(403).render('error', { message: 'No puedes editar esta cotización', error: { status: 403 } });
        }
        const inventario = await InventarioItem.find({ activo: true, stock: { $gt: 0 } }).sort({ nombre: 1 });
        res.render('tecnico/cotizacion_form', {
            orden: cotizacion.ordenServicio,
            inventario,
            cotizacion,
            isEdit: true,
            error: req.query.error,
            success: req.query.success
        });
    } catch (error) {
        logger.error('Quote edit form error', { error: error.message });
        res.status(500).render('error', { message: 'Error cargando formulario de edición', error: { status: 500 } });
    }
});

// Editar cotización rechazada (POST)
router.post('/cotizaciones/:id/editar', isTecnico, idValidation, cotizacionValidation, async (req, res) => {
    try {
        const cotizacion = await Cotizacion.findById(req.params.id).populate('creadoPor');
        if (!cotizacion) {
            return res.status(404).render('error', { message: 'Cotización no encontrada', error: { status: 404 } });
        }
        if (cotizacion.estado !== 'rechazada' || cotizacion.creadoPor._id.toString() !== req.user._id.toString()) {
            return res.status(403).render('error', { message: 'No puedes editar esta cotización', error: { status: 403 } });
        }
        const { descripcionManoObra, horas, precioPorHora, itemsInventario, observaciones } = req.body;
        const subtotalManoObra = parseFloat(horas) * parseFloat(precioPorHora);
        // Procesar items de inventario
        const itemsArray = [];
        let subtotalMateriales = 0;
        if (itemsInventario && Array.isArray(itemsInventario)) {
            for (let item of itemsInventario) {
                const inventarioItem = await InventarioItem.findById(item.inventarioItem);
                if (!inventarioItem) {
                    return res.status(400).render('tecnico/cotizacion_form', {
                        error: 'Item de inventario no encontrado',
                        orden: cotizacion.ordenServicio,
                        inventario: await InventarioItem.find({ activo: true, stock: { $gt: 0 } }).sort({ nombre: 1 }),
                        cotizacion,
                        isEdit: true
                    });
                }
                if (inventarioItem.stock < parseInt(item.cantidad)) {
                    return res.status(400).render('tecnico/cotizacion_form', {
                        error: `Stock insuficiente para ${inventarioItem.nombre}`,
                        orden: cotizacion.ordenServicio,
                        inventario: await InventarioItem.find({ activo: true, stock: { $gt: 0 } }).sort({ nombre: 1 }),
                        cotizacion,
                        isEdit: true
                    });
                }
                const subtotal = parseInt(item.cantidad) * parseFloat(item.precioUnitario);
                itemsArray.push({
                    inventarioItem: item.inventarioItem,
                    cantidad: parseInt(item.cantidad),
                    precioUnitario: parseFloat(item.precioUnitario),
                    subtotal: subtotal
                });
                subtotalMateriales += subtotal;
            }
        }
        const total = subtotalManoObra + subtotalMateriales;
        // Actualizar cotización
        cotizacion.manoDeObra.descripcion = descripcionManoObra;
        cotizacion.manoDeObra.horas = parseFloat(horas);
        cotizacion.manoDeObra.precioPorHora = parseFloat(precioPorHora);
        cotizacion.manoDeObra.subtotal = subtotalManoObra;
        cotizacion.itemsInventario = itemsArray;
        cotizacion.subtotalManoObra = subtotalManoObra;
        cotizacion.subtotalMateriales = subtotalMateriales;
        cotizacion.total = total;
        cotizacion.observaciones = observaciones;
        cotizacion.estado = 'pendiente'; // Vuelve a pendiente para revisión
        await cotizacion.save();
        logger.info('Quote updated', { updatedBy: req.user.username, quoteId: cotizacion._id });
        res.redirect('/tecnico/ordenes/' + cotizacion.ordenServicio + '?success=Cotización actualizada correctamente');
    } catch (error) {
        logger.error('Quote update error', { error: error.message });
        res.status(500).render('error', { message: 'Error actualizando cotización', error: { status: 500 } });
    }
});

router.get('/mis-ordenes', isTecnico, async (req, res) => {
    try {
        const misOrdenes = await OrdenServicio.find({ tecnicoAsignado: req.user._id })
            .populate({
                path: 'dispositivo',
                populate: { path: 'cliente' }
            });
        res.render('tecnico/mis-ordenes', {
            user: req.user,
            misOrdenes
        });
    } catch (error) {
        res.status(500).render('error', { message: 'Error cargando tus órdenes', error });
    }
});

module.exports = router; 